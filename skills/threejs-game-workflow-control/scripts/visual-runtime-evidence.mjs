import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { deriveVisualReturnStage, deriveVisualRootCause, isPlainObject, isSha256, nonEmptyString, sha256Bytes, VISUAL_ROOT_CAUSES } from './visual-contract-core.mjs';

/** 把运行和生产证据格式化为可定位的视觉合同错误。 */
export function productionContractError(context = {}, message, details = {}) {
  const stage = context.stage ?? 'V2';
  const annotation = context.annotation_number ?? context.annotationNumber ?? '?';
  const region = context.region_id ?? context.regionId ?? '?';
  const expected = details.expectedMethod ?? context.expectedMethod ?? '?';
  const observed = details.observedMethod ?? context.observedMethod ?? '?';
  const missing = details.missing ?? context.missing ?? '';
  const component = details.component_id ?? details.componentId ?? context.component_id ?? context.componentId;
  const state = details.state_id ?? details.stateId ?? context.state_id ?? context.stateId;
  const componentLabel = component !== undefined || state !== undefined ? ` component_id=${component ?? '?'} state_id=${state ?? '?'}` : '';
  const suffix = missing ? ` 缺失=${missing}` : '';
  const returnStage = details.returnStage ?? context.returnStage ?? deriveVisualReturnStage(stage, { validationStages: ['F2', 'F3', 'V5'] });
  const rootCause = details.rootCause ?? context.rootCause ?? deriveVisualRootCause(stage, returnStage, { acceptanceStages: ['F2', 'F3', 'V5'], defaultRootCause: VISUAL_ROOT_CAUSES.ACCEPTANCE });
  return `[${stage}] annotation_number=${annotation} region_id=${region}${componentLabel} expected_method=${expected} observed_method=${observed} 根因=${rootCause}${suffix} ${message} 应退回阶段=${returnStage}`;
}

/** 解析项目内普通文件并拒绝绝对路径、父目录跳转和项目根自身。 */
export function safeProjectPath(projectRoot, value) {
  if (!nonEmptyString(value)) return null;
  const candidate = resolve(projectRoot, value);
  const rel = relative(resolve(projectRoot), candidate);
  if (!rel || rel === '.' || rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel)) return null;
  return candidate;
}

/** 校验证据文件存在且绑定当前候选、目标、基线和 diff；不接受自证布尔值。 */
export function validateEvidenceIdentity(evidence, context, identity = {}, options = {}) {
  const errors = [];
  const error = (message, missing = '') => errors.push(productionContractError(context, message, { missing }));
  if (!isPlainObject(evidence)) { error('运行时证据对象缺失', 'evidence'); return errors; }
  for (const field of ['evidence', 'evidence_sha256', 'candidate_sha256', 'target_sha256', 'baseline_sha256', 'diff_fingerprint']) if (!nonEmptyString(evidence[field])) error(`证据缺少 ${field}`, field);
  for (const field of ['evidence_sha256', 'candidate_sha256', 'target_sha256', 'baseline_sha256']) if (nonEmptyString(evidence[field]) && !isSha256(evidence[field])) error(`证据 ${field} 格式无效`, field);
  if (isSha256(evidence.evidence_sha256) && options.projectRoot) {
    const path = safeProjectPath(options.projectRoot, evidence.evidence);
    if (!path || !existsSync(path) || !statSync(path).isFile()) error(`证据文件不存在：${evidence.evidence}`, 'evidence');
    else if (sha256Bytes(readFileSync(path)) !== evidence.evidence_sha256) error(`证据 SHA 不匹配：${evidence.evidence}`, 'evidence_sha256');
  }
  if (identity.candidate && evidence.candidate_sha256 !== identity.candidate) error('证据 candidate_sha256 未绑定当前候选', 'candidate_sha256');
  if (identity.target && evidence.target_sha256 !== identity.target) error('证据 target_sha256 未绑定当前冻结目标', 'target_sha256');
  if (identity.baseline && evidence.baseline_sha256 !== identity.baseline) error('证据 baseline_sha256 未绑定当前视觉基线', 'baseline_sha256');
  if (identity.diff && evidence.diff_fingerprint !== identity.diff) error('证据 diff_fingerprint 未绑定当前候选 diff', 'diff_fingerprint');
  return errors;
}

/** 从当前视觉 manifest 提取供运行证据复用的候选、目标、基线和 diff 身份。 */
export function manifestEvidenceIdentity(manifest) {
  return { candidate: manifest?.candidate_identity?.sha256 ?? manifest?.candidate_sha256, target: manifest?.reference_target?.target_sha256, baseline: manifest?.visual_baseline?.style_fingerprint ?? manifest?.visual_baseline?.sha256, diff: manifest?.candidate_identity?.diff_fingerprint ?? manifest?.diff_fingerprint };
}

/** 只在 V5 要求图像生成资源提交真实运行消费证据并核验其身份。 */
export function validateImageGenerationRuntimeConsumption(asset, context, options = {}) {
  if (options.requireRuntimeConsumption !== true) return [];
  const evidence = asset?.runtime_consumption;
  if (!isPlainObject(evidence) || !['passed', 'consumed', 'pass'].includes(String(evidence.status).toLowerCase())) {
    return [productionContractError(context, '缺少带身份绑定的运行时实际消费 evidence', { missing: 'runtime_consumption' })];
  }
  return validateEvidenceIdentity(evidence, context, options.identity ?? {}, { projectRoot: options.projectRoot });
}
