import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";
import { validateProductionContract } from "../../threejs-game-workflow-control/scripts/visual-production-contract.mjs";

const VALIDATOR = resolve("skills/threejs-game-model-pipeline/scripts/validate-model.mjs");
const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7wAAAABJRU5ErkJggg==", "base64");

/** 构造包含三角形 POSITION accessor 的 glTF 2.0 场景数据。 */
function baseGltf() {
  return {
    asset: { version: "2.0", generator: "fixture" },
    scene: 0,
    scenes: [{ name: "main", nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
  };
}

/** 编码真实 GLB v2 头部、JSON chunk 和 BIN chunk，JSON/BIN 按规范补齐。 */
function encodeGlb(gltf, bin = Buffer.alloc(36)) {
  const rawJson = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonPadding = (4 - rawJson.length % 4) % 4;
  const json = Buffer.concat([rawJson, Buffer.alloc(jsonPadding, 0x20)]);
  const binPadding = (4 - bin.length % 4) % 4;
  const paddedBin = Buffer.concat([bin, Buffer.alloc(binPadding)]);
  const bytes = Buffer.alloc(12 + 8 + json.length + 8 + paddedBin.length);
  bytes.writeUInt32LE(GLB_MAGIC, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(json.length, 12);
  bytes.writeUInt32LE(JSON_CHUNK, 16);
  json.copy(bytes, 20);
  const binHeader = 20 + json.length;
  bytes.writeUInt32LE(paddedBin.length, binHeader);
  bytes.writeUInt32LE(BIN_CHUNK, binHeader + 4);
  paddedBin.copy(bytes, binHeader + 8);
  return bytes;
}

/** 生成包含冻结 SHA 和显式预算策略的项目资产清单。 */
function modelManifest(bytes, overrides = {}) {
  return {
    schemaVersion: 1,
    asset: {
      assetId: "fixture-triangle",
      file: "public/models/fixture.glb",
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      source: "本地测试夹具",
      license: "CC0-1.0",
      sceneId: "main",
      coordinateSystem: { units: "meters", upAxis: "Y" },
      budgets: { maxBytes: 4096, maxTriangles: 1, maxMaterials: 1, maxTexturePixels: 0 },
      allowAnimations: false,
      allowSkins: false,
      externalUriPolicy: "reject",
      ...overrides,
    },
  };
}

/** 为每个测试建立隔离项目并在结束时清理测试临时目录。 */
async function createProject(t, { gltf = baseGltf(), bin = Buffer.alloc(36), manifestOverrides = {} } = {}) {
  const temp = await mkdtemp(join(tmpdir(), "threejs-model-gate-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const repo = join(temp, "project");
  const modelPath = join(repo, "public", "models", "fixture.glb");
  await mkdir(dirname(modelPath), { recursive: true });
  const bytes = encodeGlb(gltf, bin);
  await writeFile(modelPath, bytes);
  const manifestPath = join(repo, "references", "model-manifest.json");
  await mkdir(dirname(manifestPath), { recursive: true });
  const manifest = modelManifest(bytes, manifestOverrides);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return { temp, repo, modelPath, manifestPath, manifest, bytes };
}

/** 运行 CLI，并将 stdout/stderr JSON 解码为便于断言的结果。 */
function runValidator(project) {
  const result = spawnSync(process.execPath, [VALIDATOR, "--repo", project.repo, "--manifest", project.manifestPath], { encoding: "utf8" });
  let output;
  try { output = JSON.parse(result.stdout || result.stderr); } catch { output = { raw: result.stdout || result.stderr }; }
  return { ...result, output };
}

/** 保存修改后的清单，用于在同一真实 GLB 文件上测试独立失败条件。 */
async function saveManifest(project, update) {
  const manifest = structuredClone(project.manifest);
  update(manifest);
  await writeFile(project.manifestPath, JSON.stringify(manifest, null, 2));
}

test("CLI 接受自包含 GLB，并明确标注只检查 accessor 元数据", async (t) => {
  const project = await createProject(t);
  const result = runValidator(project);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output.status, "passed");
  assert.equal(result.output.metrics.triangles, 1);
  assert.equal(result.output.verification.geometryDecoded, false);
  assert.equal(result.output.verification.geometryCounts, "accessor-metadata-only");
});

test("CLI 拒绝不匹配的冻结 SHA", async (t) => {
  const project = await createProject(t);
  await saveManifest(project, (manifest) => { manifest.asset.sha256 = `sha256:${"0".repeat(64)}`; });
  const result = runValidator(project);
  assert.equal(result.status, 1);
  assert.ok(result.output.issues.some((issue) => issue.path === "asset.sha256"));
});

test("CLI 拒绝 GLB 头部声明长度与文件实际长度不一致", async (t) => {
  const project = await createProject(t);
  const bytes = await readFile(project.modelPath);
  bytes.writeUInt32LE(bytes.length - 4, 8);
  await writeFile(project.modelPath, bytes);
  await saveManifest(project, (manifest) => { manifest.asset.sha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`; });
  const result = runValidator(project);
  assert.equal(result.status, 1);
  assert.ok(result.output.issues.some((issue) => issue.path === "glb.header.length"));
});

test("CLI 拒绝三角形预算超限", async (t) => {
  const project = await createProject(t);
  await saveManifest(project, (manifest) => { manifest.asset.budgets.maxTriangles = 0; });
  const result = runValidator(project);
  assert.equal(result.status, 1);
  assert.ok(result.output.issues.some((issue) => issue.path === "asset.budgets.maxTriangles"));
});

test("CLI 拒绝 GLB 文件大小超过预算", async (t) => {
  const project = await createProject(t);
  await saveManifest(project, (manifest) => { manifest.asset.budgets.maxBytes = 1; });
  const result = runValidator(project);
  assert.equal(result.status, 1);
  assert.ok(result.output.issues.some((issue) => issue.path === "asset.budgets.maxBytes"));
});

test("CLI 拒绝材质数量超过预算", async (t) => {
  const gltf = baseGltf();
  gltf.materials = [{}];
  const project = await createProject(t, { gltf, manifestOverrides: { budgets: { maxBytes: 4096, maxTriangles: 1, maxMaterials: 0, maxTexturePixels: 0 } } });
  const result = runValidator(project);
  assert.equal(result.status, 1);
  assert.ok(result.output.issues.some((issue) => issue.path === "asset.budgets.maxMaterials"));
});

test("CLI 拒绝模型相对路径越过项目根目录", async (t) => {
  const project = await createProject(t);
  await saveManifest(project, (manifest) => { manifest.asset.file = "../outside.glb"; });
  const result = runValidator(project);
  assert.equal(result.status, 1);
  assert.match(result.output.issues[0].message, /项目内相对路径/);
});

test("CLI 拒绝经由目录符号链接逃逸项目的模型", async (t) => {
  const project = await createProject(t);
  const outside = join(project.temp, "outside");
  await mkdir(outside);
  await writeFile(join(outside, "fixture.glb"), project.bytes);
  try {
    await symlink(outside, join(project.repo, "escape"), "junction");
  } catch (error) {
    t.skip(`当前环境不能创建目录联接：${error.message}`);
    return;
  }
  await saveManifest(project, (manifest) => { manifest.asset.file = "escape/fixture.glb"; });
  const result = runValidator(project);
  assert.equal(result.status, 1);
  assert.match(result.output.issues[0].message, /符号链接逃逸/);
});

test("CLI 拒绝外部 buffer URI，即使 BIN chunk 仍存在", async (t) => {
  const gltf = baseGltf();
  gltf.buffers[0].uri = "model.bin";
  const project = await createProject(t, { gltf });
  const result = runValidator(project);
  assert.equal(result.status, 1);
  assert.ok(result.output.issues.some((issue) => issue.path === "gltf.buffers[0].uri"));
});

test("CLI 拒绝未明示允许的动画与 skin", async (t) => {
  const gltf = baseGltf();
  gltf.animations = [{}];
  gltf.skins = [{}];
  const project = await createProject(t, { gltf });
  const result = runValidator(project);
  assert.equal(result.status, 1);
  assert.ok(result.output.issues.some((issue) => issue.path === "asset.allowAnimations"));
  assert.ok(result.output.issues.some((issue) => issue.path === "asset.allowSkins"));
});

test("CLI 为压缩几何返回未解码标记", async (t) => {
  const gltf = baseGltf();
  gltf.extensionsUsed = ["KHR_draco_mesh_compression"];
  const project = await createProject(t, { gltf });
  const result = runValidator(project);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output.verification.compressedGeometryPresent, true);
  assert.equal(result.output.verification.geometryDecoded, false);
});

test("CLI 将嵌入纹理完整 mip 像素纳入预算", async (t) => {
  const gltf = baseGltf();
  const bin = Buffer.concat([Buffer.alloc(36), PNG_1X1]);
  gltf.buffers[0].byteLength = bin.length;
  gltf.bufferViews.push({ buffer: 0, byteOffset: 36, byteLength: PNG_1X1.length });
  gltf.images = [{ bufferView: 1, mimeType: "image/png" }];
  gltf.textures = [{ source: 0 }];
  const project = await createProject(t, { gltf, bin });
  const result = runValidator(project);
  assert.equal(result.status, 1);
  assert.ok(result.output.issues.some((issue) => issue.path === "asset.budgets.maxTexturePixels"));
});

test("资源生产合同将 authored-model 固定映射为 gltf-model", () => {
  const contract = {
    production_origin: "independent-production",
    production_method: "authored-model",
    delivery_kind: "gltf-model",
    image_generation_required: false,
    generation_record_required: false,
    substitution_policy: "forbid",
    expected_assets: [{ asset_id: "guard-model" }],
  };
  assert.deepEqual(validateProductionContract(contract), []);
  const wrongDelivery = validateProductionContract({ ...contract, delivery_kind: "raster-image" });
  assert.ok(wrongDelivery.some((issue) => issue.includes("authored-model 必须使用 delivery_kind=gltf-model")));
});
