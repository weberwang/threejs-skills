import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

/** 判断普通 JSON 对象，供视频与图片图集报告共同使用。 */
export function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 判断去除空白后仍有内容的字符串。 */
export function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** 判断数值是否为正有限数。 */
export function finitePositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** 将项目内路径转换为比较用的正斜杠形式。 */
export function normalizedPath(value) {
  return nonEmptyString(value) ? value.replaceAll("\\", "/") : "";
}

/** 判断路径是否是项目内相对路径，防止合同把文件门引向项目外。 */
export function isProjectRelativePath(value) {
  const path = normalizedPath(value);
  if (!path || path.startsWith("/") || /^[A-Za-z]:\//u.test(path) || path.startsWith("//")) return false;
  return !path.split("/").some((segment) => segment === "..");
}

/** 校验 ThreeJS 运行时 URL，阻止外部 scheme、反斜杠和编码后的目录逃逸。 */
export function isRuntimeUrl(value) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0 || /\s/u.test(value)) return false;
  if (value.includes("\\") || /^[A-Za-z][A-Za-z\d+.-]*:/u.test(value) || value.startsWith("//")) return false;
  const path = value.split(/[?#]/u, 1)[0];
  if (path.length === 0) return false;
  let decoded = path;
  for (let round = 0; round < 3; round += 1) {
    if (decoded.includes("\\") || decoded.split("/").some((segment) => segment === "." || segment === "..")) return false;
    let next;
    try { next = decodeURIComponent(decoded); } catch { return false; }
    if (next === decoded) return true;
    decoded = next;
  }
  return !decoded.includes("\\") && !decoded.split("/").some((segment) => segment === "." || segment === "..");
}

/** 校验工件绑定的项目内路径；摘要只作追踪信息，不参与验收。 */
export function validateArtifactBinding(artifact, label, errors) {
  if (!isObject(artifact)) {
    errors.push(label + " 必须是包含 file 的对象");
    return;
  }
  if (!nonEmptyString(artifact.file)) errors.push(label + ".file 必须是非空项目内相对路径");
  else if (!isProjectRelativePath(artifact.file)) errors.push(label + ".file 必须是项目内相对路径：" + artifact.file);
}

/** 裁剪区域使用显示画布上的整数像素，禁止缺项或静默修正边界。 */
export function validateRegion(region, label, errors) {
  if (!isObject(region)) {
    errors.push(label + " 必须是包含 x、y、width、height 的区域对象");
    return false;
  }
  const valid = ["x", "y", "width", "height"].every((field) =>
    Number.isSafeInteger(region[field]) && region[field] >= (field === "x" || field === "y" ? 0 : 1));
  if (!valid) errors.push(label + " 的 x/y 必须是非负安全整数，width/height 必须是正安全整数");
  return valid;
}

/** 局部锚点允许半像素，但不允许隐式字符串转换或无效坐标。 */
export function validateAnchor(anchor, label, errors) {
  const valid = isObject(anchor) && ["x", "y"].every((field) => Number.isFinite(anchor[field]) && anchor[field] >= 0);
  if (!valid) errors.push(label + " 必须包含非负有限数值 x/y");
  return valid;
}

/** 校验图集参数，确保报告设置在 accepted 合同中有唯一的期望值。 */
export function validateSettings(settings, label, errors) {
  if (!isObject(settings)) {
    errors.push(label + ".settings 必须包含 fps、width、height 和 remove_background");
    return;
  }
  if (!finitePositive(settings.fps)) errors.push(label + ".settings.fps 必须是正有限数字");
  if (!Number.isInteger(settings.width) || settings.width <= 0) errors.push(label + ".settings.width 必须是正整数");
  if (!Number.isInteger(settings.height) || settings.height <= 0) errors.push(label + ".settings.height 必须是正整数");
  if (typeof settings.remove_background !== "boolean") errors.push(label + ".settings.remove_background 必须是布尔值");
  if (settings.region !== undefined) validateRegion(settings.region, label + ".settings.region", errors);
  if (settings.anchor !== undefined) {
    const valid = validateAnchor(settings.anchor, label + ".settings.anchor", errors);
    if (valid && isObject(settings.region) && (settings.anchor.x > settings.region.width || settings.anchor.y > settings.region.height)) {
      errors.push(label + ".settings.anchor 必须位于源区域内");
    }
  }
}

/** 视频与图片路线共用区域身份校验，区域必须同时对应清单和报告。 */
export function validateReportedRegion(report, settings, label, errors) {
  const regions = [settings?.region, report.input?.region, report.settings?.region];
  if (regions.every((region) => region === undefined)) return;
  const [expected, inputRegion, reportedRegion] = regions;
  const expectedValid = validateRegion(expected, label + " 对应的 frame_animation.settings.region", errors);
  const inputValid = validateRegion(inputRegion, label + ".input.region", errors);
  const reportedValid = validateRegion(reportedRegion, label + ".settings.region", errors);
  const fields = ["x", "y", "width", "height"];
  if (expectedValid && inputValid && fields.some((field) => expected[field] !== inputRegion[field])) {
    errors.push(label + ".input.region 必须等于 frame_animation.settings.region");
  }
  if (expectedValid && reportedValid && fields.some((field) => expected[field] !== reportedRegion[field])) {
    errors.push(label + ".settings.region 必须等于 frame_animation.settings.region");
  }
  const displayWidth = report.input?.display_width;
  const displayHeight = report.input?.display_height;
  if (!Number.isSafeInteger(displayWidth) || displayWidth <= 0 || !Number.isSafeInteger(displayHeight) || displayHeight <= 0) {
    errors.push(label + ".input.display_width/display_height 必须是区域所属显示画布的正安全整数尺寸");
  } else if (inputValid && (inputRegion.width > displayWidth - inputRegion.x || inputRegion.height > displayHeight - inputRegion.y)) {
    // 用减法比较避免坐标与宽高相加溢出，也防止编码前尺寸掩盖旋转后的越界。
    errors.push(label + ".input.region 必须完整位于实际显示画布内");
  }
}

/** 共用锚点绑定及真实缩放留白变换校验，防止 origin 落到无关空白边缘。 */
export function validateReportedAnchor(report, settings, label, errors) {
  const anchors = [settings?.anchor, report.input?.anchor, report.settings?.anchor];
  const explicit = anchors.some((anchor) => anchor !== undefined);
  let expectedAnchorValid = false;
  if (explicit) {
    const labels = [" 对应的 frame_animation.settings.anchor", ".input.anchor", ".settings.anchor"];
    const valid = anchors.map((anchor, index) => validateAnchor(anchor, label + labels[index], errors));
    expectedAnchorValid = valid[0];
    for (let index = 1; index < anchors.length; index += 1) {
      if (valid[0] && valid[index] && (anchors[index].x !== anchors[0].x || anchors[index].y !== anchors[0].y)) {
        errors.push(label + labels[index] + " 必须等于 frame_animation.settings.anchor");
      }
    }
  }

  const cell = report.cell;
  // 整画布和分区都必须提供真实布局，缺少字段不能绕过缩放留白校验。
  const sourceAnchor = cell?.source_anchor;
  const contentRect = cell?.content_rect;
  const sourceValid = validateAnchor(sourceAnchor, label + ".cell.source_anchor", errors);
  const rectValid = validateRegion(contentRect, label + ".cell.content_rect", errors);
  const sourceWidth = report.input?.region?.width ?? report.input?.display_width;
  const sourceHeight = report.input?.region?.height ?? report.input?.display_height;
  if (!Number.isSafeInteger(sourceWidth) || sourceWidth <= 0 || !Number.isSafeInteger(sourceHeight) || sourceHeight <= 0) {
    errors.push(label + ".cell.source_anchor 缺少有效源区域或显示画布尺寸");
    return;
  }
  if (sourceValid && (sourceAnchor.x > sourceWidth || sourceAnchor.y > sourceHeight)) {
    errors.push(label + ".cell.source_anchor 必须位于源区域内");
  }
  if (sourceValid && expectedAnchorValid
      && (sourceAnchor.x !== anchors[0].x || sourceAnchor.y !== anchors[0].y)) {
    errors.push(label + ".cell.source_anchor 必须等于 frame_animation.settings.anchor");
  }
  if (!explicit && sourceValid && (sourceAnchor.x !== sourceWidth / 2 || sourceAnchor.y !== sourceHeight - 1)) {
    errors.push(label + ".cell.source_anchor 必须等于默认底部中心锚点：源宽/2、源高-1");
  }
  if (!Number.isSafeInteger(cell?.width) || !Number.isSafeInteger(cell?.height) || cell.width <= 0 || cell.height <= 0) return;
  if (rectValid && (contentRect.width > cell.width - contentRect.x || contentRect.height > cell.height - contentRect.y)) {
    errors.push(label + ".cell.content_rect 必须完整位于输出 cell 内");
  }
  const target = cell.target_anchor;
  if (sourceValid && rectValid && isObject(target) && Number.isFinite(target.x) && Number.isFinite(target.y)) {
    // 使用报告记录的实际栅格尺寸，避免另行猜测缩放器的像素取整与留白量。
    const expectedX = contentRect.x + sourceAnchor.x * contentRect.width / sourceWidth;
    const expectedY = contentRect.y + sourceAnchor.y * contentRect.height / sourceHeight;
    if (Math.abs(target.x - expectedX) > 1e-6 || Math.abs(target.y - expectedY) > 1e-6) {
      errors.push(label + ".cell.target_anchor 必须等于局部锚点经缩放与留白后的变换结果");
    }
  }
}

/** 计算文件内容 SHA-256，保持与 visual manifest 文件门相同的表示。 */
export function sha256Bytes(bytes) {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

/** 解析项目内路径；调用方可提供更严格的 symlink/junction 检查器。 */
function defaultResolvePath(projectRoot, file) {
  const root = resolve(projectRoot ?? ".");
  const candidate = resolve(root, file);
  const relativePath = relative(root, candidate);
  if (isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(".." + (process.platform === "win32" ? "\\" : "/"))) {
    throw new Error("路径逃逸项目根目录：" + file);
  }
  return candidate;
}

/** 读取绑定工件并复核其真实路径，确保文件可读且没有经链接逃逸项目根目录。 */
export async function readBoundArtifact(artifact, label, context, errors) {
  if (!isObject(artifact) || !nonEmptyString(artifact.file)) return null;
  let resolvedFile;
  try {
    resolvedFile = (context.resolvePath ?? ((file) => defaultResolvePath(context.projectRoot, file)))(artifact.file);
    const exists = context.isFile ? await context.isFile(resolvedFile) : await stat(resolvedFile).then((item) => item.isFile()).catch(() => false);
    if (!exists) {
      errors.push(label + " 文件不存在：" + artifact.file);
      return null;
    }
    if (nonEmptyString(context.projectRoot)) {
      const projectRootReal = await realpath(resolve(context.projectRoot));
      const artifactReal = await realpath(resolvedFile);
      const relativeRealPath = relative(projectRootReal, artifactReal);
      // 词法路径仍在项目内也可能经 symlink/junction 指向外部，必须按真实位置二次约束。
      if (isAbsolute(relativeRealPath) || relativeRealPath === ".."
        || relativeRealPath.startsWith(".." + (process.platform === "win32" ? "\\" : "/"))) {
        throw new Error("文件真实位置逃逸项目根目录：" + artifact.file);
      }
    }
    const bytes = await readFile(resolvedFile);
    return { bytes, file: artifact.file, resolvedFile };
  } catch (error) {
    errors.push(label + "：" + error.message);
    return null;
  }
}

/** 从 PNG IHDR 读取图集尺寸；拒绝签名或正尺寸无效的文件。 */
export function readPngDimensions(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!Buffer.isBuffer(bytes) || bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) return null;
  if (bytes.toString("ascii", 12, 16) !== "IHDR") return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** 以严格 UTF-8 读取文本工件，避免二进制内容被静默替换后通过检查。 */
export function decodeText(bytes, label, errors) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!nonEmptyString(text)) errors.push(label + " 文件内容不能为空");
    return text;
  } catch {
    errors.push(label + " 必须是有效 UTF-8 文本");
    return null;
  }
}

/** 网页预览必须是可读取的 UTF-8 HTML；meta 中的摘要仅供追踪，不参与验收。 */
export function validatePreview(artifact, label, errors) {
  if (!artifact) return;
  const html = decodeText(artifact.bytes, label, errors);
  if (html === null) return;
  if (!/<html\b/iu.test(html)) errors.push(label + " 必须包含 HTML 根元素");
}

/** 比较报告中的相对工件路径；绝对路径仅作诊断信息，不参与文件身份绑定。 */
export function validateReportedArtifactPath(reportPath, binding, label, errors) {
  if (!nonEmptyString(reportPath) || !isObject(binding) || !nonEmptyString(binding.file)) return;
  const isAbsoluteReportPath = isAbsolute(reportPath) || /^[A-Za-z]:[\\/]/u.test(reportPath)
    || reportPath.startsWith("\\\\") || reportPath.startsWith("//");
  if (isAbsoluteReportPath) return;
  if (normalizedPath(reportPath) !== normalizedPath(binding.file)) {
    errors.push(label + " 必须与 manifest 工件路径一致");
  }
}

/** 校验真实 Three.js 加载、水平 UV、Sprite 锚点和逐帧播放合同。 */
export function validateThreeJSContract(report, asset, sheetBinding, label, errors) {
  const animation = isObject(report.animation) ? report.animation : {};
  if (!nonEmptyString(animation.key)) errors.push(label + ".animation.key 必须是非空字符串");
  if (!nonEmptyString(animation.texture_key)) errors.push(label + ".animation.texture_key 必须是非空字符串");
  if (!finitePositive(animation.frame_rate)) errors.push(label + ".animation.frame_rate 必须是正有限数字");
  else if (finitePositive(report.input?.fps) && animation.frame_rate !== report.input.fps) {
    errors.push(label + ".animation.frame_rate 必须等于 input.fps");
  }
  if (typeof animation.loop !== "boolean") errors.push(label + ".animation.loop 必须是布尔值");
  if (!nonEmptyString(asset?.texture_key)) errors.push(label + " 对应 asset.texture_key 必须是非空字符串");
  else if (nonEmptyString(animation.texture_key) && asset.texture_key !== animation.texture_key) {
    errors.push(label + ".animation.texture_key 必须等于 asset.texture_key");
  }

  const threejs = report.threejs;
  if (!isObject(threejs) || !isObject(threejs.texture_loader) || !isObject(threejs.atlas_uv)
    || !isObject(threejs.sprite) || !isObject(threejs.animation) || !isObject(threejs.snippets)) {
    errors.push(label + ".threejs 必须提供 texture_loader、atlas_uv、sprite、animation 和 snippets 合同");
    return;
  }
  const frames = Array.isArray(report.frames) ? report.frames : [];
  const endFrame = frames.length - 1;
  const cell = report.cell;
  const textureLoader = threejs.texture_loader;
  if (textureLoader.class !== "THREE.TextureLoader" || textureLoader.method !== "loadAsync") {
    errors.push(label + ".threejs.texture_loader 必须使用 THREE.TextureLoader.loadAsync");
  }
  if (textureLoader.color_space !== "THREE.SRGBColorSpace") errors.push(label + ".threejs.texture_loader.color_space 必须为 THREE.SRGBColorSpace");
  if (!isRuntimeUrl(textureLoader.url)) errors.push(label + ".threejs.texture_loader.url 必须绑定 spritesheet.runtime_url");
  else if (textureLoader.url !== sheetBinding?.runtime_url) errors.push(label + ".threejs.texture_loader.url 必须严格等于 spritesheet.runtime_url");

  const atlasUv = threejs.atlas_uv;
  const expectedFrameCount = frames.length;
  const expectedRepeatX = expectedFrameCount > 0 ? 1 / expectedFrameCount : NaN;
  if (atlasUv.layout !== "horizontal" || atlasUv.frame_count !== expectedFrameCount
    || atlasUv.frame_index?.start !== 0 || atlasUv.frame_index?.end !== endFrame) {
    errors.push(label + ".threejs.atlas_uv 帧序必须覆盖水平图集的 0 至末帧");
  }
  if (atlasUv.offset_formula !== "frameIndex / frameCount"
    || !isObject(atlasUv.offset) || Math.abs(atlasUv.offset.x_start) > 1e-9
    || !Number.isFinite(atlasUv.offset.x_start) || !Number.isFinite(atlasUv.offset.x_step)
    || !Number.isFinite(atlasUv.offset.y) || Math.abs(atlasUv.offset.x_step - expectedRepeatX) > 1e-9
    || Math.abs(atlasUv.offset.y) > 1e-9
    || !isObject(atlasUv.repeat) || !Number.isFinite(atlasUv.repeat.x) || !Number.isFinite(atlasUv.repeat.y)
    || Math.abs(atlasUv.repeat.x - expectedRepeatX) > 1e-9 || Math.abs(atlasUv.repeat.y - 1) > 1e-9
    || atlasUv.wrapping?.s !== "THREE.ClampToEdgeWrapping" || atlasUv.wrapping?.t !== "THREE.ClampToEdgeWrapping") {
    errors.push(label + ".threejs.atlas_uv 的 UV repeat/offset/wrapping 与水平帧采样不一致");
  }

  const sprite = threejs.sprite;
  const anchor = cell?.target_anchor;
  const expectedX = anchor?.x / cell?.width;
  const expectedY = 1 - anchor?.y / cell?.height;
  if (sprite.material_class !== "THREE.SpriteMaterial" || sprite.object_class !== "THREE.Sprite") {
    errors.push(label + ".threejs.sprite 必须使用 THREE.SpriteMaterial 和 THREE.Sprite");
  }
  const center = sprite.center;
  if (center?.source_origin !== "top-left" || center?.unit !== "normalized-cell"
    || !Number.isFinite(center.x) || !Number.isFinite(center.y)
    || Math.abs(center.x - expectedX) > 1e-9 || Math.abs(center.y - expectedY) > 1e-9) {
    errors.push(label + ".threejs.sprite.center 必须按左上角像素锚点转换为 Sprite.center 左下归一化坐标");
  }
  if (!isObject(center?.target_anchor) || center.target_anchor.x !== anchor?.x || center.target_anchor.y !== anchor?.y) {
    errors.push(label + ".threejs.sprite.center.target_anchor 与 cell.target_anchor 不一致");
  }

  const threejsAnimation = threejs.animation;
  if (threejsAnimation.key !== animation.key || threejsAnimation.texture_key !== animation.texture_key
    || threejsAnimation.frame_rate !== animation.frame_rate || threejsAnimation.loop !== animation.loop) {
    errors.push(label + ".threejs.animation 与 animation 不一致");
  }
  if (threejsAnimation.frames?.start !== 0 || threejsAnimation.frames?.end !== endFrame
    || threejsAnimation.frames?.count !== expectedFrameCount) {
    errors.push(label + ".threejs.animation.frames 与实际帧范围不一致");
  }
  const expectedEndBehavior = animation.loop === true ? "wrap-to-first-frame" : "hold-last-frame";
  if (threejsAnimation.end_behavior !== expectedEndBehavior) errors.push(label + ".threejs.animation.end_behavior 与 animation.loop 不一致");

  if (typeof threejs.snippets.factory !== "string" || !threejs.snippets.factory.includes("new THREE.TextureLoader().loadAsync")
    || !threejs.snippets.factory.includes("new THREE.SpriteMaterial") || !threejs.snippets.factory.includes("new THREE.Sprite")
    || !threejs.snippets.factory.includes("sprite.scale.set") || !threejs.snippets.factory.includes("sprite.center.set")
    || !threejs.snippets.factory.includes("texture.offset.x = frameIndex / frameCount")) {
    errors.push(label + ".threejs.snippets.factory 必须是可执行的 three.js 图集动画示例");
  }
  if (typeof threejs.snippets.usage !== "string" || !threejs.snippets.usage.includes("animation.update(deltaSeconds)")) {
    errors.push(label + ".threejs.snippets.usage 必须展示逐帧更新调用");
  }

  const sheetFile = sheetBinding?.file;
  const runtimeOutputs = Array.isArray(asset?.runtime_outputs) ? asset.runtime_outputs.map(normalizedPath) : [];
  if (!runtimeOutputs.includes(normalizedPath(sheetFile))) errors.push(label + " spritesheet 必须位于 asset.runtime_outputs");
}
