#!/usr/bin/env node
/**
 * 视觉 V0→V5 跨阶段硬门。
 *
 * 该模块只读取 Work Item 及其显式绑定的视觉证据，不接受根节点布尔值、
 * Approval Ledger 文本或 stageId 猜测。所有控制入口都应调用同一个函数，
 * 这样待审批的候选在 prepare、handoff、approve 和 advance 之间不会出现
 * 不同解释。
 */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { validateGlobalVisualBaselineSelectionReferenceShape } from './global-visual-baseline-contract.mjs';
import { assertConfirmedPageSketch } from './page-sketch-prerequisite.mjs';
import { V2_PLAN_FIELDS } from './v2-reconstruction-plan-contract.mjs';
import { deriveVisualDisposition, earliestVisualReturnStage as earliestReturnStage, isPlainObject as isObject, nonEmptyString as nonEmpty, sha256Bytes, VISUAL_REMEDIATION, VISUAL_REMEDIATION_LABEL, VISUAL_REMEDIATION_NEXT_ACTION, VISUAL_RETURN_SNAPSHOT_KEYS as RETURN_SNAPSHOT_KEYS } from './visual-contract-core.mjs';
export { VISUAL_REMEDIATION } from './visual-contract-core.mjs';

export const VISUAL_STAGE_IDS = Object.freeze(['V0', 'V1', 'V2', 'V3', 'V4', 'V5']);
export const VISUAL_STAGE_STATES = Object.freeze([
  'not-started',
  'in-progress',
  'pending',
  'failed',
  'stale',
  'invalid',
  'global-static-baseline-frozen',
  'v2-production-planning-complete',
  'v3-formal-acceptance-complete',
  'v4-page-sketch-confirmed',
  'v5-runtime-integration-candidate',
]);

export const VISUAL_STAGE_STATE_FOR = Object.freeze({
  V0: new Set(['not-started', 'in-progress', 'pending', 'failed', 'stale', 'invalid', 'global-static-baseline-frozen']),
  V1: new Set(['not-started', 'in-progress', 'pending', 'failed', 'stale', 'invalid', 'global-static-baseline-frozen']),
  V2: new Set(['not-started', 'in-progress', 'pending', 'failed', 'stale', 'invalid', 'v2-production-planning-complete']),
  V3: new Set(['not-started', 'in-progress', 'pending', 'failed', 'stale', 'invalid', 'v3-formal-acceptance-complete']),
  V4: new Set(['not-started', 'in-progress', 'pending', 'failed', 'stale', 'invalid', 'v4-page-sketch-confirmed']),
  V5: new Set(['not-started', 'in-progress', 'pending', 'failed', 'stale', 'invalid', 'v5-runtime-integration-candidate']),
});

export const VISIBLE_VISUAL_BEHAVIORS = Object.freeze([
  'registersFormalScene',
  'replacesFormalScene',
  'modifiesBootEntry',
  'registersProductionEntry',
  'formalRuntimeConsumption',
  'deletesLegacyVisualImplementation',
  'declaresVisualComplete',
]);

const BEHAVIOR_ALIASES = Object.freeze({
  registersFormalScene: ['registersFormalScene', 'registerFormalScene', 'registers_formal_scene', 'register_formal_scene', 'formalSceneRegistration'],
  replacesFormalScene: ['replacesFormalScene', 'replaceFormalScene', 'replaces_formal_scene', 'replace_formal_scene'],
  modifiesBootEntry: ['modifiesBootEntry', 'modifyBootEntry', 'modifies_boot_entry', 'bootToVisibleScene', 'changesBootEntry'],
  registersProductionEntry: ['registersProductionEntry', 'registerProductionEntry', 'registers_production_entry', 'productionEntryRegistration', 'formalProductionEntry'],
  formalRuntimeConsumption: ['formalRuntimeConsumption', 'consumesFormalVisualAsset', 'consumeVisibleAsset', 'consumesVisibleAsset', 'consume_visible_asset', 'consumes_visible_asset', 'runtimeVisualIntegration', 'formal_runtime_consumption', 'runtime_visual_integration'],
  deletesLegacyVisualImplementation: ['deletesLegacyVisualImplementation', 'deleteLegacyVisualImplementation', 'deletes_legacy_visual_implementation', 'removesVisualFallback'],
  declaresVisualComplete: ['declaresVisualComplete', 'visualComplete', 'productionizedVisual', 'declares_visual_complete', 'sceneUiComplete'],
});

const FORMAL_TEXT = /(?:register|replace|modify|change|wire|connect|consume|delete|remove|complete|productioniz|publish|正式|注册|替换|接入|消费|删除|移除|生产化|完成|可发布).*(?:scene|ui|visual|asset|background|character|vfx|icon|font|boot|入口|场景|界面|视觉|资源|背景|角色|特效|图标|字体)|(?:scene|ui|visual|asset|background|character|vfx|icon|font|boot|入口|场景|界面|视觉|资源|背景|角色|特效|图标|字体).*(?:register|replace|modify|change|wire|connect|consume|delete|remove|complete|productioniz|publish|正式|注册|替换|接入|消费|删除|移除|生产化|完成|可发布)/i;
const FORMAL_RUNTIME_INTENT_TEXT = /(?:boot\s*(?:→|->|to)\s*scene|(?:register|replace|wire|connect|modify|change|consume|delete|remove|publish|接入|注册|替换|连接|修改|更改|消费|删除|移除|发布).{0,32}(?:boot|main\s*scene|scene|ui|主场景入口|场景入口|正式入口|场景|界面|boot入口)|(?:boot|main\s*scene|scene|ui|主场景入口|场景入口|正式入口|场景|界面|boot入口).{0,32}(?:registration|integration|entry|runtime|注册|接入|集成|运行时|消费|入口)|(?:consume|use|load|render|消费|使用|加载|渲染).{0,24}(?:visible|formal|production|可见|正式|运行时)?.{0,12}(?:visual\s*)?(?:assets?|images?|sprites?|资源|图片|图像)|(?:formal|正式).{0,16}(?:main\s*(?:scene|entry)|boot\s*(?:entry|scene)|scene\s*entry|ui\s*entry|主场景入口|正式入口|boot→scene)|正式.{0,12}(?:boot|main\s*scene|scene|ui).{0,12}(?:接入|注册|集成|入口))/i;
const GRAYBOX_TEXT = /(?:graybox|greybox|placeholder|prototype|diagnostic|sandbox|isolated|隔离|灰盒|占位|原型|诊断|沙盒)/i;
const VISUAL_CONTEXT_TEXT = /(?:visual|scene|ui|asset|resource|effect|sprite|background|character|vfx|icon|font|视觉|场景|界面|资源|特效|角色|背景|图标|字体)/i;
const HASH_PATTERN = /^(?:sha256:[a-f0-9]{64}|git:[a-f0-9]{40}(?:[a-f0-9]{24})?)$/i;
const PENDING_ASSET_STATUS = new Set(['planned', 'pending', 'unapproved', 'proposed', 'producing', 'review']);

const REMEDIATION_LABEL = VISUAL_REMEDIATION_LABEL;
const REMEDIATION_NEXT_ACTION = VISUAL_REMEDIATION_NEXT_ACTION;
/** 识别行为时只读取字段值，避免对象键名（例如 visualIntegration）制造假阳性。 */
function valuesOnly(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return [];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => valuesOnly(item, depth + 1));
  if (isObject(value)) return Object.values(value).flatMap((item) => valuesOnly(item, depth + 1));
  return [];
}

/** 只接受显式 V0-V5；stageId、文本和用户回复都不能提供这个值。 */
export function normalizeVisualStage(value) {
  const stage = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return VISUAL_STAGE_IDS.includes(stage) ? stage : null;
}

/** 读取 canonical visualStage 字段，同时拒绝 snake_case 值冲突。 */
export function readVisualStage(subject = {}) {
  const values = [subject.visualStage, subject.visual_stage, subject.visualPhase, subject.visual_phase].filter((value) => value !== undefined);
  if (!values.length) return { stage: null, conflicts: [] };
  const normalized = values.map(normalizeVisualStage);
  return { stage: normalized[0], conflicts: normalized.some((item) => item === null) || new Set(normalized).size > 1 ? values : [] };
}

/** 校验阶段声明自身；即使工作尚未进入正式集成，也不接受裸 frozen 或未知 V 阶段。 */
export function validateVisualStageDeclaration(subject = {}) {
  const errors = [];
  const { stage, conflicts } = readVisualStage(subject);
  const rawStageId = String(subject.stageId ?? '').trim();
  const baselineState = firstValue(subject.globalStaticBaselineState, subject.global_static_baseline_state);
  const visualContext = Boolean(subject.visualStage || subject.visual_stage || subject.visualStageState || subject.visual_stage_state || baselineState || subject.visualDomain || subject.visualWork || VISUAL_CONTEXT_TEXT.test(String(subject.domain ?? '')) || /^V/i.test(rawStageId));
  if (!visualContext) return errors;
  if (conflicts.length) errors.push(error('VISUAL_STAGE_DECLARATION_INVALID', 'visualStage 字段未知或互相矛盾，不允许猜测', { missingEvidence: ['visualStage'] }));
  if (/^V/i.test(rawStageId) && !/^V[0-5]$/i.test(rawStageId)) errors.push(error('VISUAL_STAGE_UNKNOWN', `未知视觉阶段：${rawStageId}`, { missingEvidence: ['visualStage'] }));
  if ((subject.visualStageState ?? subject.visual_stage_state ?? subject.visualState ?? subject.visual_state) === 'frozen') errors.push(error('VISUAL_BARE_FROZEN', '裸 frozen 没有视觉阶段语义；请使用 global-static-baseline-frozen 或 v2-production-planning-complete', { missingEvidence: ['visualStageState'] }));
  if (baselineState && baselineState !== 'global-static-baseline-frozen') errors.push(error(baselineState === 'frozen' ? 'VISUAL_BARE_FROZEN' : 'VISUAL_STAGE_STATE_INVALID', '全局静态基线状态必须为 global-static-baseline-frozen，且不能代替 V2', { missingEvidence: ['globalStaticBaselineState'] }));
  const state = firstValue(subject.visualStageState, subject.visual_stage_state, subject.visualState, subject.visual_state);
  if (stage && state !== null && !VISUAL_STAGE_STATE_FOR[stage]?.has(String(state))) errors.push(error('VISUAL_STAGE_STATE_INVALID', `阶段 ${stage} 与状态 ${String(state)} 不匹配`, { missingEvidence: ['visualStageState'] }));
  // 全局冻结状态必须绑定三候选人工选择证据；只写状态字段不能绕过冻结前置。
  // 这里仅校验消费者引用的 path+sha 形状；根证据的生产者链由 loader 完整复核。
  if (baselineState === 'global-static-baseline-frozen' || ((stage === 'V0' || stage === 'V1') && state === 'global-static-baseline-frozen')) {
    const selectionErrors = validateGlobalVisualBaselineSelectionReferenceShape(subject.globalVisualBaselineSelectionRef);
    for (const message of selectionErrors) errors.push(error('GLOBAL_VISUAL_BASELINE_SELECTION_MISSING', message, { missingEvidence: ['globalVisualBaselineSelectionRef'] }));
  }
  if (/^V[0-5]$/i.test(rawStageId) && stage && rawStageId.toUpperCase() !== stage) errors.push(error('VISUAL_STAGE_DECLARATION_CONFLICT', 'stageId 仅作范围标签，必须与显式 visualStage 一致且不能替代它', { missingEvidence: ['visualStage'] }));
  if (stage && !state) errors.push(error('VISUAL_STAGE_STATE_MISSING', `阶段 ${stage} 缺少有语义状态`, { missingEvidence: ['visualStageState'] }));
  if (!stage && /^V[0-5]$/i.test(rawStageId)) errors.push(error('VISUAL_STAGE_MISSING', 'V0-V5 工作必须显式声明 visualStage，不能从 stageId 推断', { missingEvidence: ['visualStage'] }));
  return errors;
}

/** 从 Work Item 的行为字段中识别正式可见视觉集成；stageId 本身不参与证据替代。 */
export function classifyVisibleVisualProductionIntegration(subject = {}) {
  const behaviorSource = [subject.visualIntegration, subject.visual_integration, subject.visualBehaviors, subject.visual_behaviors, subject.behaviors, subject].filter(Boolean);
  const behaviors = [];
  for (const behavior of VISIBLE_VISUAL_BEHAVIORS) {
    const aliases = BEHAVIOR_ALIASES[behavior];
    if (behaviorSource.some((source) => aliases.some((key) => source?.[key] === true))) behaviors.push(behavior);
  }
  if (subject.visibleVisualProductionIntegration === true || subject.visible_visual_production_integration === true || subject.requiresVisualStageGate === true || subject.requires_visual_stage_gate === true) behaviors.push('explicit-visible-visual-integration');
  const behaviorText = valuesOnly({
    domain: subject.domain,
    objective: subject.objective,
    inScope: subject.inScope,
    approvedRequirements: subject.approvedRequirements,
    pendingApprovalObject: subject.pendingApprovalObject,
    pendingApprovalContext: subject.pendingApprovalContext,
    userOriginalText: subject.userOriginalText,
    visualIntegration: subject.visualIntegration,
    behaviors: subject.behaviors,
    visualBehaviors: subject.visualBehaviors,
  }).join(' ');
  const visualContext = Boolean(subject.visualDomain || subject.visualWork || subject.visualStage || subject.visual_stage || VISUAL_CONTEXT_TEXT.test(`${subject.domain ?? ''} ${behaviorText}`));
  const stage = readVisualStage(subject).stage;
  // V3 本身就是正式资源生产阶段，Main 等 stageId 只是贯穿 Work Item 的范围标签；只有真实运行入口/消费意图才触发下游硬门。
  const v3ResourceStageWithoutRuntimeIntent = stage === 'V3' && !FORMAL_RUNTIME_INTENT_TEXT.test(behaviorText);
  const stageHint = /(?:production-entry|formal-entry|main|integration|integrate|正式入口|主场景|集成)/i.test(String(subject.stageId ?? ''));
  if (visualContext && stageHint && !v3ResourceStageWithoutRuntimeIntent) behaviors.push('stage-scope-requires-visual-gate');
  if (!behaviors.length && FORMAL_TEXT.test(behaviorText) && visualContext && !v3ResourceStageWithoutRuntimeIntent) behaviors.push('formal-visual-text');
  const graybox = subject.graybox === true || subject.grayBox === true || subject.isolatedPrototype === true || GRAYBOX_TEXT.test(behaviorText);
  const formal = behaviors.length > 0;
  // 灰盒只在未声明正式行为时豁免；一旦同一项工作注册正式入口，灰盒文字不能降级门槛。
  const isolatedGraybox = graybox && !formal && (subject.actionLevel === 'A2' || subject.pendingApprovalActionLevel === 'A2' || subject.safeA3 === true || subject.isolated === true);
  return { isVisibleVisualProductionIntegration: formal && !isolatedGraybox, behaviors: [...new Set(behaviors)], visualContext, graybox, isolatedGraybox };
}

/** 将证据状态规范化为只用于严格枚举比较的小写文本。 */
function textStatus(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** 取得候选列表中的首个普通对象。 */
function firstObject(...values) { return values.find(isObject) ?? null; }
/** 取得候选列表中的首个已声明值。 */
function firstValue(...values) { return values.find((value) => value !== undefined && value !== null && value !== '') ?? null; }

/** 读取不可变 JSON 引用；内联对象永远不作为跨阶段证据。 */
/** 读取并校验视觉阶段的不可变 JSON 引用，供其他控制门复用同一文件哈希规则。 */
export function loadImmutableVisualStageReference(reference, label, options = {}) {
  if (!isObject(reference)) return null;
  // 跨阶段引用只接受 schema 的 path + sha256；旧别名会让调用者绕过不可变引用约束。
  const file = reference.path;
  const expectedSha = reference.sha256;
  if (!nonEmpty(file) || !nonEmpty(expectedSha)) return null;
  if (!/^sha256:[a-f0-9]{64}$/i.test(String(expectedSha))) return null;
  let root;
  let absolute;
  try {
    root = realpathSync(resolve(options.projectRoot ?? process.cwd()));
    const candidate = resolve(root, String(file));
    const lexical = relative(root, candidate);
    if (isAbsolute(String(file)) || !lexical || lexical === '..' || lexical.startsWith('..\\') || lexical.startsWith('../') || isAbsolute(lexical)) return null;
    absolute = realpathSync(candidate);
    const actualRelative = relative(root, absolute);
    if (!actualRelative || actualRelative === '..' || actualRelative.startsWith('..\\') || actualRelative.startsWith('../') || isAbsolute(actualRelative) || !statSync(absolute).isFile()) return null;
  } catch { return null; }
  let bytes;
  try { bytes = readFileSync(absolute); } catch { return null; }
  const actualSha = sha256Bytes(bytes);
  if (actualSha !== expectedSha) return null;
  try {
    const parsed = JSON.parse(bytes.toString('utf8'));
    // 引用身份必须由内容交叉验证，不能由 ref 自己宣称 resultId/workItemId。
    if (!isObject(parsed) || (reference.resultId && parsed.resultId !== reference.resultId) || (reference.unitResultId && parsed.unitResultId !== reference.unitResultId) || (reference.workItemId && (parsed.workItemId ?? parsed.work_item_id) !== reference.workItemId)) return null;
    return { value: parsed, file: String(file), sha256: actualSha, label };
  } catch { return null; }
}

/** 取得阶段引用集合；只允许每一阶段一个不可变 JSON 证据文件。 */
function stageReferences(subject = {}, options = {}) {
  return firstObject(options.visualStageEvidenceRefs, options.visual_stage_evidence_refs, subject.visualStageEvidenceRefs, subject.visual_stage_evidence_refs, subject.visualPrerequisiteReferences, subject.visual_prerequisite_references, subject.visualDependencyRefs, subject.visual_dependency_refs) ?? {};
}

/** 兼容不同证据容器，但只消费对象证据，不消费根节点 PASS。 */
function evidenceObjects(subject = {}, options = {}) {
  const refs = stageReferences(subject, options);
  const evidence = firstObject(options.evidence, options.visualEvidence, options.visualStageEvidence, subject.visualStageEvidence, subject.visual_stage_evidence, subject.visualDependencyChain, subject.visual_dependency_chain) ?? {};
  const refFor = (stage) => firstObject(refs[stage], refs[stage.toLowerCase()], refs[`V${stage.slice(1)}`], refs[`${stage.toLowerCase()}Evidence`], refs[`${stage.toLowerCase()}_evidence`]);
  const v2Ref = refFor('V2'); const v3Ref = refFor('V3'); const v4Ref = refFor('V4'); const v5Ref = refFor('V5');
  const v2 = loadImmutableVisualStageReference(v2Ref, 'V2 reconstruction production plan', options)?.value ?? null;
  const v3 = loadImmutableVisualStageReference(v3Ref, 'V3 formal acceptance', options)?.value ?? null;
  const v4 = loadImmutableVisualStageReference(v4Ref, 'V4 page sketch', options)?.value ?? null;
  const v5 = loadImmutableVisualStageReference(v5Ref, 'V5 runtime candidate', options)?.value ?? null;
  return { evidence: { ...evidence, __references: { V2: v2Ref, V3: v3Ref, V4: v4Ref, V5: v5Ref } }, v2, v3, v4, v5, refs: { V2: v2Ref, V3: v3Ref, V4: v4Ref, V5: v5Ref } };
}

/** 仅接受明确的成功终态，不读取根摘要布尔值。 */
function statusPass(value) { return ['pass', 'passed', 'accepted', 'complete', 'completed', 'valid'].includes(textStatus(value)); }
/** 判断阶段证据是否携带工作项或执行单元结果身份。 */
function hasIdentity(value) { return isObject(value) && [value.workItemId, value.work_item_id, value.resultId, value.unitResultId, value.executionUnitResultId].some(nonEmpty); }
/** 校验并返回受支持的内容或 Git 候选哈希。 */
function hashValue(value) { return nonEmpty(value) && HASH_PATTERN.test(value) ? value : null; }
/** 读取第一个合法 SHA 身份；格式错误交由 repair 处理，不直接触发回退。 */
function firstHash(...values) { return values.map(hashValue).find(Boolean) ?? null; }
/** 读取第一个非空稳定指纹；diff identity 不强制使用 SHA-256。 */
function firstIdentity(...values) { return values.map((value) => nonEmpty(value) ? String(value).trim() : null).find(Boolean) ?? null; }
/** 判断引用指向的文件是否仅发生内容哈希漂移；缺路径、坏格式或文件不存在仍归 repair。 */
function isStaleVisualReference(reference, options = {}) {
  if (!isObject(reference) || !nonEmpty(reference.path) || !hashValue(reference.sha256)) return false;
  const root = resolve(options.projectRoot ?? process.cwd());
  const absolute = resolve(root, String(reference.path));
  if (isAbsolute(String(reference.path)) || relative(root, absolute).startsWith('..') || !existsSync(absolute)) return false;
  try {
    const actual = sha256Bytes(readFileSync(absolute));
    return actual !== reference.sha256;
  } catch {
    return false;
  }
}

/** 从工作项和各阶段证据中收集可用于 pending 快照的哈希。 */
function collectHashes(subject, evidence, ...objects) {
  const names = ['baselineHash', 'baseline_hash', 'contentHash', 'content_hash', 'artifactHash', 'artifact_hash', 'dependencyHash', 'dependency_hash', 'diffFingerprint', 'diff_fingerprint', 'candidateHash', 'candidate_sha256', 'candidateSha256', 'targetHash', 'target_sha256', 'targetSha256'];
  const result = {};
  for (const name of names) {
    const value = [subject[name], evidence[name], ...objects.map((item) => item?.[name])].find((item) => hashValue(item));
    if (value) result[name] = value;
  }
  return result;
}

/** 计算 pending 使用的不可变快照；任何 hash、候选或证据 ID 漂移都会失效。 */
export function visualPrerequisiteSnapshot(subject = {}, options = {}) {
  const { evidence, v2, v3, v4, v5, refs } = evidenceObjects(subject, options);
  const hashes = collectHashes(subject, evidence, v2, v3, v4, v5);
  const v2PlanTargetHash = firstHash(subject.targetSha256, v2?.targetSha256);
  const v2PlanCandidateHash = firstHash(v2?.candidateSha256);
  const v2PlanDiffFingerprint = firstIdentity(v2?.diffFingerprint);
  const decompositionConfirmation = firstObject(v2?.visualDecompositionConfirmation);
  const identity = {
    workItemId: firstValue(subject.workItemId, subject.work_item_id, evidence.workItemId, evidence.work_item_id),
    unitResultId: null,
    candidateId: firstValue(subject.candidateId, subject.candidate_id, evidence.candidateId, evidence.candidate_id, v5?.candidateId, v5?.candidate_id),
    candidateVersion: firstValue(subject.candidateVersion, subject.candidate_version, evidence.candidateVersion, evidence.candidate_version),
    contentHash: firstValue(hashes.contentHash, hashes.candidateHash, hashes.candidate_sha256),
    baselineHash: firstValue(hashes.baselineHash, subject.baselineHash),
    diffFingerprint: firstValue(hashes.diffFingerprint, subject.diffFingerprint),
    artifactHash: firstValue(hashes.artifactHash),
    dependencyHash: firstValue(hashes.dependencyHash),
    visualManifestHash: firstValue(subject.visualManifestSha256, subject.visual_manifest_sha256, evidence.visualManifestSha256, evidence.visual_manifest_sha256),
    V2DecompositionConfirmationId: firstValue(decompositionConfirmation?.confirmationId),
    V2DecompositionConfirmationEvidenceHash: firstValue(decompositionConfirmation?.evidenceSha256),
    V2PlanTargetHash: v2PlanTargetHash,
    V2PlanCandidateHash: v2PlanCandidateHash,
    V2PlanDiffFingerprint: v2PlanDiffFingerprint,
    V2ReferenceHash: refs?.V2?.sha256,
    V3ReferenceHash: refs?.V3?.sha256,
    V4ReferenceHash: refs?.V4?.sha256,
    V5ReferenceHash: refs?.V5?.sha256,
  };
  return Object.fromEntries(Object.entries(identity).filter(([, value]) => value !== null && value !== undefined));
}

/** 比较 pending 创建时与当前快照，返回发生漂移的身份字段。 */
function compareSnapshots(previous, current) {
  if (!isObject(previous)) return [];
  const changed = [];
  for (const key of new Set([...Object.keys(previous), ...Object.keys(current)])) if (previous[key] !== current[key]) changed.push(key);
  return changed.sort();
}

/** 创建所有控制入口共用的结构化视觉门错误。 */
function error(errorCode, message, details = {}) {
  const disposition = details.disposition ?? VISUAL_REMEDIATION.REPAIR;
  if (!Object.hasOwn(REMEDIATION_LABEL, disposition)) throw new Error(`未知视觉处置级别：${String(disposition)}`);
  const affectedScope = [...new Set(details.affectedScope ?? [])].filter(nonEmpty);
  return {
    errorCode,
    message,
    disposition,
    remediation: REMEDIATION_LABEL[disposition],
    missingStages: details.missingStages ?? [],
    missingEvidence: details.missingEvidence ?? [],
    invalidatedDependencies: details.invalidatedDependencies ?? [],
    affectedScope,
    invalidatesDownstream: details.invalidatesDownstream === true || disposition === VISUAL_REMEDIATION.RETURN,
    nextAction: details.nextAction ?? REMEDIATION_NEXT_ACTION[disposition],
  };
}

/** 从快照差异和证据错误中判定最小必要处置，不把普通缺字段升级为阶段回退。 */
function classifyRemediation(details = {}) { return deriveVisualDisposition(details); }

/** 判断机器结构化验证是否明确失败；缺少字段仍属于原地修复，不升级为重验或回退。 */
function hasMachineEvidenceFailure(value) {
  const review = firstObject(value?.machineValidation, value?.machine_validation, value?.visualStructuredReview, value?.visual_structured_review, value?.decompositionValidation, value?.decomposition_validation);
  return isObject(review) && ['fail', 'failed', 'invalid', 'stale'].includes(textStatus(review.status ?? review.verdict ?? review.result));
}

/** 返回 V2 拆解方案身份发生真实变化的最小证据列表。 */
function collectIdentityChanges(subject, { v2, oldSnapshot, snapshot } = {}) {
  const changes = [];
  const read = (value, ...names) => firstValue(...names.map((name) => value?.[name]));
  const candidateSha = (value) => value?.candidateSha256 ?? null;
  const diff = (value) => value?.diffFingerprint ?? null;
  const target = (value) => value?.targetSha256 ?? null;
  const compare = (label, values, normalizer = hashValue) => {
    // 只有两端都通过格式/非空校验的身份才足以证明真实变化；坏格式先按 repair 处理。
    const known = values.map(normalizer).filter(Boolean);
    if (known.length === 2 && known[0] !== known[1]) changes.push(label);
  };
  const subjectTarget = subject?.targetSha256 ?? null;
  // V3/V4 的代码与资源候选会正常演进；仅 V2 拆解方案绑定冲突才允许回退。
  compare('V2 plan target identity', [subjectTarget, target(v2)]);
  compare('V2 plan candidate identity', [candidateSha(v2), v2?.visualDecompositionConfirmation?.candidateSha256]);
  compare('V2 plan diff identity', [diff(v2), v2?.visualDecompositionConfirmation?.diffFingerprint], firstIdentity);
  if (isObject(oldSnapshot) && isObject(snapshot)) for (const key of RETURN_SNAPSHOT_KEYS) {
    const normalizer = key.includes('DiffFingerprint') || key === 'V2DecompositionConfirmationId' || key === 'workItemId' || key === 'unitResultId' ? firstIdentity : hashValue;
    const previous = normalizer(oldSnapshot[key]);
    const current = normalizer(snapshot[key]);
    if (previous && current && previous !== current) changes.push(key);
  }
  return [...new Set(changes)];
}

/** 将当前失败收敛到最小受影响阶段和下游，供编排器决定继续、重验或回退。 */
function finalizeRemediation(result, context = {}) {
  const identityChanges = collectIdentityChanges(context.subject, context);
  if (identityChanges.length) result.ok = false;
  const disposition = identityChanges.length > 0
    ? VISUAL_REMEDIATION.RETURN
    : classifyRemediation({ changed: context.changed, missingEvidence: result.missingEvidence, identityChanges, machineFailure: hasMachineEvidenceFailure(context.v2) });
  const errorDispositions = result.errors.map((item) => item.disposition).filter(Boolean);
  const hasReturnError = errorDispositions.includes(VISUAL_REMEDIATION.RETURN);
  const hasRevalidationError = errorDispositions.includes(VISUAL_REMEDIATION.REVALIDATE);
  const finalDisposition = identityChanges.length > 0 || hasReturnError
    ? VISUAL_REMEDIATION.RETURN
    : hasRevalidationError || disposition === VISUAL_REMEDIATION.REVALIDATE
      ? VISUAL_REMEDIATION.REVALIDATE
      : result.errors.length > 0 ? VISUAL_REMEDIATION.REPAIR : null;
  const affectedScope = [...new Set([
    ...result.errors.flatMap((item) => item.affectedScope ?? []),
    ...result.invalidatedDependencies,
    ...(finalDisposition === VISUAL_REMEDIATION.RETURN ? identityChanges : []),
  ])].filter(nonEmpty);
  result.disposition = finalDisposition;
  result.remediation = finalDisposition ? REMEDIATION_LABEL[finalDisposition] : null;
  result.affectedScope = affectedScope;
  result.identityChanges = identityChanges;
  result.invalidatesDownstream = finalDisposition === VISUAL_REMEDIATION.RETURN;
  if (finalDisposition === VISUAL_REMEDIATION.RETURN) {
    const stage = context.returnStage && identityChanges.length === 0
      ? context.returnStage
      : earliestReturnStage(identityChanges, context.returnStage ?? (result.stage && /^V[0-5]$/.test(result.stage) ? result.stage : 'V2'));
    result.returnStage = stage;
    const start = Number(stage.slice(1));
    result.invalidatedStages = Number.isInteger(start) ? VISUAL_STAGE_IDS.slice(start) : [];
  } else {
    result.returnStage = null;
    result.invalidatedStages = [];
  }
  result.nextAction = result.ok ? '当前硬门已满足，可沿工作流继续推进' : REMEDIATION_NEXT_ACTION[finalDisposition ?? VISUAL_REMEDIATION.REPAIR];
  return result;
}

/** 递归查找未完成资产和未批准替代，并保留确定性字段路径。 */
function collectPendingEvidence(value, path = '', output = []) {
  if (Array.isArray(value)) value.forEach((item, index) => collectPendingEvidence(item, `${path}[${index}]`, output));
  else if (isObject(value)) Object.entries(value).forEach(([key, item]) => {
    const currentPath = path ? `${path}.${key}` : key;
    if (['status', 'state', 'approvalStatus', 'approval_status'].includes(key) && PENDING_ASSET_STATUS.has(textStatus(item))) output.push({ path: currentPath, value: item });
    if (['substitution', 'replacement', 'alternative', 'substitute'].some((token) => key.toLowerCase().includes(token)) && item !== false && item !== null && textStatus(item) !== 'approved') output.push({ path: currentPath, value: item });
    collectPendingEvidence(item, currentPath, output);
  });
  return output;
}

/** 校验标准冻结 V2 方案及其哈希绑定的拆解、技术和布局来源。 */
function validateV2ProductionPlan(v2, subject, options, missingEvidence, staleFiles) {
  if (!isObject(v2)) return;
  const missing = V2_PLAN_FIELDS.filter((field) => v2[field] === undefined);
  const extra = Object.keys(v2).filter((field) => !V2_PLAN_FIELDS.includes(field));
  if (missing.length || extra.length) missingEvidence.push(`V2 reconstruction plan fields (missing: ${missing.join(',') || 'none'}; extra: ${extra.join(',') || 'none'})`);
  if (v2.schemaVersion !== 'threejs-scene-v2-reconstruction-plan/1.0' || v2.status !== 'COMPLETE' || v2.stage !== 'V2' || v2.frozen !== true
    || !nonEmpty(v2.workItemId) || (subject?.workItemId && v2.workItemId !== subject.workItemId)
    || !nonEmpty(v2.sceneId) || !/^sha256:[a-f0-9]{64}$/i.test(String(v2.targetSha256))
    || !/^sha256:[a-f0-9]{64}$/i.test(String(v2.candidateSha256)) || !nonEmpty(v2.diffFingerprint)) {
    missingEvidence.push('V2 COMPLETE/frozen plan identity (work/scene/target/candidate/diff)');
  }
  if (!isObject(v2.visualProductionContract) || !Array.isArray(v2.visualProductionUnits) || v2.visualProductionUnits.length === 0 || !Array.isArray(v2.displayLayerContexts)) {
    missingEvidence.push('V2 production contract/units/display-layer contexts');
  }

  const root = resolve(options.projectRoot ?? process.cwd());
  const rootReal = (() => { try { return realpathSync(root); } catch { return null; } })();
  /** 安全读取 V2 冻结源文件并区分内容漂移与结构缺失。 */
  const readBoundFile = (file, expectedSha, label) => {
    if (!rootReal || !nonEmpty(file) || isAbsolute(file) || file.includes('\0') || !/^sha256:[a-f0-9]{64}$/i.test(String(expectedSha))) {
      missingEvidence.push(`${label} file/SHA binding`);
      return null;
    }
    try {
      const candidate = resolve(rootReal, file);
      const lexical = relative(rootReal, candidate);
      if (!lexical || lexical === '..' || lexical.startsWith('..\\') || lexical.startsWith('../') || isAbsolute(lexical)) throw new Error('path escape');
      const actual = realpathSync(candidate);
      const realRelative = relative(rootReal, actual);
      if (!realRelative || realRelative === '..' || realRelative.startsWith('..\\') || realRelative.startsWith('../') || isAbsolute(realRelative) || !statSync(actual).isFile()) throw new Error('symlink escape');
      const bytes = readFileSync(actual);
      if (sha256Bytes(bytes) !== expectedSha) {
        staleFiles.push(`${label}:${file}`);
        throw new Error('hash mismatch');
      }
      return bytes;
    } catch {
      missingEvidence.push(`${label} file SHA/path`);
      return null;
    }
  };
  const sceneMaster = v2.sceneMaster;
  if (!isObject(sceneMaster) || Object.keys(sceneMaster).some((key) => !['file', 'sha256', 'sceneId'].includes(key))
    || sceneMaster.sceneId !== v2.sceneId || sceneMaster.sha256 !== v2.targetSha256) missingEvidence.push('V2 sceneMaster target/scene binding');
  readBoundFile(sceneMaster?.file, sceneMaster?.sha256, 'V2 sceneMaster');
  for (const field of ['sceneReconstructionContract', 'decompositionAnnotation', 'technicalDecomposition']) {
    const artifact = v2[field];
    if (!isObject(artifact) || Object.keys(artifact).some((key) => !['file', 'sha256', 'sceneId'].includes(key)) || artifact.sceneId !== v2.sceneId) {
      missingEvidence.push(`V2 ${field} scene/file/SHA binding`);
      continue;
    }
    const bytes = readBoundFile(artifact.file, artifact.sha256, `V2 ${field}`);
    if (bytes && field === 'sceneReconstructionContract') {
      try {
        const contract = JSON.parse(bytes.toString('utf8'));
        const conditions = contract.target_conditions;
        const layout = contract.layout_decomposition;
        const annotation = layout?.layout_annotation;
        const nodes = layout?.layout_nodes;
        if (!isObject(conditions) || conditions.target_sha256 !== v2.targetSha256 || conditions.scene_id !== v2.sceneId
          || !Array.isArray(nodes) || nodes.length === 0 || !isObject(annotation)
          || !nonEmpty(annotation.layout_nodes_file) || !/^sha256:[a-f0-9]{64}$/i.test(String(annotation.layout_nodes_sha256))) {
          missingEvidence.push('V2 scene reconstruction target/layout coverage');
          continue;
        }
        const nodesBytes = readBoundFile(annotation.layout_nodes_file, annotation.layout_nodes_sha256, 'V2 frozen layout nodes');
        if (nodesBytes) {
          const document = JSON.parse(nodesBytes.toString('utf8'));
          const sourceNodes = document?.layout_nodes;
          const contractIds = nodes.map((node) => node?.layout_node_id);
          const sourceIds = Array.isArray(sourceNodes) ? sourceNodes.map((node) => node?.layout_node_id) : [];
          if (!Array.isArray(sourceNodes) || sourceNodes.length === 0 || sourceIds.some((id) => !nonEmpty(id))
            || new Set(sourceIds).size !== sourceIds.length || JSON.stringify(contractIds) !== JSON.stringify(sourceIds)
            || document.target_sha256 !== v2.targetSha256 || document.scene_id !== v2.sceneId) missingEvidence.push('V2 contract/frozen layout node identity and coverage');
        }
      } catch {
        missingEvidence.push('V2 scene reconstruction contract/layout JSON');
      }
    }
  }
  const confirmation = v2.visualDecompositionConfirmation;
  if (!isObject(confirmation) || confirmation.confirmationMode !== 'manual' || !['PASS', 'accepted'].includes(confirmation.status)
    || confirmation.targetSha256 !== v2.targetSha256 || confirmation.candidateSha256 !== v2.candidateSha256
    || confirmation.diffFingerprint !== v2.diffFingerprint) missingEvidence.push('V2 manual decomposition confirmation identity');
  if (isObject(confirmation)) readBoundFile(confirmation.evidenceFile, confirmation.evidenceSha256, 'V2 decomposition confirmation');
}

/** 对外复用同一严格 V2 文件和身份校验，避免阶段入口出现较弱的独立门。 */
export function validateStandardV2ProductionPlan(value, subject = {}, options = {}) {
  const missingEvidence = [];
  const staleFiles = [];
  validateV2ProductionPlan(value, subject, options, missingEvidence, staleFiles);
  return { ok: missingEvidence.length === 0, missingEvidence, staleFiles };
}

/**
 * 复算阶段证据文件，而不是相信 JSON 内声明的 PASS。路径、文件集合和哈希必须一一对应，
 * 命令输出也必须实际落在同一组文件中；这样手写顶层状态无法伪造下游完成结果。
 */
function validateEvidenceFiles(value, label, options, missingEvidence, requireCommands = false) {
  if (!isObject(value) || !Array.isArray(value.files) || value.files.length === 0 || new Set(value.files).size !== value.files.length || !isObject(value.fileHashes)) {
    missingEvidence.push(`${label} files/fileHashes 不可变绑定`);
    return false;
  }
  const files = value.files.map((file) => String(file));
  const hashKeys = Object.keys(value.fileHashes).sort();
  if (JSON.stringify([...files].sort()) !== JSON.stringify(hashKeys)) {
    missingEvidence.push(`${label} files 与 fileHashes 必须精确一致`);
    return false;
  }
  const root = resolve(options.projectRoot ?? process.cwd());
  let valid = true;
  for (const file of files) {
    const target = resolve(root, file);
    const relativeTarget = relative(root, target);
    if (isAbsolute(file) || relativeTarget === '..' || relativeTarget.startsWith('..\\') || relativeTarget.startsWith('../') || !existsSync(target)) {
      missingEvidence.push(`${label} evidence file ${file}`);
      valid = false;
      continue;
    }
    const expected = value.fileHashes[file];
    let actual = null;
    try { actual = sha256Bytes(readFileSync(target)); } catch { actual = null; }
    if (!/^sha256:[a-f0-9]{64}$/i.test(String(expected)) || actual !== expected) {
      missingEvidence.push(`${label} evidence hash ${file}`);
      valid = false;
    }
  }
  if (requireCommands) {
    if (!Array.isArray(value.commands) || value.commands.length === 0) {
      missingEvidence.push(`${label} commands`);
      valid = false;
    } else {
      for (const command of value.commands) {
        if (!isObject(command) || !nonEmpty(command.command) || command.exitCode !== 0 || !nonEmpty(command.outputFile) || !/^sha256:[a-f0-9]{64}$/i.test(String(command.outputHash)) || !files.includes(command.outputFile) || value.fileHashes[command.outputFile] !== command.outputHash) {
          missingEvidence.push(`${label} command output binding`);
          valid = false;
        }
      }
    }
  }
  return valid;
}

/** 校验每个阶段的候选身份与内容/差异哈希，防止不同候选的证据拼接。 */
function validateCandidateIdentity(value, label, missingEvidence, strict = false) {
  const candidate = strict ? value?.candidateIdentity : value?.candidateIdentity ?? value?.candidate_identity;
  const candidateDiff = strict ? candidate?.diffFingerprint : candidate?.diffFingerprint ?? candidate?.diff_fingerprint;
  if (!isObject(candidate) || !hashValue(candidate.sha256) || !hashValue(candidateDiff)) {
    missingEvidence.push(`${label} candidate identity/hash`);
    return false;
  }
  const contentHash = strict ? value.contentHash : value.contentHash ?? value.content_hash ?? value.candidateHash ?? value.candidate_sha256;
  const diffHash = strict ? value.diffFingerprint : value.diffFingerprint ?? value.diff_fingerprint;
  if (hashValue(contentHash) && candidate.sha256 !== contentHash) missingEvidence.push(`${label} candidate content hash binding`);
  if (hashValue(diffHash) && candidateDiff !== diffHash) missingEvidence.push(`${label} candidate diff hash binding`);
  return true;
}

/** 校验视觉 V3 资源、V4 页面草图与 V5 正式运行态的分段门。 */
export function validateVisualStagePrerequisites(subject = {}, options = {}) {
  const classification = classifyVisibleVisualProductionIntegration(subject);
  const result = { ok: true, required: classification.isVisibleVisualProductionIntegration, classification, stage: null, state: null, missingStages: [], missingEvidence: [], invalidatedDependencies: [], errors: [], snapshot: null, nextAction: null, disposition: null, remediation: null, affectedScope: [], identityChanges: [], invalidatesDownstream: false, returnStage: null, invalidatedStages: [] };
  const { stage, conflicts } = readVisualStage(subject);
  result.stage = stage;
  const state = firstValue(subject.visualStageState, subject.visual_stage_state, subject.visualState, subject.visual_state);
  result.state = state;
  if (!result.required) {
    if (conflicts.length) { result.ok = false; result.errors.push(error('VISUAL_STAGE_DECLARATION_INVALID', '视觉阶段字段未知或互相矛盾', { missingEvidence: ['visualStage'] })); }
    return finalizeRemediation(result, { subject, changed: [] });
  }
  if (classification.isolatedGraybox) return finalizeRemediation(result, { subject, changed: [] });
  if (conflicts.length) result.errors.push(error('VISUAL_STAGE_DECLARATION_INVALID', '视觉阶段字段未知或互相矛盾，不允许猜测', { missingEvidence: ['visualStage'] }));

  const sketchPreparation = stage === 'V4' && ['in-progress', 'pending'].includes(state);
  const sketchConfirmed = stage === 'V4' && state === 'v4-page-sketch-confirmed';
  const formalImplementation = stage === 'V5' && state === 'in-progress';
  const runtimeAccepted = stage === 'V5' && state === 'v5-runtime-integration-candidate';
  if (!sketchPreparation && !sketchConfirmed && !formalImplementation && !runtimeAccepted) {
    const missingStage = stage === 'V4' ? 'V4' : 'V5';
    result.missingStages.push(missingStage);
    result.errors.push(error('VISUAL_STAGE_NOT_READY', `正式可见视觉行为必须在 V4 草图准备/确认或 V5 正式实现/运行验收状态执行；当前为 ${stage ?? 'unknown'}/${state ?? 'missing'}`, { missingStages: [missingStage], missingEvidence: ['visualStage', 'visualStageState'] }));
  }

  const { evidence, v2, v3, v4, v5, refs } = evidenceObjects(subject, options);
  const missingEvidence = result.missingEvidence;
  const staleReferenceStages = [];
  const requiredRefs = sketchPreparation ? ['V2', 'V3'] : ['V2', 'V3', 'V4', ...(runtimeAccepted ? ['V5'] : [])];
  for (const referenceStage of requiredRefs) {
    const reference = refs[referenceStage];
    if (!isObject(reference) || !nonEmpty(reference.path) || !nonEmpty(reference.sha256)) missingEvidence.push(`${referenceStage} immutable evidence reference (path + sha256)`);
    else if (!loadImmutableVisualStageReference(reference, `${referenceStage} immutable evidence`, options)) {
      missingEvidence.push(`${referenceStage} immutable evidence hash/identity`);
      if (isStaleVisualReference(reference, options)) staleReferenceStages.push(referenceStage);
    }
  }
  const staleV2Files = [];
  if (isObject(v2)) {
    validateV2ProductionPlan(v2, subject, options, missingEvidence, staleV2Files);
  } else missingEvidence.push('V2 standard frozen reconstruction plan');
  if (staleV2Files.length) {
    result.invalidatedDependencies.push(...staleV2Files);
    result.errors.push(error('VISUAL_PENDING_STALE', 'V2 冻结拆解/技术来源文件哈希已漂移，需要重新验证 V2 当前门', { invalidatedDependencies: staleV2Files, disposition: VISUAL_REMEDIATION.REVALIDATE, affectedScope: staleV2Files }));
  }
  if (!isObject(v3) || v3.evidenceType !== 'v3-formal-acceptance' || v3.status !== 'PASS') missingEvidence.push('V3 acceptance PASS');
  if (isObject(v3)) {
    if (!nonEmpty(v3.acceptanceId) || !nonEmpty(v3.workItemId) || (subject.workItemId && v3.workItemId !== subject.workItemId) || !hashValue(v3.baselineHash) || (subject.baselineHash && v3.baselineHash !== subject.baselineHash) || !hashValue(v3.contentHash) || !hashValue(v3.diffFingerprint)) missingEvidence.push('V3 immutable acceptance identity/hash');
    validateEvidenceFiles(v3, 'V3 formal acceptance', options, missingEvidence);
    validateCandidateIdentity(v3, 'V3 formal acceptance', missingEvidence, true);
    const formalAssets = v3.formalAssets;
    const components = v3.components;
    if (!Array.isArray(formalAssets) || formalAssets.length === 0) missingEvidence.push('V3 accepted formal assets');
    else if (formalAssets.some((asset) => !isObject(asset) || !statusPass(asset.status))) missingEvidence.push('V3 formal asset accepted statuses');
    if (!Array.isArray(components) || components.length === 0) missingEvidence.push('V3 accepted component states');
    else if (components.some((component) => !isObject(component) || !statusPass(component.status))) missingEvidence.push('V3 component accepted statuses');
  }

  let confirmedSketch = null;
  if (sketchConfirmed || formalImplementation || runtimeAccepted) {
    try { confirmedSketch = assertConfirmedPageSketch(subject, options.projectRoot); }
    catch (caught) { missingEvidence.push(caught.message); }
    const pkg = options.implementationPackage ?? subject.implementationPackage;
    if ((formalImplementation || runtimeAccepted) && pkg && confirmedSketch
      && (pkg.pageSketchFile !== confirmedSketch.reference.path || pkg.pageSketchSha256 !== confirmedSketch.sha256)) missingEvidence.push('V5 Implementation Package pageSketchFile/pageSketchSha256 binding');
  } else if (sketchPreparation && refs.V4) {
    const draft = loadImmutableVisualStageReference(refs.V4, 'V4 draft page sketch', options);
    if (!draft || draft.value?.schema !== 'threejs-page-sketch/1.0' || draft.value?.confirmation?.status === 'accepted') missingEvidence.push('V4 editable unconfirmed page sketch');
  }

  if (runtimeAccepted) {
    if (!isObject(v5) || v5.evidenceType !== 'v5-runtime-integration-candidate' || v5.status !== 'PASS') missingEvidence.push('V5 runtime candidate PASS');
    if (isObject(v5)) {
      if (!nonEmpty(v5.candidateId) || v5.workItemId !== subject.workItemId || !hashValue(v5.baselineHash) || v5.baselineHash !== subject.baselineHash || !hashValue(v5.contentHash) || !nonEmpty(v5.diffFingerprint)) missingEvidence.push('V5 immutable candidate identity/hash');
      validateEvidenceFiles(v5, 'V5 runtime candidate', options, missingEvidence);
      validateCandidateIdentity(v5, 'V5 runtime candidate', missingEvidence, true);
      if (v5.pageSketchSha256 !== refs.V4?.sha256) missingEvidence.push('V5 pageSketchSha256 must bind current V4 page sketch');
    }
  }

  const pending = collectPendingEvidence({ v2, v3, v4, v5, visualManifest: options.visualManifest, implementationPackage: options.implementationPackage });
  if (pending.length) result.invalidatedDependencies.push(...pending.map((item) => `${item.path}=${item.value}`));
  const snapshot = visualPrerequisiteSnapshot(subject, { ...options, visualStageEvidence: evidence, v2, v3, v4, v5 });
  result.snapshot = snapshot;
  const oldSnapshot = options.pendingSnapshot ?? subject.pendingVisualPrerequisiteSnapshot ?? subject.pending_visual_prerequisite_snapshot;
  const changed = compareSnapshots(oldSnapshot, snapshot);
  if (changed.length) result.invalidatedDependencies.push(...changed);
  if (pending.length) result.errors.push(error('VISUAL_PENDING_ASSET', '存在 planned/pending 资源或未批准替代，当前门尚未满足', { invalidatedDependencies: result.invalidatedDependencies, disposition: VISUAL_REMEDIATION.REVALIDATE, affectedScope: pending.map((item) => item.path) }));
  if (staleReferenceStages.length) {
    const dependencies = staleReferenceStages.map((referenceStage) => `${referenceStage}EvidenceHash`);
    result.invalidatedDependencies.push(...dependencies);
    result.errors.push(error('VISUAL_PENDING_STALE', '视觉证据文件内容哈希已漂移，需要重验当前门；不因证据更新自动回退阶段', { invalidatedDependencies: dependencies, disposition: VISUAL_REMEDIATION.REVALIDATE, affectedScope: staleReferenceStages }));
  }
  if (changed.length) result.errors.push(error('VISUAL_PENDING_STALE', '当前门使用的视觉证据已更新，需要重新验证；不因证据更新自动回退阶段', { invalidatedDependencies: changed, disposition: VISUAL_REMEDIATION.REVALIDATE, affectedScope: changed }));
  if (missingEvidence.length) result.errors.push(error('VISUAL_PREREQUISITES_MISSING', 'V2/V3/V4/V5 下游证据不完整；根摘要、手写 PASS 或用户批准不具备证明力', { missingEvidence }));
  result.missingEvidence = [...new Set(missingEvidence)];
  result.invalidatedDependencies = [...new Set(result.invalidatedDependencies)];
  result.ok = result.errors.length === 0;
  return finalizeRemediation(result, { subject, v2, v3, v4, v5, oldSnapshot, snapshot, changed, returnStage: 'V2' });
}

/** 供 CLI 使用的异常，保留结构化门禁信息而非拼接不可解析文本。 */
export class VisualStagePrerequisiteError extends Error {
  constructor(result, command = 'visual-stage-gate') {
    const primary = result.errors?.[0] ?? error('VISUAL_PREREQUISITES_MISSING', '视觉阶段前置条件不满足');
    super(primary.message);
    this.name = 'VisualStagePrerequisiteError';
    this.command = command;
    this.result = result;
    this.errorCode = primary.errorCode;
  }
}

export function assertVisualStagePrerequisites(subject, options = {}) {
  const result = validateVisualStagePrerequisites(subject, options);
  if (result.required && !result.ok) throw new VisualStagePrerequisiteError(result, options.command);
  return result;
}

/** 将门禁失败标准化为 CLI stderr JSON，便于所有入口和自动化消费同一错误码。 */
export function structuredVisualStageFailure(errorValue, command = 'visual-stage-gate') {
  const result = errorValue?.result ?? errorValue;
  if (result?.ok === true) return { ok: true, command, required: result.required === true, stage: result.stage ?? null, state: result.state ?? null, snapshot: result.snapshot ?? null, disposition: null, remediation: null, affectedScope: [], invalidatedStages: [] };
  const primary = result?.errors?.[0] ?? error('VISUAL_PREREQUISITES_MISSING', errorValue?.message ?? '视觉阶段前置条件不满足');
  return {
    ok: false,
    command,
    errorCode: primary.errorCode,
    message: primary.message,
    disposition: result?.disposition ?? primary.disposition ?? VISUAL_REMEDIATION.REPAIR,
    remediation: result?.remediation ?? primary.remediation ?? REMEDIATION_LABEL[result?.disposition ?? primary.disposition ?? VISUAL_REMEDIATION.REPAIR],
    missingStages: [...new Set(result?.missingStages ?? primary.missingStages ?? [])],
    missingEvidence: [...new Set(result?.missingEvidence ?? primary.missingEvidence ?? [])],
    invalidatedDependencies: [...new Set(result?.invalidatedDependencies ?? primary.invalidatedDependencies ?? [])],
    affectedScope: [...new Set(result?.affectedScope ?? primary.affectedScope ?? [])],
    invalidatesDownstream: result?.invalidatesDownstream === true || primary.invalidatesDownstream === true,
    invalidatedStages: [...new Set(result?.invalidatedStages ?? [])],
    returnStage: result?.returnStage ?? null,
    nextAction: result?.nextAction ?? primary.nextAction ?? REMEDIATION_NEXT_ACTION[VISUAL_REMEDIATION.REPAIR],
  };
}

/**
 * 所有 CLI 入口共享的视觉阶段门；失败抛出结构化异常交给 CLI 输出，
 * 避免某入口把缺失证据降级成普通提示或被批准文本覆盖。
 */
export function enforceVisualStageGate(work, options = {}) {
  const result = validateVisualStagePrerequisites(work, options);
  const actionLevel = String(options.actionLevel ?? '');
  const sketchWork = result.stage === 'V4' && ['in-progress', 'pending', 'v4-page-sketch-confirmed'].includes(String(result.state));
  const formalCodeWork = result.stage === 'V5' && result.state === 'in-progress';
  const runtimeProofReady = result.stage === 'V5' && result.state === 'v5-runtime-integration-candidate';
  const prematureA4 = result.required && actionLevel === 'A4' && !runtimeProofReady && !result.classification.isolatedGraybox;
  const prematureFormalAction = result.required && ['A0', 'A1', 'A2', 'A3'].includes(actionLevel)
    && !sketchWork && !formalCodeWork && !result.classification.isolatedGraybox;
  if (prematureA4 || prematureFormalAction) {
    result.ok = false;
    result.errors.unshift(error(prematureA4 ? 'VISUAL_A4_REQUIRES_V5_RUNTIME_ACCEPTANCE' : 'VISUAL_FORMAL_ENTRY_REQUIRES_A4', prematureA4
      ? 'A4/F4 正式入口必须等待 V5 运行验收候选完成'
      : '正式可见视觉集成必须通过 V5 页面草图绑定和运行验收；只有 V4 草图准备或 V5 正式代码实施可在 A1–A3 执行', {
      missingStages: [prematureA4 ? 'V5' : 'V4'],
      affectedScope: ['当前动作等级', 'A4/F4 pending'],
      disposition: VISUAL_REMEDIATION.REPAIR,
      nextAction: '原地修复当前动作等级或 pending 上下文，再重新运行当前门；A4/F4 只能在 V5 运行验收后进入',
    }));
    // 该错误只说明当前动作与门不匹配，不使已冻结的候选失效，也不触发阶段回退。
    result.affectedScope = [...new Set([...result.affectedScope, '当前动作等级', 'A4/F4 pending'])];
    if (result.disposition !== VISUAL_REMEDIATION.RETURN) {
      result.disposition = VISUAL_REMEDIATION.REPAIR;
      result.remediation = REMEDIATION_LABEL[VISUAL_REMEDIATION.REPAIR];
      result.invalidatesDownstream = false;
      result.returnStage = null;
      result.invalidatedStages = [];
      result.nextAction = '原地修复当前动作等级或 pending 上下文，再重新运行当前门；A4/F4 只能在 V5 运行验收后进入';
    }
  }
  if (result.required && !result.ok) throw new VisualStagePrerequisiteError(result, options.command ?? 'visual-stage-gate');
  return result;
}

/** 计算证据对象摘要，供审计和 pending 快照诊断使用。 */
export function visualEvidenceDigest(value) {
  return sha256Bytes(JSON.stringify(value ?? null));
}
