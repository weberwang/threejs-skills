import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { canonicalPageSketchContent, validatePageSketchDocument } from '../../threejs-game-ui-layout/scripts/page-sketch-contract.mjs';
import { validatePageSketchResourceBindings } from '../../threejs-game-ui-layout/scripts/page-sketch-resource-bindings.mjs';

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const V2_PLAN_SCHEMA = 'threejs-scene-v2-reconstruction-plan/1.0';

/** 判断值是否为普通 JSON 对象。 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 以对象键排序且数组保序的方式序列化，供 V2 节点源快照比较。 */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

/** 校验路径既不穿越项目根目录，也不会经符号链接逃逸。 */
function readProjectFile(projectRoot, file, label) {
  if (typeof file !== 'string' || !file.trim() || isAbsolute(file) || file.includes('\0')) throw new Error(`${label} 必须是项目内相对路径`);
  const root = realpathSync(resolve(projectRoot));
  const candidate = resolve(root, file);
  const lexical = relative(root, candidate);
  if (!lexical || lexical === '..' || lexical.startsWith(`..${sep}`) || isAbsolute(lexical)) throw new Error(`${label} 越出项目根目录：${file}`);
  const actual = realpathSync(candidate);
  const realRelative = relative(root, actual);
  if (!realRelative || realRelative === '..' || realRelative.startsWith(`..${sep}`) || isAbsolute(realRelative)) throw new Error(`${label} 通过符号链接越出项目根目录：${file}`);
  if (!statSync(actual).isFile()) throw new Error(`${label} 必须是普通文件：${file}`);
  const bytes = readFileSync(actual);
  return { file, bytes, path: actual, sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}` };
}

/** 读取并核验阶段不可变引用的当前文件字节与 JSON 内容。 */
function readJsonReference(reference, projectRoot, label) {
  if (!isRecord(reference) || !SHA256.test(reference.sha256 ?? '')) throw new Error(`${label} 缺少不可变 path/SHA-256 引用`);
  const result = readProjectFile(projectRoot, reference.path, `${label}.path`);
  if (result.sha256 !== reference.sha256) throw new Error(`${label} 文件 SHA-256 已漂移：${reference.path}`);
  let value;
  try { value = JSON.parse(result.bytes.toString('utf8')); } catch (error) { throw new Error(`${label} 不是有效 JSON：${error.message}`); }
  if (!isRecord(value)) throw new Error(`${label} 必须是 JSON 对象`);
  return { ...result, value };
}

/** 取得唯一 V2 布局节点引用，确保草图引用当前 V2 冻结节点源。 */
function v2NodeBinding(work, plan, projectRoot) {
  const contractRef = plan.sceneReconstructionContract;
  if (!isRecord(contractRef) || typeof contractRef.file !== 'string' || !SHA256.test(contractRef.sha256 ?? '')) throw new Error('当前 V2 方案缺少 sceneReconstructionContract 文件与 SHA-256');
  const contractFile = readProjectFile(projectRoot, contractRef.file, 'V2 sceneReconstructionContract.file');
  if (contractFile.sha256 !== contractRef.sha256) throw new Error('当前 V2 sceneReconstructionContract 文件 SHA-256 已漂移');
  let contract;
  try { contract = JSON.parse(contractFile.bytes.toString('utf8')); } catch (error) { throw new Error(`当前 V2 sceneReconstructionContract 不是有效 JSON：${error.message}`); }
  const annotation = contract?.layout_decomposition?.layout_annotation;
  if (!isRecord(annotation) || typeof annotation.layout_nodes_file !== 'string' || !SHA256.test(annotation.layout_nodes_sha256 ?? '')) throw new Error('当前 V2 sceneReconstructionContract 缺少冻结 layout_nodes 文件绑定');
  const workContract = work.sceneReconstructionContract;
  const workAnnotation = workContract?.layout_decomposition?.layout_annotation;
  if (workContract && (workAnnotation?.layout_nodes_file !== annotation.layout_nodes_file
    || workAnnotation?.layout_nodes_sha256 !== annotation.layout_nodes_sha256)) {
    throw new Error('Work Item 的 V2 layout_nodes 绑定与当前 V2 证据不一致');
  }
  const nodesFile = readProjectFile(projectRoot, annotation.layout_nodes_file, 'V2 layout_nodes_file');
  if (nodesFile.sha256 !== annotation.layout_nodes_sha256) throw new Error('当前 V2 layout_nodes 文件 SHA-256 已漂移');
  let nodesDocument;
  try { nodesDocument = JSON.parse(nodesFile.bytes.toString('utf8')); } catch (error) { throw new Error(`当前 V2 layout_nodes 文件不是有效 JSON：${error.message}`); }
  const nodes = nodesDocument?.layout_nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) throw new Error('当前 V2 layout_nodes 文件缺少非空 layout_nodes');
  return { path: annotation.layout_nodes_file, sha256: nodesFile.sha256, nodes, contract };
}

/** 校验草图资源只展示当前页面 accepted 图片，并复核运行时模块文件的真实 SHA。 */
function validateV3AssetBindings(document, manifest, projectRoot) {
  const mappings = validatePageSketchResourceBindings({
    nodes: document.nodes,
    sceneId: document.scene_id,
    stateId: document.state_id,
    assets: manifest.assets,
    regions: manifest.coverage_audit?.regions,
    mappings: document.v3_assets,
    nodePresentations: document.node_presentations,
  });
  const assetsById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  for (const entry of mappings) {
    const asset = assetsById.get(entry.asset_id);
    const file = readProjectFile(projectRoot, entry.file, `V3 asset ${entry.asset_id}.file`);
    if (file.sha256 !== entry.sha256 || asset.sha256 !== entry.sha256) throw new Error(`草图资源 ${entry.asset_id} 的文件 SHA 与 V3 清单不一致`);
  }
  for (const [nodeId, presentation] of Object.entries(document.node_presentations ?? {})) {
    if (presentation?.kind === 'runtime-program') {
      const module = readProjectFile(projectRoot, presentation.module_file, `node_presentations.${nodeId}.module_file`);
      if (module.sha256 !== presentation.module_sha256) throw new Error(`节点 ${nodeId} runtime-program module SHA-256 已漂移`);
    }
  }
}

/** 校验 V4 已确认草图及其 V2/V3 文件、内容和身份来源链。 */
export function loadConfirmedPageSketch(work, projectRoot) {
  const references = work?.visualStageEvidenceRefs;
  const v2 = readJsonReference(references?.V2, projectRoot, 'V2 production plan');
  const v3 = readJsonReference(references?.V3, projectRoot, 'V3 formal acceptance');
  const sketch = readJsonReference(references?.V4, projectRoot, 'V4 page sketch');
  const { value: document } = sketch;
  if (v2.value.workItemId !== work.workItemId || v3.value.workItemId !== work.workItemId) throw new Error('V2/V3 来源证据必须绑定当前 Work Item');
  if (v3.value.baselineHash !== work.baselineHash || (v2.value.baselineHash !== undefined && v2.value.baselineHash !== work.baselineHash)) throw new Error('V2/V3 来源证据必须绑定当前 Work Item 冻结基线');
  if (v2.value.schemaVersion !== V2_PLAN_SCHEMA || v2.value.stage !== 'V2' || v2.value.status !== 'COMPLETE' || v2.value.frozen !== true) throw new Error('V2 来源必须是当前冻结 COMPLETE 拆解方案');
  if (v3.value.evidenceType !== 'v3-formal-acceptance' || v3.value.status !== 'PASS'
    || !isRecord(v3.value.candidateIdentity) || !SHA256.test(v3.value.candidateIdentity.sha256 ?? '')
    || !SHA256.test(v3.value.contentHash ?? '') || v3.value.candidateIdentity.sha256 !== v3.value.contentHash
    || !v3.value.diffFingerprint || v3.value.candidateIdentity.diffFingerprint !== v3.value.diffFingerprint) throw new Error('V3 来源必须是绑定当前候选身份的正式资源 PASS 验收');
  const formalAssets = v3.value.formalAssets;
  const components = v3.value.components;
  if (!Array.isArray(formalAssets) || formalAssets.length === 0 || !Array.isArray(components) || components.length === 0) throw new Error('V3 PASS 来源必须包含非空正式资源与组件状态');
  const acceptedStates = new Set(['accepted', 'pass', 'passed', 'complete', 'completed', 'valid']);
  if (formalAssets.some((asset) => !isRecord(asset) || !acceptedStates.has(String(asset.status).toLowerCase()))) throw new Error('V3 正式资源状态必须全部 accepted');
  if (components.some((component) => !isRecord(component) || !acceptedStates.has(String(component.status).toLowerCase()))) throw new Error('V3 组件状态必须全部 accepted');
  const v2Nodes = v2NodeBinding(work, v2.value, projectRoot);
  const targetConditions = v2Nodes.contract.target_conditions;
  const expectedIdentity = {
    target_sha256: v2.value.targetSha256,
    scene_id: targetConditions?.scene_id,
    state_id: targetConditions?.state_id,
    work_item_id: work.workItemId,
    candidate_version: v3.value.candidateVersion,
  };
  validatePageSketchDocument(document, { expectedIdentity });
  if (document.target_sha256 !== v3.value.targetSha256 || document.candidate_version !== v3.value.candidateVersion) throw new Error('草图 target/candidateVersion 与 V3 正式资源验收身份不一致');
  const contentSha = `sha256:${createHash('sha256').update(canonicalPageSketchContent(document), 'utf8').digest('hex')}`;
  if (document.confirmation?.status !== 'accepted' || !Number.isFinite(Date.parse(document.confirmation.confirmed_at)) || contentSha !== document.confirmation.content_sha256) throw new Error('V4 草图缺少有效人工确认，或确认内容摘要已漂移');

  const workTarget = work.sceneReconstructionContract?.target_conditions;
  if (work.sceneReconstructionContract && (workTarget?.target_sha256 !== expectedIdentity.target_sha256
    || workTarget?.scene_id !== expectedIdentity.scene_id
    || workTarget?.state_id !== expectedIdentity.state_id)) throw new Error('Work Item 显式 V2 场景目标身份与当前 V2 冻结证据不一致');
  if (document.v2_nodes_file !== v2Nodes.path || document.v2_nodes_sha256 !== v2Nodes.sha256 || canonicalJson(document.nodes) !== canonicalJson(v2Nodes.nodes)) throw new Error('V4 草图 nodes 必须与当前 V2 冻结 layout_nodes 文件逐字节绑定且内容一致');
  if (document.v3_evidence_file !== v3.file || document.v3_evidence_sha256 !== v3.sha256) throw new Error('V4 草图未绑定当前 V3 正式资源验收文件 SHA');
  const manifestFile = v3.value.visualManifestFile;
  const manifestSha = v3.value.visualManifestSha256;
  if (document.v3_manifest_file !== manifestFile || document.v3_manifest_sha256 !== manifestSha || !SHA256.test(manifestSha ?? '')) throw new Error('V4 草图未绑定 V3 PASS 证据中的当前 visual manifest 文件/SHA');
  const manifestLoaded = readProjectFile(projectRoot, manifestFile, 'V3 visualManifestFile');
  if (manifestLoaded.sha256 !== manifestSha) throw new Error('V3 visual manifest 文件 SHA-256 已漂移');
  let manifest;
  try { manifest = JSON.parse(manifestLoaded.bytes.toString('utf8')); } catch (error) { throw new Error(`V3 visual manifest 不是有效 JSON：${error.message}`); }
  if (!isRecord(manifest) || manifest.schema_version !== '1.5' || manifest.workItemId !== work.workItemId || manifest.candidateVersion !== document.candidate_version || manifest.reference_target?.target_sha256 !== document.target_sha256 || manifest.candidate_identity?.sha256 !== v3.value.candidateIdentity.sha256 || manifest.candidate_identity?.diff_fingerprint !== v3.value.candidateIdentity.diffFingerprint) throw new Error('V3 visual manifest 未绑定当前 Work Item、候选版本、目标或正式资源候选身份');
  const refFile = v2.value.sceneMaster?.file;
  const normalizedReference = document.reference_file.replaceAll('\\', '/');
  if (normalizedReference !== refFile?.replaceAll('\\', '/') || normalizedReference !== manifest.reference_target?.original_file?.replaceAll('\\', '/')) throw new Error('草图 reference_file 必须绑定 V2 冻结底图与 V3 manifest 目标图');
  const nodesRef = targetConditions?.viewport;
  if (!isRecord(nodesRef) || document.viewport.width !== nodesRef.width || document.viewport.height !== nodesRef.height) throw new Error('草图 viewport 必须与 V2 冻结目标视口一致');
  const referenceImage = readProjectFile(projectRoot, document.reference_file, 'V2 reference_file');
  if (referenceImage.sha256 !== document.target_sha256 || referenceImage.sha256 !== manifest.reference_target.target_sha256) throw new Error('V2/V3 冻结参考图的当前字节 SHA 与 target_sha256 不一致');
  validateV3AssetBindings(document, manifest, projectRoot);
  return { document, reference: references.V4, sha256: sketch.sha256, v2, v3, manifest };
}

/** 要求当前 Work Item 持有可复核的 accepted V4 页面草图。 */
export function assertConfirmedPageSketch(work, projectRoot) {
  if (!projectRoot) throw new Error('V4 页面草图门缺少项目根目录');
  try { return loadConfirmedPageSketch(work, projectRoot); }
  catch (error) { throw new Error(`V4 页面草图确认门拒绝：${error.message}`); }
}
