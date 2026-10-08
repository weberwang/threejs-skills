import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { registerVisualManifestUsabilityCases } from "./visual-manifest-usability-cases.mjs";
import { technicalRegionSnapshot } from "./generate_effect_image_annotation.mjs";
import { checkManifestFiles as runManifestFileCheck, computeRegionDefinitionSha256, main, readPngDimensions, validateManifest } from "./validate_visual_manifest.mjs";
import { annotationProductionContract, decodePngRgba } from "./effect_image_raster.mjs";
import { renderEffectImageAnnotation } from "./effect_image_annotation_core.mjs";
import { deriveAtomicImageRequirements } from "../../threejs-game-workflow-control/scripts/visual-atomic-contract.mjs";
import { buildEffectImageAssetPrompt, buildEffectImageFullPrompt, EFFECT_IMAGE_GLOBAL_PROMPT_PREFIX, EFFECT_IMAGE_NEGATIVE_PROMPT, resolveProductionContract } from "../../threejs-game-workflow-control/scripts/visual-production-contract.mjs";
import { DEFAULT_SOURCE_BACKGROUND_COLOR } from "../../threejs-game-workflow-control/scripts/visual-transparent-background-contract.mjs";
import { loadVisualConfirmationAuthority } from "../../threejs-game-workflow-control/scripts/visual-confirmation-authority.mjs"; import { computeLayoutAnnotationConfirmationSha256, computeLayoutUserMessageSha256 } from "../../threejs-game-workflow-control/scripts/layout_annotation_confirmation.mjs"; import { writeLayoutReviewFixtureArtifacts } from "./layout-review-fixtures.mjs";
import { CORE_TEMPLATES, OPTIONAL_TEMPLATES } from "../../threejs-game-orchestrator/scripts/project_doc_templates.mjs";

import {
  EMPTY_DOCUMENT_FINGERPRINT,
  STRUCTURAL_FILE_GATE_OPTIONS,
  visualComponentContract,
  addManualConfirmationRecords,
  nonEmptyString,
  imageNormalizationRecord,
  validManifest,
  attachSceneReconstructionContract,
  validOrdinaryManifest,
  validAiManifest,
  bitmapManifest,
  multiConfirmationGroupManifest,
  sha256Bytes,
  canonicalJson,
  canonicalSha,
  prerequisiteListSha,
  pngCrc32,
  minimalPng,
  createFixtureFiles,
  reuseSnapshot,
  writeConfirmationFixtureFiles,
  loadFixtureAuthority,
  checkManifestFiles,
  refreshRegionDerivedContracts,
} from "./validate_visual_manifest.fixtures.mjs";

test("文件检查覆盖存在性、哈希与 AI 引用", async () => { const root = await mkdtemp(join(tmpdir(), "visual-manifest-")); const manifest = validAiManifest(); assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("文件不存在"))); await createFixtureFiles(root, true); await writeConfirmationFixtureFiles(root, manifest); assert.deepEqual(await checkManifestFiles(manifest, root), []); await writeFile(join(root, "docs/visual-baseline.md"), "修改"); assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("SHA-256 不一致"))); });
test("全局锚点和一致性证据内容篡改时文件门拒绝", async () => {
  const root = await mkdtemp(join(tmpdir(), "visual-global-file-gate-"));
  const manifest = validAiManifest();
  await createFixtureFiles(root, true);
  await writeConfirmationFixtureFiles(root, manifest);
  await writeFile(join(root, "evidence/visual/main-anchor.png"), "anchor-drift");
  assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("visual_baseline.anchor_evidence") && item.includes("sha256")));
  await writeFile(join(root, "evidence/visual/main-anchor.png"), "");
  await writeFile(join(root, "evidence/visual/ai-consistency.json"), "consistency-drift");
  assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("generation_record.consistency_evidence") && item.includes("sha256")));
});
test("V5 check-files 与 CLI 拒绝旧 F2 baseline 或旧 diff 身份", async () => {
  const root = await mkdtemp(join(tmpdir(), "visual-f2-identity-"));
  await createFixtureFiles(root);
  const manifestPath = join(root, "visual-assets.json");
  for (const [field, value] of [["baselineHash", `sha256:${"8".repeat(64)}`], ["diffFingerprint", "diff-old"]]) {
    const manifest = validManifest();
    manifest.visual_production_gate.f2_machine_validation[field] = value;
    assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("未绑定当前")), `check-files ${field}`);
    await writeFile(manifestPath, JSON.stringify(manifest));
    assert.equal(await main([manifestPath, "--stage", "V5", "--check-files", "--project-root", root]), 1, `CLI ${field}`);
  }
});
test("V5 文件审计拒绝扩展名伪装的 mjs raster", async () => { const root = await mkdtemp(join(tmpdir(), "visual-fake-raster-")); const manifest = validManifest(); await createFixtureFiles(root); const fake = join(root, "public/assets/fake.mjs"); await mkdir(dirname(fake), { recursive: true }); await writeFile(fake, "export default 1;"); manifest.assets[0].runtime_outputs = ["public/assets/fake.mjs"]; manifest.production_contract_audit.units[0].actual_assets[0].file = "public/assets/fake.mjs"; manifest.production_contract_audit.units[0].actual_assets[0].sha256 = sha256Bytes(Buffer.from("export default 1;")); assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("不是可解码 PNG/JPEG/WebP"))); });
test("V5 check-files 不得因缺少 production_contract_audit 而静默放行", async () => { const root = await mkdtemp(join(tmpdir(), "visual-v5-audit-")); const manifest = validManifest(); delete manifest.production_contract_audit; await createFixtureFiles(root); assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("production_contract_audit 缺失"))); });
test("编号图文件缺失或哈希不匹配时文件检查失败", async () => { const root = await mkdtemp(join(tmpdir(), "visual-numbered-")); const manifest = validManifest(); manifest.coverage_audit.regions[0].confirmation = { mode: "USER_DECISION", reasons: ["ambiguous-boundary"], numbered_image_file: "evidence/coverage/numbered.png", numbered_image_version: "1", numbered_image_sha256: EMPTY_DOCUMENT_FINGERPRINT, decision_id: "decision-1" }; await createFixtureFiles(root); assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("numbered_image_file 文件不存在"))); const path = join(root, "evidence/coverage/numbered.png"); await mkdir(dirname(path), { recursive: true }); await writeFile(path, "changed"); assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("numbered_image_sha256 与文件"))); });
test("拆解提案、决定记录和生成器标注 PNG 必须真实存在且逐项绑定", async () => { const root = await mkdtemp(join(tmpdir(), "visual-decomposition-")); const manifest = bitmapManifest(); await createFixtureFiles(root, true); const region = manifest.coverage_audit.regions[1]; const pairRegions = manifest.coverage_audit.regions.filter((item) => item.scene_id === region.scene_id && item.state_id === region.state_id); const numberedBytes = renderEffectImageAnnotation(minimalPng(390, 844), manifest.reference_target.original_file, manifest.coverage_audit.canvases[0], pairRegions); await writeConfirmationFixtureFiles(root, manifest, numberedBytes); const numberedPath = join(root, region.confirmation.annotation_file); assert.deepEqual(await checkManifestFiles(manifest, root), []); const hidden = Buffer.from(numberedBytes); hidden[hidden.length - 1] ^= 1; await writeFile(numberedPath, hidden); region.confirmation.annotation_sha256 = sha256Bytes(hidden); assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("标准 PNG 不一致"))); await writeConfirmationFixtureFiles(root, manifest, numberedBytes); await writeFile(join(root, region.confirmation.proposal_file), ""); assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("proposal_file 必须是可解析 JSON"))); const invalid = bitmapManifest(); await createFixtureFiles(root, true); await writeConfirmationFixtureFiles(root, invalid, minimalPng()); assert((await checkManifestFiles(invalid, root)).some((item) => item.includes("尺寸") || item.includes("标准 PNG") || item.includes("区域标注"))); });
test("文件检查拒绝路径逃逸", async () => { const root = await mkdtemp(join(tmpdir(), "visual-manifest-")); const manifest = validManifest(); manifest.visual_baseline.document = "../outside.md"; assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("路径逃逸"))); });
test("文件检查拒绝 symlink 真实位置逃逸", async (t) => { const root = await mkdtemp(join(tmpdir(), "visual-symlink-")); const outsideRoot = await mkdtemp(join(tmpdir(), "visual-symlink-outside-")); const outside = join(outsideRoot, "outside.png"); await writeFile(outside, "outside"); const link = join(root, "evidence/visual/escaped.png"); await mkdir(dirname(link), { recursive: true }); try { await symlink(outside, link, "file"); } catch { t.skip("当前 Windows 环境不允许创建 symlink"); return; } const manifest = validManifest(); manifest.visual_baseline.anchor_evidence.push("evidence/visual/escaped.png"); assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("真实位置逃逸"))); });
test("错误 assets 容器不得绕过 V3/V5 文件检查", async () => { const root = await mkdtemp(join(tmpdir(), "visual-manifest-")); const manifest = validManifest(); manifest.assets = 42; await createFixtureFiles(root); assert(validateManifest(manifest).includes("assets 必须是数组")); assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("V5") || item.includes("V5"))); });
test("CLI 对结构错误返回非零", async () => { const root = await mkdtemp(join(tmpdir(), "visual-manifest-")); const path = join(root, "visual-assets.json"); const manifest = validManifest(); manifest.assets = 42; await writeFile(path, JSON.stringify(manifest)); assert.equal(await main([path, "--check-files", "--project-root", root]), 1); });
test("CLI 对 bitmap-decomposition 强制文件证据门", async () => { const root = await mkdtemp(join(tmpdir(), "visual-bitmap-gate-")); const path = join(root, "visual-assets.json"); await writeFile(path, JSON.stringify(bitmapManifest())); assert.equal(await main([path]), 2); });
test("独立生产文件不得与冻结原图真实路径或内容相同", async () => { const root = await mkdtemp(join(tmpdir(), "visual-independent-source-")); const manifest = validManifest(); await createFixtureFiles(root); await writeFile(join(root, manifest.assets[0].source_file), minimalPng(390, 844)); assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("真实路径或内容 SHA 相同"))); });
test("reuse-existing 只能绑定新版不可变快照且不得改回 generate-now", () => {
  const manifest = validManifest(); const region = manifest.coverage_audit.regions[1];
  region.production_method = "reuse"; region.delivery_kind = "existing-asset"; region.implementation_plan = { mode: "reuse-existing", summary: "复用已验收主角资源" }; region.reuse_snapshot = reuseSnapshot();
  Object.assign(manifest.assets[0], { production_method: "reuse", delivery_kind: "existing-asset" });
  Object.assign(manifest.production_contract_audit.units[0], { observed_method: "reuse", observed_delivery_kind: "existing-asset" });
  refreshRegionDerivedContracts(manifest, region); addManualConfirmationRecords(manifest);
  const invalid = structuredClone(manifest); invalid.coverage_audit.regions[1].reuse_snapshot.source_status = "rejected";
  assert(validateManifest(invalid).some((item) => item.includes("source_status") && item.includes("accepted")));
  const generateNow = structuredClone(manifest); generateNow.coverage_audit.regions[1].implementation_plan.mode = "generate-now";
  assert(validateManifest(generateNow).some((item) => item.includes("production_method=reuse") && item.includes("reuse-existing")));
});
test("reuse 快照缺 schema 或来源字段时拒绝", () => {
  const base = validManifest(); const region = base.coverage_audit.regions[1]; region.production_method = "reuse"; region.delivery_kind = "existing-asset"; region.implementation_plan = { mode: "reuse-existing", summary: "复用已验收主角资源" }; region.reuse_snapshot = reuseSnapshot();
  Object.assign(base.assets[0], { production_method: "reuse", delivery_kind: "existing-asset" }); refreshRegionDerivedContracts(base, region); addManualConfirmationRecords(base);
  const invalidSchema = structuredClone(base); invalidSchema.coverage_audit.regions[1].reuse_snapshot.schema = "asset-reuse-snapshot/0.9";
  assert(validateManifest(invalidSchema).some((item) => item.includes("asset-reuse-snapshot/1.0")));
  const missing = structuredClone(base); delete missing.coverage_audit.regions[1].reuse_snapshot.source_manifest_file;
  assert(validateManifest(missing).some((item) => item.includes("source_manifest_file")));
});
test("reuse-existing 文件身份必须绑定 accepted 源快照、源文件和兼容证据", async () => {
  const root = await mkdtemp(join(tmpdir(), "visual-reuse-files-")); const manifest = validManifest(); const region = manifest.coverage_audit.regions[1];
  const sourceBytes = minimalPng(64, 96); const compatibility = JSON.stringify({ status: "passed" });
  const sourceManifest = { status: "accepted", source_file: "art/hero.png", source_sha256: sha256Bytes(sourceBytes) }; const sourceManifestBytes = Buffer.from(JSON.stringify(sourceManifest));
  const snapshot = reuseSnapshot({ source_asset_id: "hero-idle", source_manifest_sha256: sha256Bytes(sourceManifestBytes), source_sha256: sha256Bytes(sourceBytes), compatibility_evidence_sha256: sha256Bytes(Buffer.from(compatibility)) });
  region.production_method = "reuse"; region.delivery_kind = "existing-asset"; region.implementation_plan = { mode: "reuse-existing", summary: "复用已验收主角资源" }; region.reuse_snapshot = snapshot;
  Object.assign(manifest.assets[0], { production_method: "reuse", delivery_kind: "existing-asset" }); Object.assign(manifest.production_contract_audit.units[0], { observed_method: "reuse", observed_delivery_kind: "existing-asset" });
  refreshRegionDerivedContracts(manifest, region); addManualConfirmationRecords(manifest); await createFixtureFiles(root); await writeFile(join(root, "art/hero.png"), sourceBytes); await writeFile(join(root, "evidence/visual/hero-consistency.json"), compatibility); await writeFile(join(root, "docs/reuse-snapshot.json"), sourceManifestBytes); await writeConfirmationFixtureFiles(root, manifest);
  assert.deepEqual(await checkManifestFiles(manifest, root), []);
  await writeFile(join(root, "art/hero.png"), Buffer.from("source-drift")); assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("source_file") && item.includes("SHA")));
  await writeFile(join(root, "art/hero.png"), sourceBytes); await writeFile(join(root, "evidence/visual/hero-consistency.json"), JSON.stringify({ status: "rejected" })); assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("compatibility evidence")));
  const drifted = { ...sourceManifest, source_file: "art/other.png" }; const driftedBytes = Buffer.from(JSON.stringify(drifted)); await writeFile(join(root, "docs/reuse-snapshot.json"), driftedBytes); snapshot.source_manifest_sha256 = sha256Bytes(driftedBytes); assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("source_file") && item.includes("source manifest")));
});
test("拆解人工确认必须绑定用户原文、时间和 manual accepted 身份", () => { const missing = bitmapManifest(); delete missing.coverage_audit.regions[1].confirmation.user_message_sha256; assert(validateManifest(missing).some((item) => item.includes("user_message_sha256"))); const forged = bitmapManifest(); forged.coverage_audit.regions[1].confirmation.confirmation_mode = "auto"; assert(validateManifest(forged).some((item) => item.includes("confirmation_mode 必须为 manual"))); });

test("每个 scene/state 组拥有独立 PNG、提案和决定文件并完整覆盖组内编号", async () => {
  const root = await mkdtemp(join(tmpdir(), "visual-confirmation-groups-")); const manifest = multiConfirmationGroupManifest(); await createFixtureFiles(root, true);
  const original = minimalPng(390, 844); const groups = new Map();
  for (const region of manifest.coverage_audit.regions) { const key = `${region.scene_id}\0${region.state_id}`; const list = groups.get(key) ?? []; list.push(region); groups.set(key, list); }
  const bytesByGroup = Object.fromEntries([...groups].map(([key, regions]) => [key, renderEffectImageAnnotation(original, manifest.reference_target.original_file, manifest.coverage_audit.canvases.find((canvas) => `${canvas.scene_id}\0${canvas.state_id}` === key), regions)]));
  await writeConfirmationFixtureFiles(root, manifest, bytesByGroup);
  assert.notEqual(manifest.coverage_audit.regions[0].confirmation.annotation_file, manifest.coverage_audit.regions[2].confirmation.annotation_file);
  assert.equal(manifest.scene_reconstruction_contract.layout_decomposition.layout_nodes.length, 2); assert.deepEqual(await checkManifestFiles(manifest, root), []);
});

test("多 scene/state 确认拒绝串组文件和漏组文件", async () => {
  const root = await mkdtemp(join(tmpdir(), "visual-confirmation-group-errors-")); const manifest = multiConfirmationGroupManifest(); await createFixtureFiles(root, true);
  const original = minimalPng(390, 844); const groups = new Map();
  for (const region of manifest.coverage_audit.regions) { const key = `${region.scene_id}\0${region.state_id}`; const list = groups.get(key) ?? []; list.push(region); groups.set(key, list); }
  const bytesByGroup = Object.fromEntries([...groups].map(([key, regions]) => [key, renderEffectImageAnnotation(original, manifest.reference_target.original_file, manifest.coverage_audit.canvases.find((canvas) => `${canvas.scene_id}\0${canvas.state_id}` === key), regions)]));
  await writeConfirmationFixtureFiles(root, manifest, bytesByGroup);
  const first = manifest.coverage_audit.regions[0].confirmation; const second = manifest.coverage_audit.regions[2].confirmation;
  second.annotation_file = first.annotation_file;
  assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("不得复用其他 scene/state 组")));
  await writeConfirmationFixtureFiles(root, manifest, bytesByGroup);
  second.decision_record_file = "evidence/coverage/missing-victory-decision.json";
  assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("decision_record_file 文件不存在") || item.includes("decision_record_file")));
});
test("拆解提案前必须绑定已有 ownership 审阅证据", () => { const manifest = bitmapManifest(); delete manifest.coverage_audit.regions[1].ownership_evidence; assert(validateManifest(manifest).some((item) => item.includes("ownership_evidence"))); });
test("reuse 快照文件漂移或来源状态变化时拒绝", async () => {
  const root = await mkdtemp(join(tmpdir(), "visual-reuse-snapshot-drift-")); const manifest = validManifest(); const region = manifest.coverage_audit.regions[1]; const sourceBytes = minimalPng(64, 96); const compatibility = JSON.stringify({ status: "passed" });
  const sourceManifest = { status: "accepted", source_file: "art/hero.png", source_sha256: sha256Bytes(sourceBytes) }; const sourceManifestBytes = Buffer.from(JSON.stringify(sourceManifest)); const snapshot = reuseSnapshot({ source_asset_id: "hero-idle", source_manifest_sha256: sha256Bytes(sourceManifestBytes), source_sha256: sha256Bytes(sourceBytes), compatibility_evidence_sha256: sha256Bytes(Buffer.from(compatibility)) });
  region.production_method = "reuse"; region.delivery_kind = "existing-asset"; region.implementation_plan = { mode: "reuse-existing", summary: "复用快照资源" }; region.reuse_snapshot = snapshot; Object.assign(manifest.assets[0], { production_method: "reuse", delivery_kind: "existing-asset" }); Object.assign(manifest.production_contract_audit.units[0], { observed_method: "reuse", observed_delivery_kind: "existing-asset" }); refreshRegionDerivedContracts(manifest, region); addManualConfirmationRecords(manifest);
  await createFixtureFiles(root); await writeFile(join(root, "art/hero.png"), sourceBytes); await writeFile(join(root, "evidence/visual/hero-consistency.json"), compatibility); await writeFile(join(root, "docs/reuse-snapshot.json"), sourceManifestBytes); await writeConfirmationFixtureFiles(root, manifest); assert.deepEqual(await checkManifestFiles(manifest, root), []);
  const rejected = structuredClone(manifest); rejected.coverage_audit.regions[1].reuse_snapshot.source_status = "rejected"; assert((await checkManifestFiles(rejected, root)).some((item) => item.includes("source_status") && item.includes("accepted")));
  await writeFile(join(root, "art/hero.png"), Buffer.from("drift")); assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("source_file") && item.includes("SHA")));
});

test("固定视觉区域确认哈希覆盖生产方式、状态、部件粒度和热区合同", () => {
  const mutations = [
    ["production_method", "image-generation"],
    ["delivery_kind", "vector-image"],
    ["image_generation_required", true],
    ["generation_record_required", true],
    ["substitution_policy", "user-change-request-only"],
  ];
  for (const [field, value] of mutations) {
    const manifest = validManifest();
    manifest.coverage_audit.regions[1][field] = value;
    assert(validateManifest(manifest).some((item) => item.includes("region_definition_sha256 与当前区域合同不一致")), field);
  }
  const componentDrift = validManifest();
  componentDrift.coverage_audit.regions[1].component_inventory.component_count = 2;
  assert(validateManifest(componentDrift).some((item) => item.includes("region_definition_sha256 与当前区域合同不一致")), "component_inventory");
  const assetDrift = validManifest();
  assetDrift.coverage_audit.regions[1].expected_assets[0].asset_id = "hero-alt";
  assert(validateManifest(assetDrift).some((item) => item.includes("region_definition_sha256 与当前区域合同不一致")), "expected_assets");
  const hotspotDrift = validManifest();
  hotspotDrift.coverage_audit.regions[1].interaction_hotspots = [{ hotspot_id: "hero-hit", component_id: "hero-component", bounds: { x: 0, y: 0, width: 10, height: 10 } }];
  assert(validateManifest(hotspotDrift).some((item) => item.includes("region_definition_sha256 与当前区域合同不一致")), "interaction_hotspots");
});

test("状态分析证据身份缺失或冻结目标漂移时拒绝", () => {
  const missing = validManifest();
  delete missing.coverage_audit.regions[1].state_analysis.evidence_sha256;
  assert(validateManifest(missing).some((item) => item.includes("缺少 evidence_sha256")), "evidence_sha256");
  const targetDrift = validManifest();
  targetDrift.coverage_audit.regions[1].state_analysis.reference_target_sha256 = EMPTY_DOCUMENT_FINGERPRINT;
  assert(validateManifest(targetDrift).some((item) => item.includes("reference_target_sha256 必须绑定当前冻结目标")), "reference_target_sha256");
  const createdAtMissing = validManifest();
  delete createdAtMissing.coverage_audit.regions[1].component_inventory.created_at;
  assert(validateManifest(createdAtMissing).some((item) => item.includes("created_at")), "created_at");
});

test("--check-files 校验状态分析证据存在和 SHA", async () => {
  const root = await mkdtemp(join(tmpdir(), "visual-state-analysis-files-"));
  const manifest = validManifest();
  await createFixtureFiles(root);
  await writeConfirmationFixtureFiles(root, manifest);
  assert.deepEqual(await checkManifestFiles(manifest, root), []);
  await writeFile(join(root, "evidence/coverage/state-analysis.md"), "changed");
  assert((await checkManifestFiles(manifest, root)).some((item) => item.includes("state_analysis.evidence_sha256 与文件 SHA-256 不一致")));
});

test("区域确认哈希覆盖 runtime_implementation 合同", () => {
  const manifest = validManifest();
  const region = manifest.coverage_audit.regions[1];
  const originalHash = region.confirmation.region_definition_sha256;
  region.runtime_implementation = { kind: "authored-raster", integration_files: ["src/hero.mjs"] };
  const changedHash = computeRegionDefinitionSha256(region);
  assert.notEqual(changedHash, originalHash);
  assert.notEqual(validateManifest(manifest).filter((item) => item.includes("region_definition_sha256 与当前区域合同不一致")).length, 0);
  region.confirmation.region_definition_sha256 = changedHash;
  const stableHash = computeRegionDefinitionSha256(region);
  region.runtime_implementation.integration_files = ["src/hero-variant.mjs"];
  assert.notEqual(computeRegionDefinitionSha256(region), stableHash);
});

test("nested production_contract 与 camel stateAnalysis 纳入同一确认哈希并拒绝别名冲突", async () => {
  const nested = validManifest();
  const region = nested.coverage_audit.regions[1];
  const productionFields = ["production_origin", "production_method", "delivery_kind", "image_generation_required", "generation_record_required", "substitution_policy", "expected_assets"];
  region.production_contract = Object.fromEntries(productionFields.map((field) => [field, region[field]]));
  productionFields.forEach((field) => delete region[field]);
  region.confirmation.region_definition_sha256 = computeRegionDefinitionSha256(region);
  assert.deepEqual(validateManifest(nested, STRUCTURAL_FILE_GATE_OPTIONS), []);
  const methodDrift = structuredClone(nested);
  methodDrift.coverage_audit.regions[1].production_contract.production_method = "reuse";
  assert.notEqual(computeRegionDefinitionSha256(methodDrift.coverage_audit.regions[1]), region.confirmation.region_definition_sha256);
  assert(validateManifest(methodDrift).some((item) => item.includes("region_definition_sha256 与当前区域合同不一致")), "nested production_method 漂移必须使旧确认失效");

  const camel = validManifest();
  const camelRegion = camel.coverage_audit.regions[1];
  camelRegion.stateAnalysis = camelRegion.state_analysis;
  delete camelRegion.state_analysis;
  camelRegion.confirmation.region_definition_sha256 = computeRegionDefinitionSha256(camelRegion);
  assert.deepEqual(validateManifest(camel, STRUCTURAL_FILE_GATE_OPTIONS), []);
  const evidenceDrift = structuredClone(camel);
  evidenceDrift.coverage_audit.regions[1].stateAnalysis.evidence = "evidence/coverage/changed-state-analysis.md";
  assert.notEqual(computeRegionDefinitionSha256(evidenceDrift.coverage_audit.regions[1]), camelRegion.confirmation.region_definition_sha256);
  assert(validateManifest(evidenceDrift).some((item) => item.includes("region_definition_sha256 与当前区域合同不一致")), "camel stateAnalysis.evidence 漂移必须使旧确认失效");
  const conflict = structuredClone(camel);
  conflict.coverage_audit.regions[1].state_analysis = structuredClone(conflict.coverage_audit.regions[1].stateAnalysis);
  conflict.coverage_audit.regions[1].state_analysis.evidence = "evidence/coverage/conflicting.md";
  assert(validateManifest(conflict).some((item) => item.includes("区域合同别名取值冲突") && item.includes("state_analysis")));
});

test("camel stateAnalysis 与 snake state_analysis 共用文件存在和 SHA 门", async () => {
  const root = await mkdtemp(join(tmpdir(), "visual-camel-state-files-"));
  const manifest = validManifest();
  const region = manifest.coverage_audit.regions[1];
  region.stateAnalysis = region.state_analysis;
  delete region.state_analysis;
  region.confirmation.region_definition_sha256 = computeRegionDefinitionSha256(region);
  await createFixtureFiles(root);
  await writeConfirmationFixtureFiles(root, manifest);
  assert.deepEqual(await checkManifestFiles(manifest, root), []);
  await writeFile(join(root, "evidence/coverage/state-analysis.md"), "camel-state-drift");
  const errors = await checkManifestFiles(manifest, root);
  assert(errors.some((item) => item.includes("state_analysis.evidence_sha256 与文件 SHA-256 不一致")), errors.join("\n"));
  const missing = structuredClone(manifest);
  missing.coverage_audit.regions[1].stateAnalysis.evidence = "evidence/coverage/missing-state-analysis.md";
  missing.coverage_audit.regions[1].confirmation.region_definition_sha256 = computeRegionDefinitionSha256(missing.coverage_audit.regions[1]);
  assert((await checkManifestFiles(missing, root)).some((item) => item.includes("state_analysis.evidence 文件不存在")), "camel stateAnalysis 缺失证据文件必须失败");
});

test("manifest runtime_outputs 按规范化大小写和 ./ 路径识别物理冲突", () => {
  const manifest = validManifest();
  manifest.assets.push({ ...structuredClone(manifest.assets[0]), id: "hero-copy", texture_key: "hero-copy", runtime_outputs: ["PUBLIC/SHARED.PNG"] });
  manifest.assets[0].runtime_outputs = ["public/shared.png"];
  const errors = validateManifest(manifest);
  assert(errors.some((item) => item.includes("runtime_outputs 路径重复") && item.includes("PUBLIC/SHARED.PNG")), errors.join("\n"));
  const dotted = structuredClone(manifest);
  dotted.assets[1].runtime_outputs = ["public/./shared.png"];
  assert(validateManifest(dotted).some((item) => item.includes("runtime_outputs 路径重复")), "./ 别名也必须冲突");
});

test("effect-image 布局节点必须与 coverage 双向绑定且禁止孤立、跨区和重复消费", () => {
  const missing = validManifest(); delete missing.coverage_audit.regions[1].layout_node_ids;
  assert(validateManifest(missing).some((item) => item.includes("layout_node_ids 必须是非空字符串列表")), "区域布局节点不能为空");
  const missingPlacement = validManifest(); delete missingPlacement.coverage_audit.regions[1].component_inventory.components[0].placements[0].layout_node_id;
  assert(validateManifest(missingPlacement).some((item) => item.includes("placement 缺少 layout_node_id") || item.includes("layout_node_id 必须是非空字符串")), "placement 布局节点不能为空");
  const duplicateRegionNode = validManifest(); duplicateRegionNode.coverage_audit.regions[1].layout_node_ids.push("hero-component-layout-node");
  assert(validateManifest(duplicateRegionNode).some((item) => item.includes("layout_node_ids 不得重复")), "区域布局节点不能重复");
  const orphan = validManifest(); orphan.scene_reconstruction_contract.layout_decomposition.layout_nodes.push({ ...structuredClone(orphan.scene_reconstruction_contract.layout_decomposition.layout_nodes[1]), layout_node_id: "orphan-layout-node" });
  assert(validateManifest(orphan).some((item) => item.includes("双向一一对应") || item.includes("未被 coverage region.layout_node_ids 反向声明")), "孤立布局节点必须失败");
  const crossRegion = validManifest(); crossRegion.coverage_audit.regions[1].component_inventory.components[0].placements[0].layout_node_id = "layout-score";
  assert(validateManifest(crossRegion).some((item) => item.includes("只能引用本 region")), "placement 不得跨区域引用布局节点");
  const runtimeCrossRegion = validManifest(); runtimeCrossRegion.coverage_audit.regions[0].runtime_implementation.layout_node_ids = ["hero-component-layout-node"];
  assert(validateManifest(runtimeCrossRegion).some((item) => item.includes("runtime_implementation.layout_node_ids 只能引用本 region")), "runtime 布局实现不得跨区域引用节点");
  const duplicateConsumer = validManifest(); duplicateConsumer.coverage_audit.regions[1].runtime_implementation = { kind: "runtime-program", integration_files: ["src/hero.mjs"], layout_node_ids: ["hero-component-layout-node"] };
  assert(validateManifest(duplicateConsumer).some((item) => item.includes("被重复消费")), "同一节点不得同时由 placement 和 runtime 消费");
});

test("布局拆解必须绑定冻结 target、scene、state 和 layout contract version", () => {
  for (const field of ["target_sha256", "scene_id", "state_id", "layout_contract_version"]) {
    const manifest = validManifest(); manifest.scene_reconstruction_contract.layout_decomposition.layout_binding[field] = field === "target_sha256" ? EMPTY_DOCUMENT_FINGERPRINT : `drifted-${field}`; const errors = validateManifest(manifest);
    assert(errors.some((item) => item.includes("layout_decomposition") && item.includes("不一致")), `${field} 漂移必须失败`);
  }
});

test("V5 必须记录全部布局节点的逐节点几何差异和证据", () => {
  const missing = validManifest();
  delete missing.fidelity_cases[0].layout_node_results;
  assert(validateManifest(missing).some((item) => item.includes("layout_node_results 必须是非空逐节点几何差异数组")), "缺逐节点布局证据必须失败");
  const incomplete = validManifest(); incomplete.fidelity_cases[0].layout_node_results.pop();
  assert(validateManifest(incomplete).some((item) => item.includes("layout_node_results 缺少布局节点")), "漏布局节点必须失败");
  const forgedDelta = validManifest(); forgedDelta.fidelity_cases[0].layout_node_results[0].candidate_bounds.x += 1;
  assert(validateManifest(forgedDelta).some((item) => item.includes("delta 必须由 candidate_bounds 减 target_bounds")), "伪造布局 delta 必须失败");
});

test("布局字段变化会使 confirmation 的区域定义 SHA 失效", () => { const manifest = validManifest(); const region = manifest.coverage_audit.regions[1]; const original = region.confirmation.region_definition_sha256; region.layout_node_ids = ["hero-component-layout-node-v2"]; assert.notEqual(computeRegionDefinitionSha256(region), original, "布局节点必须参与区域定义 SHA"); assert(validateManifest(manifest).some((item) => item.includes("region_definition_sha256 与当前区域合同不一致")), "布局字段漂移必须使旧确认失效"); });

test("产品体积预算非必需且最新初始化模板不生成该字段", () => {
  const manifest = validManifest(); assert(!Object.hasOwn(manifest.budgets, "package_size_mb")); assert.deepEqual(validateManifest(manifest, STRUCTURAL_FILE_GATE_OPTIONS), []); const template = JSON.parse(OPTIONAL_TEMPLATES.assets["visual-assets.json"]); assert.equal(template.schema_version, "1.5"); assert(!Object.hasOwn(template.budgets, "package_size_mb"));
});
