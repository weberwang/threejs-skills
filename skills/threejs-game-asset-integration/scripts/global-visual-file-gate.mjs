import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { collectDisplayLayerEvidencePaths } from "../../threejs-game-workflow-control/scripts/display-layer-planning-contract.mjs";
import { collectGlobalVisualConsistencyEvidencePaths, normalizeGlobalAnchorEvidence } from "../../threejs-game-workflow-control/scripts/global-visual-consistency-contract.mjs";

/** 判断值是否为普通对象。 */
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 判断值是否为去除空白后仍有内容的字符串。 */
function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** 计算文件门使用的标准 SHA-256 表示。 */
function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/** 把生成记录中的证据路径加入统一清单，避免资产扫描后再追加第二轮文件检查。 */
function appendGenerationRecordEntries(entries, record, label) {
  for (const item of collectGlobalVisualConsistencyEvidencePaths(record, label)) entries.push([item.field, item.path, item.sha256]);
}

/** 收集视觉清单全部需要复算的基线、显示层和合同证据路径。 */
export function collectManifestFileEvidenceEntries(data) {
  const entries = [];
  const baseline = data?.visual_baseline;
  if (isObject(baseline)) {
    if (nonEmptyString(baseline.document)) entries.push(["visual_baseline.document", baseline.document, baseline.style_fingerprint, "visual_baseline.style_fingerprint 与 document 文件 SHA-256 不一致"]);
    for (const [index, anchor] of normalizeGlobalAnchorEvidence(baseline).entries()) if (nonEmptyString(anchor.path)) entries.push([`visual_baseline.anchor_evidence[${index}]`, anchor.path, anchor.sha256 || null]);
  }
  const target = data?.reference_target;
  if (target?.origin === "generated" && isObject(target.generation_record)) appendGenerationRecordEntries(entries, target.generation_record, "reference_target.generation_record");
  if (Array.isArray(data?.fidelity_cases)) data.fidelity_cases.forEach((item, index) => {
    if (!isObject(item)) return;
    for (const field of ["reference_evidence", "candidate_evidence"]) if (Array.isArray(item[field])) for (const path of item[field]) if (nonEmptyString(path)) entries.push([`fidelity_cases[${index}].${field}`, path]);
  });
  if (Array.isArray(data?.contract_reconciliation?.checks)) for (const [index, item] of data.contract_reconciliation.checks.entries()) if (nonEmptyString(item?.evidence)) entries.push([`contract_reconciliation.checks[${index}].evidence`, item.evidence]);
  for (const item of collectDisplayLayerEvidencePaths(data?.scene_reconstruction_contract?.display_layer_planning)) entries.push([item.field, item.path, item.sha256]);
  if (Array.isArray(data?.coverage_audit?.regions)) for (const [index, region] of data.coverage_audit.regions.entries()) {
    if (nonEmptyString(region?.ownership_evidence) && region.ownership_evidence !== region?.confirmation?.evidence) entries.push([`coverage_audit.regions[${index}].ownership_evidence`, region.ownership_evidence]);
    const confirmation = region?.confirmation;
    if (confirmation?.mode === "AUTO" && nonEmptyString(confirmation.evidence)) entries.push([`coverage_audit.regions[${index}].confirmation.evidence`, confirmation.evidence]);
  }
  if (Array.isArray(data?.coverage_audit?.summaries)) for (const [index, summary] of data.coverage_audit.summaries.entries()) if (nonEmptyString(summary?.evidence)) entries.push([`coverage_audit.summaries[${index}].evidence`, summary.evidence]);
  if (data?.effect_image_reconstruction?.applicability === "effect-image" && Array.isArray(data?.assets)) data.assets.forEach((asset, index) => {
    if (isObject(asset?.generation_record)) appendGenerationRecordEntries(entries, asset.generation_record, `assets[${index}].generation_record`);
  });
  const layoutDecomposition = data?.scene_reconstruction_contract?.layout_decomposition;
  const layoutAnnotation = layoutDecomposition?.layout_annotation;
  const layoutConfirmation = layoutDecomposition?.layout_annotation_confirmation;
  if (isObject(layoutAnnotation) && nonEmptyString(layoutAnnotation.layout_annotation_file)) entries.push(["scene_reconstruction_contract.layout_decomposition.layout_annotation.layout_annotation_file", layoutAnnotation.layout_annotation_file, layoutAnnotation.layout_annotation_sha256]);
  if (isObject(layoutAnnotation) && nonEmptyString(layoutAnnotation.layout_review_file)) entries.push(["scene_reconstruction_contract.layout_decomposition.layout_annotation.layout_review_file", layoutAnnotation.layout_review_file, layoutAnnotation.layout_review_sha256]);
  if (isObject(layoutAnnotation) && nonEmptyString(layoutAnnotation.layout_nodes_file)) entries.push(["scene_reconstruction_contract.layout_decomposition.layout_annotation.layout_nodes_file", layoutAnnotation.layout_nodes_file, layoutAnnotation.layout_nodes_sha256]);
  if (isObject(layoutAnnotation) && nonEmptyString(layoutAnnotation.layout_decision_file)) entries.push(["scene_reconstruction_contract.layout_decomposition.layout_annotation.layout_decision_file", layoutAnnotation.layout_decision_file, layoutAnnotation.layout_decision_sha256]);
  if (isObject(layoutConfirmation)) {
    for (const [field, shaField] of [["layout_annotation_file", "layout_annotation_sha256"], ["layout_review_file", "layout_review_sha256"], ["layout_nodes_file", "layout_nodes_sha256"], ["layout_decision_file", "layout_decision_sha256"], ["decision_record_file", "decision_record_sha256"], ["user_decision_receipt_file", "user_decision_receipt_sha256"]]) if (nonEmptyString(layoutConfirmation[field])) entries.push([`scene_reconstruction_contract.layout_decomposition.layout_annotation_confirmation.${field}`, layoutConfirmation[field], layoutConfirmation[shaField]]);
  }
  // 同一路径且期望 SHA 相同的字段只需复算一次，避免重复 I/O；不同身份仍分别报错。
  // 按收集顺序保留首次字段，使 visual_baseline.anchor_evidence 这类主真值优先于派生引用。
  const uniqueEntries = new Map();
  for (const entry of entries) {
    const key = `${entry[1]}\0${entry[2] ?? ""}`;
    if (!uniqueEntries.has(key)) uniqueEntries.set(key, entry);
  }
  return [...uniqueEntries.values()];
}

/** 按调用方提供的安全路径解析器复算所有证据文件，保留项目根目录越界保护。 */
export async function checkManifestFileEvidence(entries, { resolvePath, isFile }) {
  const errors = [];
  for (const [field, path, expectedSha, mismatchMessage] of entries) {
    try {
      const resolvedEvidence = resolvePath(path);
      if (!isFile(resolvedEvidence)) errors.push(`${field} 文件不存在：${path}`);
      else if (nonEmptyString(expectedSha) && sha256Bytes(await readFile(resolvedEvidence)) !== expectedSha) errors.push(mismatchMessage ?? `${field} sha256 与证据文件不一致：${path}`);
    } catch (error) {
      errors.push(`${field}：${error.message}`);
    }
  }
  return errors;
}
