import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { canonicalPageSketchContent } from '../../threejs-game-ui-layout/scripts/page-sketch-contract.mjs';
import { initPageSketch } from '../../threejs-game-ui-layout/scripts/init-page-sketch.mjs';
import { loadConfirmedPageSketch } from './page-sketch-prerequisite.mjs';

const HASH = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

/** 将对象写为 JSON 工件并返回项目相对路径与真实字节 SHA。 */
function writeJson(root, file, value) {
  const path = join(root, file);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return { path: file, sha256: HASH(readFileSync(path)) };
}

/** 生成通过 V2、V3、V4 全部来源绑定的草图文件夹具。 */
function makeFixture({ shared = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'page-sketch-prerequisite-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  mkdirSync(join(root, 'assets'), { recursive: true });
  const targetSha = HASH(Buffer.from('reference pixels'));
  const assetSha = HASH(Buffer.from('hero pixels'));
  const baselineHash = HASH(Buffer.from('baseline'));
  writeFileSync(join(root, 'docs/reference.png'), 'reference pixels');
  writeFileSync(join(root, 'assets/hero.png'), 'hero pixels');
  const nodes = [{ layout_node_id: 'hero', parent_layout_node_id: 'viewport', region_id: 'region-hero', depth: 1, marker: '①', color: '#f00', target_bounds: { x: 12, y: 20, width: 64, height: 96 } }];
  const nodesDoc = { schema: 'threejs-layout-nodes/1.0', target_sha256: targetSha, scene_id: 'play', state_id: 'default', viewport: { width: 390, height: 844 }, layout_nodes: nodes };
  const nodesRef = writeJson(root, 'docs/layout-nodes.json', nodesDoc);
  const contract = {
    target_conditions: { target_sha256: targetSha, scene_id: 'play', state_id: 'default', viewport: { width: 390, height: 844 } },
    // 构建版 layout_nodes 可补充颜色和编号等字段，合同内嵌副本不作完整相等比较。
    layout_decomposition: { layout_nodes: [{ layout_node_id: 'hero', parent_layout_node_id: 'viewport' }], layout_annotation: { layout_nodes_file: nodesRef.path, layout_nodes_sha256: nodesRef.sha256 } },
  };
  const contractRef = writeJson(root, 'docs/v2-contract.json', contract);
  const v2 = writeJson(root, 'docs/v2-plan.json', {
    schemaVersion: 'threejs-scene-v2-reconstruction-plan/1.0', workItemId: 'WI-1', status: 'COMPLETE', stage: 'V2', frozen: true,
    baselineHash, targetSha256: targetSha, sceneId: 'play', sceneMaster: { file: 'docs/reference.png', sha256: targetSha }, sceneReconstructionContract: { file: contractRef.path, sha256: contractRef.sha256 },
  });
  const heroAsset = { id: 'hero-image', status: 'accepted', scene_id: 'play', coverage_region_ids: ['region-hero'], sha256: assetSha, runtime_outputs: ['assets/hero.png'] };
  if (shared) {
    delete heroAsset.scene_id;
    heroAsset.shared = true;
    heroAsset.shared_scene_ids = ['play', 'menu'];
  }
  const manifest = {
    schema_version: '1.5', workItemId: 'WI-1', candidateVersion: 'candidate-1',
    reference_target: { original_file: 'docs/reference.png', target_sha256: targetSha, scene_ids: ['play'], state_ids: ['default'] },
    candidate_identity: { sha256: HASH(Buffer.from('candidate')), diff_fingerprint: HASH(Buffer.from('diff')) },
    coverage_audit: { canvases: [{ scene_id: 'play', state_id: 'default', width: 390, height: 844 }], regions: [{ id: 'region-hero', scene_id: 'play', state_id: 'default', owner_type: 'fixed-production-visual', layout_node_ids: ['hero'], asset_id: 'hero-image', expected_assets: [{ asset_id: 'hero-image', component_id: 'hero-component', state_id: 'default', runtime_file: 'assets/hero.png' }], component_inventory: { components: [{ component_id: 'hero-component', state_coverage: [{ state_id: 'default', requirement: 'required' }], placements: [{ layout_node_id: 'hero' }] }] } }] },
    assets: [heroAsset],
  };
  const manifestRef = writeJson(root, 'docs/v3-manifest.json', manifest);
  const v3 = writeJson(root, 'docs/v3-acceptance.json', {
    evidenceType: 'v3-formal-acceptance', status: 'PASS', acceptanceId: 'ACCEPT-1', workItemId: 'WI-1', baselineHash, targetSha256: targetSha,
    contentHash: manifest.candidate_identity.sha256, diffFingerprint: manifest.candidate_identity.diff_fingerprint,
    formalAssets: [{ asset_id: 'hero-image', status: 'accepted' }], components: [{ component_id: 'hero-component', status: 'accepted' }], candidateVersion: 'candidate-1', candidateIdentity: { sha256: manifest.candidate_identity.sha256, diffFingerprint: manifest.candidate_identity.diff_fingerprint },
    visualManifestFile: manifestRef.path, visualManifestSha256: manifestRef.sha256,
  });
  const document = {
    schema: 'threejs-page-sketch/1.0', target_sha256: targetSha, scene_id: 'play', state_id: 'default', work_item_id: 'WI-1', candidate_version: 'candidate-1',
    viewport: { width: 390, height: 844 }, reference_file: 'docs/reference.png',
    v2_nodes_file: nodesRef.path, v2_nodes_sha256: nodesRef.sha256,
    v3_manifest_file: manifestRef.path, v3_manifest_sha256: manifestRef.sha256,
    v3_evidence_file: v3.path, v3_evidence_sha256: v3.sha256,
    v3_assets: [{ asset_id: 'hero-image', file: 'assets/hero.png', sha256: assetSha, layout_node_id: 'hero' }],
    nodes,
    layout: { schema: 'threejs-visual-layout/1.0', target_sha256: targetSha, scene_id: 'play', state_id: 'default', offsets: { hero: { x: 8, y: -4 } } },
    node_presentations: { hero: { kind: 'image', asset_ids: ['hero-image'], object_fit: 'contain' } },
    confirmation: null,
  };
  document.confirmation = {
    status: 'accepted', confirmed_at: '2026-09-30T08:00:00.000Z',
    content_sha256: HASH(Buffer.from(canonicalPageSketchContent(document), 'utf8')),
  };
  const sketchRef = writeJson(root, 'docs/page-sketch.json', document);
  const work = {
    workItemId: 'WI-1',
    baselineHash,
    sceneReconstructionContract: { target_conditions: contract.target_conditions, layout_decomposition: contract.layout_decomposition },
    visualStageEvidenceRefs: { V2: v2, V3: v3, V4: sketchRef },
  };
  return { root, work, document, nodes, nodesRef, v2, v3, manifestRef, sketchRef };
}

/** 重新写草图后同步更新 V4 引用 SHA，模拟 Work Item 更新但人工确认未重做。 */
function rewriteSketch(fixture, document) {
  fixture.sketchRef = writeJson(fixture.root, 'docs/page-sketch.json', document);
  fixture.work.visualStageEvidenceRefs.V4 = fixture.sketchRef;
}

test('V4 确认门接受 V2 节点、V3 manifest 和正式资源均未漂移的草图', () => {
  const fixture = makeFixture();
  const result = loadConfirmedPageSketch(fixture.work, fixture.root);
  assert.equal(result.sha256, fixture.sketchRef.sha256);
  assert.equal(Object.hasOwn(result.document.confirmation, 'confirmed_by'), false);
});

test('V3 受控 shared 资源可绑定到明确声明的 scene', () => {
  const fixture = makeFixture({ shared: true });
  assert.equal(loadConfirmedPageSketch(fixture.work, fixture.root).document.v3_assets[0].asset_id, 'hero-image');
});

test('草图门以不可变 V2 证据为权威，Work Item 可不内联复制 V2 合同', () => {
  const fixture = makeFixture();
  delete fixture.work.sceneReconstructionContract;
  assert.doesNotThrow(() => loadConfirmedPageSketch(fixture.work, fixture.root));
});

test('V3 证据基线变更后保留旧阶段引用必须拒绝', () => {
  const fixture = makeFixture();
  fixture.work.baselineHash = HASH(Buffer.from('new baseline'));
  assert.throws(() => loadConfirmedPageSketch(fixture.work, fixture.root), /冻结基线/);
});

/** 验证编辑器初始化、人工确认文件和控制面 gate 使用同一份 schema 与 SHA。 */
test('initPageSketch 生成的草图可经人工确认后被控制门读取', async () => {
  const fixture = makeFixture();
  const resources = writeJson(fixture.root, 'docs/resources.json', {
    schema: 'threejs-page-sketch-resources/1.0',
    assets: [{ asset_id: 'hero-image', file: 'assets/hero.png', layout_node_id: 'hero' }],
    node_presentations: { hero: { kind: 'image', asset_ids: ['hero-image'], object_fit: 'contain' } },
  });
  await initPageSketch({
    '--project-root': fixture.root,
    '--nodes': fixture.nodesRef.path,
    '--v3-manifest': fixture.manifestRef.path,
    '--v3-evidence': fixture.v3.path,
    '--resources': resources.path,
    '--output': 'docs/generated-page-sketch.json',
  });
  const generated = JSON.parse(readFileSync(join(fixture.root, 'docs/generated-page-sketch.json'), 'utf8'));
  assert.equal(generated.confirmation, null);
  generated.confirmation = {
    status: 'accepted', confirmed_at: '2026-10-01T00:00:00.000Z',
    content_sha256: HASH(Buffer.from(canonicalPageSketchContent(generated), 'utf8')),
  };
  fixture.work.visualStageEvidenceRefs.V4 = writeJson(fixture.root, 'docs/generated-page-sketch.json', generated);
  const loaded = loadConfirmedPageSketch(fixture.work, fixture.root);
  assert.equal(Object.hasOwn(loaded.document.confirmation, 'confirmed_by'), false);
  assert.equal(loaded.document.v3_assets[0].layout_node_id, 'hero');
});

test('V4 确认门拒绝空确认和保存后未重新确认的内容', () => {
  const fixture = makeFixture();
  const empty = structuredClone(fixture.document);
  empty.confirmation = null;
  rewriteSketch(fixture, empty);
  assert.throws(() => loadConfirmedPageSketch(fixture.work, fixture.root), /confirmation|有效人工确认/);

  const edited = structuredClone(fixture.document);
  edited.layout.offsets.hero.x += 1;
  rewriteSketch(fixture, edited);
  assert.throws(() => loadConfirmedPageSketch(fixture.work, fixture.root), /内容摘要已漂移/);
});

test('V4 确认门拒绝 V2 节点来源漂移和 V3 正式资源文件篡改', () => {
  const fixture = makeFixture();
  const changedNodes = structuredClone(fixture.document);
  changedNodes.nodes[0].target_bounds.x += 2;
  rewriteSketch(fixture, changedNodes);
  assert.throws(() => loadConfirmedPageSketch(fixture.work, fixture.root), /内容摘要已漂移/);

  const assetFixture = makeFixture();
  writeFileSync(join(assetFixture.root, 'assets/hero.png'), 'tampered hero pixels');
  assert.throws(() => loadConfirmedPageSketch(assetFixture.work, assetFixture.root), /SHA|sha/);
});

test('V4 确认门拒绝 V2 或 V3 证据路径穿越和草图候选身份伪造', () => {
  const pathFixture = makeFixture();
  pathFixture.work.visualStageEvidenceRefs.V4.path = '../outside.json';
  assert.throws(() => loadConfirmedPageSketch(pathFixture.work, pathFixture.root), /项目内相对路径|越出项目根目录/);

  const identityFixture = makeFixture();
  const changed = structuredClone(identityFixture.document);
  changed.candidate_version = 'candidate-old';
  rewriteSketch(identityFixture, changed);
  assert.throws(() => loadConfirmedPageSketch(identityFixture.work, identityFixture.root), /candidate_version|V3 正式资源验收身份/);
});
