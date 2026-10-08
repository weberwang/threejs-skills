import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { canonicalPageSketchContent } from '../../threejs-game-ui-layout/scripts/page-sketch-contract.mjs';

/** 为控制面回归生成真实文件身份，避免用固定摘要代替草图来源链。 */
function hashBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/** 写入阶段工件并返回精确文件引用。 */
function writeArtifact(repo, file, value) {
  const path = resolve(repo, file);
  mkdirSync(dirname(path), { recursive: true });
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(path, bytes);
  return { path: file, sha256: hashBytes(bytes) };
}

/**
 * 在已有 V2 场景夹具上追加 V3 资源、V4 确认草图和 V5 运行回执。
 * 直接更新 work/pkg，正式包换写时也能复用同一草图引用，不绕过生产校验器。
 */
export function bindConfirmedSketchFixture({ repo, work, pkg }) {
  const v2File = work.visualStageEvidenceRefs.V2.path;
  const plan = JSON.parse(readFileSync(resolve(repo, v2File), 'utf8'));
  const targetSha = hashBytes(readFileSync(resolve(repo, plan.sceneMaster.file)));
  const sceneId = plan.sceneId;
  const candidateVersion = 'candidate-test';
  const node = { layout_node_id: 'test-image-node', parent_layout_node_id: 'viewport', region_id: 'test-image-region', target_bounds: { x: 10, y: 20, width: 1, height: 1 } };
  const nodesRef = writeArtifact(repo, 'docs/page-sketch-nodes.json', { schema: 'threejs-layout-nodes/1.0', target_sha256: targetSha, scene_id: sceneId, state_id: 'default', viewport: { width: 390, height: 844 }, layout_nodes: [node] });
  const contract = { target_conditions: { target_sha256: targetSha, scene_id: sceneId, state_id: 'default', viewport: { width: 390, height: 844 } }, layout_decomposition: { layout_nodes: [node], layout_annotation: { layout_nodes_file: nodesRef.path, layout_nodes_sha256: nodesRef.sha256 } } };
  const contractRef = writeArtifact(repo, plan.sceneReconstructionContract.file, contract);
  plan.sceneReconstructionContract.sha256 = contractRef.sha256;
  plan.targetSha256 = targetSha;
  plan.visualDecompositionConfirmation.targetSha256 = targetSha;
  const v2Ref = writeArtifact(repo, v2File, plan);
  const assetFile = 'docs/page-sketch-asset.png';
  // 一像素 PNG 是资源文件身份夹具；布局和浏览器解码由 UI 的专项测试覆盖。
  const assetBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII=', 'base64');
  writeFileSync(resolve(repo, assetFile), assetBytes);
  const assetSha = hashBytes(assetBytes);
  const candidate = { sha256: plan.candidateSha256, diff_fingerprint: plan.diffFingerprint };
  const manifest = {
    schema_version: '1.5', workItemId: work.workItemId, candidateVersion,
    reference_target: { original_file: plan.sceneMaster.file, target_sha256: targetSha, scene_ids: [sceneId], state_ids: ['default'] }, candidate_identity: candidate,
    assets: [{ id: 'test-image', status: 'accepted', scene_id: sceneId, sha256: assetSha, runtime_outputs: [assetFile], coverage_region_ids: ['test-image-region'] }],
    coverage_audit: { canvases: [{ scene_id: sceneId, state_id: 'default', width: 390, height: 844 }], regions: [{ id: 'test-image-region', scene_id: sceneId, state_id: 'default', owner_type: 'fixed-production-visual', layout_node_ids: [node.layout_node_id], expected_assets: [{ asset_id: 'test-image', component_id: 'test-component', state_id: 'default', runtime_file: assetFile }], component_inventory: { components: [{ component_id: 'test-component', state_coverage: [{ state_id: 'default', requirement: 'required' }], placements: [{ placement_id: 'test-placement', layout_node_id: node.layout_node_id }] }] } }] },
  };
  const manifestRef = writeArtifact(repo, 'docs/page-sketch-manifest.json', manifest);
  const common = { workItemId: work.workItemId, baselineHash: work.baselineHash, contentHash: candidate.sha256, diffFingerprint: candidate.diff_fingerprint, status: 'PASS', candidateIdentity: { sha256: candidate.sha256, diffFingerprint: candidate.diff_fingerprint }, files: [assetFile], fileHashes: { [assetFile]: assetSha } };
  const v3Ref = writeArtifact(repo, 'docs/v3-acceptance.json', { ...common, evidenceType: 'v3-formal-acceptance', acceptanceId: 'V3-TEST', targetSha256: targetSha, candidateVersion, visualManifestFile: manifestRef.path, visualManifestSha256: manifestRef.sha256, formalAssets: [{ id: 'test-image', status: 'accepted' }], components: [{ id: 'test-component', status: 'accepted' }] });
  const sketch = {
    schema: 'threejs-page-sketch/1.0', target_sha256: targetSha, scene_id: sceneId, state_id: 'default', work_item_id: work.workItemId, candidate_version: candidateVersion, viewport: { width: 390, height: 844 }, reference_file: plan.sceneMaster.file,
    v2_nodes_file: nodesRef.path, v2_nodes_sha256: nodesRef.sha256, v3_manifest_file: manifestRef.path, v3_manifest_sha256: manifestRef.sha256, v3_evidence_file: v3Ref.path, v3_evidence_sha256: v3Ref.sha256,
    v3_assets: [{ asset_id: 'test-image', file: assetFile, sha256: assetSha, layout_node_id: node.layout_node_id }], nodes: [node], node_presentations: { [node.layout_node_id]: { kind: 'image', asset_ids: ['test-image'], object_fit: 'fill' } },
    layout: { schema: 'threejs-visual-layout/1.0', target_sha256: targetSha, scene_id: sceneId, state_id: 'default', offsets: {} }, confirmation: null,
  };
  sketch.confirmation = { status: 'accepted', confirmed_at: '2026-10-01T00:00:00.000Z', content_sha256: hashBytes(canonicalPageSketchContent(sketch)) };
  const v4Ref = writeArtifact(repo, 'docs/page-sketch.json', sketch);
  const v5Ref = writeArtifact(repo, 'docs/v5-runtime-candidate.json', { ...common, evidenceType: 'v5-runtime-integration-candidate', candidateId: 'V5-TEST', pageSketchSha256: v4Ref.sha256 });
  work.visualStageEvidenceRefs = { V2: v2Ref, V3: v3Ref, V4: v4Ref, V5: v5Ref };
  // 基础工程工作项没有视觉草图依赖，不给基础包增加正式视觉字段。
  if (work.visualStage === 'V5') pkg.pageSketchFile = v4Ref.path;
  if (work.visualStage === 'V5') pkg.pageSketchSha256 = v4Ref.sha256;
  for (const unit of pkg.executionUnits ?? []) {
    if (unit.highFidelityPrerequisite) {
      unit.highFidelityPrerequisite.targetSha256 = targetSha;
      unit.highFidelityPrerequisite.evidenceSha256 = v2Ref.sha256;
    }
  }
  return { targetSha, plan, contract, sketch, manifest, refs: work.visualStageEvidenceRefs };
}

/** 将替换实施包重新绑定当前夹具的 V2 方案与 V4 草图，不重写已确认文件。 */
export function bindPackageToSketchFixture({ repo, work, pkg }) {
  const plan = JSON.parse(readFileSync(resolve(repo, work.visualStageEvidenceRefs.V2.path), 'utf8'));
  if (work.visualStage === 'V5') pkg.pageSketchFile = work.visualStageEvidenceRefs.V4.path;
  if (work.visualStage === 'V5') pkg.pageSketchSha256 = work.visualStageEvidenceRefs.V4.sha256;
  for (const unit of pkg.executionUnits ?? []) {
    if (unit.highFidelityPrerequisite) {
      Object.assign(unit.highFidelityPrerequisite, { targetSha256: plan.targetSha256, candidateSha256: plan.candidateSha256, diffFingerprint: plan.diffFingerprint, evidenceSha256: work.visualStageEvidenceRefs.V2.sha256 });
    }
  }
}
