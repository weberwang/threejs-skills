import { createHash } from "node:crypto";
import { decodePngRgba } from "../../threejs-game-asset-integration/scripts/effect_image_raster.mjs";

/** 判断值是否为普通对象。 */
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** 判断字符串是否包含有效合同内容。 */
function nonEmptyString(value) { return typeof value === "string" && value.trim().length > 0; }

/** 提取资源的统一输出元数据，供 V4 文件门和 图像生成 合同共用。 */
export function resolveOutputMetadata(asset = {}) {
  const output = isObject(asset.output) ? asset.output : (isObject(asset.output_metadata) ? asset.output_metadata : {});
  // 图像生成 的 runtime_outputs 是归一化后的交付路径；只有缺少所有显式输出字段时才退回 source_file。
  const outputFile = asset.output_file ?? asset.outputFile ?? output.file ?? output.path ?? asset.runtime_output_file ?? asset.runtimeOutputFile
    ?? (Array.isArray(asset.runtime_outputs) ? asset.runtime_outputs[0] : undefined)
    ?? (Array.isArray(asset.runtimeOutputs) ? asset.runtimeOutputs[0] : undefined);
  return { mime_type: asset.mime_type ?? asset.mimeType ?? output.mime_type ?? output.mimeType, width: asset.width ?? output.width, height: asset.height ?? output.height, alpha: asset.alpha ?? output.alpha, sha256: asset.sha256 ?? asset.output_sha256 ?? output.sha256 ?? output.file_sha256, file: outputFile ?? asset.source_file };
}

/** 判断交付类型是否为通用位图；图像生成 的 PNG/JPEG 收紧由专用模块负责。 */
export function isRasterDelivery(deliveryKind, mimeType = "") {
  return deliveryKind === "raster-image" && (!nonEmptyString(mimeType) || /^image\/(png|webp|jpeg|jpg|avif|bmp|gif)$/i.test(mimeType));
}

/** 固定视觉 V4 只接受 PNG/JPEG 魔数，不能被 actual_assets.mime_type 自报值绕过。 */
export function isPngOrJpegMagic(bytes) {
  if (!Buffer.isBuffer(bytes)) return false;
  const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return png || jpeg;
}

/**
 * 计算 V4 用于部件去重的规范化位图指纹。
 * PNG 使用解码后的 RGBA 像素，避免不同压缩参数或元数据掩盖同一视觉；
 * 其他格式暂以正式文件 SHA 作为证据，不能声称像素等价。
 */
export function computeRasterFingerprint(bytes, mimeType = "") {
  if (!Buffer.isBuffer(bytes)) return null;
  const mime = String(mimeType).toLowerCase();
  if (mime === "image/png" || bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    // PNG 指纹必须沿用严格解码；损坏文件直接抛错，禁止返回 null 让上层误判为无指纹。
    const decoded = decodePngRgba(bytes);
    return `rgba:${decoded.width}x${decoded.height}:sha256:${createHash("sha256").update(decoded.pixels).digest("hex")}`;
  }
  return `file:${createHash("sha256").update(bytes).digest("hex")}`;
}

/** 登记 region/state 的像素身份，并返回已占用该指纹的其他原子资产。 */
export function registerRasterFingerprint(registry, regionId, stateId, fingerprint, componentId, assetId) {
  if (!(registry instanceof Map) || !fingerprint) return null;
  const key = `${regionId}\0${stateId}\0${fingerprint}`; const previous = registry.get(key);
  if (!previous) registry.set(key, { component_id: componentId, asset_id: assetId });
  return previous ?? null;
}
