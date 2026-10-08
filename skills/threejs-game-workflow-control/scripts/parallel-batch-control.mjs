import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** 并行批次允许的严格字段。 */
const BATCH_FIELDS = ['batchId', 'workItemId', 'packageId', 'baselineHash', 'parallelGroup', 'delegationFiles', 'delegationHashes', 'executionUnitIds', 'assignedAgents', 'createdAt', 'fingerprint'];

/** 稳定序列化批次不可变字段。 */
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

/** 计算委派文件内容哈希，避免批次校验依赖主控制器的内部工具集合。 */
function fileHash(path) {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

/** 计算原子并行批次不可变指纹。 */
export function parallelBatchFingerprint(batch) {
  const immutable = Object.fromEntries(BATCH_FIELDS.filter((field) => field !== 'fingerprint').map((field) => [field, batch[field]]));
  return `sha256:${createHash('sha256').update(stableJson(immutable)).digest('hex')}`;
}

/** 校验批次自身的严格结构、可选当前绑定、排序字段和不可变指纹。 */
function validateBatchEnvelope(batch, batchPath, work, pkg, repo, io, bindCurrent = true) {
  if (!batch || typeof batch !== 'object' || Array.isArray(batch)) throw new Error('Parallel Delegation Batch 必须为对象');
  const missing = BATCH_FIELDS.filter((field) => batch[field] === undefined);
  const extra = Object.keys(batch).filter((field) => !BATCH_FIELDS.includes(field));
  if (missing.length || extra.length) throw new Error(`Parallel Delegation Batch 字段不严格：缺少 ${missing.join('、') || '无'}；多余 ${extra.join('、') || '无'}`);
  if (!batch.batchId || !batch.workItemId || !batch.packageId || !/^(?:sha256:[a-f0-9]{64}|[a-f0-9]{40}(?:[a-f0-9]{24})?)$/.test(batch.baselineHash) || !batch.parallelGroup || Number.isNaN(Date.parse(batch.createdAt))) throw new Error('Parallel Delegation Batch 工作项、实施包、基线、并行组或时间无效');
  if (bindCurrent && (batch.workItemId !== work.workItemId || batch.packageId !== pkg.packageId || batch.baselineHash !== work.baselineHash)) throw new Error('Parallel Delegation Batch 未绑定当前工作项、实施包或基线');
  for (const field of ['delegationFiles', 'executionUnitIds', 'assignedAgents']) {
    const values = batch[field];
    if (!Array.isArray(values) || values.length < 2 || new Set(values).size !== values.length || values.some((value) => typeof value !== 'string' || !value) || JSON.stringify(values) !== JSON.stringify([...values].sort())) throw new Error(`Parallel Delegation Batch.${field} 必须为至少两个已排序唯一字符串`);
  }
  for (const path of batch.delegationFiles) {
    const normalized = io.normalizeRepoPath(repo, io.resolve(repo, path));
    if (!normalized.startsWith('.workflow-control/delegations/') || normalized.startsWith('.workflow-control/delegations/batches/')) throw new Error(`并行委派文件路径无效：${path}`);
  }
  if (!batch.delegationHashes || typeof batch.delegationHashes !== 'object' || Array.isArray(batch.delegationHashes)) throw new Error('Parallel Delegation Batch.delegationHashes 必须为对象');
  if (JSON.stringify(Object.keys(batch.delegationHashes).sort()) !== JSON.stringify(batch.delegationFiles)) throw new Error('Parallel Delegation Batch.delegationHashes 必须精确覆盖 delegationFiles');
  if (Object.values(batch.delegationHashes).some((hash) => !/^sha256:[a-f0-9]{64}$/.test(hash))) throw new Error('Parallel Delegation Batch.delegationHashes 含无效 SHA-256');
  if (batch.fingerprint !== parallelBatchFingerprint(batch)) throw new Error('Parallel Delegation Batch 不可变指纹不匹配');
  const relativeBatch = io.normalizeRepoPath(repo, batchPath);
  if (!relativeBatch.startsWith('.workflow-control/delegations/batches/')) throw new Error('Parallel Delegation Batch 必须保存在 .workflow-control/delegations/batches/');
}

/** 校验原子并行委派批次及其全部委派。 */
export function validateParallelBatch(batch, batchPath, work, pkg, repo, io) {
  if (work.globalState !== 'IMPLEMENTING') throw new Error('A3 parallel-check 仅允许 IMPLEMENTING 状态');
  validateBatchEnvelope(batch, batchPath, work, pkg, repo, io);
  const batchesRoot = '.workflow-control/delegations/batches';

  // 委派路径和内容哈希必须先锁定，批次生成后任何委派变化都会使整个原子批次失效。
  const delegations = batch.delegationFiles.map((path) => {
    const normalized = io.normalizeRepoPath(repo, io.resolve(repo, path));
    const target = io.resolve(repo, normalized);
    if (!io.existsSync(target) || batch.delegationHashes[path] !== fileHash(target)) throw new Error(`并行委派文件哈希不匹配：${path}`);
    return io.validateDelegation(io.readJson(target, 'Delegation Package'));
  });
  const derivedUnits = [...new Set(delegations.flatMap((delegation) => delegation.executionUnitIds ?? []))].sort();
  const derivedAgents = [...new Set(delegations.map((delegation) => delegation.assignedAgent))].sort();
  if (JSON.stringify(derivedUnits) !== JSON.stringify(batch.executionUnitIds) || JSON.stringify(derivedAgents) !== JSON.stringify(batch.assignedAgents)) throw new Error('并行批次 executionUnitIds/assignedAgents 与委派内容不一致');
  const agents = new Set(); const assignedUnits = new Set();
  const readyUnits = [];
  for (const delegation of delegations) {
    io.validateDelegationForWork(delegation, work, repo);
    if (delegation.actionLevel !== 'A3' || delegation.parallelGroup !== batch.parallelGroup) throw new Error('并行批次委派必须全部为同一非空组的 A3');
    const binding = io.validateDelegationBinding(delegation, pkg);
    for (const unit of binding.units) {
      if (assignedUnits.has(unit.unitId)) throw new Error(`并行批次重复分配 execution unit：${unit.unitId}`);
      assignedUnits.add(unit.unitId);
      readyUnits.push(unit);
    }
    if (agents.has(delegation.assignedAgent)) throw new Error(`并行批次代理身份重复：${delegation.assignedAgent}`);
    agents.add(delegation.assignedAgent);
  }
  const groupUnits = pkg.executionUnits.filter((unit) => unit.parallelGroup === batch.parallelGroup).map((unit) => unit.unitId).sort();
  if (groupUnits.length < 2 || JSON.stringify(groupUnits) !== JSON.stringify([...assignedUnits].sort())) throw new Error('并行批次遗漏或额外分配并行组 execution unit');

  const root = io.resolve(repo, batchesRoot);
  for (const name of io.existsSync(root) ? io.readdirSync(root).filter((item) => item.endsWith('.json')) : []) {
    const historyPath = io.resolve(root, name);
    if (io.resolve(historyPath) === io.resolve(batchPath)) continue;
    let history;
    try { history = JSON.parse(io.readFileSync(historyPath, 'utf8')); } catch { continue; }
    try { validateBatchEnvelope(history, historyPath, work, pkg, repo, io, false); } catch (error) { throw new Error(`历史并行批次损坏：${name}：${error.message}`); }
    if (history.packageId !== pkg.packageId || history.baselineHash !== work.baselineHash) continue;
    const duplicated = history.executionUnitIds.filter((unitId) => assignedUnits.has(unitId));
    if (duplicated.length) throw new Error(`execution unit 已存在历史并行批次分配：${duplicated.join('、')}`);
  }
  // 结构、内容哈希和历史不可变性全部通过后才检查当前顺序状态，避免任何结构错误被状态门遮蔽；成功路径仍绝不绕过状态硬门。
  for (const unit of readyUnits) io.assertUnitReady(unit, work, pkg, repo);
  return { batchId: batch.batchId, parallelGroup: batch.parallelGroup, executionUnitIds: [...assignedUnits].sort() };
}
