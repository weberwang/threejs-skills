/** 工作流放宽后的关键回归用例；由主测试文件注入既有夹具，避免测试注册文件继续膨胀。 */

/** 注册普通 Work Item、具体副作用和说明字段的回归测试。 */
export function registerRelaxedWorkflowTests({
  assert,
  test,
  setup,
  makeFoundationPackage,
  makePackage,
  writeBoundPackage,
  run,
  rejects,
  readFileSync,
  writeJson,
  join,
  rmSync,
  existsSync,
  makeEvidence,
  hash,
}) {
  test('普通任务：没有独立授权对象也能完成 Work Item、Diff Audit 和 Evidence 闭环', () => {
    const f = setup({ globalState: 'REVIEW', visualStage: 'V0', visualStageState: 'not-started', pendingApprovalState: 'REVIEW', pendingApprovalActionLevel: 'A1', pendingApprovalActionType: 'threejs-spec-candidate', pendingApprovalFileScope: ['docs'] }, [], makeFoundationPackage);
    const work = JSON.parse(readFileSync(f.workPath, 'utf8'));
    const pkg = JSON.parse(readFileSync(f.packagePath, 'utf8'));
    assert.equal(Object.hasOwn(work, 'taskAuthorization'), false);
    assert.equal(Object.hasOwn(pkg, 'taskAuthorizationId'), false);
    const record = join(f.root, 'evidence', 'WI-1', 'ordinary-audit.json');
    const audited = run('diff-audit', ['--work-item', f.workPath, '--baseline', f.head, '--baseline-hash', hash, '--action-level', 'A1', '--action-type', 'threejs-spec-candidate', '--artifact', 'docs/spec.md', '--record', record], f.repo);
    assert.equal(audited.status, 0, audited.stderr);
    const audit = JSON.parse(audited.stdout);
    assert.equal(Object.hasOwn(audit, 'authorizationId'), false);
    assert.equal(audit.workItemId, 'WI-1');
    assert.equal(audit.authorizationBasis, 'TASK_SCOPE');
    const evidencePath = join(f.root, 'evidence', 'WI-1', 'ordinary-evidence.json');
    writeJson(evidencePath, makeEvidence(f, audit));
    assert.equal(run('advance', ['--work-item', f.workPath], f.repo).status, 0);
    assert.equal(run('advance', ['--work-item', f.workPath, '--evidence', evidencePath], f.repo).status, 0);
    assert.equal(run('advance', ['--work-item', f.workPath, '--evidence', evidencePath], f.repo).status, 0);
    assert.equal(JSON.parse(readFileSync(f.workPath, 'utf8')).globalState, 'COMPLETE');
  });

  test('A4：普通本地集成直接按 Work Item 范围通过，声明 destructive 仍需精确批准', () => {
    const ordinary = setup({ globalState: 'INTEGRATING', pendingApprovalActionLevel: 'A4', pendingApprovalActionType: 'threejs-integration', pendingApprovalState: 'INTEGRATING', pendingApprovalContext: 'local-integration', pendingApprovalFileScope: ['src/main.js'], pendingApprovalImpactSummary: [] });
    const ordinaryResult = run('preflight', ['--work-item', ordinary.workPath, '--implementation-package', ordinary.packagePath, '--action-level', 'A4', '--action-type', 'threejs-integration', '--path', 'src/main.js'], ordinary.repo);
    assert.equal(ordinaryResult.status, 0, ordinaryResult.stderr);
    assert.equal(JSON.parse(ordinaryResult.stdout).authorizationBasis, 'TASK_SCOPE');
    assert.equal(JSON.parse(ordinaryResult.stdout).explicitApprovalRequired, false);

    const destructive = setup({ globalState: 'INTEGRATING', pendingApprovalActionLevel: 'A4', pendingApprovalActionType: 'threejs-integration', pendingApprovalState: 'INTEGRATING', pendingApprovalContext: 'destructive-integration', pendingApprovalFileScope: ['src/main.js'], pendingApprovalImpactSummary: ['删除旧实现'], pendingApprovalDestructive: true });
    rejects(run('preflight', ['--work-item', destructive.workPath, '--ledger', destructive.ledgerPath, '--implementation-package', destructive.packagePath, '--action-level', 'A4', '--action-type', 'threejs-integration', '--path', 'src/main.js', '--destructive'], destructive.repo), /没有唯一|审批/);
    assert.deepEqual(JSON.parse(readFileSync(destructive.ledgerPath, 'utf8')).approvals, []);
  });

  test('高风险审批：账本可在确认时按需创建', () => {
    const f = setup({ globalState: 'PASSED' });
    rmSync(f.ledgerPath);
    const args = ['--work-item', f.workPath, '--ledger', f.ledgerPath, '--pending-id', 'PENDING-ON-DEMAND', '--object', 'replace entry', '--stage', 'G1', '--action-type', 'threejs-integration', '--action-level', 'A4', '--gate', 'F4', '--context', 'destructive integration', '--path', 'src', '--impact', '破坏性替换集成入口', '--destructive'];
    const prepared = run('prepare-approval', args, f.repo);
    assert.equal(prepared.status, 0, prepared.stderr);
    assert.equal(existsSync(f.ledgerPath), false);
    assert.equal(run('handoff', ['--work-item', f.workPath], f.repo).status, 0);
    const approved = run('approve', ['--work-item', f.workPath, '--ledger', f.ledgerPath, '--approval-id', 'AP-ON-DEMAND', '--user-text', '批准'], f.repo);
    assert.equal(approved.status, 0, approved.stderr);
    assert.equal(JSON.parse(readFileSync(f.ledgerPath, 'utf8')).approvals[0].approvalId, 'AP-ON-DEMAND');
  });

  test('说明性范围字段缺失时默认空数组，关键 Work Item 字段仍拒绝', () => {
    const f = setup();
    const work = JSON.parse(readFileSync(f.workPath, 'utf8'));
    delete work.outOfScope;
    writeJson(f.workPath, work);
    const pkg = JSON.parse(readFileSync(f.packagePath, 'utf8'));
    delete pkg.outOfScope;
    delete pkg.stopConditions;
    writeJson(f.packagePath, pkg);
    const args = ['--work-item', f.workPath, '--implementation-package', f.packagePath, '--action-level', 'A3', '--action-type', 'threejs-code-change', '--path', 'src/main.js'];
    assert.equal(run('preflight', args, f.repo).status, 0);

    delete work.objective;
    writeJson(f.workPath, work);
    rejects(run('status', ['--work-item', f.workPath], f.repo), /缺少字段.*objective/);
  });

  test('A4：普通可恢复删除无需批准，命中禁止路径仍拒绝', () => {
    const deletionPackage = makePackage({ expectedDeletedFiles: ['src/old.js'] });
    deletionPackage.fileOwnership['src/old.js'] = 'implementer';
    deletionPackage.executionUnits.find((unit) => unit.unitId === 'SHARED-1').ownedPaths.push('src/old.js');
    const f = setup({ globalState: 'INTEGRATING', pendingApprovalActionLevel: 'A4', pendingApprovalActionType: 'threejs-integration', pendingApprovalState: 'INTEGRATING', pendingApprovalContext: 'local-cleanup', pendingApprovalFileScope: ['src/old.js'], pendingApprovalImpactSummary: [] });
    writeBoundPackage(f, deletionPackage);
    const allowedDelete = run('preflight', ['--work-item', f.workPath, '--implementation-package', f.packagePath, '--action-level', 'A4', '--action-type', 'threejs-integration', '--path', 'src/old.js', '--delete'], f.repo);
    assert.equal(allowedDelete.status, 0, allowedDelete.stderr);
    assert.equal(JSON.parse(allowedDelete.stdout).explicitApprovalRequired, false);
    const work = JSON.parse(readFileSync(f.workPath, 'utf8'));
    work.pendingApprovalFileScope = ['src/secret']; writeJson(f.workPath, work);
    rejects(run('preflight', ['--work-item', f.workPath, '--implementation-package', f.packagePath, '--action-level', 'A4', '--action-type', 'threejs-integration', '--path', 'src/secret', '--delete'], f.repo), /forbiddenPaths/);
  });

  test('委派门：Work Item 范围直接绑定，未登记代理仍拒绝', () => {
    const f = setup({ delegatedAgents: ['implementer'] });
    // 选择初始已激活的 SHARED 单元，令本测试只覆盖 Work Item 绑定和代理登记，不混入前序单元 READY 门。
    const delegation = { workItemId: 'WI-1', stageId: 'G1', owner: 'orchestrator', assignedAgent: 'implementer', executionUnitIds: ['SHARED-1'], parallelGroup: null, ownership: ['src/main.js'], allowedActions: ['threejs-code-change'], forbiddenActions: [], actionLevel: 'A3', allowedPaths: ['src/main.js'], forbiddenPaths: ['.git', 'src/secret'], acceptanceCommands: ['node --test'], completionBoundary: '完成返回', outOfScopeReturn: '越界返回', preserveOthersChanges: true };
    const path = join(f.root, 'delegations', 'worker.json'); writeJson(path, delegation);
    const valid = run('delegate-check', ['--work-item', f.workPath, '--delegation', path, '--implementation-package', f.packagePath], f.repo);
    assert.equal(valid.status, 0, valid.stderr);
    delegation.assignedAgent = 'unregistered'; writeJson(path, delegation);
    rejects(run('delegate-check', ['--work-item', f.workPath, '--delegation', path, '--implementation-package', f.packagePath], f.repo), /未登记/);
  });
}
