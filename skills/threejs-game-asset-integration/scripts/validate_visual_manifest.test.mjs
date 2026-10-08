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

registerVisualManifestUsabilityCases({ validManifest, validateManifest, options: STRUCTURAL_FILE_GATE_OPTIONS });

test("普通 visual manifest fidelity DPR 允许动态有效值并拒绝非法声明", () => {
  for (const dpr of [0.5, 1, 1.25, 1.5, 2]) { const manifest = validManifest(); manifest.fidelity_cases[0].dpr = dpr; assert.deepEqual(validateManifest(manifest, STRUCTURAL_FILE_GATE_OPTIONS), [], `fidelity dpr=${dpr}`); }
  for (const dpr of [0, -1, 2.0001, 3, "2", NaN, Infinity]) { const manifest = validManifest(); manifest.fidelity_cases[0].dpr = dpr; assert(validateManifest(manifest, STRUCTURAL_FILE_GATE_OPTIONS).some((item) => item.includes("正有限数字且不超过 2")), `fidelity dpr=${dpr}`); }
});
test("visual manifest 独立入口拒绝伪造父子相对几何", () => { for (const mutate of [node => delete node.parent_layout_node_id, node => { node.relative_position.left += 1; }, node => { node.axis_alignment.horizontal = "right"; }, node => { node.offset.x = 999; }, node => { node.self_anchor = "center-center"; }]) { const manifest = validManifest(); mutate(manifest.scene_reconstruction_contract.layout_decomposition.layout_nodes[0]); assert(validateManifest(manifest).some((item) => item.includes("parent_layout_node_id") || item.includes("relative_position") || item.includes("axis_alignment") || item.includes("offset.x") || item.includes("self_anchor")), JSON.stringify(mutate)); } });
test("不保留 visual-assets 1.4 兼容", () => { const manifest = validManifest(); manifest.schema_version = "1.4"; assert(validateManifest(manifest).some((item) => item.includes("schema_version 必须为 1.5"))); });
test("非效果图 1.5 清单通过", () => assert.deepEqual(validateManifest(validOrdinaryManifest()), []));
test("effect-image V2-ready 允许 fidelity case 尚未产生", () => { const manifest = validManifest(); manifest.effect_image_reconstruction.lifecycle = "v2-ready"; manifest.fidelity_cases = []; assert.deepEqual(validateManifest(manifest), []); }); test("V3 资源验收不要求正式 Scene、组合预验收或 runtime consumption", () => { const manifest = validManifest(); manifest.visualStage = "V3"; manifest.visualStageState = "v3-formal-acceptance-complete"; manifest.effect_image_reconstruction.lifecycle = "v2-ready"; manifest.fidelity_cases = []; delete manifest.scene_reconstruction_contract; delete manifest.visual_production_gate; delete manifest.assets[0].runtime_consumption; delete manifest.production_contract_audit.units[0].runtime_consumption; assert.deepEqual(validateManifest(manifest, { stage: "V3", ...STRUCTURAL_FILE_GATE_OPTIONS }), []); });
test("validateManifest 高层硬阻断单一区域 composite，即使 composite_parts 完整也必须退回 V1", () => {
  const manifest = validManifest();
  assert.deepEqual(validateManifest(manifest, STRUCTURAL_FILE_GATE_OPTIONS), []);
  const region = manifest.scene_reconstruction_contract.coverage_regions.find((item) => item.region_id === "region-hero");
  Object.assign(region, {
    implementation_owner: "runtime-program",
    implementation_plan: { mode: "asset-and-scene" },
  });
  Object.assign(region.visual_route_analysis, {
    selected_route: "composite",
    asset_first_decision: "composite-required",
    implementation_plan_mode: "asset-and-scene",
    final_owner: "runtime-program",
    production_method: "runtime-program",
    delivery_kind: "runtime-program",
    composite_parts: [
      { part_id: "hero-appearance", part_role: "appearance", selected_route: "image-asset", final_owner: "fixed-production-visual", production_method: "authored-raster", delivery_kind: "raster-image", evidence: ["evidence/route/hero-appearance.json"] },
      { part_id: "hero-behavior", part_role: "behavior", selected_route: "threejs-native", final_owner: "runtime-program", production_method: "runtime-program", delivery_kind: "runtime-program", evidence: ["evidence/route/hero-behavior.json"] },
    ],
  });
  const errors = validateManifest(manifest, STRUCTURAL_FILE_GATE_OPTIONS);
  assert(errors.some((item) => item.includes("程序逻辑与独立视觉资产必须重新拆解")), errors.join("\n"));
  assert(errors.some((item) => item.includes("禁止单一 composite region 继续生产或验收")), errors.join("\n"));
  assert(errors.some((item) => item.includes("应退回阶段=V1/PROPOSAL")), errors.join("\n"));
});
test("显示层合同拒绝默认主图中的瞬态层和孤立上下文图", () => {
  const transient = validManifest();
  const planning = transient.scene_reconstruction_contract.display_layer_planning;
  const layer = planning.inventory[0]; layer.layer_id = "pause-modal"; layer.type = "modal"; layer.persistence = "transient"; layer.in_scene_master = true; planning.scene_master.persistent_layer_ids = ["pause-modal"]; layer.states = [{ state_id: "open", required: true }];
  assert(validateManifest(transient).some((item) => item.includes("上下文效果图") || item.includes("不得进入默认 scene master") || item.includes("瞬态显示层不属于场景工作项")));
  layer.in_scene_master = false; planning.scene_master.persistent_layer_ids = []; layer.states[0].contextual_effect_image = { evidence: "evidence/display/pause-open.png", sha256: transient.reference_target.target_sha256, origin: "provided", host_scene_id: "main-gameplay", host_target_sha256: transient.reference_target.target_sha256, layer_target_sha256: transient.reference_target.target_sha256, viewport: { width: 390, height: 844 }, kind: "host-scene-context", isolated_only: true };
  assert(validateManifest(transient, { workItemType: "DISPLAY_LAYER" }).some((item) => item.includes("孤立组件图")));
});
test("独立清单入口显式区分场景与弹窗工作项", async () => {
  const transient = validManifest();
  transient.effect_image_reconstruction.lifecycle = "v2-ready";
  transient.fidelity_cases = [];
  const planning = transient.scene_reconstruction_contract.display_layer_planning;
  const layer = planning.inventory[0];
  layer.layer_id = "pause-modal"; layer.type = "modal"; layer.persistence = "transient"; layer.in_scene_master = false;
  planning.scene_master.persistent_layer_ids = [];
  layer.states = [{ state_id: "open", required: true, contextual_effect_image: { evidence: "evidence/display/pause-open.png", sha256: transient.reference_target.target_sha256, origin: "provided", host_scene_id: "main-gameplay", host_target_sha256: transient.reference_target.target_sha256, layer_target_sha256: transient.reference_target.target_sha256, viewport: { width: 390, height: 844 }, kind: "host-scene-context", isolated_only: false } }];
  const displayErrors = validateManifest(transient, { workItemType: "DISPLAY_LAYER" });
  assert(!displayErrors.some((item) => item.includes("瞬态显示层不属于场景工作项")), displayErrors.join("\n"));
  assert(validateManifest(transient, { workItemType: "SCENE" }).some((item) => item.includes("瞬态显示层不属于场景工作项")));
  const root = await mkdtemp(join(tmpdir(), "display-layer-manifest-cli-"));
  const path = join(root, "visual-assets.json");
  await writeFile(path, JSON.stringify(transient));
  const messages = [];
  const originalError = console.error;
  console.error = (...args) => messages.push(args.join(" "));
  try {
    // 夹具仍带 V5 阶段身份，CLI 会因阶段冲突失败；这里专门确认它不再误报场景作用域。
    assert.equal(await main([path, "--stage", "V2", "--work-item-type", "DISPLAY_LAYER"]), 1);
  } finally {
    console.error = originalError;
  }
  assert(!messages.join("\n").includes("瞬态显示层不属于场景工作项"), messages.join("\n"));
});
test("V5 stage 对 v2-ready 清单强制 production_contract_audit", async () => { const root = await mkdtemp(join(tmpdir(), "visual-v5-stage-")); const path = join(root, "visual-assets.json"); const manifest = validManifest(); manifest.effect_image_reconstruction.lifecycle = "v2-ready"; delete manifest.production_contract_audit; await writeFile(path, JSON.stringify(manifest)); assert(validateManifest(manifest, { stage: "V5" }).some((item) => item.includes("production_contract_audit 缺失"))); assert.equal(await main([path, "--stage", "V5", "--check-files", "--project-root", root]), 1); });
test("V3/V5 效果图 API 和 CLI 缺少文件门必须拒绝，显式文件门才可继续结构校验", async () => {
  const v2Ready = validManifest(); v2Ready.effect_image_reconstruction.lifecycle = "v2-ready";
  assert(validateManifest(v2Ready, { stage: "V5" }).some((item) => item.includes("checkFiles=true") && item.includes("projectRoot")));
  const v5 = validManifest();
  assert(validateManifest(v5, { stage: "V5" }).some((item) => item.includes("checkFiles=true") && item.includes("projectRoot")));
  const imagegen = validAiManifest(); imagegen.effect_image_reconstruction.lifecycle = "v2-ready";
  assert(validateManifest(imagegen, { stage: "V5" }).some((item) => item.includes("checkFiles=true") && item.includes("projectRoot")));
  assert.deepEqual(validateManifest(v5, STRUCTURAL_FILE_GATE_OPTIONS), []);
  assert.deepEqual(validateManifest(imagegen, STRUCTURAL_FILE_GATE_OPTIONS), []);
  const root = await mkdtemp(join(tmpdir(), "visual-file-gate-cli-")); const path = join(root, "visual-assets.json"); await writeFile(path, JSON.stringify(v5));
  assert.equal(await main([path, "--stage", "V5"]), 1); assert(validateManifest(v5, { stage: "V4" }).some((item) => item.includes("只能是 V2、V3 或 V5"))); assert((await checkManifestFiles(v5, "fixture-project", { stage: "V4" })).some((item) => item.includes("只能是 V2、V3 或 V5")));
});
test("effect-image 根工作项和候选版本必须使用单一 camelCase 并绑定 V5 audit", () => {
  const missingWorkItem = validManifest(); delete missingWorkItem.workItemId; missingWorkItem.work_item_id = "work-item-1";
  const workErrors = validateManifest(missingWorkItem);
  assert(workErrors.some((item) => item.includes("workItemId")));
  assert(workErrors.some((item) => item.includes("work_item_id")));
  const missingCandidate = validManifest(); delete missingCandidate.candidateVersion; missingCandidate.candidate_version = "candidate-1";
  const candidateErrors = validateManifest(missingCandidate);
  assert(candidateErrors.some((item) => item.includes("candidateVersion")));
  assert(candidateErrors.some((item) => item.includes("candidate_version")));
  const staleCandidate = validManifest(); staleCandidate.effect_image_reconstruction.lifecycle = "v2-ready"; staleCandidate.candidateVersion = "candidate-stale";
  assert(validateManifest(staleCandidate, { stage: "V5" }).some((item) => item.includes("candidateVersion")));
});
test("V5 主入口拒绝错误 Work Item 或过期 candidateVersion 的 Change Request", () => {
  const base = validManifest();
  const request = { status: "ACCEPTED", changeRequestId: "CR-METHOD", workItemId: "wrong-work-item", candidateVersion: base.candidateVersion, candidate_sha256: base.candidate_identity.sha256, target_sha256: base.reference_target.target_sha256, baseline_sha256: base.visual_baseline.style_fingerprint, diff_fingerprint: base.candidate_identity.diff_fingerprint, user_original_text: "用户批准变更生产方式", accepted_at: "2026-08-15T00:40:00Z", production_method_changes: [{ annotation_number: 2, region_id: "region-hero", previous_method: "authored-raster", proposed_method: "reuse" }] };
  base.change_requests = [request];
  assert(validateManifest(base, { stage: "V5" }).some((item) => item.includes("workItemId") && item.includes("不一致")));
  const stale = structuredClone(base); stale.change_requests[0].workItemId = stale.workItemId; stale.change_requests[0].candidateVersion = "candidate-old";
  assert(validateManifest(stale, { stage: "V5" }).some((item) => item.includes("candidateVersion") && item.includes("不一致")));
});
test("V5 complete 必须有全部通过的 fidelity case", () => { const missing = validManifest(); missing.fidelity_cases = []; assert(validateManifest(missing).some((item) => item.includes("fidelity_cases 必须是非空数组"))); const failed = validManifest(); failed.fidelity_cases[0].conclusion = "failed"; assert(validateManifest(failed).some((item) => item.includes("必须全部 passed"))); });
test("V5 F2 机器事实拒绝旧 baseline 或旧 diff 身份", () => {
  for (const [field, value] of [["baselineHash", `sha256:${"9".repeat(64)}`], ["diffFingerprint", "diff-old"]]) {
    const manifest = validManifest();
    manifest.visual_production_gate.f2_machine_validation[field] = value;
    assert(validateManifest(manifest).some((item) => item.includes("F2") && item.includes("未绑定当前")), field);
  }
});
test("V5 complete 缺少 V5、F2 或 V5 对象时不得绕过总门", () => {
  for (const [field, marker] of [["production_contract_audit", "production_contract_audit"], ["f2_machine_validation", "F2"], ["visual_production_gate", "V5 production gate"]]) {
    const manifest = validManifest();
    if (field === "f2_machine_validation") delete manifest.visual_production_gate.f2_machine_validation;
    else delete manifest[field];
    assert(validateManifest(manifest).some((item) => item.includes(marker)), field);
  }
});
test("V5 fidelity 必须逐冻结 scene/state 组合覆盖", () => { const manifest = validManifest(); manifest.reference_target.state_ids.push("paused"); manifest.coverage_audit.canvases.push({ scene_id: "main-gameplay", state_id: "paused", width: 390, height: 844 }); manifest.coverage_audit.summaries.push({ scene_id: "main-gameplay", state_id: "paused", coverage_ratio: 1, uncovered: [], status: "passed", evidence: "evidence/coverage/paused-summary.md" }); manifest.coverage_audit.regions.push({ ...structuredClone(manifest.coverage_audit.regions[0]), id: "region-paused", state_id: "paused" }); assert(validateManifest(manifest).some((item) => item.includes("main-gameplay/paused"))); });
test("项目模板默认生成非效果图 1.5 资源清单", () => { assert(CORE_TEMPLATES["GDD.md"].includes("完整场景与功能清单")); assert(CORE_TEMPLATES["TDD.md"].includes("functional_status")); assert(CORE_TEMPLATES["visual-baseline.md"].includes("不追加 V2/V3/V4/V5 证据")); assert(CORE_TEMPLATES["visual-design.md"].includes("可追加的视觉方向")); assert(CORE_TEMPLATES["visual-design.md"].includes("本文件追加 V2/V3/V4/V5 留痕不会改变基线哈希")); assert(!OPTIONAL_TEMPLATES.assets["asset-license-register.md"].includes("对 `docs/visual-design.md` 计算")); const template = JSON.parse(OPTIONAL_TEMPLATES.assets["visual-assets.json"]); assert.equal(template.schema_version, "1.5"); assert.equal(template.visual_contract_version, "1.0"); assert.equal(template.workItemId, null); assert.equal(template.candidateVersion, null); assert.equal(template.visual_baseline.document, "docs/visual-baseline.md"); assert.deepEqual(template.effect_image_reconstruction, { applicability: "not-applicable", lifecycle: "not-applicable" }); assert(!("reference_target" in template)); });
test("合同回对门缺项、未通过或身份漂移时失败", () => { const missing = validManifest(); missing.contract_reconciliation.checks.pop(); assert(validateManifest(missing).some((item) => item.includes("缺少已通过领域"))); const failed = validManifest(); failed.contract_reconciliation.status = "failed"; assert(validateManifest(failed).some((item) => item.includes("必须为 passed"))); const drifted = validManifest(); drifted.contract_reconciliation.candidate_sha256 = `sha256:${"9".repeat(64)}`; assert(validateManifest(drifted).some((item) => item.includes("当前候选 SHA 不一致"))); });
test("ownership 覆盖规则拒绝运行内容位图化", () => { const manifest = validManifest(); manifest.coverage_audit.regions[2].asset_id = "hero-idle"; assert(validateManifest(manifest).some((item) => item.includes("禁止映射生产位图"))); });
test("覆盖区域要求几何和人工确认文件证据", () => { const bounds = validManifest(); delete bounds.coverage_audit.regions[0].bounds; assert(validateManifest(bounds).some((item) => item.includes("bounds 必须"))); const evidence = validManifest(); delete evidence.coverage_audit.regions[0].confirmation.proposal_file; assert(validateManifest(evidence).some((item) => item.includes("proposal_file"))); });
test("拆解位图必须先经过绑定目标、区域定义和人工 accepted 确认", () => { const auto = validManifest(); auto.coverage_audit.regions[1].production_origin = "bitmap-decomposition"; delete auto.coverage_audit.regions[1].confirmation.confirmation_schema; assert(validateManifest(auto).some((item) => item.includes("confirmation_schema"))); const missingConfirmation = validManifest(); missingConfirmation.coverage_audit.regions[1].production_origin = "bitmap-decomposition"; missingConfirmation.coverage_audit.regions[1].confirmation = { mode: "USER_DECISION" }; assert(validateManifest(missingConfirmation).some((item) => item.includes("manual accepted") || item.includes("confirmation_schema"))); const confirmed = bitmapManifest(); assert.deepEqual(validateManifest(confirmed, STRUCTURAL_FILE_GATE_OPTIONS), []); const targetDrift = structuredClone(confirmed); targetDrift.coverage_audit.regions[1].confirmation.target_sha256 = `sha256:${"9".repeat(64)}`; assert(validateManifest(targetDrift).some((item) => item.includes("未绑定当前冻结目标") || item.includes("必须重新确认"))); const regionDrift = structuredClone(confirmed); regionDrift.coverage_audit.regions[1].confirmation.region_id = "region-other"; assert(validateManifest(regionDrift).some((item) => item.includes("与覆盖区域不一致"))); const boundsDrift = structuredClone(confirmed); boundsDrift.coverage_audit.regions[1].bounds.width += 1; assert(validateManifest(boundsDrift).some((item) => item.includes("区域合同不一致"))); const layerDrift = structuredClone(confirmed); layerDrift.coverage_audit.regions[1].layer = "foreground"; assert(validateManifest(layerDrift).some((item) => item.includes("区域合同不一致"))); });
test("独立生产必须使用 accepted/manual 确认且不得伪装拆解", () => { const valid = validManifest(); assert.deepEqual(validateManifest(valid, STRUCTURAL_FILE_GATE_OPTIONS), []); const forged = validManifest(); forged.coverage_audit.regions[1].confirmation.status = "pending"; assert(validateManifest(forged).some((item) => item.includes("status 必须为 accepted"))); });
test("运行数据和运行渲染区域不得声明 production_origin", () => { const manifest = validManifest(); manifest.coverage_audit.regions[0].production_origin = "independent-production"; assert(validateManifest(manifest).some((item) => item.includes("禁止声明 production_origin"))); });
test("coverage 与 fidelity 必须位于冻结目标范围", () => { const coverage = validManifest(); coverage.coverage_audit.regions[0].scene_id = "unknown-scene"; assert(validateManifest(coverage).some((item) => item.includes("scene_id 不在 reference_target"))); const fidelity = validManifest(); fidelity.fidelity_cases[0].state_id = "unknown-state"; assert(validateManifest(fidelity).some((item) => item.includes("state_id 不在 reference_target"))); });
test("coverage 完整性拒绝 1x1、缺目标状态和越界区域", () => { const tiny = validManifest(); tiny.coverage_audit.regions = [{ ...tiny.coverage_audit.regions[0], bounds: { x: 0, y: 0, width: 1, height: 1 } }]; assert(validateManifest(tiny).some((item) => item.includes("并集面积不足"))); const missing = validManifest(); missing.reference_target.state_ids.push("paused"); assert(validateManifest(missing).some((item) => item.includes("缺少目标组合"))); const overflow = validManifest(); overflow.coverage_audit.regions[1].bounds.x = 380; assert(validateManifest(overflow).some((item) => item.includes("bounds 超出目标画布"))); });
test("coverage 重叠矩形不得重复累计为完整画布", () => { const manifest = validManifest(); manifest.coverage_audit.regions = [structuredClone(manifest.coverage_audit.regions[0]), structuredClone(manifest.coverage_audit.regions[0])]; manifest.coverage_audit.regions[0].bounds = { x: 0, y: 0, width: 390, height: 422 }; manifest.coverage_audit.regions[1].id = "region-overlap"; manifest.coverage_audit.regions[1].bounds = { x: 0, y: 0, width: 390, height: 422 }; assert(validateManifest(manifest).some((item) => item.includes("矩形并集面积不足"))); });
test("固定视觉必须映射资源且资产必须反向绑定区域", () => { const missing = validManifest(); missing.coverage_audit.regions[1].asset_id = "unknown"; assert(validateManifest(missing).some((item) => item.includes("缺少已声明正式资源"))); const stale = validManifest(); stale.assets[0].coverage_region_ids = ["region-score"]; assert(validateManifest(stale).some((item) => item.includes("未映射到该资源"))); });
test("固定视觉覆盖映射必须双向完全一致", () => { const manifest = validManifest(); manifest.coverage_audit.regions.push({ ...structuredClone(manifest.coverage_audit.regions[1]), id: "region-hero-shadow" }); assert(validateManifest(manifest).some((item) => item.includes("缺少映射到该资源"))); });
test("资产 coverage_region_ids 不得重复", () => { const manifest = validManifest(); manifest.assets[0].coverage_region_ids.push("region-hero"); assert(validateManifest(manifest).some((item) => item.includes("coverage_region_ids 不得重复"))); });
test("effect-image 清单允许同时包含未映射普通资产", () => { const manifest = validManifest(); const ordinary = { ...manifest.assets[0], id: "boot-logo", texture_key: "boot-logo", scene_id: "boot", runtime_outputs: ["public/assets/boot-logo.png"] }; delete ordinary.ownership_type; delete ordinary.coverage_region_ids; manifest.assets.push(ordinary); assert.deepEqual(validateManifest(manifest, STRUCTURAL_FILE_GATE_OPTIONS), []); });
test("孤立还原字段不得伪造映射", () => { const manifest = validManifest(); const isolated = { ...manifest.assets[0], id: "boot-logo", texture_key: "boot-logo", scene_id: "boot", runtime_outputs: ["public/assets/boot-logo.png"], coverage_region_ids: ["region-hero"] }; manifest.assets.push(isolated); assert(validateManifest(manifest).some((item) => item.includes("未被 fixed coverage 引用"))); });
test("人工确认必须绑定标注、提案和决定文件及 SHA", () => { const manifest = validManifest(); manifest.coverage_audit.regions[0].confirmation = { confirmation_schema: "visual-decomposition-confirmation/1.0", status: "accepted", confirmation_mode: "manual" }; const errors = validateManifest(manifest); assert(errors.some((item) => item.includes("proposal_file"))); assert(errors.some((item) => item.includes("annotation_sha256"))); assert(errors.some((item) => item.includes("decision_record_file"))); });
test("拆解区域身份哈希对属性顺序稳定且拒绝所有权漂移", () => { const manifest = bitmapManifest(); const region = manifest.coverage_audit.regions[1]; const hash = computeRegionDefinitionSha256(region); const reordered = structuredClone(region); reordered.bounds = { height: region.bounds.height, width: region.bounds.width, y: region.bounds.y, x: region.bounds.x }; assert.equal(computeRegionDefinitionSha256(reordered), hash); for (const field of ["owner_id", "asset_id", "production_origin"]) { const changed = structuredClone(region); changed[field] = `${changed[field]}-changed`; assert.notEqual(computeRegionDefinitionSha256(changed), hash); } });
test("拆解资产只有显式 图像生成 才要求 AI 路线且独立生产不得直接复用冻结原图", () => { const bitmap = validManifest(); const region = bitmap.coverage_audit.regions[1]; region.production_origin = "bitmap-decomposition"; region.production_method = "image-generation"; region.delivery_kind = "raster-image"; region.image_generation_required = true; region.generation_record_required = true; const asset = bitmap.assets[0]; asset.production_origin = "bitmap-decomposition"; asset.production_method = "image-generation"; asset.delivery_kind = "raster-image"; asset.image_generation_required = true; asset.generation_record_required = true; assert(validateManifest(bitmap).some((item) => item.includes("route 必须为 ai-composite-raster"))); const independent = validManifest(); independent.assets[0].source_file = independent.reference_target.original_file; assert(validateManifest(independent).some((item) => item.includes("不得直接把冻结效果图"))); });
test("重复合同领域、覆盖和 fidelity ID 失败", () => { const gate = validManifest(); gate.contract_reconciliation.checks.push(structuredClone(gate.contract_reconciliation.checks[0])); assert(validateManifest(gate).some((item) => item.includes("domain 重复"))); const coverage = validManifest(); coverage.coverage_audit.regions.push(structuredClone(coverage.coverage_audit.regions[0])); assert(validateManifest(coverage).some((item) => item.includes("id 重复"))); const fidelity = validManifest(); fidelity.fidelity_cases.push(structuredClone(fidelity.fidelity_cases[0])); assert(validateManifest(fidelity).some((item) => item.includes("id 重复"))); });
test("parity 身份变化使旧证据失效", () => { const target = validManifest(); target.fidelity_cases[0].target_sha256 = `sha256:${"3".repeat(64)}`; assert(validateManifest(target).some((item) => item.includes("冻结目标 SHA 不一致"))); const candidate = validManifest(); candidate.fidelity_cases[0].candidate_sha256 = `sha256:${"4".repeat(64)}`; assert(validateManifest(candidate).some((item) => item.includes("当前候选 SHA 不一致"))); });
test("fidelity 必须绑定根视觉基线版本", () => { const manifest = validManifest(); manifest.fidelity_cases[0].visual_baseline_version = "2.0.0"; assert(validateManifest(manifest).some((item) => item.includes("根 visual_baseline.version"))); });
test("所有资源状态都要求场景归属", () => { for (const status of ["planned", "producing", "review", "accepted", "rejected", "replaced"]) { const manifest = validManifest(); manifest.assets[0].status = status; delete manifest.assets[0].scene_id; assert(validateManifest(manifest).some((item) => item.includes("scene_id 或 shared")), status); } });
test("公共资源要求稳定复用或运行必需", () => { const valid = validManifest(); delete valid.assets[0].scene_id; valid.assets[0].shared = true; valid.assets[0].shared_scene_ids = ["main-gameplay", "result"]; assert.deepEqual(validateManifest(valid, STRUCTURAL_FILE_GATE_OPTIONS), []); const oneScene = validManifest(); delete oneScene.assets[0].scene_id; oneScene.assets[0].shared = true; oneScene.assets[0].shared_scene_ids = ["main-gameplay"]; assert(validateManifest(oneScene).some((item) => item.includes("至少两个"))); const runtime = validManifest(); delete runtime.assets[0].scene_id; runtime.assets[0].shared = true; runtime.assets[0].shared_reason = "runtime-required"; assert.deepEqual(validateManifest(runtime, STRUCTURAL_FILE_GATE_OPTIONS), []); });
test("场景归属与公共归属不得混用", () => { const manifest = validManifest(); manifest.assets[0].shared = true; manifest.assets[0].shared_scene_ids = ["main-gameplay", "result"]; assert(validateManifest(manifest).some((item) => item.includes("二选一"))); });
test("重复纹理键和输出路径同时报告", () => { const manifest = validManifest(); manifest.assets.push({ ...manifest.assets[0], id: "hero-run" }); const errors = validateManifest(manifest); assert(errors.some((item) => item.includes("texture_key 重复"))); assert(errors.some((item) => item.includes("路径重复"))); });
test("已验收资源要求证据", () => { const manifest = validManifest(); delete manifest.assets[0].threejs_evidence; assert(validateManifest(manifest).some((item) => item.includes("threejs_evidence"))); });
test("视觉基线必须存在且使用明确静态冻结语义", () => { const missing = validManifest(); delete missing.visual_baseline; assert(validateManifest(missing).includes("visual_baseline 必须是对象")); const draft = validManifest(); draft.visual_baseline.status = "draft"; assert(validateManifest(draft).some((item) => item.includes("global-static-baseline-frozen"))); const bare = validManifest(); bare.visual_baseline.status = "frozen"; assert(validateManifest(bare).some((item) => item.includes("global-static-baseline-frozen"))); });
test("风格指纹格式固定", () => { const manifest = validManifest(); manifest.visual_baseline.style_fingerprint = "sha256:ABC"; assert(validateManifest(manifest).some((item) => item.includes("64 位小写十六进制"))); });
test("阶段证据文档不得作为冻结基线哈希正文", () => { const manifest = validManifest(); manifest.visual_baseline.document = "docs/visual-design.md"; assert(validateManifest(manifest).some((item) => item.includes("不可变 docs/visual-baseline.md"))); });
test("资源基线绑定必须一致", () => { for (const [field, value] of [["visual_baseline_version", "2.0.0"], ["style_fingerprint", "sha256:drifted"]]) { const manifest = validManifest(); manifest.assets[0][field] = value; assert(validateManifest(manifest).some((item) => item.includes(`${field} 与`))); } });
test("AI 生成包字段完整", () => { assert.deepEqual(validateManifest(validAiManifest(), STRUCTURAL_FILE_GATE_OPTIONS), []); const manifest = validAiManifest(); delete manifest.assets[0].generation_record.global_prompt_prefix; assert(validateManifest(manifest).some((item) => item.includes("global_prompt_prefix"))); });
test("任意路线使用 generation_record 时必须提供完整公共生成身份", () => { const forged = validManifest(); delete forged.assets[0].source_file; forged.assets[0].generation_record = { x: 1 }; assert(validateManifest(forged).some((item) => item.includes("generation_record.record_id"))); const generated = validManifest(); delete generated.assets[0].source_file; generated.assets[0].generation_record = { record_id: "gen-1", generator: "aseprite-cli", generator_version: "1.3", created_at: "2026-08-15T00:00:00Z", command_or_recipe: "aseprite -b hero.aseprite --save-as hero.png", input_sources: ["spec:hero-idle"], parameters: { scale: 1 } }; assert.deepEqual(validateManifest(generated, STRUCTURAL_FILE_GATE_OPTIONS), []); });
test("预算必须是正数", () => { const manifest = validManifest(); manifest.budgets.max_texture_size = null; assert(validateManifest(manifest).some((item) => item.includes("max_texture_size 必须是正数"))); });
test("PNG 必须具备支持的 IHDR 组合和完整扫描行", () => { assert.deepEqual(readPngDimensions(minimalPng(1, 1)), { width: 1, height: 1 }); assert.equal(readPngDimensions(minimalPng(1, 1, Buffer.alloc(0))), null); assert.equal(readPngDimensions(minimalPng(1, 1, Buffer.from([5, 0, 0, 0, 0]))), null); });
