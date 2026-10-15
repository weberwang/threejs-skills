#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const URI_FIELDS = new Set(["uri"]);
const COMPRESSED_EXTENSIONS = new Set(["KHR_draco_mesh_compression", "EXT_meshopt_compression"]);
const ACCESSOR_COMPONENT_BYTES = new Map([[5120, 1], [5121, 1], [5122, 2], [5123, 2], [5125, 4], [5126, 4]]);
const ACCESSOR_TYPE_COMPONENTS = new Map([["SCALAR", 1], ["VEC2", 2], ["VEC3", 3], ["VEC4", 4], ["MAT2", 4], ["MAT3", 9], ["MAT4", 16]]);

/** 汇总清单或 GLB 结构问题，供 CLI 与测试以同一格式处理。 */
export class ModelValidationError extends Error {
  /** 创建携带逐项问题的可读错误。 */
  constructor(issues) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
    this.name = "ModelValidationError";
    this.issues = issues;
  }
}

/** 判断 JSON 解析结果是否为普通对象。 */
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 判断路径是否位于项目根目录内，且不把父目录误判为内部路径。 */
function isWithinRoot(root, target) {
  const path = relative(root, target);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

/** 逐段解析模型文件路径，发现任何指向项目外部的符号链接即拒绝。 */
async function resolveProjectFile(repoRoot, declaredPath) {
  if (typeof declaredPath !== "string" || declaredPath.trim() === "") throw new Error("file 必须是项目内相对路径");
  const normalized = declaredPath.replaceAll("\\", "/");
  const pieces = normalized.split("/");
  if (normalized.startsWith("/") || /^[a-z]:/i.test(normalized) || pieces.some((part) => !part || part === "." || part === ".." || part.includes(":"))) {
    throw new Error("file 必须是无绝对路径或路径穿越的项目内相对路径");
  }

  const root = await realpath(repoRoot);
  let cursor = root;
  for (const piece of pieces) {
    cursor = resolve(cursor, piece);
    await lstat(cursor);
    const actual = await realpath(cursor);
    if (!isWithinRoot(root, actual)) throw new Error(`路径经过符号链接逃逸项目目录：${piece}`);
  }
  const actualPath = await realpath(cursor);
  if (!isWithinRoot(root, actualPath) || actualPath === root) throw new Error("模型路径必须指向项目内文件");
  if (!(await stat(actualPath)).isFile()) throw new Error("file 必须指向普通文件");
  return actualPath;
}

/** 按 glTF 2.0 GLB 容器规则读取 JSON 与 BIN chunk，并拒绝错位和越界。 */
function parseGlb(bytes) {
  const issues = [];
  const fail = (path, message) => issues.push({ path, message });
  if (!Buffer.isBuffer(bytes) || bytes.length < 20) throw new ModelValidationError([{ path: "glb", message: "文件短于 GLB 头和最小 JSON chunk" }]);
  const magic = bytes.readUInt32LE(0);
  const version = bytes.readUInt32LE(4);
  const declaredLength = bytes.readUInt32LE(8);
  if (magic !== GLB_MAGIC) fail("glb.header.magic", "不是 GLB 文件（magic 必须为 glTF）");
  if (version !== 2) fail("glb.header.version", "GLB 容器版本必须为 2");
  if (declaredLength !== bytes.length) fail("glb.header.length", `头部长度 ${declaredLength} 与文件长度 ${bytes.length} 不一致`);
  if (issues.length) throw new ModelValidationError(issues);

  const chunks = [];
  let offset = 12;
  while (offset < bytes.length) {
    if (bytes.length - offset < 8) {
      fail("glb.chunks", "chunk 头不完整");
      break;
    }
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const end = dataStart + length;
    if (length % 4 !== 0) fail(`glb.chunks[${chunks.length}].length`, "chunk 长度必须按 4 字节对齐");
    if (end > bytes.length) {
      fail(`glb.chunks[${chunks.length}]`, "chunk 越过文件边界");
      break;
    }
    chunks.push({ type, data: bytes.subarray(dataStart, end) });
    offset = end;
  }
  if (offset !== bytes.length) fail("glb.chunks", "chunk 边界未精确覆盖文件");
  if (chunks[0]?.type !== JSON_CHUNK) fail("glb.chunks[0]", "第一个 chunk 必须是 JSON");
  const jsonChunks = chunks.filter((chunk) => chunk.type === JSON_CHUNK);
  const binChunks = chunks.filter((chunk) => chunk.type === BIN_CHUNK);
  if (jsonChunks.length !== 1) fail("glb.chunks", "必须且只能有一个 JSON chunk");
  if (binChunks.length > 1) fail("glb.chunks", "最多只能有一个 BIN chunk");
  if (binChunks.length === 1 && chunks[1]?.type !== BIN_CHUNK) fail("glb.chunks", "BIN chunk（若存在）必须紧随 JSON chunk");
  if (issues.length) throw new ModelValidationError(issues);

  let gltf;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(jsonChunks[0].data);
    gltf = JSON.parse(text);
  } catch (error) {
    throw new ModelValidationError([{ path: "glb.json", message: `JSON chunk 不是有效 UTF-8 JSON：${error.message}` }]);
  }
  if (!isObject(gltf)) throw new ModelValidationError([{ path: "glb.json", message: "JSON chunk 根节点必须是对象" }]);
  return { gltf, bin: binChunks[0]?.data ?? null, chunkCount: chunks.length };
}

/** 提供可复用的数组读取和类型检查，避免后续结构校验访问错误类型。 */
function readArray(gltf, key, issues) {
  if (gltf[key] === undefined) return [];
  if (!Array.isArray(gltf[key])) {
    issues.push({ path: `gltf.${key}`, message: "必须是数组" });
    return [];
  }
  return gltf[key];
}

/** 校验一个引用编号是否指向指定 glTF 数组中的现有条目。 */
function validReference(value, entries, path, issues) {
  if (!Number.isInteger(value) || value < 0 || value >= entries.length) {
    issues.push({ path, message: `引用索引 ${String(value)} 超出有效范围` });
    return false;
  }
  return true;
}

/** 校验二进制 buffer、bufferView 与 accessor 的边界和类型。 */
function inspectBuffersAndAccessors(gltf, bin, issues) {
  const buffers = readArray(gltf, "buffers", issues);
  const views = readArray(gltf, "bufferViews", issues);
  const accessors = readArray(gltf, "accessors", issues);

  buffers.forEach((buffer, index) => {
    if (!isObject(buffer) || !Number.isInteger(buffer.byteLength) || buffer.byteLength < 0) {
      issues.push({ path: `gltf.buffers[${index}]`, message: "必须声明非负整数 byteLength" });
      return;
    }
    if (Object.hasOwn(buffer, "uri")) issues.push({ path: `gltf.buffers[${index}].uri`, message: "自包含 GLB 不接受任何外部或 data URI 资源" });
    if (index > 0) issues.push({ path: `gltf.buffers[${index}]`, message: "此验收器只接收由单个 GLB BIN chunk 提供的首个 buffer" });
    if (index === 0) {
      if (buffer.byteLength > 0 && !bin) issues.push({ path: "glb.bin", message: "buffer 声明了内容但 GLB 缺少 BIN chunk" });
      if (bin && (bin.length < buffer.byteLength || bin.length - buffer.byteLength > 3)) issues.push({ path: "glb.bin", message: "BIN chunk 长度必须等于 buffer.byteLength，或仅多出最多 3 个填充字节" });
      if (bin && bin.length > buffer.byteLength && bin.subarray(buffer.byteLength).some((byte) => byte !== 0)) issues.push({ path: "glb.bin", message: "BIN chunk 尾部填充字节必须为零" });
    }
  });
  if (buffers.length === 0 && bin) issues.push({ path: "glb.bin", message: "没有 glTF buffer 时不能存在孤立 BIN chunk" });

  views.forEach((view, index) => {
    const path = `gltf.bufferViews[${index}]`;
    if (!isObject(view) || !validReference(view.buffer, buffers, `${path}.buffer`, issues)) return;
    const offset = view.byteOffset ?? 0;
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(view.byteLength) || view.byteLength < 0) {
      issues.push({ path, message: "byteOffset 和 byteLength 必须是非负整数" });
      return;
    }
    if (offset + view.byteLength > (buffers[view.buffer]?.byteLength ?? 0)) issues.push({ path, message: "bufferView 越过声明的 buffer 边界" });
    if (view.byteStride !== undefined && (!Number.isInteger(view.byteStride) || view.byteStride < 4 || view.byteStride > 252 || view.byteStride % 4 !== 0)) issues.push({ path: `${path}.byteStride`, message: "byteStride 必须是 4 至 252 的 4 字节倍数" });
  });

  accessors.forEach((accessor, index) => {
    const path = `gltf.accessors[${index}]`;
    if (!isObject(accessor)) {
      issues.push({ path, message: "accessor 必须是对象" });
      return;
    }
    const componentBytes = ACCESSOR_COMPONENT_BYTES.get(accessor.componentType);
    const components = ACCESSOR_TYPE_COMPONENTS.get(accessor.type);
    if (!componentBytes) issues.push({ path: `${path}.componentType`, message: "componentType 不属于 glTF 2.0 类型" });
    if (!components) issues.push({ path: `${path}.type`, message: "accessor type 不属于 glTF 2.0 类型" });
    if (!Number.isInteger(accessor.count) || accessor.count < 1) issues.push({ path: `${path}.count`, message: "count 必须是正整数" });
    if (accessor.bufferView !== undefined && validReference(accessor.bufferView, views, `${path}.bufferView`, issues) && componentBytes && components && Number.isInteger(accessor.count) && accessor.count > 0) {
      const view = views[accessor.bufferView];
      const offset = accessor.byteOffset ?? 0;
      const elementBytes = componentBytes * components;
      const stride = view.byteStride ?? elementBytes;
      const requiredBytes = stride * (accessor.count - 1) + elementBytes;
      if (!Number.isInteger(offset) || offset < 0 || offset % componentBytes !== 0) issues.push({ path: `${path}.byteOffset`, message: "byteOffset 必须是非负且按 componentType 对齐的整数" });
      else if (offset + requiredBytes > view.byteLength) issues.push({ path, message: "accessor 数据越过 bufferView 边界" });
    }
    if (accessor.sparse !== undefined) {
      const sparse = accessor.sparse;
      if (!isObject(sparse) || !Number.isInteger(sparse.count) || sparse.count < 1 || sparse.count > accessor.count || !isObject(sparse.indices) || !isObject(sparse.values)) {
        issues.push({ path: `${path}.sparse`, message: "sparse accessor 结构或 count 无效" });
      } else {
        if (![5121, 5123, 5125].includes(sparse.indices.componentType)) issues.push({ path: `${path}.sparse.indices.componentType`, message: "sparse indices 只能使用无符号整数类型" });
        if (validReference(sparse.indices.bufferView, views, `${path}.sparse.indices.bufferView`, issues)) checkSparseRange(sparse.indices, views[sparse.indices.bufferView], sparse.count, ACCESSOR_COMPONENT_BYTES.get(sparse.indices.componentType) ?? 1, `${path}.sparse.indices`, issues);
        if (validReference(sparse.values.bufferView, views, `${path}.sparse.values.bufferView`, issues)) checkSparseRange(sparse.values, views[sparse.values.bufferView], sparse.count, componentBytes * components, `${path}.sparse.values`, issues);
      }
    }
  });
  return { buffers, views, accessors };
}

/** 校验稀疏 accessor 子数组是否落在对应 bufferView 内。 */
function checkSparseRange(item, view, count, elementBytes, path, issues) {
  const offset = item.byteOffset ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset + count * elementBytes > view.byteLength) issues.push({ path, message: "稀疏数据越过 bufferView 边界" });
}

/** 按图片文件头读取可验证的基础尺寸；不解码纹理像素或 GPU 压缩数据。 */
function imagePixelCount(bytes, mimeType, path, issues) {
  let width;
  let height;
  let mipLevels = 1;
  let layers = 1;
  let faces = 1;
  if (mimeType === "image/png") {
    if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.toString("ascii", 12, 16) !== "IHDR") {
      issues.push({ path, message: "PNG 文件头或 IHDR 块无效" });
      return 0;
    }
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  } else if (mimeType === "image/jpeg") {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      issues.push({ path, message: "JPEG 文件头无效" });
      return 0;
    }
    const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      while (bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker >= 0xd0 && marker <= 0xd7 || marker === 0x01) continue;
      if (offset + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (frameMarkers.has(marker) && length >= 7) {
        height = bytes.readUInt16BE(offset + 3);
        width = bytes.readUInt16BE(offset + 5);
        break;
      }
      offset += length;
    }
    if (width === undefined) {
      issues.push({ path, message: "JPEG 未找到有效尺寸帧" });
      return 0;
    }
  } else if (mimeType === "image/ktx2") {
    const signature = Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (bytes.length < 80 || !bytes.subarray(0, 12).equals(signature)) {
      issues.push({ path, message: "KTX2 文件头无效" });
      return 0;
    }
    width = bytes.readUInt32LE(20);
    height = bytes.readUInt32LE(24);
    layers = Math.max(1, bytes.readUInt32LE(32));
    faces = bytes.readUInt32LE(36);
    mipLevels = Math.max(1, bytes.readUInt32LE(40));
    if (bytes.readUInt32LE(28) !== 0 || ![1, 6].includes(faces)) issues.push({ path, message: "KTX2 仅接受二维纹理或六面立方体纹理" });
  } else {
    issues.push({ path, message: `无法静态确认 ${String(mimeType)} 的纹理像素预算；仅支持 PNG、JPEG 和 KTX2` });
    return 0;
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    issues.push({ path, message: "纹理尺寸必须是正整数" });
    return 0;
  }
  let pixels = 0;
  for (let level = 0; level < mipLevels; level += 1) {
    const levelPixels = Math.max(1, Math.floor(width / (2 ** level))) * Math.max(1, Math.floor(height / (2 ** level))) * layers * faces;
    pixels += levelPixels;
    if (!Number.isSafeInteger(pixels)) {
      issues.push({ path, message: "纹理像素总数超过安全整数范围" });
      return Number.MAX_SAFE_INTEGER;
    }
  }
  return pixels;
}

/** 检查纹理与图片引用，并统计每个 texture 使用的完整 mip 像素数。 */
function inspectTextures(gltf, bin, buffersInfo, issues) {
  const images = readArray(gltf, "images", issues);
  const textures = readArray(gltf, "textures", issues);
  const imagePixels = [];
  images.forEach((image, index) => {
    const path = `gltf.images[${index}]`;
    if (!isObject(image)) {
      issues.push({ path, message: "image 必须是对象" });
      imagePixels.push(0);
      return;
    }
    if (Object.hasOwn(image, "uri")) {
      issues.push({ path: `${path}.uri`, message: "自包含 GLB 不接受外部或 data URI 图片" });
      imagePixels.push(0);
      return;
    }
    if (!Number.isInteger(image.bufferView) || !validReference(image.bufferView, buffersInfo.views, `${path}.bufferView`, issues)) {
      issues.push({ path, message: "图片必须通过有效 bufferView 嵌入 GLB" });
      imagePixels.push(0);
      return;
    }
    const view = buffersInfo.views[image.bufferView];
    const buffer = buffersInfo.buffers[view.buffer];
    const start = (view.byteOffset ?? 0);
    const end = start + view.byteLength;
    if (!bin || view.buffer !== 0 || !buffer || end > bin.length) {
      issues.push({ path, message: "图片 bufferView 不在 GLB BIN chunk 内" });
      imagePixels.push(0);
      return;
    }
    imagePixels.push(imagePixelCount(bin.subarray(start, end), image.mimeType, path, issues));
  });
  textures.forEach((texture, index) => {
    const path = `gltf.textures[${index}]`;
    if (!isObject(texture)) {
      issues.push({ path, message: "texture 必须是对象" });
      return;
    }
    const alternate = texture.extensions?.KHR_texture_basisu?.source;
    const source = alternate ?? texture.source;
    if (!validReference(source, images, `${path}.source`, issues)) return;
  });
  return textures.reduce((total, texture, index) => {
    const source = texture?.extensions?.KHR_texture_basisu?.source ?? texture?.source;
    return Number.isInteger(source) && source >= 0 && source < imagePixels.length ? total + imagePixels[source] : total;
  }, 0);
}

/** 校验 mesh/primitives/accessor 索引并依据拓扑类型累计声明三角形数。 */
function inspectMeshes(gltf, accessors, issues) {
  const materials = readArray(gltf, "materials", issues);
  const meshes = readArray(gltf, "meshes", issues);
  const trianglesByMesh = meshes.map(() => 0);
  meshes.forEach((mesh, meshIndex) => {
    const primitives = Array.isArray(mesh?.primitives) ? mesh.primitives : [];
    if (!Array.isArray(mesh?.primitives) || primitives.length === 0) issues.push({ path: `gltf.meshes[${meshIndex}].primitives`, message: "mesh 必须至少包含一个 primitive" });
    primitives.forEach((primitive, primitiveIndex) => {
      const path = `gltf.meshes[${meshIndex}].primitives[${primitiveIndex}]`;
      if (!isObject(primitive) || !isObject(primitive.attributes)) {
        issues.push({ path, message: "primitive 必须包含 attributes 对象" });
        return;
      }
      const positionIndex = primitive.attributes.POSITION;
      if (!validReference(positionIndex, accessors, `${path}.attributes.POSITION`, issues)) return;
      const position = accessors[positionIndex];
      if (position?.type !== "VEC3" || position?.componentType !== 5126) issues.push({ path: `${path}.attributes.POSITION`, message: "POSITION accessor 必须是 FLOAT VEC3" });
      for (const [semantic, accessorIndex] of Object.entries(primitive.attributes)) validReference(accessorIndex, accessors, `${path}.attributes.${semantic}`, issues);
      if (primitive.targets !== undefined) {
        if (!Array.isArray(primitive.targets)) issues.push({ path: `${path}.targets`, message: "targets 必须是 accessor 映射数组" });
        else for (const [targetIndex, target] of primitive.targets.entries()) {
          if (!isObject(target)) issues.push({ path: `${path}.targets[${targetIndex}]`, message: "morph target 必须是对象" });
          else for (const [semantic, accessorIndex] of Object.entries(target)) validReference(accessorIndex, accessors, `${path}.targets[${targetIndex}].${semantic}`, issues);
        }
      }
      if (primitive.indices !== undefined) {
        if (validReference(primitive.indices, accessors, `${path}.indices`, issues)) {
          const indices = accessors[primitive.indices];
          if (indices?.type !== "SCALAR" || ![5121, 5123, 5125].includes(indices?.componentType)) issues.push({ path: `${path}.indices`, message: "indices accessor 必须是无符号整数 SCALAR" });
        }
      }
      if (primitive.material !== undefined) validReference(primitive.material, materials, `${path}.material`, issues);
      const mode = primitive.mode ?? 4;
      if (!Number.isInteger(mode) || mode < 0 || mode > 6) {
        issues.push({ path: `${path}.mode`, message: "primitive mode 必须在 glTF 2.0 的 0 至 6 范围内" });
        return;
      }
      const count = primitive.indices === undefined ? position?.count : accessors[primitive.indices]?.count;
      if (!Number.isInteger(count) || count < 0) return;
      let triangles = 0;
      if (mode === 4) {
        if (count % 3 !== 0) issues.push({ path, message: "TRIANGLES 的索引或顶点数量必须是 3 的倍数" });
        triangles = Math.floor(count / 3);
      } else if (mode === 5 || mode === 6) triangles = Math.max(0, count - 2);
      trianglesByMesh[meshIndex] += triangles;
    });
  });
  return { materials, meshes, trianglesByMesh };
}

/** 校验动画采样器、channel 目标及 skin 的关节和 inverse bind matrix 引用。 */
function inspectAnimationsAndSkins(animations, skins, nodes, accessors, issues) {
  skins.forEach((skin, skinIndex) => {
    const path = `gltf.skins[${skinIndex}]`;
    if (!isObject(skin) || !Array.isArray(skin.joints) || skin.joints.length === 0) {
      issues.push({ path, message: "skin 必须包含非空 joints 数组" });
      return;
    }
    skin.joints.forEach((nodeIndex, jointIndex) => validReference(nodeIndex, nodes, `${path}.joints[${jointIndex}]`, issues));
    if (skin.skeleton !== undefined) validReference(skin.skeleton, nodes, `${path}.skeleton`, issues);
    if (skin.inverseBindMatrices !== undefined && validReference(skin.inverseBindMatrices, accessors, `${path}.inverseBindMatrices`, issues)) {
      const accessor = accessors[skin.inverseBindMatrices];
      if (accessor?.type !== "MAT4" || accessor?.componentType !== 5126 || accessor?.count !== skin.joints.length) issues.push({ path: `${path}.inverseBindMatrices`, message: "inverseBindMatrices 必须是每个 joint 对应一个 FLOAT MAT4" });
    }
  });
  animations.forEach((animation, animationIndex) => {
    const path = `gltf.animations[${animationIndex}]`;
    if (!isObject(animation) || !Array.isArray(animation.samplers) || animation.samplers.length === 0 || !Array.isArray(animation.channels) || animation.channels.length === 0) {
      issues.push({ path, message: "animation 必须包含非空 samplers 和 channels 数组" });
      return;
    }
    animation.samplers.forEach((sampler, samplerIndex) => {
      const samplerPath = `${path}.samplers[${samplerIndex}]`;
      if (!isObject(sampler)) {
        issues.push({ path: samplerPath, message: "animation sampler 必须是对象" });
        return;
      }
      if (validReference(sampler.input, accessors, `${samplerPath}.input`, issues) && (accessors[sampler.input]?.type !== "SCALAR" || accessors[sampler.input]?.componentType !== 5126)) issues.push({ path: `${samplerPath}.input`, message: "动画输入 accessor 必须是 FLOAT SCALAR" });
      validReference(sampler.output, accessors, `${samplerPath}.output`, issues);
      if (sampler.interpolation !== undefined && !["LINEAR", "STEP", "CUBICSPLINE"].includes(sampler.interpolation)) issues.push({ path: `${samplerPath}.interpolation`, message: "动画插值方式无效" });
    });
    animation.channels.forEach((channel, channelIndex) => {
      const channelPath = `${path}.channels[${channelIndex}]`;
      if (!isObject(channel)) {
        issues.push({ path: channelPath, message: "animation channel 必须是对象" });
        return;
      }
      validReference(channel.sampler, animation.samplers, `${channelPath}.sampler`, issues);
      const target = channel.target;
      if (!isObject(target) || !["translation", "rotation", "scale", "weights"].includes(target.path)) issues.push({ path: `${channelPath}.target`, message: "animation channel target 或 path 无效" });
      else validReference(target.node, nodes, `${channelPath}.target.node`, issues);
    });
  });
}

/** 校验节点、动画、骨架及实例扩展，并为指定场景计算保守三角形数。 */
function inspectScenes(gltf, accessors, meshInfo, manifestAsset, issues) {
  const nodes = readArray(gltf, "nodes", issues);
  const scenes = readArray(gltf, "scenes", issues);
  const skins = readArray(gltf, "skins", issues);
  const animations = readArray(gltf, "animations", issues);
  const parents = new Array(nodes.length).fill(0);
  nodes.forEach((node, index) => {
    const path = `gltf.nodes[${index}]`;
    if (!isObject(node)) {
      issues.push({ path, message: "node 必须是对象" });
      return;
    }
    if (node.mesh !== undefined) validReference(node.mesh, meshInfo.meshes, `${path}.mesh`, issues);
    if (node.skin !== undefined) validReference(node.skin, skins, `${path}.skin`, issues);
    if (node.skin !== undefined && node.mesh === undefined) issues.push({ path, message: "带 skin 的 node 必须同时引用 mesh" });
    if (node.children !== undefined && !Array.isArray(node.children)) issues.push({ path: `${path}.children`, message: "children 必须是数组" });
    for (const [childIndex, child] of (Array.isArray(node.children) ? node.children : []).entries()) {
      if (validReference(child, nodes, `${path}.children[${childIndex}]`, issues)) parents[child] += 1;
    }
  });
  parents.forEach((count, index) => { if (count > 1) issues.push({ path: `gltf.nodes[${index}]`, message: "node 不能有多个父节点" }); });
  inspectAnimationsAndSkins(animations, skins, nodes, accessors, issues);

  const colors = new Uint8Array(nodes.length);
  for (let start = 0; start < nodes.length; start += 1) {
    if (colors[start]) continue;
    const stack = [[start, false]];
    while (stack.length) {
      const [index, leaving] = stack.pop();
      if (leaving) {
        colors[index] = 2;
        continue;
      }
      if (colors[index] === 1) {
        issues.push({ path: `gltf.nodes[${index}]`, message: "node hierarchy 存在循环" });
        continue;
      }
      if (colors[index] === 2) continue;
      colors[index] = 1;
      stack.push([index, true]);
      for (const child of Array.isArray(nodes[index]?.children) ? nodes[index].children : []) if (Number.isInteger(child) && child >= 0 && child < nodes.length) stack.push([child, false]);
    }
  }

  const sceneMatches = scenes.map((scene, index) => ({ scene, index })).filter(({ scene }) => scene?.name === manifestAsset.sceneId);
  if (sceneMatches.length !== 1) issues.push({ path: "asset.sceneId", message: `必须唯一匹配一个 glTF scene.name：${manifestAsset.sceneId}` });
  if (gltf.scene !== undefined) validReference(gltf.scene, scenes, "gltf.scene", issues);
  const selected = sceneMatches[0]?.scene;
  if (selected && (!Array.isArray(selected.nodes) || selected.nodes.some((index) => !validReference(index, nodes, "gltf.scenes[].nodes", issues)))) issues.push({ path: "gltf.scenes", message: "目标 scene 的 roots 必须是有效节点索引数组" });
  if (selected && Array.isArray(selected.nodes)) selected.nodes.forEach((index) => {
    if (Number.isInteger(index) && index >= 0 && index < parents.length && parents[index] > 0) issues.push({ path: `gltf.scenes[].nodes[${index}]`, message: "scene root 不能同时是其他 node 的 child" });
  });
  let triangles = 0;
  let instanceCount = 0;
  if (selected && Array.isArray(selected.nodes)) {
    const stack = [...selected.nodes];
    const seen = new Set();
    while (stack.length) {
      const nodeIndex = stack.pop();
      if (!Number.isInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= nodes.length || seen.has(nodeIndex)) continue;
      seen.add(nodeIndex);
      const node = nodes[nodeIndex];
      const multiplier = node?.extensions?.EXT_mesh_gpu_instancing ? getInstanceCount(node, nodeIndex, accessors, issues) : 1;
      if (Number.isInteger(node?.mesh) && node.mesh >= 0 && node.mesh < meshInfo.meshes.length) {
        triangles += meshInfo.trianglesByMesh[node.mesh] * multiplier;
        instanceCount += multiplier;
      }
      if (Array.isArray(node?.children)) stack.push(...node.children);
    }
  }
  if (animations.length > 0 && manifestAsset.allowAnimations !== true) issues.push({ path: "asset.allowAnimations", message: `模型含 ${animations.length} 个动画，但清单未明确允许` });
  if (skins.length > 0 && manifestAsset.allowSkins !== true) issues.push({ path: "asset.allowSkins", message: `模型含 ${skins.length} 个 skin，但清单未明确允许` });
  return { sceneIndex: sceneMatches[0]?.index ?? null, sceneName: selected?.name ?? null, triangles, instanceCount, skinCount: skins.length, animationCount: animations.length };
}

/** 读取 EXT_mesh_gpu_instancing 中的一组 accessor 数量，缺失或数量不一时拒绝。 */
function getInstanceCount(node, nodeIndex, accessors, issues) {
  const attributes = node.extensions?.EXT_mesh_gpu_instancing?.attributes;
  const path = `gltf.nodes[${nodeIndex}].extensions.EXT_mesh_gpu_instancing.attributes`;
  if (!isObject(attributes) || Object.keys(attributes).length === 0) {
    issues.push({ path, message: "实例扩展必须声明至少一个属性 accessor" });
    return 1;
  }
  const counts = Object.entries(attributes).map(([semantic, index]) => {
    if (!validReference(index, accessors, `${path}.${semantic}`, issues)) return 1;
    return accessors[index]?.count ?? 1;
  });
  if (counts.some((count) => count !== counts[0])) issues.push({ path, message: "所有实例属性 accessor 的 count 必须相同" });
  return Math.max(1, ...counts);
}

/** 收集 glTF extension 声明并拒绝未嵌入文件所需的 URI 引用。 */
function inspectExtensionsAndUris(gltf, issues) {
  const used = readArray(gltf, "extensionsUsed", issues);
  const required = readArray(gltf, "extensionsRequired", issues);
  for (const [index, extension] of used.entries()) if (typeof extension !== "string" || extension.length === 0) issues.push({ path: `gltf.extensionsUsed[${index}]`, message: "扩展名称必须是非空字符串" });
  for (const [index, extension] of required.entries()) {
    if (typeof extension !== "string" || extension.length === 0) issues.push({ path: `gltf.extensionsRequired[${index}]`, message: "扩展名称必须是非空字符串" });
    else if (!used.includes(extension)) issues.push({ path: `gltf.extensionsRequired[${index}]`, message: "required 扩展必须同时出现在 extensionsUsed" });
  }
  const foundUris = [];
  const foundExtensions = new Set();
  const visit = (value, path) => {
    if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${path}[${index}]`));
    else if (isObject(value)) for (const [key, child] of Object.entries(value)) {
      if (URI_FIELDS.has(key) && typeof child === "string") foundUris.push(`${path}.${key}`);
      if (key === "extensions" && isObject(child)) Object.keys(child).forEach((extension) => foundExtensions.add(extension));
      visit(child, `${path}.${key}`);
    }
  };
  visit(gltf, "gltf");
  for (const uri of foundUris) issues.push({ path: uri, message: "此静态验收只接收自包含 GLB，必须移除所有 URI 资源引用" });
  return { used: [...new Set([...used, ...foundExtensions].filter((name) => typeof name === "string"))], compressed: [...foundExtensions, ...used].some((name) => COMPRESSED_EXTENSIONS.has(name)) };
}

/** 对清单和项目内模型执行 GLB、glTF 结构、引用及资源预算验收。 */
export async function validateModelManifest(manifest, { repoRoot }) {
  const issues = [];
  const fail = (path, message) => issues.push({ path, message });
  if (!isObject(manifest) || manifest.schemaVersion !== 1 || !isObject(manifest.asset)) throw new ModelValidationError([{ path: "manifest", message: "清单必须包含 schemaVersion=1 和 asset 对象" }]);
  const asset = manifest.asset;
  for (const field of ["assetId", "file", "source", "license", "sceneId"]) if (typeof asset[field] !== "string" || asset[field].trim() === "") fail(`asset.${field}`, "必须是非空字符串");
  if (!isObject(asset.coordinateSystem) || asset.coordinateSystem.units !== "meters" || asset.coordinateSystem.upAxis !== "Y") fail("asset.coordinateSystem", "必须明确声明 glTF 坐标：units=meters、upAxis=Y");
  if (!isObject(asset.budgets)) fail("asset.budgets", "必须显式声明资源预算");
  else for (const field of ["maxBytes", "maxTriangles", "maxMaterials", "maxTexturePixels"]) if (!Number.isSafeInteger(asset.budgets[field]) || asset.budgets[field] < (field === "maxBytes" ? 1 : 0)) fail(`asset.budgets.${field}`, "必须是满足非负边界的安全整数");
  if (typeof asset.allowAnimations !== "boolean") fail("asset.allowAnimations", "必须显式声明是否允许动画");
  if (typeof asset.allowSkins !== "boolean") fail("asset.allowSkins", "必须显式声明是否允许 skin");
  if (asset.externalUriPolicy !== "reject") fail("asset.externalUriPolicy", "必须显式声明 externalUriPolicy=reject");
  if (issues.length) throw new ModelValidationError(issues);

  let modelPath;
  try {
    modelPath = await resolveProjectFile(repoRoot, asset.file);
  } catch (error) {
    throw new ModelValidationError([{ path: "asset.file", message: error.message }]);
  }
  if (!/\.glb$/i.test(asset.file)) fail("asset.file", "仅接受 .glb 文件");
  const fileInfo = await stat(modelPath);
  if (fileInfo.size > asset.budgets.maxBytes) throw new ModelValidationError([{ path: "asset.budgets.maxBytes", message: `模型大小 ${fileInfo.size} 超过预算 ${asset.budgets.maxBytes}` }]);
  const bytes = await readFile(modelPath);
  if (bytes.length > asset.budgets.maxBytes) fail("asset.budgets.maxBytes", `读取后的模型大小 ${bytes.length} 超过预算 ${asset.budgets.maxBytes}`);
  const sha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  // 摘要只供追踪；验收依据实际读取的模型结构、引用和预算，不能由旧摘要阻断。
  if (issues.length) throw new ModelValidationError(issues);

  const { gltf, bin, chunkCount } = parseGlb(bytes);
  if (!isObject(gltf.asset) || gltf.asset.version !== "2.0") fail("gltf.asset.version", "glTF asset.version 必须为 2.0");
  if (gltf.asset?.minVersion !== undefined && gltf.asset.minVersion !== "2.0") fail("gltf.asset.minVersion", "此验收器只接受最低版本为 2.0 的资产");
  const buffersInfo = inspectBuffersAndAccessors(gltf, bin, issues);
  const uriInfo = inspectExtensionsAndUris(gltf, issues);
  const meshInfo = inspectMeshes(gltf, buffersInfo.accessors, issues);
  const sceneInfo = inspectScenes(gltf, buffersInfo.accessors, meshInfo, asset, issues);
  const texturePixels = inspectTextures(gltf, bin, buffersInfo, issues);
  if (meshInfo.materials.length > asset.budgets.maxMaterials) fail("asset.budgets.maxMaterials", `材质数 ${meshInfo.materials.length} 超过预算 ${asset.budgets.maxMaterials}`);
  if (sceneInfo.triangles > asset.budgets.maxTriangles) fail("asset.budgets.maxTriangles", `目标场景三角形数 ${sceneInfo.triangles} 超过预算 ${asset.budgets.maxTriangles}`);
  if (texturePixels > asset.budgets.maxTexturePixels) fail("asset.budgets.maxTexturePixels", `纹理像素数 ${texturePixels} 超过预算 ${asset.budgets.maxTexturePixels}`);
  if (issues.length) throw new ModelValidationError(issues);
  return {
    status: "passed",
    asset: { assetId: asset.assetId, file: asset.file, sha256, source: asset.source, license: asset.license },
    glb: { version: 2, byteLength: bytes.length, chunkCount, jsonAssetVersion: gltf.asset.version, sceneId: asset.sceneId, sceneIndex: sceneInfo.sceneIndex },
    metrics: { triangles: sceneInfo.triangles, instances: sceneInfo.instanceCount, materials: meshInfo.materials.length, texturePixels, animationCount: sceneInfo.animationCount, skinCount: sceneInfo.skinCount },
    verification: { container: "validated", gltfStructure: "validated", geometryCounts: "accessor-metadata-only", geometryDecoded: false, compressedGeometryPresent: uriInfo.compressed, texturePixels: "embedded-header-dimensions", texturePixelsDecoded: false, externalUris: "rejected" },
    extensions: uriInfo.used,
  };
}

/** 解析 CLI 参数并输出机器可读结果；失败时返回非零状态码。 */
function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === "--help" || key === "-h") return { help: true };
    if (!["--repo", "--manifest"].includes(key) || !args[index + 1]) throw new Error(`未知或缺少参数值：${key}`);
    values[key.slice(2)] = args[++index];
  }
  if (!values.repo || !values.manifest) throw new Error("用法：node validate-model.mjs --repo <项目根目录> --manifest <模型清单.json>");
  return values;
}

/** 执行命令行入口，读取清单并按验证结果设置进程状态。 */
async function main() {
  try {
    const args = parseArguments(process.argv.slice(2));
    if (args.help) {
      process.stdout.write("用法：node validate-model.mjs --repo <项目根目录> --manifest <模型清单.json>\n");
      return;
    }
    const manifestPath = resolve(args.manifest);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const result = await validateModelManifest(manifest, { repoRoot: resolve(args.repo) });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const issues = error instanceof ModelValidationError ? error.issues : [{ path: "cli", message: error.message }];
    process.stderr.write(`${JSON.stringify({ status: "failed", issues }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

// 按真实文件身份识别直接执行，避免同名调用方或 npm bin 链接被误判。
if (process.argv[1] && await realpath(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
