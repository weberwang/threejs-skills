import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { initPageSketch } from "./init-page-sketch.mjs";

/** 以生产合同相同的前缀格式计算测试文件 SHA。 */
function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/** 写入 JSON 时保留实际文件字节，供V3 manifest SHA回执绑定。 */
async function writeJson(path, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  await writeFile(path, bytes);
  return bytes;
}

/** 准备 V2 节点、V3 PASS、冻结底图和正式资源的最小游戏项目。 */
async function createProject({ includeAsset = true, componentState = "default", structuralParentInRegion = false, inheritComponentStateCoverage = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "page-sketch-init-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, "public"), { recursive: true });
  const referenceBytes = Buffer.from("frozen-reference-image-bytes");
  const assetBytes = Buffer.from("accepted-runtime-image-bytes");
  await writeFile(join(root, "public", "reference.png"), referenceBytes);
  if (includeAsset) await writeFile(join(root, "public", "hero.png"), assetBytes);
  const targetSha = sha256(referenceBytes);
  const assetSha = sha256(assetBytes);
  const candidateSha = `sha256:${"c".repeat(64)}`;
  const nodesDocument = {
    schema: "threejs-layout-nodes/1.0",
    target_sha256: targetSha,
    scene_id: "HudScene",
    state_id: "default",
    viewport: { width: 200, height: 100 },
    layout_nodes: [
      { layout_node_id: "hud.root", parent_layout_node_id: "viewport", ...(structuralParentInRegion ? { region_id: "hero-region" } : {}), target_bounds: { x: 0, y: 0, width: 200, height: 100 } },
      { layout_node_id: "hud.hero", parent_layout_node_id: "hud.root", region_id: "hero-region", target_bounds: { x: 20, y: 10, width: 48, height: 48 } },
      { layout_node_id: "hud.hero-copy", parent_layout_node_id: "hud.root", region_id: "hero-region", target_bounds: { x: 90, y: 10, width: 48, height: 48 } },
    ],
  };
  await writeJson(join(root, "docs", "layout-nodes.json"), nodesDocument);
  const manifest = {
    schema_version: "1.5",
    workItemId: "WI-HUD",
    candidateVersion: "candidate-7",
    candidate_identity: { sha256: candidateSha, diff_fingerprint: "diff-hud-7" },
    reference_target: { original_file: "public/reference.png", target_sha256: targetSha, scene_ids: ["HudScene"], state_ids: ["default"] },
    coverage_audit: {
      canvases: [{ scene_id: "HudScene", state_id: "default", width: 200, height: 100 }],
      regions: [{
        id: "hero-region",
        scene_id: "HudScene",
        state_id: "default",
        owner_type: "fixed-production-visual",
        layout_node_ids: ["hud.hero", "hud.hero-copy"],
        ...(inheritComponentStateCoverage ? { state_analysis: { states: [{ state_id: "normal", requirement: "required" }] } } : {}),
        expected_assets: [{ asset_id: "hero-formal", component_id: "hero-component", state_id: componentState, runtime_file: "public/hero.png" }],
        component_inventory: {
          components: [{
            component_id: "hero-component",
            ...(inheritComponentStateCoverage ? {} : { state_coverage: [{ state_id: componentState, requirement: "required" }] }),
            placements: [
              { placement_id: "hero-placement", layout_node_id: "hud.hero" },
              { placement_id: "hero-copy-placement", layout_node_id: "hud.hero-copy" },
            ],
          }],
        },
      }],
    },
    assets: [{ id: "hero-formal", status: "accepted", scene_id: "HudScene", component_id: "hero-component", state_id: componentState, runtime_outputs: ["public/hero.png"], sha256: assetSha, coverage_region_ids: ["hero-region"] }],
  };
  const manifestBytes = await writeJson(join(root, "docs", "visual-assets.json"), manifest);
  await writeJson(join(root, "docs", "v3-pass.json"), {
    evidenceType: "v3-formal-acceptance",
    status: "PASS",
    acceptanceId: "ACCEPT-HUD-7",
    workItemId: "WI-HUD",
    candidateVersion: "candidate-7",
    targetSha256: targetSha,
    contentHash: candidateSha,
    diffFingerprint: "diff-hud-7",
    candidateIdentity: { sha256: candidateSha, diffFingerprint: "diff-hud-7" },
    formalAssets: [{ id: "hero-formal", status: "accepted" }],
    components: [{ id: "hero-component", status: "accepted" }],
    visualManifestFile: "docs/visual-assets.json",
    visualManifestSha256: sha256(manifestBytes),
  });
  const resourceMap = {
    schema: "threejs-page-sketch-resources/1.0",
    assets: [
      { asset_id: "hero-formal", file: "public/hero.png", layout_node_id: "hud.hero" },
      { asset_id: "hero-formal", file: "public/hero.png", layout_node_id: "hud.hero-copy" },
    ],
    node_presentations: {
      "hud.root": { kind: "container" },
      "hud.hero": { kind: "image", asset_ids: ["hero-formal"], object_fit: "contain" },
      "hud.hero-copy": { kind: "image", asset_ids: ["hero-formal"], object_fit: "contain" },
    },
  };
  await writeJson(join(root, "docs", "page-sketch-resources.json"), resourceMap);
  return { root, targetSha };
}

/** CLI 输入固定绑定当前V2/V3文件与游戏项目目录下的目标路径。 */
function inputArgs(root) {
  return {
    "--project-root": root,
    "--nodes": "docs/layout-nodes.json",
    "--v3-manifest": "docs/visual-assets.json",
    "--v3-evidence": "docs/v3-pass.json",
    "--resources": "docs/page-sketch-resources.json",
    "--output": "docs/page-sketch.json",
  };
}

test("草图生成绑定真实V2/V3来源并允许同一正式资源复用到多个节点", async () => {
  const project = await createProject();
  try {
    const sketch = await initPageSketch(inputArgs(project.root));
    assert.equal(sketch.schema, "threejs-page-sketch/1.0");
    assert.equal(sketch.confirmation, null);
    assert.equal(sketch.target_sha256, project.targetSha);
    assert.deepEqual(sketch.v3_assets.map(({ asset_id, layout_node_id }) => [asset_id, layout_node_id]), [
      ["hero-formal", "hud.hero"],
      ["hero-formal", "hud.hero-copy"],
    ]);
    const onDisk = JSON.parse(await readFile(join(project.root, "docs", "page-sketch.json"), "utf8"));
    assert.equal(onDisk.v2_nodes_sha256, sketch.v2_nodes_sha256);
    await assert.rejects(initPageSketch(inputArgs(project.root)), { code: "EEXIST" });
  } finally {
    await rm(project.root, { recursive: true, force: true });
  }
});

test("实际缺失的 accepted 运行时资源阻止草图生成", async () => {
  const project = await createProject({ includeAsset: false });
  try {
    await assert.rejects(initPageSketch(inputArgs(project.root)), /hero\.png/);
  } finally {
    await rm(project.root, { recursive: true, force: true });
  }
});

/** 当前页面 state 与组件视觉 state 可不同，且同 region 的结构父节点不强制伪装成图片。 */
test("组件状态由 expected_assets 反推且结构父节点保留 container", async () => {
  const project = await createProject({ componentState: "idle", structuralParentInRegion: true, inheritComponentStateCoverage: true });
  try {
    const sketch = await initPageSketch(inputArgs(project.root));
    assert.equal(sketch.state_id, "default");
    assert.equal(sketch.v3_assets[0].asset_id, "hero-formal");
    assert.deepEqual(sketch.node_presentations["hud.root"], { kind: "container" });
  } finally {
    await rm(project.root, { recursive: true, force: true });
  }
});

/** V3 普通 shared 资源无须 shared_reason；runtime-required 资源可省略 shared_scene_ids。 */
test("共享资源归属遵循 V3 普通 shared 与 runtime-required 合同", async () => {
  for (const mode of ["ordinary", "runtime-required"]) {
    const project = await createProject();
    try {
      const manifestPath = join(project.root, "docs", "visual-assets.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      const asset = manifest.assets[0];
      delete asset.scene_id;
      asset.shared = true;
      if (mode === "ordinary") asset.shared_scene_ids = ["HudScene", "InventoryScene"];
      else asset.shared_reason = "runtime-required";
      await writeJson(manifestPath, manifest);
      const evidencePath = join(project.root, "docs", "v3-pass.json");
      const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
      evidence.visualManifestSha256 = sha256(await readFile(manifestPath));
      await writeJson(evidencePath, evidence);
      const sketch = await initPageSketch(inputArgs(project.root));
      assert.equal(sketch.v3_assets.length, 2, mode);
    } finally {
      await rm(project.root, { recursive: true, force: true });
    }
  }
});

/** V3 PASS 的候选/底图身份与正式资源、组件状态均在写草图前核验。 */
test("V3 证据身份漂移或正式资源/组件状态未接受时拒绝生成", async () => {
  const cases = [
    { name: "candidateVersion", mutate: (evidence) => { evidence.candidateVersion = "candidate-old"; }, error: /candidateVersion/ },
    { name: "targetSha256", mutate: (evidence) => { evidence.targetSha256 = `sha256:${"f".repeat(64)}`; }, error: /冻结目标 SHA/ },
    { name: "diffFingerprint", mutate: (evidence) => { evidence.diffFingerprint = "stale-diff"; }, error: /diffFingerprint/ },
    { name: "formalAssets", mutate: (evidence) => { evidence.formalAssets[0].status = "planned"; }, error: /formalAssets/ },
    { name: "components", mutate: (evidence) => { evidence.components[0].status = "planned"; }, error: /components/ },
  ];
  for (const item of cases) {
    const project = await createProject();
    try {
      const evidencePath = join(project.root, "docs", "v3-pass.json");
      const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
      item.mutate(evidence);
      await writeJson(evidencePath, evidence);
      await assert.rejects(initPageSketch(inputArgs(project.root)), item.error, item.name);
    } finally {
      await rm(project.root, { recursive: true, force: true });
    }
  }
});

/** init CLI 可预览带 placement 的 runtime-data 文本和 runtime-rendered 程序节点，不伪造 V3 图片。 */
test("草图初始化接受有 placement 的 runtime 文本与程序配方", async () => {
  const project = await createProject();
  try {
    const manifestPath = join(project.root, "docs", "visual-assets.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const formalRegion = manifest.coverage_audit.regions[0];
    formalRegion.owner_type = "runtime-rendered";
    delete formalRegion.expected_assets;
    formalRegion.component_inventory = {
      components: [
        { component_id: "score-label", placements: [{ placement_id: "score-label-placement", layout_node_id: "hud.hero" }] },
        { component_id: "score-value", placements: [{ placement_id: "score-value-placement", layout_node_id: "hud.hero-copy" }] },
      ],
    };
    const otherRegion = {
      id: "other-fixed-region",
      scene_id: "InventoryScene",
      state_id: "default",
      owner_type: "fixed-production-visual",
      layout_node_ids: ["inventory.logo"],
      expected_assets: [{ asset_id: "inventory-logo", component_id: "inventory-logo-component", state_id: "idle", runtime_file: "public/hero.png" }],
      component_inventory: { components: [{ component_id: "inventory-logo-component", state_coverage: [{ state_id: "idle", requirement: "required" }], placements: [{ placement_id: "inventory-logo-placement", layout_node_id: "inventory.logo" }] }] },
    };
    manifest.coverage_audit.regions.push(otherRegion);
    manifest.coverage_audit.canvases.push({ scene_id: "InventoryScene", state_id: "default", width: 200, height: 100 });
    manifest.reference_target.scene_ids.push("InventoryScene");
    manifest.assets[0] = {
      ...manifest.assets[0],
      id: "inventory-logo",
      scene_id: "InventoryScene",
      component_id: "inventory-logo-component",
      state_id: "idle",
      coverage_region_ids: ["other-fixed-region"],
    };
    const manifestBytes = await writeJson(manifestPath, manifest);

    const runtimeBytes = Buffer.from("export function mount() { return null; }\n");
    await writeFile(join(project.root, "public", "runtime-preview.mjs"), runtimeBytes);
    const evidencePath = join(project.root, "docs", "v3-pass.json");
    const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
    evidence.formalAssets = [{ id: "inventory-logo", status: "accepted" }];
    evidence.components = [{ id: "inventory-logo-component", status: "accepted" }];
    evidence.visualManifestSha256 = sha256(manifestBytes);
    await writeJson(evidencePath, evidence);

    const resourcePath = join(project.root, "docs", "page-sketch-resources.json");
    const resourceMap = JSON.parse(await readFile(resourcePath, "utf8"));
    resourceMap.assets = [];
    resourceMap.node_presentations["hud.hero"] = {
      kind: "text", text: "Score", style: { font_family: "Arial", font_size_px: 18, color: "#ffffff" },
    };
    resourceMap.node_presentations["hud.hero-copy"] = {
      kind: "runtime-program", module_file: "public/runtime-preview.mjs", module_sha256: sha256(runtimeBytes),
    };
    await writeJson(resourcePath, resourceMap);

    const sketch = await initPageSketch(inputArgs(project.root));
    assert.deepEqual(sketch.v3_assets, []);
    assert.equal(sketch.node_presentations["hud.hero"].kind, "text");
    assert.equal(sketch.node_presentations["hud.hero-copy"].kind, "runtime-program");
  } finally {
    await rm(project.root, { recursive: true, force: true });
  }
});
