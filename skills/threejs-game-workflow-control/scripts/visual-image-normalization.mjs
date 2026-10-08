#!/usr/bin/env node
/**
 * 图像生成 原图尺寸归一化工具。
 *
 * 原图只是中间产物；本工具使用 Sharp 读取元数据并在比例已满足，或已提供两次
 * 原始 图像生成 失败证据与焦点的受控裁切后，生成精确尺寸 PNG/JPEG。透明背景移除
 * 路线可先把第二次原始输出去背，再把去背结果作为本工具的归一化输入。
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  IMAGE_ASPECT_RATIO_CORRECTION_SCHEMA,
  IMAGE_ASPECT_RATIO_CORRECTION_STRATEGY,
  IMAGE_ASPECT_RATIO_CORRECTION_TRIGGER,
  sameImageAspectRatio,
} from "./visual-image-normalization-contract.mjs";

/** Sharp 归一化工具使用的稳定版本标识。 */
export const IMAGE_NORMALIZATION_TOOL = "sharp";
/** Sharp 归一化允许的最终格式；透明素材只允许 PNG。 */
export const IMAGE_NORMALIZATION_FORMATS = Object.freeze(["png", "jpeg"]);
/** 归一化操作的记录值。 */
export const IMAGE_NORMALIZATION_OPERATION = Object.freeze({
  resize: "resize-to-contract",
  notRequired: "not-required",
  cropAndResize: "crop-and-resize-to-contract",
});

/** 表示输入无法安全归一化的可读错误。 */
export class ImageNormalizationError extends Error {
  /** 创建带有稳定错误名称的归一化错误。 */
  constructor(message) {
    super(message);
    this.name = "ImageNormalizationError";
  }
}

/** 判断值是否为正整数，尺寸合同不接受隐式字符串。 */
function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

/** 校验与 JSON Schema date-time 一致的 RFC3339 时间，拒绝仅日期等宽松写法。 */
function validDateTime(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));
}

/** 检查目标宽高并给出统一错误。 */
function validateTargetSize(width, height) {
  if (!positiveInteger(width) || !positiveInteger(height)) throw new ImageNormalizationError("目标 width/height 必须是正整数");
}

/** 判断焦点坐标是否为可审计的归一化坐标。 */
function unitInterval(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** 使用整数最大公约数把目标比例约分，避免裁切矩形引入小数像素。 */
function greatestCommonDivisor(left, right) {
  let a = left;
  let b = right;
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

/** 根据目标比例和焦点计算源图内最大的整数裁切矩形。 */
function calculateCropRect(sourceWidth, sourceHeight, targetWidth, targetHeight, focusX, focusY) {
  if (!unitInterval(focusX) || !unitInterval(focusY)) throw new ImageNormalizationError("比例修正 focus.x/focus.y 必须是 0 到 1 之间的有限数字");
  const divisor = greatestCommonDivisor(targetWidth, targetHeight);
  const ratioWidth = targetWidth / divisor;
  const ratioHeight = targetHeight / divisor;
  const scale = Math.floor(Math.min(sourceWidth / ratioWidth, sourceHeight / ratioHeight));
  if (!positiveInteger(scale)) throw new ImageNormalizationError("原图尺寸不足以形成目标比例的整数裁切矩形");
  const width = ratioWidth * scale;
  const height = ratioHeight * scale;
  // 焦点只分配源图多出的边缘像素，保证主体位置稳定且裁切矩形永不越界。
  const left = Math.floor((sourceWidth - width) * focusX);
  const top = Math.floor((sourceHeight - height) * focusY);
  return { left, top, width, height };
}

/** 将输入输出路径解析为绝对路径并拒绝同一路径覆盖原图。 */
function resolveDistinctPaths(sourceFile, outputFile) {
  if (typeof sourceFile !== "string" || sourceFile.trim() === "") throw new ImageNormalizationError("source_file 必须是非空路径");
  if (typeof outputFile !== "string" || outputFile.trim() === "") throw new ImageNormalizationError("output_file 必须是非空路径");
  const sourceAbsolute = resolve(sourceFile);
  const outputAbsolute = resolve(outputFile);
  const samePath = process.platform === "win32" ? sourceAbsolute.toLowerCase() === outputAbsolute.toLowerCase() : sourceAbsolute === outputAbsolute;
  if (samePath) throw new ImageNormalizationError("source_file 与 output_file 不得是同一路径，原始生成文件必须保留为中间产物");
  if (!/\.(?:png|jpe?g)$/i.test(outputAbsolute)) throw new ImageNormalizationError("output_file 必须使用 .png、.jpg 或 .jpeg 后缀");
  return { sourceAbsolute, outputAbsolute };
}

/** 从最终路径解析 Sharp 输出格式，避免用 MIME 猜测透明能力。 */
function outputFormat(outputFile) {
  if (/\.png$/i.test(outputFile)) return "png";
  if (/\.(?:jpe?g)$/i.test(outputFile)) return "jpeg";
  throw new ImageNormalizationError("output_file 必须使用 .png、.jpg 或 .jpeg 后缀");
}

/** 把 Sharp 元数据格式映射为归一化输出格式。 */
function metadataFormat(metadata) {
  return metadata.format === "jpg" ? "jpeg" : metadata.format;
}

/** 计算文件的 SHA-256，记录原图和最终交付物的真实身份。 */
async function sha256File(file) {
  return `sha256:${createHash("sha256").update(await readFile(file)).digest("hex")}`;
}

/** 读取输入图片元数据并要求 Sharp 能确认像素尺寸。 */
async function readSourceMetadata(sourceFile) {
  let metadata;
  try {
    metadata = await sharp(sourceFile).metadata();
  } catch (error) {
    throw new ImageNormalizationError(`无法读取原图元数据：${error.message}`);
  }
  if (!positiveInteger(metadata.width) || !positiveInteger(metadata.height)) throw new ImageNormalizationError("原图缺少有效像素宽高，不能归一化");
  return metadata;
}

/** 读取真实原始 图像生成 尝试的完整身份，禁止旧版路径数组或调用方伪造比例修正证据。 */
async function readAttempt(attemptInput, index) {
  const input = attemptInput;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ImageNormalizationError(`图像生成 attempt[${index}] 必须是完整对象；旧版路径字符串结构不再接受`);
  const requiredFields = ["attempt_id", "generation_record_id", "generated_at", "file", "sha256", "width", "height"];
  const missing = requiredFields.filter((field) => input[field] === undefined);
  if (missing.length) throw new ImageNormalizationError(`图像生成 attempt[${index}] 缺少字段：${missing.join("、")}`);
  if (typeof input.attempt_id !== "string" || !input.attempt_id.trim() || typeof input.generation_record_id !== "string" || !input.generation_record_id.trim()) throw new ImageNormalizationError(`图像生成 attempt[${index}] 必须包含非空 attempt_id 与 generation_record_id`);
  if (typeof input.file !== "string" || input.file.trim() === "") throw new ImageNormalizationError(`图像生成 attempt[${index}].file 必须是非空路径`);
  if (!validDateTime(input.generated_at)) throw new ImageNormalizationError(`图像生成 attempt[${index}].generated_at 必须是 RFC3339 时间`);
  if (!positiveInteger(input.width) || !positiveInteger(input.height)) throw new ImageNormalizationError(`图像生成 attempt[${index}] 的 width/height 必须是正整数`);
  const metadata = await readSourceMetadata(input.file);
  let sha256;
  try {
    sha256 = await sha256File(resolve(input.file));
  } catch (error) {
    throw new ImageNormalizationError(`无法读取生成尝试文件：${error.message}`);
  }
  if (input.sha256 !== sha256) throw new ImageNormalizationError(`图像生成 attempt[${index}] 的 sha256 与实际文件不一致`);
  if (input.width !== metadata.width) throw new ImageNormalizationError(`图像生成 attempt[${index}] 的 width 与实际文件不一致`);
  if (input.height !== metadata.height) throw new ImageNormalizationError(`图像生成 attempt[${index}] 的 height 与实际文件不一致`);
  return { attempt_id: input.attempt_id, generation_record_id: input.generation_record_id, generated_at: input.generated_at, file: input.file, sha256, width: metadata.width, height: metadata.height };
}

/** 比较两个解析后的路径，兼容 Windows 大小写不敏感的文件系统。 */
function sameResolvedPath(left, right) {
  const leftAbsolute = resolve(left);
  const rightAbsolute = resolve(right);
  return process.platform === "win32" ? leftAbsolute.toLowerCase() === rightAbsolute.toLowerCase() : leftAbsolute === rightAbsolute;
}

/** 收集两次原始 图像生成 失败尝试和显式焦点；裁切始终作用于当前归一化输入。 */
async function readAspectRatioCorrection(options, sourceMetadata, targetWidth, targetHeight) {
  const correction = options.aspectRatioCorrection ?? options.aspect_ratio_correction;
  const directAttempts = options.attemptFiles ?? options.attempt_files ?? options.attempts ?? options.aspectRatioAttempts ?? options.aspect_ratio_attempts;
  const attempts = correction?.attemptFiles ?? correction?.attempt_files ?? correction?.attempts ?? directAttempts;
  const focus = correction?.focus ?? options.focus ?? options.cropFocus ?? options.crop_focus;
  const focusX = correction?.focusX ?? correction?.focus_x ?? options.focusX ?? options.focus_x ?? options.cropFocusX ?? options.crop_focus_x ?? focus?.x;
  const focusY = correction?.focusY ?? correction?.focus_y ?? options.focusY ?? options.focus_y ?? options.cropFocusY ?? options.crop_focus_y ?? focus?.y;
  if (!Array.isArray(attempts) || attempts.length !== 2) throw new ImageNormalizationError("比例修正必须显式提供恰好两个 图像生成 失败 attempt 文件");
  if (!unitInterval(focusX) || !unitInterval(focusY)) throw new ImageNormalizationError("比例修正必须显式提供 0 到 1 之间的 focus.x/focus.y");
  const resolvedAttempts = await Promise.all(attempts.map((attempt, index) => readAttempt(attempt, index)));
  if (sameResolvedPath(resolvedAttempts[0].file, resolvedAttempts[1].file)) throw new ImageNormalizationError("两次 图像生成 attempt 必须来自两个不同的实际文件");
  if (resolvedAttempts[0].sha256 === resolvedAttempts[1].sha256) throw new ImageNormalizationError("两次 图像生成 attempt 必须具有不同的实际 SHA-256，复制同一输出不能作为第二次生成");
  if (new Set(resolvedAttempts.map((attempt) => attempt.attempt_id)).size !== 2) throw new ImageNormalizationError("两次 图像生成 attempt 的 attempt_id 必须唯一");
  if (new Set(resolvedAttempts.map((attempt) => attempt.generation_record_id)).size !== 2) throw new ImageNormalizationError("两次 图像生成 attempt 的 generation_record_id 必须唯一");
  if (resolvedAttempts[1].width !== sourceMetadata.width || resolvedAttempts[1].height !== sourceMetadata.height) throw new ImageNormalizationError("第二次 图像生成 attempt 的实际尺寸必须与当前归一化输入一致");
  const generation = options.generationRecord ?? options.generation_record ?? options.generation;
  const generationSource = generation?.transparency_strategy === "background-removal" || generation?.transparencyStrategy === "background-removal"
    ? generation.raw_source_file ?? generation.rawSourceFile : generation?.source_file ?? generation?.sourceFile;
  if (generationSource && !sameResolvedPath(resolvedAttempts[1].file, generationSource)) throw new ImageNormalizationError("第二次 图像生成 attempt 必须绑定 generation_record 的 raw/source 文件");
  const firstMatchesTargetRatio = sameImageAspectRatio(resolvedAttempts[0].width, resolvedAttempts[0].height, targetWidth, targetHeight);
  const secondMatchesTargetRatio = sameImageAspectRatio(resolvedAttempts[1].width, resolvedAttempts[1].height, targetWidth, targetHeight);
  if (!firstMatchesTargetRatio && !secondMatchesTargetRatio) {
    const cropRect = calculateCropRect(sourceMetadata.width, sourceMetadata.height, targetWidth, targetHeight, focusX, focusY);
    return {
      schema: IMAGE_ASPECT_RATIO_CORRECTION_SCHEMA,
      status: "passed",
      trigger: IMAGE_ASPECT_RATIO_CORRECTION_TRIGGER,
      strategy: IMAGE_ASPECT_RATIO_CORRECTION_STRATEGY,
      attempts: resolvedAttempts,
      focus: { x: focusX, y: focusY },
      crop_rect: cropRect,
    };
  }
  throw new ImageNormalizationError("比例修正 attempt 必须都与 expected_assets 宽高比不一致");
}

/** 按目标尺寸生成 PNG/JPEG；fit=fill 只在宽高比已证明一致时使用。 */
async function writeNormalizedImage(sourceFile, outputFile, metadata, targetWidth, targetHeight, format, cropRect) {
  await mkdir(dirname(outputFile), { recursive: true });
  if (metadata.width === targetWidth && metadata.height === targetHeight && metadataFormat(metadata) === format) {
    await copyFile(sourceFile, outputFile);
    return IMAGE_NORMALIZATION_OPERATION.notRequired;
  }
  try {
    const image = sharp(sourceFile);
    const encode = (pipeline) => format === "png" ? pipeline.png() : pipeline.jpeg({ quality: 100, chromaSubsampling: "4:4:4" });
    if (metadata.width === targetWidth && metadata.height === targetHeight) {
      await encode(image).toFile(outputFile);
      return IMAGE_NORMALIZATION_OPERATION.notRequired;
    }
    if (cropRect) {
      await encode(image.extract(cropRect).resize(targetWidth, targetHeight, { fit: "fill", kernel: "lanczos3" })).toFile(outputFile);
      return IMAGE_NORMALIZATION_OPERATION.cropAndResize;
    }
    await encode(image.resize(targetWidth, targetHeight, { fit: "fill", kernel: "lanczos3" })).toFile(outputFile);
    return IMAGE_NORMALIZATION_OPERATION.resize;
  } catch (error) {
    throw new ImageNormalizationError(`Sharp 尺寸归一化失败：${error.message}`);
  }
}

/** 读取最终 PNG/JPEG 元数据，确认尺寸、格式和透明通道没有漂移。 */
async function readOutputMetadata(outputFile, targetWidth, targetHeight, format, requireAlpha, sourceHasAlpha) {
  let metadata;
  try {
    metadata = await sharp(outputFile).metadata();
  } catch (error) {
    throw new ImageNormalizationError(`无法读取归一化位图元数据：${error.message}`);
  }
  if (metadataFormat(metadata) !== format) throw new ImageNormalizationError(`归一化输出必须是 ${format === "png" ? "PNG" : "JPEG"}`);
  if (metadata.width !== targetWidth || metadata.height !== targetHeight) throw new ImageNormalizationError("归一化输出宽高未精确匹配 expected_assets，必须重新生成或调整目标尺寸");
  if (sourceHasAlpha && metadata.hasAlpha !== true) throw new ImageNormalizationError("原图含 Alpha，但归一化输出未保留 Alpha");
  if (requireAlpha && metadata.hasAlpha !== true) throw new ImageNormalizationError("透明素材要求输入和最终 PNG 都含有 Alpha 通道");
  return metadata;
}

/** 生成结构化尺寸归一化记录，供 V4 合同和运行时共同消费。 */
export async function normalizeImageToContract(options = {}) {
  const sourceFile = options.sourceFile ?? options.source_file;
  const outputFile = options.outputFile ?? options.output_file;
  const targetWidth = options.targetWidth ?? options.target_width;
  const targetHeight = options.targetHeight ?? options.target_height;
  const requireAlpha = options.requireAlpha ?? options.require_alpha ?? false;
  validateTargetSize(targetWidth, targetHeight);
  const paths = resolveDistinctPaths(sourceFile, outputFile);
  const format = outputFormat(paths.outputAbsolute);
  const sourceMetadata = await readSourceMetadata(paths.sourceAbsolute);
  const sourceMatchesTargetRatio = sameImageAspectRatio(sourceMetadata.width, sourceMetadata.height, targetWidth, targetHeight);
  let aspectRatioCorrection;
  if (!sourceMatchesTargetRatio) {
    const hasCorrectionInput = options.aspectRatioCorrection !== undefined || options.aspect_ratio_correction !== undefined
      || options.attemptFiles !== undefined || options.attempt_files !== undefined || options.attempts !== undefined || options.aspectRatioAttempts !== undefined || options.aspect_ratio_attempts !== undefined || options.focus !== undefined || options.cropFocus !== undefined || options.crop_focus !== undefined
      || options.focusX !== undefined || options.focus_x !== undefined || options.focusY !== undefined || options.focus_y !== undefined || options.cropFocusX !== undefined || options.crop_focus_x !== undefined || options.cropFocusY !== undefined || options.crop_focus_y !== undefined;
    if (!hasCorrectionInput) throw new ImageNormalizationError("原图与目标尺寸宽高比不一致；必须提供两次生成失败证据后执行受控比例修正，或先由生产流程完成生成式延展");
    aspectRatioCorrection = await readAspectRatioCorrection(options, sourceMetadata, targetWidth, targetHeight);
  } else if (options.aspectRatioCorrection !== undefined || options.aspect_ratio_correction !== undefined
    || options.attemptFiles !== undefined || options.attempt_files !== undefined || options.attempts !== undefined || options.aspectRatioAttempts !== undefined || options.aspect_ratio_attempts !== undefined || options.focus !== undefined || options.cropFocus !== undefined || options.crop_focus !== undefined
    || options.focusX !== undefined || options.focus_x !== undefined || options.focusY !== undefined || options.focus_y !== undefined || options.cropFocusX !== undefined || options.crop_focus_x !== undefined || options.cropFocusY !== undefined || options.crop_focus_y !== undefined) {
    throw new ImageNormalizationError("比例修正只适用于与目标比例不一致的生成输出");
  }
  if (requireAlpha && sourceMetadata.hasAlpha !== true) throw new ImageNormalizationError("透明素材要求原图含有 Alpha 通道，不能通过后处理伪造");
  // JPEG 无法保留 Alpha；只要输入实际含 Alpha，就必须改用 PNG，避免静默丢失透明通道。
  if (format === "jpeg" && sourceMetadata.hasAlpha === true) throw new ImageNormalizationError("含 Alpha 的素材只能归一化为 PNG，JPEG 只能用于不透明素材");
  const cropRect = aspectRatioCorrection?.crop_rect;
  const operation = await writeNormalizedImage(paths.sourceAbsolute, paths.outputAbsolute, sourceMetadata, targetWidth, targetHeight, format, cropRect);
  const outputMetadata = await readOutputMetadata(paths.outputAbsolute, targetWidth, targetHeight, format, requireAlpha, sourceMetadata.hasAlpha === true);
  const sourceSha256 = await sha256File(paths.sourceAbsolute);
  const outputSha256 = await sha256File(paths.outputAbsolute);
  return {
    schema: "image-normalization/1",
    status: "passed",
    operation,
    source_file: sourceFile,
    source_sha256: sourceSha256,
    source_width: sourceMetadata.width,
    source_height: sourceMetadata.height,
    target_width: targetWidth,
    target_height: targetHeight,
    output_file: outputFile,
    output_sha256: outputSha256,
    output_width: outputMetadata.width,
    output_height: outputMetadata.height,
    preserve_alpha: outputMetadata.hasAlpha === true,
    tool: IMAGE_NORMALIZATION_TOOL,
    tool_version: sharp.versions?.sharp ?? "0.35.3",
    completed_at: new Date().toISOString(),
    ...(aspectRatioCorrection ? { aspect_ratio_correction: aspectRatioCorrection } : {}),
  };
}

/** 从 CLI 参数读取一个带值的开关。 */
function readFlag(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

/** 读取 CLI 的完整 attempt 描述；JSON 与逐字段写法共享同一严格运行时合同。 */
function parseCliAttempt(raw, args, ordinal) {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  if (raw.trim().startsWith("{")) {
    try { return JSON.parse(raw); } catch (error) { throw new ImageNormalizationError(`--attempt-${ordinal} 的 JSON 无法解析：${error.message}`); }
  }
  const aliases = ordinal === 1 ? ["--attempt-one", "--attempt-1", "--attempt1"] : ["--attempt-two", "--attempt-2", "--attempt2"];
  const prefix = ordinal === 1 ? "--attempt-one" : "--attempt-two";
  const readMeta = (name) => readFlag(args, `${prefix}-${name}`) ?? aliases.map((alias) => readFlag(args, `${alias}-${name}`)).find((value) => value !== undefined);
  return {
    attempt_id: readMeta("id"), generation_record_id: readMeta("generation-record-id"), generated_at: readMeta("generated-at"),
    file: raw, sha256: readMeta("sha256"), width: Number(readMeta("width")), height: Number(readMeta("height")),
  };
}

/** 解析重复 --attempt 描述；裸路径故意保留为缺字段错误，不恢复旧格式。 */
function readRepeatedAttemptDescriptors(args) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if ((args[index] === "--attempt" || args[index] === "--attempt-file") && args[index + 1] !== undefined) values.push(parseCliAttempt(args[index + 1], args, values.length + 1));
  }
  return values;
}

/** 运行归一化 CLI，成功输出 JSON 记录，失败返回非零退出码。 */
export async function runImageNormalizationCli(args = process.argv.slice(2), output = console) {
  const sourceFile = readFlag(args, "--source");
  const outputFile = readFlag(args, "--output");
  const targetWidth = Number(readFlag(args, "--width"));
  const targetHeight = Number(readFlag(args, "--height"));
  const requireAlpha = args.includes("--require-alpha");
  const attemptInputs = [
    readFlag(args, "--attempt-one") ?? readFlag(args, "--attempt-1") ?? readFlag(args, "--attempt1"),
    readFlag(args, "--attempt-two") ?? readFlag(args, "--attempt-2") ?? readFlag(args, "--attempt2"),
  ].map((value, index) => parseCliAttempt(value, args, index + 1)).filter((value) => value !== undefined);
  const repeatedAttempts = readRepeatedAttemptDescriptors(args);
  const allAttempts = repeatedAttempts.length > 0 ? repeatedAttempts : attemptInputs;
  const focusXValue = readFlag(args, "--focus-x");
  const focusYValue = readFlag(args, "--focus-y");
  const aspectRatioCorrection = allAttempts.length > 0 || focusXValue !== undefined || focusYValue !== undefined
    ? { attempts: allAttempts, focus: { x: Number(focusXValue), y: Number(focusYValue) } }
    : undefined;
  try {
    const record = await normalizeImageToContract({ sourceFile, outputFile, targetWidth, targetHeight, requireAlpha, aspect_ratio_correction: aspectRatioCorrection });
    output.log(JSON.stringify(record, null, 2));
    return 0;
  } catch (error) {
    output.error(JSON.stringify({ status: "failed", error: error.message }));
    return 1;
  }
}

/** 仅在直接执行脚本时启动 CLI，作为模块导入时不产生副作用。 */
async function main() {
  const exitCode = await runImageNormalizationCli();
  if (exitCode !== 0) process.exitCode = exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
