/** V0→V5 视觉阶段硬门回归；正式资源、确认草图与运行验收必须逐段绑定。 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { classifyVisibleVisualProductionIntegration, structuredVisualStageFailure, validateVisualStageDeclaration, validateVisualStagePrerequisites } from './visual-stage-prerequisites.mjs';
import { bindConfirmedSketchFixture } from './workflow-page-sketch-fixture.mjs';

const SHA = `sha256:${'a'.repeat(64)}`;
const HASH2 = `sha256:${'b'.repeat(64)}`;
const HASH3 = `sha256:${'d'.repeat(64)}`;
const CLI = resolve(import.meta.dirname, 'workflow-control.mjs');

function sha(path) { return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`; }
function writeJson(root, relative, value) {
  const path = join(root, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return { path: relative.replaceAll('\\', '/'), sha256: sha(path) };
}
/** 构造严格 V2 冻结计划，并复用工作流夹具生成 V3/V4/V5 的真实来源链。 */
function evidenceSet(root, overrides = {}) {
  const sceneId = 'main-scene';
  const artifactFiles = {
    sceneMaster: 'docs/reference.png',
    reconstructionContract: 'docs/reconstruction-contract.json',
    decompositionAnnotation: 'docs/decomposition-annotation.png',
    technicalDecomposition: 'docs/technical-decomposition.json',
    confirmation: 'docs/v2-confirmation.json',
  };
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, artifactFiles.sceneMaster), 'reference image pixels\n', 'utf8');
  writeFileSync(join(root, artifactFiles.decompositionAnnotation), 'confirmed annotation pixels\n', 'utf8');
  writeFileSync(join(root, artifactFiles.technicalDecomposition), '{"analysis":"visual layout source"}\n', 'utf8');
  writeFileSync(join(root, artifactFiles.confirmation), 'manual V2 confirmation\n', 'utf8');
  const targetSha = sha(join(root, artifactFiles.sceneMaster));
  const artifact = (file) => ({ file, sha256: sha(join(root, file)), sceneId });
  const contract = {
    target_conditions: { target_sha256: targetSha, scene_id: sceneId, state_id: 'default', viewport: { width: 390, height: 844 } },
    layout_decomposition: { layout_nodes: [] },
  };
  writeFileSync(join(root, artifactFiles.reconstructionContract), `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
  const v2 = {
    schemaVersion: 'threejs-scene-v2-reconstruction-plan/1.0',
    workItemId: 'WI-VISUAL', status: 'COMPLETE', stage: 'V2', frozen: true, sceneId,
    targetSha256: targetSha, candidateSha256: HASH2, diffFingerprint: HASH2,
    sceneMaster: artifact(artifactFiles.sceneMaster),
    sceneReconstructionContract: artifact(artifactFiles.reconstructionContract),
    decompositionAnnotation: artifact(artifactFiles.decompositionAnnotation),
    technicalDecomposition: artifact(artifactFiles.technicalDecomposition),
    visualDecompositionConfirmation: {
      confirmationId: 'CONFIRM-V2', confirmationMode: 'manual', status: 'PASS',
      targetSha256: targetSha, candidateSha256: HASH2, diffFingerprint: HASH2,
      evidenceFile: artifactFiles.confirmation, evidenceSha256: sha(join(root, artifactFiles.confirmation)),
    },
    visualProductionContract: { contractId: 'CONTRACT-V2' },
    visualProductionUnits: [{ unitId: 'unit', owner: 'fixed-production-visual' }],
    displayLayerContexts: [],
  };
  const initialWork = {
    workItemId: 'WI-VISUAL', baselineHash: SHA, visualStage: 'V5',
    visualStageEvidenceRefs: { V2: writeJson(root, 'evidence/V2.json', v2) },
  };
  const pkg = {};
  bindConfirmedSketchFixture({ repo: root, work: initialWork, pkg });
  const refs = { ...initialWork.visualStageEvidenceRefs };
  // 每次变体都重算文件引用 SHA，测试内容校验而非无关的旧引用哈希错误。
  for (const [stage, patch] of Object.entries(overrides)) {
    if (!refs[stage] || !patch) continue;
    const current = JSON.parse(readFileSync(join(root, refs[stage].path), 'utf8'));
    refs[stage] = writeJson(root, refs[stage].path, { ...current, ...patch });
  }
  return refs;
}
/** 创建指定视觉阶段的 Work Item，默认使用完整且可复核的 V2→V5 证据链。 */
function subject(root, options = {}) {
  const refs = options.refs ?? evidenceSet(root, options.evidence);
  const visualStage = options.visualStage ?? 'V5';
  const visualStageState = options.visualStageState ?? ({ V4: 'v4-page-sketch-confirmed', V5: 'v5-runtime-integration-candidate' }[visualStage] ?? 'pending');
  const targetSha = sha(join(root, 'docs/reference.png'));
  return {
    workItemId: 'WI-VISUAL',
    domain: 'visual',
    stageId: options.stageId ?? 'production-entry',
    visualStage,
    visualStageState,
    visualIntegration: options.visualIntegration ?? { registersFormalScene: true },
    baselineHash: SHA,
    targetSha256: targetSha,
    visualStageEvidenceRefs: refs,
    ...options,
  };
}
function tempFixture(options = {}) { const root = mkdtempSync(join(tmpdir(), 'threejs-visual-stage-')); return { root, work: subject(root, options) }; }
function errorCodes(result) { return result.errors.map((item) => item.errorCode); }

/** 创建真实 Git 基线，供 CLI 交接阶段验证候选 diff，而不是只测试纯函数。 */
function makeCliFixture() {
  const repo = mkdtempSync(join(tmpdir(), 'threejs-visual-cli-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', '视觉门测试'], { cwd: repo });
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'main.js'), 'export const scene = true;\n', 'utf8');
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-qm', 'baseline'], { cwd: repo });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  const refs = evidenceSet(repo);
  const root = join(repo, '.workflow-control');
  mkdirSync(join(root, 'work-items'), { recursive: true });
  mkdirSync(join(root, 'approvals'), { recursive: true });
  const workPath = join(root, 'work-items', 'WI-VISUAL.json');
  const ledgerPath = join(root, 'approvals', 'ledger.json');
  const work = {
    workItemId: 'WI-VISUAL', projectId: 'P-VISUAL', moduleIds: ['scene'], domain: 'visual', stageId: 'main', globalState: 'PASSED', baselineId: head, baselineVersion: '1', baselineHash: SHA,
    objective: '将正式视觉候选接入 Main Scene',
    inScope: ['scene'], outOfScope: ['release'], approvedRequirements: ['REQ-VISUAL'], allowedActions: ['threejs-inspect', 'threejs-spec-candidate', 'threejs-prototype', 'threejs-code-change', 'threejs-integration'], allowedActionLevels: ['A0', 'A1', 'A2', 'A3'], explicitApprovalActionLevels: ['A4', 'A5', 'A6'], prohibitedActions: [], allowedPaths: ['src'], forbiddenPaths: ['.git'], allowedExternalTargets: [], protectedExternalTargets: [], requiredGates: ['F0', 'F1', 'F2', 'F3'], approvalRecord: null,
    assignedAgent: 'implementer', delegatedAgents: [], expectedOutputs: ['src/main.js'], validationPlan: ['node --test'], exitCriteria: ['视觉证据复核'], nextGate: 'F4', rollbackPolicy: '不自动回滚共享工作区', evidenceRoot: '.workflow-control/evidence/WI-VISUAL',
    pendingApprovalId: 'PENDING-OLD', pendingApprovalObject: '旧候选', pendingApprovalStage: 'main', pendingApprovalActionLevel: 'A4', pendingApprovalGate: 'F4', pendingApprovalState: 'PASSED', pendingApprovalContext: 'threejs-integration', pendingApprovalActionType: 'threejs-integration', pendingApprovalImpactSummary: ['验证候选'], pendingApprovalFileScope: ['src'], pendingApprovalServices: [], pendingApprovalAllowServiceStart: false, pendingApprovalAllowDelete: false, pendingApprovalExternalWrite: false, pendingApprovalDestructive: false, pendingApprovalPhysicalDevice: false, pendingApprovalRelease: false, pendingApprovalExternalTargets: [], pendingApprovalPreparedAt: '2026-08-20T00:00:00.000Z', pendingApprovalPresentedId: null, pendingApprovalPresentedAt: null,
    validationBatchId: 'BATCH-VISUAL', changeRequestFiles: [], visualStage: 'V5', visualStageState: 'v5-runtime-integration-candidate', visualStageEvidenceRefs: refs, visualIntegration: { registersFormalScene: true },
  };
  writeFileSync(workPath, `${JSON.stringify(work, null, 2)}\n`, 'utf8');
  writeFileSync(ledgerPath, `${JSON.stringify({ schemaVersion: '1.0', approvals: [] }, null, 2)}\n`, 'utf8');
  return { repo, root, head, workPath, ledgerPath, refs };
}

/** 执行真实 workflow-control CLI，保留 stdout/stderr 供错误码与落盘断言使用。 */
function runCli(fixture, command, args = []) {
  return spawnSync(process.execPath, [CLI, command, ...args, '--repo', fixture.repo], { cwd: fixture.repo, encoding: 'utf8' });
}

test('静态基线 global-static-baseline-frozen 不能冒充 V2', () => {
  const f = tempFixture({ visualStage: 'V2', visualStageState: 'pending', globalStaticBaselineState: 'global-static-baseline-frozen' });
  const result = validateVisualStagePrerequisites(f.work, { projectRoot: f.root });
  assert.equal(result.ok, false);
  assert(errorCodes(result).includes('VISUAL_STAGE_NOT_READY'));
});

test('V0/V1 全局冻结状态缺少三候选人工选择引用时拒绝', () => {
  const errors = validateVisualStageDeclaration({ workItemId: 'WI-GLOBAL', visualStage: 'V1', visualStageState: 'global-static-baseline-frozen' });
  assert(errors.some((item) => item.errorCode === 'GLOBAL_VISUAL_BASELINE_SELECTION_MISSING'));
});

test('V2 PASS 但 V3/V4/V5 缺失时正式运行硬门拒绝', () => {
  const f = tempFixture();
  delete f.work.visualStageEvidenceRefs.V3; delete f.work.visualStageEvidenceRefs.V4; delete f.work.visualStageEvidenceRefs.V5;
  const result = validateVisualStagePrerequisites(f.work, { projectRoot: f.root });
  assert.equal(result.ok, false); assert.equal(result.disposition, 'revalidate'); assert(result.missingEvidence.some((item) => item.startsWith('V3 immutable'))); assert(result.missingEvidence.some((item) => item.startsWith('V4 immutable'))); assert(result.missingEvidence.some((item) => item.startsWith('V5 immutable')));
});

test('V2 技术拆解文件发生来源漂移时只要求重验当前门', () => {
  const f = tempFixture();
  const v2 = JSON.parse(readFileSync(join(f.root, f.work.visualStageEvidenceRefs.V2.path), 'utf8'));
  writeFileSync(join(f.root, v2.technicalDecomposition.file), 'changed technical decomposition\n', 'utf8');
  const result = validateVisualStagePrerequisites(f.work, { projectRoot: f.root });
  assert.equal(result.ok, false);
  assert.equal(result.disposition, 'revalidate');
  assert.equal(result.returnStage, null);
  assert(errorCodes(result).includes('VISUAL_PENDING_STALE'));
  assert(result.invalidatedDependencies.some((item) => item.includes('V2 technicalDecomposition')));
});

test('V3 accepted 到 V4 草图确认后，V5 实现候选演进不触发阶段回退', () => {
  const f = tempFixture({ evidence: {
    V5: { contentHash: HASH3, diffFingerprint: HASH3, candidateIdentity: { sha256: HASH3, diffFingerprint: HASH3 } },
  } });
  const result = validateVisualStagePrerequisites(f.work, { projectRoot: f.root });
  assert.equal(result.ok, true);
  assert.notEqual(result.disposition, 'return');
  assert.equal(result.returnStage, null);
});

test('V4 草图准备只依赖 V2/V3，确认态消费 V4 canonical 草图', () => {
  const preparing = tempFixture({ visualStage: 'V4', visualStageState: 'in-progress' });
  delete preparing.work.visualStageEvidenceRefs.V4;
  delete preparing.work.visualStageEvidenceRefs.V5;
  const prepareResult = validateVisualStagePrerequisites(preparing.work, { projectRoot: preparing.root });
  assert.equal(prepareResult.ok, true);

  const confirmed = tempFixture({ visualStage: 'V4', visualStageState: 'v4-page-sketch-confirmed' });
  const confirmedResult = validateVisualStagePrerequisites(confirmed.work, { projectRoot: confirmed.root });
  assert.equal(confirmedResult.ok, true);
  assert.equal(confirmed.work.visualStageEvidenceRefs.V4.path, 'docs/page-sketch.json');
});

test('V4 准备缺少 V3 或 V5 运行态草图 SHA 漂移时拒绝', () => {
  const missingV3 = tempFixture({ visualStage: 'V4', visualStageState: 'in-progress' });
  delete missingV3.work.visualStageEvidenceRefs.V3;
  const missingResult = validateVisualStagePrerequisites(missingV3.work, { projectRoot: missingV3.root });
  assert.equal(missingResult.ok, false);
  assert(missingResult.missingEvidence.some((item) => item.startsWith('V3 immutable')));

  const driftedV5 = tempFixture({ evidence: { V5: { pageSketchSha256: HASH3 } } });
  const driftResult = validateVisualStagePrerequisites(driftedV5.work, { projectRoot: driftedV5.root });
  assert.equal(driftResult.ok, false);
  assert(driftResult.missingEvidence.includes('V5 pageSketchSha256 must bind current V4 page sketch'));
});

test('V5 正式实施包必须精确绑定已确认 V4 草图 path/SHA', () => {
  const f = tempFixture({ visualStage: 'V5', visualStageState: 'in-progress' });
  const sketchRef = f.work.visualStageEvidenceRefs.V4;
  const pkg = { pageSketchFile: sketchRef.path, pageSketchSha256: sketchRef.sha256 };
  assert.equal(validateVisualStagePrerequisites(f.work, { projectRoot: f.root, implementationPackage: pkg }).ok, true);

  const drifted = validateVisualStagePrerequisites(f.work, {
    projectRoot: f.root,
    implementationPackage: { ...pkg, pageSketchSha256: HASH3 },
  });
  assert.equal(drifted.ok, false);
  assert(drifted.missingEvidence.includes('V5 Implementation Package pageSketchFile/pageSketchSha256 binding'));
});

test('V2 冻结目标身份真实变化时才要求回退 V2', () => {
  const f = tempFixture({ evidence: { V2: { targetSha256: HASH3 } } });
  const result = validateVisualStagePrerequisites(f.work, { projectRoot: f.root });
  assert.equal(result.ok, false);
  assert.equal(result.disposition, 'return');
  assert.equal(result.returnStage, 'V2');
  assert(result.identityChanges.includes('V2 plan target identity'));
});

test('标准 V2、accepted V3、人工确认 V4 与绑定 SHA 的 V5 允许正式运行验收', () => {
  const f = tempFixture();
  const result = validateVisualStagePrerequisites(f.work, { projectRoot: f.root });
  assert.equal(result.ok, true); assert.equal(result.required, true);
  assert.equal(result.stage, 'V5');
  assert.equal(JSON.parse(readFileSync(join(f.root, f.work.visualStageEvidenceRefs.V2.path), 'utf8')).schemaVersion, 'threejs-scene-v2-reconstruction-plan/1.0');
  assert.equal(JSON.parse(readFileSync(join(f.root, f.work.visualStageEvidenceRefs.V5.path), 'utf8')).pageSketchSha256, f.work.visualStageEvidenceRefs.V4.sha256);
});

test('V2 只接受标准冻结方案，拒绝旧 evidenceType 别名和额外根字段', () => {
  const alias = tempFixture({ evidence: { V2: { schemaVersion: null, evidenceType: 'v2-production-plan' } } });
  const aliasResult = validateVisualStagePrerequisites(alias.work, { projectRoot: alias.root });
  assert.equal(aliasResult.ok, false);
  assert(aliasResult.missingEvidence.some((item) => item.startsWith('V2')));

  const extra = tempFixture({ evidence: { V2: { evidenceType: 'v2-production-plan' } } });
  const extraResult = validateVisualStagePrerequisites(extra.work, { projectRoot: extra.root });
  assert.equal(extraResult.ok, false);
  assert(extraResult.missingEvidence.some((item) => item.startsWith('V2')));
});

test('灰盒隔离 A2 允许，注册正式入口仍拒绝', () => {
  const isolated = tempFixture({ stageId: 'graybox', visualIntegration: {}, graybox: true, isolatedPrototype: true, actionLevel: 'A2' });
  assert.equal(classifyVisibleVisualProductionIntegration(isolated.work).isVisibleVisualProductionIntegration, false);
  const formal = tempFixture({ stageId: 'graybox', visualIntegration: { registersFormalScene: true }, graybox: true, actionLevel: 'A2' });
  assert.equal(classifyVisibleVisualProductionIntegration(formal.work).isVisibleVisualProductionIntegration, true);
});

test('V3 Main 范围不因目标文字误判正式场景运行接入', () => {
  for (const objective of ['当前场景的正式资源生产与验收', '替换失败的正式图片资源', '实现当前主场景']) {
    const f = tempFixture({
      stageId: 'main', visualStage: 'V3', visualStageState: 'in-progress',
      objective, inScope: ['正式资源目录'], visualIntegration: {},
    });
    const classification = classifyVisibleVisualProductionIntegration(f.work);
    assert.equal(classification.isVisibleVisualProductionIntegration, false, objective);
    const result = validateVisualStagePrerequisites(f.work, { projectRoot: f.root });
    assert.equal(result.ok, true, objective);
    assert.equal(result.required, false, objective);
    assert.deepEqual(result.errors, [], objective);
  }
});

test('V3 明确正式入口、资源消费或 Boot→Scene 接入仍受阶段硬门阻断', () => {
  const cases = [
    {
      objective: '当前场景的正式资源生产与验收',
      visualIntegration: { registerFormalScene: true },
    },
    {
      objective: '当前场景的正式资源生产与验收',
      visualIntegration: { consumeVisibleAsset: true },
    },
    {
      objective: '正式 Boot→Scene 接入并消费正式图片资源',
      visualIntegration: {},
    },
    {
      objective: '生成正式资源并验收',
      inScope: ['注册正式主场景入口'],
      visualIntegration: {},
    },
  ];
  for (const options of cases) {
    const f = tempFixture({ stageId: 'main', visualStage: 'V3', visualStageState: 'in-progress', ...options });
    const classification = classifyVisibleVisualProductionIntegration(f.work);
    assert.equal(classification.isVisibleVisualProductionIntegration, true, JSON.stringify(options));
    const result = validateVisualStagePrerequisites(f.work, { projectRoot: f.root });
    assert.equal(result.ok, false, JSON.stringify(options));
    assert.equal(result.required, true, JSON.stringify(options));
    assert(errorCodes(result).includes('VISUAL_STAGE_NOT_READY'), JSON.stringify(options));
  }
});

test('裸 frozen 在 Schema 阶段声明校验中失败', () => {
  const errors = validateVisualStageDeclaration({ domain: 'visual', stageId: 'V2', visualStage: 'V2', visualStageState: 'frozen' });
  assert.equal(errors[0].errorCode, 'VISUAL_BARE_FROZEN');
});

test('自定义 stageId 不能替代显式视觉阶段', () => {
  const f = tempFixture({ stageId: 'main', visualStage: 'V2', visualStageState: 'v2-production-planning-complete' });
  const result = validateVisualStagePrerequisites(f.work, { projectRoot: f.root });
  assert.equal(result.ok, false); assert(errorCodes(result).includes('VISUAL_STAGE_NOT_READY'));
});

test('根 PASS 或顶层布尔值不能满足依赖', () => {
  const f = tempFixture({ visualStageEvidenceRefs: undefined, pass: true, visualPass: true });
  const result = validateVisualStagePrerequisites(f.work, { projectRoot: f.root });
  assert.equal(result.ok, false); assert(result.missingEvidence.some((item) => item.includes('immutable evidence reference')));
});

test('上游证据文件、基线或候选哈希变化使 pending stale', () => {
  const f = tempFixture();
  const first = validateVisualStagePrerequisites(f.work, { projectRoot: f.root });
  assert.equal(first.ok, true);
  const v3Path = join(f.root, f.work.visualStageEvidenceRefs.V3.path);
  const updated = writeJson(f.root, f.work.visualStageEvidenceRefs.V3.path, { ...JSON.parse(readFileSync(v3Path, 'utf8')), marker: 'changed' });
  f.work.visualStageEvidenceRefs.V3 = updated;
  const result = validateVisualStagePrerequisites(f.work, { projectRoot: f.root, pendingSnapshot: first.snapshot });
  assert.equal(result.ok, false); assert.equal(result.disposition, 'revalidate'); assert.equal(result.returnStage, null); assert(errorCodes(result).includes('VISUAL_PENDING_STALE')); assert(result.invalidatedDependencies.includes('V3ReferenceHash'));
  assert(result.missingEvidence.some((item) => item.includes('当前 V3') && item.includes('SHA')), result.missingEvidence.join('\n'));
});

test('缺唯一 V2 拆解确认时拒绝 V4/V5 下游阶段', () => {
  const f = tempFixture({ evidence: { V2: { visualDecompositionConfirmation: null } } });
  const result = validateVisualStagePrerequisites(f.work, { projectRoot: f.root });
  assert.equal(result.ok, false); assert(result.missingEvidence.includes('V2 manual decomposition confirmation identity'));
});

test('planned/pending 正式资产或未批准替代时拒绝', () => {
  const f = tempFixture({ evidence: { V3: { formalAssets: [{ id: 'pending', status: 'planned' }] } } });
  const result = validateVisualStagePrerequisites(f.work, { projectRoot: f.root });
  assert.equal(result.ok, false); assert(errorCodes(result).includes('VISUAL_PENDING_ASSET'));
});

test('完整 V5 运行候选可供所有入口复用同一结果', () => {
  const f = tempFixture();
  const result = validateVisualStagePrerequisites(f.work, { projectRoot: f.root });
  const output = structuredVisualStageFailure(result, 'route');
  assert.equal(result.ok, true); assert.equal(output.ok, true); assert.deepEqual(result.snapshot, validateVisualStagePrerequisites(f.work, { projectRoot: f.root }).snapshot);
});

test('非视觉 A4 与普通安全 A3 不被误伤', () => {
  assert.equal(classifyVisibleVisualProductionIntegration({ domain: 'architecture', stageId: 'integration', objective: '更新数据契约' }).isVisibleVisualProductionIntegration, false);
  assert.equal(classifyVisibleVisualProductionIntegration({ domain: 'code', stageId: 'G1', objective: '实现安全 A3' }).isVisibleVisualProductionIntegration, false);
});

test('当前没有控制目录或真实视觉证据时不能生成 Main Scene A4 pending', () => {
  const root = mkdtempSync(join(tmpdir(), 'threejs-no-control-'));
  const work = subject(root, { visualStage: 'V2', visualStageState: 'v2-production-planning-complete', visualStageEvidenceRefs: undefined, stageId: 'main' });
  const result = validateVisualStagePrerequisites(work, { projectRoot: root });
  assert.equal(result.ok, false); assert(result.missingEvidence.length > 0); assert.equal(readFileSync(join(root, 'evidence/V2.json'), 'utf8').length > 0, true);
});

test('CLI：普通集成不需批准，破坏性集成的 stale pending 不写 Ledger', () => {
  const fixture = makeCliFixture();
  const beforeWork = readFileSync(fixture.workPath, 'utf8');
  const beforeLedger = readFileSync(fixture.ledgerPath, 'utf8');
  const route = runCli(fixture, 'route', ['--work-item', fixture.workPath, '--ledger', fixture.ledgerPath]);
  assert.equal(route.status, 0, route.stderr);
  assert.equal(JSON.parse(route.stdout).authorizationBasis, 'TASK_SCOPE');
  assert.equal(JSON.parse(route.stdout).explicitApprovalRequired, false);

  const preflight = runCli(fixture, 'preflight', ['--work-item', fixture.workPath, '--action-level', 'A3', '--action-type', 'threejs-code-change', '--path', 'src']);
  assert.notEqual(preflight.status, 0);
  const preflightError = JSON.parse(preflight.stderr);
  assert.equal(preflightError.errorCode, 'VISUAL_FORMAL_ENTRY_REQUIRES_A4');
  assert.equal(readFileSync(fixture.workPath, 'utf8'), beforeWork);
  assert.equal(readFileSync(fixture.ledgerPath, 'utf8'), beforeLedger);

  const originalWork = JSON.parse(beforeWork);
  const sketchOnlyWork = { ...originalWork, visualStage: 'V4', visualStageState: 'v4-page-sketch-confirmed' };
  writeFileSync(fixture.workPath, `${JSON.stringify(sketchOnlyWork, null, 2)}\n`, 'utf8');
  const prematureA4 = runCli(fixture, 'preflight', ['--work-item', fixture.workPath, '--action-level', 'A4', '--action-type', 'threejs-integration', '--path', 'src']);
  assert.notEqual(prematureA4.status, 0);
  assert.equal(JSON.parse(prematureA4.stderr).errorCode, 'VISUAL_A4_REQUIRES_V5_RUNTIME_ACCEPTANCE');
  writeFileSync(fixture.workPath, `${JSON.stringify(originalWork, null, 2)}\n`, 'utf8');

  const invalid = { ...originalWork, visualStageEvidenceRefs: { ...originalWork.visualStageEvidenceRefs } };
  delete invalid.visualStageEvidenceRefs.V3; delete invalid.visualStageEvidenceRefs.V4; delete invalid.visualStageEvidenceRefs.V5;
  writeFileSync(fixture.workPath, `${JSON.stringify(invalid, null, 2)}\n`, 'utf8');
  for (const command of ['status', 'route']) {
    const blockedRead = runCli(fixture, command, ['--work-item', fixture.workPath, '--ledger', fixture.ledgerPath, ...(command === 'status' ? ['--json'] : [])]);
    if (command === 'status') {
      // status 是只读查询入口，统一输出 BLOCKED 但保留成功退出码；route 仍需硬门非零阻断。
      assert.equal(blockedRead.status, 0);
      assert.equal(JSON.parse(blockedRead.stdout).status, 'BLOCKED');
    } else {
      assert.notEqual(blockedRead.status, 0);
      assert.equal(JSON.parse(blockedRead.stderr).errorCode, 'VISUAL_PREREQUISITES_MISSING');
    }
  }
  const prepareArgs = ['--work-item', fixture.workPath, '--ledger', fixture.ledgerPath, '--pending-id', 'PENDING-V5', '--object', 'replace Main Scene visual entry', '--stage', 'main', '--action-type', 'threejs-integration', '--action-level', 'A4', '--gate', 'F4', '--context', 'threejs-integration', '--path', 'src', '--destructive', '--impact', '破坏性替换正式视觉入口'];
  const blockedPrepare = runCli(fixture, 'prepare-approval', prepareArgs);
  assert.notEqual(blockedPrepare.status, 0);
  const blockedError = JSON.parse(blockedPrepare.stderr);
  assert.equal(blockedError.errorCode, 'VISUAL_PREREQUISITES_MISSING');
  assert.deepEqual(JSON.parse(readFileSync(fixture.ledgerPath, 'utf8')).approvals, []);
  assert.deepEqual(JSON.parse(readFileSync(fixture.workPath, 'utf8')).pendingApprovalId, 'PENDING-OLD');

  writeFileSync(fixture.workPath, `${JSON.stringify(originalWork, null, 2)}\n`, 'utf8');
  const prepared = runCli(fixture, 'prepare-approval', prepareArgs);
  assert.equal(prepared.status, 0, prepared.stderr);
  const pending = JSON.parse(readFileSync(fixture.workPath, 'utf8'));
  assert.equal(pending.pendingApprovalStatus, 'pending');
  assert.ok(pending.pendingVisualPrerequisiteSnapshot);
  const handedOff = runCli(fixture, 'handoff', ['--work-item', fixture.workPath, '--ledger', fixture.ledgerPath]);
  assert.equal(handedOff.status, 0, handedOff.stderr);
  assert.equal(JSON.parse(readFileSync(fixture.workPath, 'utf8')).pendingApprovalPresentedId, 'PENDING-V5');

  const v3Path = join(fixture.repo, fixture.refs.V3.path);
  const originalV3 = readFileSync(v3Path);
  writeFileSync(v3Path, Buffer.concat([originalV3, Buffer.from('\nchanged after handoff\n')]));
  const staleHandoff = runCli(fixture, 'handoff', ['--work-item', fixture.workPath, '--ledger', fixture.ledgerPath]);
  assert.notEqual(staleHandoff.status, 0);
  assert.ok(['VISUAL_PENDING_STALE', 'VISUAL_PREREQUISITES_MISSING'].includes(JSON.parse(staleHandoff.stderr).errorCode));
  const staleApprove = runCli(fixture, 'approve', ['--work-item', fixture.workPath, '--ledger', fixture.ledgerPath, '--approval-id', 'AP-STALE', '--user-text', '批准']);
  assert.notEqual(staleApprove.status, 0);
  const staleError = JSON.parse(staleApprove.stderr);
  assert.ok(['VISUAL_PENDING_STALE', 'VISUAL_PREREQUISITES_MISSING'].includes(staleError.errorCode));
  assert.equal(staleError.disposition, 'revalidate');
  assert.equal(staleError.returnStage, null);
  assert.deepEqual(JSON.parse(readFileSync(fixture.ledgerPath, 'utf8')).approvals, []);
  assert.equal(JSON.parse(readFileSync(fixture.workPath, 'utf8')).approvalRecord, null);

  writeFileSync(v3Path, originalV3);
  const approved = runCli(fixture, 'approve', ['--work-item', fixture.workPath, '--ledger', fixture.ledgerPath, '--approval-id', 'AP-V5', '--user-text', '批准']);
  assert.equal(approved.status, 0, approved.stderr);
  const ledger = JSON.parse(readFileSync(fixture.ledgerPath, 'utf8'));
  assert.equal(ledger.approvals.length, 1);
  assert.equal(ledger.approvals[0].approvalId, 'AP-V5');
});

test('CLI：RETURN 必须声明必要分类并持久化最小影响范围', () => {
  const fixture = makeCliFixture();
  const missing = runCli(fixture, 'transition', ['--work-item', fixture.workPath, '--to', 'RETURN']);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /return-classification/i);

  const accepted = runCli(fixture, 'transition', [
    '--work-item', fixture.workPath,
    '--to', 'RETURN',
    '--return-classification', 'upstream-fact-invalidated',
    '--return-reason', 'V2 冻结候选身份已变化',
    '--affected-scope', 'stage:V2,scene:scene-main',
  ]);
  assert.equal(accepted.status, 0, accepted.stderr);
  const work = JSON.parse(readFileSync(fixture.workPath, 'utf8'));
  assert.equal(work.globalState, 'RETURN');
  assert.equal(work.returnRecord.classification, 'upstream-fact-invalidated');
  assert.deepEqual(work.returnRecord.affectedScope, ['stage:V2', 'scene:scene-main']);

  const status = runCli(fixture, 'status', ['--work-item', fixture.workPath, '--json']);
  assert.equal(status.status, 0, status.stderr);
  const statusResult = JSON.parse(status.stdout);
  assert.equal(statusResult.status, 'BLOCKED');
  assert.match(statusResult.next, /returnRecord/);
  const automatic = runCli(fixture, 'advance', ['--work-item', fixture.workPath]);
  assert.notEqual(automatic.status, 0);
  assert.match(automatic.stderr, /不能使用 advance/);

  const tampered = { ...work, returnRecord: { ...work.returnRecord, affectedScope: [] } };
  writeFileSync(fixture.workPath, `${JSON.stringify(tampered, null, 2)}\n`, 'utf8');
  const rejected = runCli(fixture, 'status', ['--work-item', fixture.workPath]);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /affectedScope/);

  writeFileSync(fixture.workPath, `${JSON.stringify(work, null, 2)}\n`, 'utf8');
  const recovered = runCli(fixture, 'transition', ['--work-item', fixture.workPath, '--to', 'REVIEW']);
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.equal(JSON.parse(readFileSync(fixture.workPath, 'utf8')).globalState, 'REVIEW');
});
