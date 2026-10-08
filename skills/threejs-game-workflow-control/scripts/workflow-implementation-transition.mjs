import { resolve } from 'node:path';
import { prepareImplementationPackageActivation } from './scene-stage-transition.mjs';

/** 准备 IMPLEMENTING 阶段的包切换，并返回是否已创建新的 V5 执行序列。 */
export function prepareImplementationTransition({ work, args, repo, validationContext, stageTransitionPlan, stageIo, unitIo, validateWorkItem, isVisualProductionWork, initializeExecutionState, normalizeRepoPath }) {
  if (!['A2', 'A3'].includes(work.pendingApprovalActionLevel)) throw new Error('进入 IMPLEMENTING 仅允许 A2/A3');
  const visualStage = String(work.visualStage ?? '').toUpperCase();
  if (isVisualProductionWork(work) && visualStage === 'V3' && work.pendingApprovalActionLevel === 'A2') throw new Error('V3 正式资源验收后应先进入 V4 页面草图确认，再推进 V5 正式实现');
  if (work.pendingApprovalActionLevel !== 'A3') {
    if (stageTransitionPlan?.formalEntry) throw new Error('V4 草图确认后进入 V5 必须通过 A3 激活正式场景实施包');
    return { work, packageActivated: false };
  }

  const packagePath = args['implementation-package'] ?? work.implementationPackageRecord;
  if (!packagePath) throw new Error('进入 IMPLEMENTING 缺少 Implementation Package');
  const pkg = validationContext.validateImplementationPackage(validationContext.readJson(packagePath, 'Implementation Package'), work);
  const formalVisualPackage = pkg.executionUnits.some((unit) => ['SCENE', 'DISPLAY_LAYER'].includes(unit.unitType));
  if (stageTransitionPlan?.formalEntry && !formalVisualPackage) throw new Error('V5 正式阶段必须激活包含 SCENE 或 DISPLAY_LAYER 的实施包');

  const packageChanged = work.implementationPackageRecord && resolve(repo, packagePath) !== resolve(repo, work.implementationPackageRecord);
  const activateV5 = Boolean(stageTransitionPlan?.formalEntry && formalVisualPackage);
  if (stageTransitionPlan?.reuseExecutionState && !activateV5) return { work, packageActivated: false };

  const packageSwitch = formalVisualPackage && (activateV5 || packageChanged)
    ? prepareImplementationPackageActivation({
      work: activateV5 ? stageTransitionPlan.previousWork : work,
      pkg,
      packagePath,
      repo,
      validationContext,
      unitIo,
      validateWorkItem,
    })
    : { nextWork: work, package: pkg, previousWork: null, previousPackage: null, replaceExisting: false };
  // 正式激活校验沿用 V4 原工作项；V5 阶段副本提供审批与 stageId，包激活提供新的 batch 身份。
  const nextWork = activateV5
    ? { ...packageSwitch.nextWork, ...stageTransitionPlan.nextWork, validationBatchId: packageSwitch.nextWork.validationBatchId }
    : packageSwitch.nextWork;
  if (activateV5) {
    // 对象展开不会传播被阶段副本删除的键，显式清除旧候选快照与审计引用。
    delete nextWork.pendingVisualPrerequisiteSnapshot;
    delete nextWork.diffAuditRecord;
    delete nextWork.diffAuditLedgerRecord;
  }
  // 切换正式包时旧执行态会归档；重用同阶段包时则由调用方保留当前状态。
  initializeExecutionState(nextWork, packageSwitch.package ?? pkg, repo, stageIo, {
    replaceExisting: Boolean(packageSwitch.replaceExisting),
    previousWork: packageSwitch.previousWork,
    previousPackage: packageSwitch.previousPackage,
  });
  nextWork.implementationPackageRecord = normalizeRepoPath(repo, packagePath);
  validateWorkItem(nextWork);
  return { work: nextWork, packageActivated: activateV5 };
}
