import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { ReskinError } from "./spine_atlas.mjs";

/** 递归稳定编码，确保 Runtime 绑定不受 JSON 字段顺序影响。 */
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

/** 由本次 pack 的真实输出和全部批次回执生成不可复用的 Runtime 绑定。 */
export function buildRuntimeBinding(build) {
  const binding = { atlas_sha256: build.atlas_sha256, skeleton_sha256: build.skeleton_sha256, page_sha256: build.page_sha256, batch_acceptance_fingerprints: build.batch_acceptance_fingerprints ?? [] };
  return { ...binding, total_fingerprint: createHash("sha256").update(stableJson(binding)).digest("hex") };
}

/** 读取结构化 JSON 运行报告，不接受截图文件或手写布尔值作为替代。 */
export async function readRuntimeReport(path) {
  let report;
  try { report = JSON.parse(await readFile(path, "utf8")); } catch (error) { throw new ReskinError(`无法读取 runtime validation 报告 ${path}：${error.message}`); }
  if (!report || typeof report !== "object" || Array.isArray(report)) throw new ReskinError("runtime validation 报告必须是 JSON 对象");
  return report;
}

/** 计算运行报告中引用文件的 SHA-256，避免接受漂移截图或日志。 */
/** 检查运行证据确实落在候选目录，并按证据类型拒绝伪造扩展名文件。 */
async function assertEvidenceFile(manifestPath, evidence, resolveArtifact, sha256, label, kind, validationRunId) {
  if (!evidence || typeof evidence !== "object" || !evidence.path || !evidence.sha256) throw new ReskinError(`${label} 缺少 path 或 sha256`);
  if (!validationRunId || evidence.validation_run_id !== validationRunId) throw new ReskinError(`${label} 未绑定当前 validation_run_id`);
  const path = resolveArtifact(manifestPath, evidence.path);
  const root = resolve(dirname(manifestPath));
  const rel = relative(root, resolve(path ?? ""));
  if (!path || isAbsolute(rel) || rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) throw new ReskinError(`${label} 必须位于候选目录内`);
  try { if (!(await stat(path)).isFile()) throw new Error("not a file"); } catch { throw new ReskinError(`${label} 文件不存在`); }
  if (!path || evidence.sha256 !== await sha256(path)) throw new ReskinError(`${label} SHA-256 不匹配`);
  const bytes = await readFile(path);
  if (kind === "png" && (extname(path).toLowerCase() !== ".png" || bytes.length < 8 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))) throw new ReskinError(`${label} 必须是真实 PNG`);
  if (kind === "log" && extname(path).toLowerCase() === ".png") throw new ReskinError(`${label} 不能是截图文件`);
  return path;
}

/** 校验项目专用适配器提供的可选 2D Spine 资源运行证据。 */
export async function validateRuntimeReport(document, manifestPath, report, resolveArtifact, sha256) {
  const errors = [];
  if (report.report_version !== "spine-runtime-validation/2.0") errors.push("report_version 必须为 spine-runtime-validation/2.0");
  const adapter = report.integration_adapter;
  if (adapter?.mode !== "project-specific") errors.push("必须声明项目专用 Spine 适配器");
  if (!["optional-2d-hud", "optional-2d-billboard"].includes(adapter?.asset_role)) errors.push("Spine 资源用途必须是可选 2D HUD 或 billboard");
  if (report.animations_from_skeleton_data !== true && report.animation_source !== "SkeletonData") errors.push("动画全集必须动态读取 SkeletonData");
  if (report.target_runtime !== document.target_runtime) errors.push("runtime 版本与 manifest 不一致");
  const runtimeParse = report.target_runtime_parse;
  if (runtimeParse?.passed !== true) errors.push("目标 Runtime 解析证据未通过");
  else {
    if (typeof runtimeParse.producer !== "string" || !runtimeParse.producer.trim()) errors.push("项目适配器解析证据缺少 producer");
    if (typeof runtimeParse.runtime_package !== "string" || !runtimeParse.runtime_package.trim()) errors.push("项目适配器解析证据缺少 runtime_package");
    if (runtimeParse.runtime_version !== document.target_runtime) errors.push("项目适配器解析证据版本不匹配");
    if (typeof (runtimeParse.command ?? runtimeParse.url) !== "string" || !(runtimeParse.command ?? runtimeParse.url).trim()) errors.push("项目适配器解析证据缺少 command/url");
    try {
      await assertEvidenceFile(manifestPath, { path: runtimeParse.log_path, sha256: runtimeParse.log_sha256, validation_run_id: runtimeParse.validation_run_id }, resolveArtifact, sha256, "项目适配器原始日志", "log", report.validation_run_id);
    } catch (error) { errors.push(error.message); }
  }
  if (typeof report.validation_run_id !== "string" || !report.validation_run_id.trim()) errors.push("缺少本次 validation_run_id");
  if (!document.build?.runtime_binding || stableJson(report.build_binding) !== stableJson(document.build.runtime_binding)) errors.push("Runtime 报告未绑定当前 pack 的 Atlas/Skeleton/Page/批次指纹");
  const expectedAnimations = document.source_audit?.stats?.animation_names ?? document.skeleton_audit?.stats?.animation_names ?? [];
  if (!Array.isArray(report.animations) || report.animations.length !== expectedAnimations.length || new Set(report.animations.map((item) => item.name)).size !== expectedAnimations.length) errors.push("运行报告没有完整且唯一的动画全集");
  else for (const name of expectedAnimations) {
    const item = report.animations.find((animation) => animation.name === name);
    if (!item || item.found !== true || item.switch_passed !== true || item.parse_error || item.texture_missing || item.anchor_drift || item.mesh_stretch || item.flicker || item.bad_crop) errors.push(`动画 ${name} 切换或运行检查未通过`);
    if (name.toLowerCase() === "idle" && (item.loop !== true || report.default_animation !== "Idle")) errors.push("Idle 默认循环语义未通过");
    if (name.toLowerCase() !== "idle" && item.loop !== false) errors.push(`动画 ${name} 必须按单次播放 loop=false`);
  }
  const summary = report.summary;
  for (const key of ["bone", "slot", "animation", "atlas_page", "atlas_region"]) if (!Number.isInteger(summary?.[key])) errors.push(`缺少真实运行摘要字段：${key}`);
  const expectedStats = document.source_audit?.stats ?? document.skeleton_audit?.stats;
  if (expectedStats && summary) {
    if (summary.bone !== expectedStats.bone_count) errors.push("运行 Bone 摘要与 Skeleton 审计不一致");
    if (summary.slot !== expectedStats.slot_count) errors.push("运行 Slot 摘要与 Skeleton 审计不一致");
    if (summary.animation !== expectedStats.animation_count) errors.push("运行 Animation 摘要与 Skeleton 审计不一致");
    if (summary.atlas_page !== document.atlas.pages.length) errors.push("运行 Atlas Page 摘要不一致");
    if (summary.atlas_region !== document.cells.length) errors.push("运行 Atlas Region 摘要不一致");
  }
  const checks = report.checks;
  for (const key of ["texture_missing", "anchor_drift", "mesh_stretch", "flicker", "bad_crop"]) if (checks?.[key] !== false) errors.push(`运行检查 ${key} 必须为 false`);
  if (!report.url || typeof report.url !== "string") errors.push("缺少诊断页 URL");
  const desktopViewport = report.viewports?.desktop;
  const mobileViewport = report.viewports?.mobile_390;
  if (!Number.isInteger(desktopViewport?.width) || desktopViewport.width < 1 || !Number.isInteger(desktopViewport?.height) || desktopViewport.height < 1) errors.push("缺少有效桌面 viewport");
  if (!Number.isInteger(mobileViewport?.width) || mobileViewport.width !== 390 || !Number.isInteger(mobileViewport?.height) || mobileViewport.height < 1) errors.push("移动端 viewport 必须是宽 390px 的有效尺寸");
  try { await assertEvidenceFile(manifestPath, report.screenshots?.desktop, resolveArtifact, sha256, "桌面截图", "png", report.validation_run_id); } catch (error) { errors.push(error.message); }
  try { await assertEvidenceFile(manifestPath, report.screenshots?.mobile_390, resolveArtifact, sha256, "390px 移动端截图", "png", report.validation_run_id); } catch (error) { errors.push(error.message); }
  try { await assertEvidenceFile(manifestPath, report.browser_log, resolveArtifact, sha256, "浏览器验证记录", "log", report.validation_run_id); } catch (error) { errors.push(error.message); }
  if (errors.length) throw new ReskinError(`runtime validation FAIL：${errors.join("；")}`);
  return { passed: true, animation_count: expectedAnimations.length };
}

/** 校验最终报告中的测试、类型检查和构建结果，不允许用默认 not-recorded 冒充通过。 */
export function validateVerification(verification) {
  const errors = [];
  if (!verification || typeof verification !== "object") return ["缺少最终验证记录"];
  if (verification.runtime_validation !== "PASS") errors.push("runtime_validation 必须为 PASS");
  for (const key of ["automated_tests", "typecheck", "build"]) {
    const value = verification[key];
    if (value === "PASS") continue;
    if (value && typeof value === "object" && value.status === "NOT_APPLICABLE" && typeof value.reason === "string" && value.reason.trim()) continue;
    errors.push(`${key} 必须为 PASS，或提供 NOT_APPLICABLE 及 reason`);
  }
  return errors;
}

/** 将最终交付所需 11 项写入机器可读报告，避免只依赖 CLI 摘要。 */
export async function writeFinalReport(path, document, manifestPath, runtimeReport, sha256) {
  const verificationErrors = validateVerification(document.verification);
  if (verificationErrors.length) throw new ReskinError(`最终报告验证记录不完整：${verificationErrors.join("；")}`);
  const batchSummary = (document.batches ?? []).map((batch) => ({ id: batch.id, revision: batch.revision, region_count: batch.regions.length, regions: batch.regions.map((region) => region.name), status: batch.status, locked: batch.locked }));
  const atlasKeys = document.cells.map((cell) => `p${cell.page_index}:${cell.name}`);
  const batchKeys = (document.batches ?? []).flatMap((batch) => batch.regions.map((region) => region.id));
  const atlasSet = new Set(atlasKeys);
  const batchSet = new Set(batchKeys);
  const duplicateRegions = atlasKeys.filter((key, index) => atlasKeys.indexOf(key) !== index);
  const missingRegions = atlasKeys.filter((key) => !batchSet.has(key));
  const unexpectedRegions = batchKeys.filter((key) => !atlasSet.has(key));
  const report = {
    report_version: "spine-reskin-final/2.0",
    character: document.character ?? null,
    direction: document.visual_contract?.direction ?? null,
    batches: batchSummary,
    atlas_region_total: document.cells.length,
    atlas_completeness: { no_duplicate: duplicateRegions.length === 0, no_missing: missingRegions.length === 0 && unexpectedRegions.length === 0, covered: duplicateRegions.length === 0 && missingRegions.length === 0 && unexpectedRegions.length === 0, duplicate_regions: [...new Set(duplicateRegions)], missing_regions: missingRegions, unexpected_regions: [...new Set(unexpectedRegions)] },
    skeleton_upgrade: document.skeleton_upgrade ?? null,
    statistics: document.source_audit?.stats ?? document.skeleton_audit?.stats ?? null,
    hashes: { atlas: document.build?.atlas_sha256 ?? null, pages: document.build?.page_sha256 ?? null, skeleton: document.build?.skeleton_sha256 ?? document.skeleton_upgrade?.after_sha256 ?? null },
    cells: document.cells.map((cell) => ({ id: cell.id, region: cell.name, status: cell.status, sha256: cell.result_sha256 })),
    runtime_validation: { url: runtimeReport.url, integration_adapter: runtimeReport.integration_adapter, animations: runtimeReport.animations.map((item) => ({ name: item.name, switch_passed: item.switch_passed })), summary: runtimeReport.summary },
    screenshots: runtimeReport.screenshots,
    verification: document.verification,
    delivery_mode: document.delivery_mode ?? "independent-validation-candidate",
  };
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { path, sha256: await sha256(path), report };
}
