import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateDisplayLayerPlanning, validateSceneReconstructionContract, validateStructuredFidelityCases } from "./scene-reconstruction-contract.mjs";
import { validateSceneVisualRouteContract } from "./scene-visual-route-contract.mjs";
import { validateSceneAssetUsageContract, validateSceneCombinationPreacceptance, validateV5ProductionGate, validateVisualImplementationPackageBinding } from "./visual-production-contract.mjs"; import { computeLayoutAnnotationConfirmationSha256, computeLayoutUserMessageSha256 } from "./layout_annotation_confirmation.mjs";

import {
  SHA,
  LAYOUT_SHA,
  LAYOUT_DECOMPOSITION_VERSION,
  allNativeJustification,
  contract,
  manifest,
  displayLayerContract,
  fidelityCase,
  effectImageContract,
  effectImageManifest,
  textNode,
  textEffectImageContract,
  effectImageLayoutResults,
} from "./scene-reconstruction-contract.fixtures.mjs";

test("场景还原合同覆盖整屏构图和 runtime fidelity obligation", () => {
  const value = contract(); delete value.combination_preacceptance; assert.deepEqual(validateSceneReconstructionContract(value, manifest(), { stage: "V3" }), []);
  const missing = structuredClone(contract()); delete missing.coverage_regions[0].fidelity_obligations;
  assert(validateSceneReconstructionContract(missing, manifest(), { stage: "V3" }).some((item) => item.includes("fidelity obligations")));
});

test("场景合同只允许 scene master 常驻层，瞬态弹窗必须拆为独立工作项", () => {
  const missing = structuredClone(contract()); delete missing.display_layer_planning;
  assert(validateSceneReconstructionContract(missing, manifest(), { stage: "V1" }).some((item) => item.includes("display_layer_planning")));

  const transient = structuredClone(contract());
  const layer = transient.display_layer_planning.inventory[0];
  layer.layer_id = "pause-modal"; layer.type = "modal"; layer.persistence = "transient"; layer.in_scene_master = true; layer.states = [{ state_id: "open", required: true }];
  transient.display_layer_planning.scene_master.persistent_layer_ids = ["pause-modal"];
  const masterErrors = validateSceneReconstructionContract(transient, manifest(), { stage: "V1" });
  assert(masterErrors.some((item) => item.includes("瞬态显示层不属于场景工作项")));
});

test("独立 DISPLAY_LAYER 的 V5 仍必须提供宿主场景生命周期轨迹", () => {
  const value = displayLayerContract();
  const layer = value.display_layer_planning.inventory[0];
  delete layer.runtime_replay;
  const targetInfo = { sceneId: "main", stateId: "default", targetSha: SHA, viewport: { width: 390, height: 844 } };
  const errors = validateDisplayLayerPlanning(value.display_layer_planning, targetInfo, { stage: "V5", scope: "display-layer" });
  assert(errors.some((item) => item.includes("runtime_replay")));
  layer.runtime_replay = { status: "passed", host_scene_id: "main", same_screen_combination: true, steps: ["open", "interact", "close", "restore"].map((phase) => ({ phase, evidence: `evidence/display/pause-${phase}.json` })) };
  assert.deepEqual(validateDisplayLayerPlanning(value.display_layer_planning, targetInfo, { stage: "V5", scope: "display-layer" }), []);
});

test("正式实施包门按 executionUnits 区分场景与弹窗验收作用域", async () => {
  const root = await mkdtemp(join(tmpdir(), "display-layer-scope-"));
  const snapshot = {
    ...manifest(),
    schema_version: "1.5",
    effect_image_reconstruction: { applicability: "effect-image" },
    workItemId: "popup-work-item",
    candidateVersion: "candidate-1",
    scene_reconstruction_contract: displayLayerContract(),
  };
  const bytes = JSON.stringify(snapshot);
  const file = "popup-manifest.json";
  await writeFile(join(root, file), bytes);
  const basePackage = {
    visualProductionUnits: [],
    visualManifestFile: file,
    visualManifestSha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    workItemId: "popup-work-item",
    candidateVersion: "candidate-1",
    current_stage: "V2",
  };
  const displayErrors = validateVisualImplementationPackageBinding({ ...basePackage, executionUnits: [{ unitType: "DISPLAY_LAYER" }] }, { projectRoot: root });
  assert(!displayErrors.some((item) => item.includes("瞬态显示层不属于场景工作项")), displayErrors.join("\n"));
  const sceneErrors = validateVisualImplementationPackageBinding({ ...basePackage, executionUnits: [{ unitType: "SCENE" }] }, { projectRoot: root });
  assert(sceneErrors.some((item) => item.includes("瞬态显示层不属于场景工作项")), sceneErrors.join("\n"));
});

test("effect-image 布局拆解、双向 region 绑定、V5 几何和 V5 逐节点证据完整通过", () => {
  const sceneContract = effectImageContract();
  const targetManifest = effectImageManifest(sceneContract);
  assert.deepEqual(validateSceneReconstructionContract(sceneContract, targetManifest, { stage: "V3" }), []);
  assert.deepEqual(validateSceneCombinationPreacceptance(sceneContract, "V5", { effectImage: true, manifest: targetManifest }), []);
  const fidelity = fidelityCase({ layout_node_results: effectImageLayoutResults() });
  assert.deepEqual(validateStructuredFidelityCases([fidelity], targetManifest, { stage: "V5" }), []);

  // 同一布局身份也允许使用 layout_decomposition 顶层绑定，供旧布局清单迁移时保持单一结构。
  const direct = structuredClone(sceneContract);
  const directLayout = direct.layout_decomposition;
  delete directLayout.layout_binding;
  Object.assign(directLayout, { target_sha256: SHA, scene_id: "main", state_id: "default", target_viewport: { width: 390, height: 844 }, visual_baseline_version: "1.0.0", layout_contract_version: "layout-2.0", layout_contract_sha256: LAYOUT_SHA, layout_decomposition_version: LAYOUT_DECOMPOSITION_VERSION });
  for (const node of directLayout.layout_nodes) Object.assign(node, { target_sha256: SHA, scene_id: "main", state_id: "default", layout_contract_version: "layout-2.0" });
  assert.deepEqual(validateSceneReconstructionContract(direct, effectImageManifest(direct), { stage: "V3" }), []);
});

test("effect-image 缺少布局节点、反向绑定或越界 bounds 时阻断；普通合同不受影响", () => {
  const missing = effectImageContract();
  delete missing.coverage_regions[0].layout_node_ids;
  const missingErrors = validateSceneReconstructionContract(missing, effectImageManifest(missing), { stage: "V2" });
  assert(missingErrors.some((item) => item.includes("layout_node_ids")));

  const orphan = effectImageContract();
  orphan.coverage_regions[0].layout_node_ids = ["board-surface"];
  const orphanErrors = validateSceneReconstructionContract(orphan, effectImageManifest(orphan), { stage: "V2" });
  assert(orphanErrors.some((item) => item.includes("跨 region") || item.includes("反向声明") || item.includes("错绑")), orphanErrors.join("\n"));

  const outOfBounds = effectImageContract();
  outOfBounds.layout_decomposition.layout_nodes[0].target_bounds.x = -1;
  const boundsErrors = validateSceneReconstructionContract(outOfBounds, effectImageManifest(outOfBounds), { stage: "V2" });
  assert(boundsErrors.some((item) => item.includes("位于冻结目标画布内")));
  assert.deepEqual(validateSceneReconstructionContract(contract(), manifest(), { stage: "V3" }), []);
});

test("effect-image 父子布局允许多层关系，并拒绝缺父、循环和越界", () => {
  const nested = effectImageContract();
  nested.coverage_regions[1].layoutNodeIds.push("board-inner");
  nested.layout_decomposition.layout_nodes.push({ ...structuredClone(nested.layout_decomposition.layout_nodes[1]), layout_node_id: "board-inner", region_id: "board", reference_id: "board-surface", parent_layout_node_id: "board-surface", parent_target_bounds: { x: 20, y: 160, width: 350, height: 620 }, relative_position: { left: 20, right: 230, top: 20, bottom: 500 }, axis_alignment: { horizontal: "left", vertical: "top" }, self_anchor: "top-left", reference_anchor: "top-left", offset: { x: 20, y: 20 }, target_bounds: { x: 40, y: 180, width: 100, height: 100 } });
  nested.combination_preacceptance.layout_geometry.node_measurements.push({ layout_node_id: "board-inner", target_bounds: { x: 40, y: 180, width: 100, height: 100 }, actual_bounds: { x: 40, y: 180, width: 100, height: 100 }, delta: { x: 0, y: 0, width: 0, height: 0 }, tolerance_reference: "layout-tolerance", result: "passed", evidence: ["board-inner-layout.json"] });
  assert.deepEqual(validateSceneReconstructionContract(nested, effectImageManifest(nested), { stage: "V2" }), []);

  const missingParent = effectImageContract();
  delete missingParent.layout_decomposition.layout_nodes[0].parent_layout_node_id;
  assert(validateSceneReconstructionContract(missingParent, effectImageManifest(missingParent), { stage: "V2" }).some((item) => item.includes("parent_layout_node_id")));

  const cycle = effectImageContract();
  cycle.layout_decomposition.layout_nodes[0].parent_layout_node_id = "board-surface";
  cycle.layout_decomposition.layout_nodes[0].reference_id = "board-surface";
  cycle.layout_decomposition.layout_nodes[0].parent_target_bounds = { x: 20, y: 160, width: 350, height: 620 };
  cycle.layout_decomposition.layout_nodes[1].parent_layout_node_id = "hud-main";
  cycle.layout_decomposition.layout_nodes[1].reference_id = "hud-main";
  cycle.layout_decomposition.layout_nodes[1].parent_target_bounds = { x: 0, y: 0, width: 390, height: 96 };
  assert(validateSceneReconstructionContract(cycle, effectImageManifest(cycle), { stage: "V2" }).some((item) => item.includes("父子布局图存在循环")));

  const childOutside = effectImageContract();
  childOutside.layout_decomposition.layout_nodes[1].parent_layout_node_id = "hud-main";
  childOutside.layout_decomposition.layout_nodes[1].reference_id = "hud-main";
  childOutside.layout_decomposition.layout_nodes[1].parent_target_bounds = { x: 0, y: 0, width: 390, height: 96 };
  assert(validateSceneReconstructionContract(childOutside, effectImageManifest(childOutside), { stage: "V2" }).some((item) => item.includes("child target_bounds")));
});

test("effect-image 相对距离、视觉对齐、offset 和锚点均不得伪造", () => {
  for (const mutate of [
    (node) => { node.relative_position.left += 1; },
    (node) => { node.axis_alignment.horizontal = "right"; },
    (node) => { node.offset.x = 999; },
    (node) => { node.self_anchor = "center-center"; },
    (node) => { node.reference_anchor = "center-center"; },
  ]) {
    const value = effectImageContract();
    mutate(value.layout_decomposition.layout_nodes[0]);
    assert(validateSceneReconstructionContract(value, effectImageManifest(value), { stage: "V2" }).some((item) => item.includes("relative_position") || item.includes("axis_alignment") || item.includes("offset.x") || item.includes("self_anchor") || item.includes("reference_anchor")));
  }
});

test("effect-image 两处布局 binding 必须共享完整身份并绑定冻结目标", () => {
  const missingResponsiveHash = effectImageContract();
  delete missingResponsiveHash.responsive_contract.layout_contract_binding.layout_contract_sha256;
  const missingResponsiveErrors = validateSceneReconstructionContract(missingResponsiveHash, effectImageManifest(missingResponsiveHash), { stage: "V2" });
  assert(missingResponsiveErrors.some((item) => item.includes("responsive_contract layout binding") && item.includes("layout_contract_sha256")), missingResponsiveErrors.join("\n"));

  const missingTargetVersion = effectImageContract();
  delete missingTargetVersion.target_conditions.layout_decomposition_version;
  const missingTargetErrors = validateSceneReconstructionContract(missingTargetVersion, effectImageManifest(missingTargetVersion), { stage: "V2" });
  assert(missingTargetErrors.some((item) => item.includes("target_conditions.layout_decomposition_version")), missingTargetErrors.join("\n"));

  const missingDecompositionVersion = effectImageContract();
  delete missingDecompositionVersion.layout_decomposition.layout_binding.layout_decomposition_version;
  const missingDecompositionErrors = validateSceneReconstructionContract(missingDecompositionVersion, effectImageManifest(missingDecompositionVersion), { stage: "V2" });
  assert(missingDecompositionErrors.some((item) => item.includes("layout_decomposition binding") && item.includes("layout_decomposition_version")), missingDecompositionErrors.join("\n"));

  const invalidHash = effectImageContract();
  invalidHash.layout_decomposition.layout_binding.layout_contract_sha256 = "sha256:" + "B".repeat(64);
  const invalidHashErrors = validateSceneReconstructionContract(invalidHash, effectImageManifest(invalidHash), { stage: "V2" });
  assert(invalidHashErrors.some((item) => item.includes("layout_decomposition binding") && item.includes("layout_contract_sha256 格式无效")), invalidHashErrors.join("\n"));

  const mismatchedBinding = effectImageContract();
  mismatchedBinding.layout_decomposition.layout_binding.layout_decomposition_version = "layout-decomposition-2";
  const mismatchedBindingErrors = validateSceneReconstructionContract(mismatchedBinding, effectImageManifest(mismatchedBinding), { stage: "V2" });
  assert(mismatchedBindingErrors.some((item) => item.includes("两个") || item.includes("不一致")), mismatchedBindingErrors.join("\n"));

  const mismatchedViewport = effectImageContract();
  mismatchedViewport.responsive_contract.layout_contract_binding.target_viewport = { width: 393, height: 852 };
  delete mismatchedViewport.responsive_contract.layout_contract_binding.viewport;
  const mismatchedViewportErrors = validateSceneReconstructionContract(mismatchedViewport, effectImageManifest(mismatchedViewport), { stage: "V2" });
  assert(mismatchedViewportErrors.some((item) => item.includes("viewport") && item.includes("不一致")), mismatchedViewportErrors.join("\n"));

  const mismatchedTarget = effectImageContract();
  mismatchedTarget.target_conditions.layout_contract_sha256 = "sha256:" + "c".repeat(64);
  const mismatchedTargetErrors = validateSceneReconstructionContract(mismatchedTarget, effectImageManifest(mismatchedTarget), { stage: "V2" });
  assert(mismatchedTargetErrors.some((item) => item.includes("layout_contract_sha256 与冻结目标不一致")), mismatchedTargetErrors.join("\n"));

  const rootIdentity = effectImageContract();
  rootIdentity.layout_identity = structuredClone(rootIdentity.layout_decomposition.layout_binding);
  assert.deepEqual(validateSceneReconstructionContract(rootIdentity, effectImageManifest(rootIdentity), { stage: "V2" }), []);
  rootIdentity.layout_identity.layout_decomposition_version = "layout-decomposition-root-drift";
  const rootErrors = validateSceneReconstructionContract(rootIdentity, effectImageManifest(rootIdentity), { stage: "V2" });
  assert(rootErrors.some((item) => item.includes("scene contract root") && item.includes("layout_decomposition_version")), rootErrors.join("\n"));

  assert.deepEqual(validateSceneReconstructionContract(contract(), manifest(), { stage: "V3" }), []);
});

test("V5 正式组合布局几何必须覆盖全部节点并拒绝 unknown 或缺证据", () => {
  const sceneContract = effectImageContract();
  const targetManifest = effectImageManifest(sceneContract);
  const v5Missing = structuredClone(sceneContract);
  v5Missing.combination_preacceptance.layout_geometry.node_measurements.pop();
  const v5Errors = validateSceneCombinationPreacceptance(v5Missing, "V5", { effectImage: true, manifest: targetManifest });
  assert(v5Errors.some((item) => item.includes("缺少 layout node 实际测量")));

  const fidelity = fidelityCase({ layout_node_results: effectImageLayoutResults() });
  fidelity.layout_node_results[1].result = "unknown";
  const fidelityErrors = validateStructuredFidelityCases([fidelity], targetManifest, { stage: "V5" });
  assert(fidelityErrors.some((item) => item.includes("result 不能为 unknown/unverified/missing")));
  const missingEvidence = fidelityCase({ layout_node_results: effectImageLayoutResults() });
  delete missingEvidence.layout_node_results[0].evidence;
  const evidenceErrors = validateStructuredFidelityCases([missingEvidence], targetManifest, { stage: "V5" });
  assert(evidenceErrors.some((item) => item.includes("缺少 layout diff evidence")));
});

test("场景目标和 fidelity DPR 允许动态有效值并拒绝非法声明", () => {
  for (const dpr of [0.5, 1, 1.25, 1.5, 2]) {
    const target = structuredClone(contract());
    target.target_conditions.dpr = dpr;
    assert.deepEqual(validateSceneReconstructionContract(target, manifest(), { stage: "V3" }), [], `target dpr=${dpr}`);
    const fidelity = fidelityCase({ dpr, normalization_equivalence: { viewport: { target: { width: 390, height: 844 }, candidate: { width: 390, height: 844 }, equivalent: true }, dpr: { target: dpr, candidate: dpr, equivalent: true }, logical_coordinates: { target: "logical-px", candidate: "logical-px", equivalent: true } } });
    assert.deepEqual(validateStructuredFidelityCases([fidelity], manifest(), { stage: "V5" }), [], `fidelity dpr=${dpr}`);
  }
  for (const dpr of [0, -1, 2.0001, 3, "2", NaN, Infinity]) {
    const target = structuredClone(contract()); target.target_conditions.dpr = dpr;
    assert(validateSceneReconstructionContract(target, manifest(), { stage: "V3" }).some((item) => item.includes("正有限数字且不超过 2")), `target dpr=${dpr}`);
    const fidelity = fidelityCase({ dpr });
    assert(validateStructuredFidelityCases([fidelity], manifest(), { stage: "V5" }).some((item) => item.includes("正有限数字且不超过 2")), `fidelity dpr=${dpr}`);
  }
});

test("normalization_equivalence.dpr 必须是有效且相等的 target/candidate 并明确 equivalent=true", () => {
  for (const proof of [{ target: 1, candidate: 2, equivalent: true }, { target: 2, candidate: 2.0001, equivalent: true }, { target: 1, candidate: 1, equivalent: "true" }, { target: 0, candidate: 0, equivalent: true }]) {
    const errors = validateStructuredFidelityCases([fidelityCase({ normalization_equivalence: { ...fidelityCase().normalization_equivalence, dpr: proof } })], manifest(), { stage: "V5" });
    assert(errors.some((item) => item.includes("DPR 等价证明必须使用有效 DPR")), JSON.stringify(proof));
  }
});

test("V1 冲突记录和 V2 拆解图确认/技术拆解/生产合同均为硬门", () => {
  const missingConflict = structuredClone(contract()); delete missingConflict.reference_technical_conflicts;
  assert(validateSceneReconstructionContract(missingConflict, manifest(), { stage: "V1" }).some((item) => item.includes("参考与技术硬约束冲突记录") && item.includes("方案缺失")));
  const missingV2 = structuredClone(contract()); delete missingV2.technical_decomposition;
  const errors = validateSceneReconstructionContract(missingV2, manifest(), { stage: "V3" });
  assert(errors.some((item) => item.includes("V2 还原方案缺少 技术拆解 JSON") && item.includes("应退回阶段=V1/PROPOSAL")), errors.join("\n"));
  assert(errors.every((item) => !item.includes("V2 还原方案缺少 技术拆解 JSON") || item.includes("方案缺失")));
});

test("requiredString 缺失错误保留完整场景上下文、证据和最早退回阶段", () => {
  const value = structuredClone(contract()); delete value.target_conditions.locale;
  const error = validateSceneReconstructionContract(value, manifest(), { stage: "V3" }).find((item) => item.includes("冻结目标 locale"));
  assert(error?.includes("[V3]") && error.includes("scene/state=main/default") && error.includes("annotation_number=*") && error.includes("region_id=*") && error.includes("缺失视觉事实") && error.includes("预期证据=") && error.includes("实际证据=missing") && error.includes("应退回阶段=V1/PROPOSAL") && error.includes("方案缺失"), error);
  const executionError = validateSceneAssetUsageContract({}, {}, "V5")[0];
  assert(executionError?.includes("验收问题") && executionError.includes("应退回阶段=V2/V3"), executionError);
});

/** 覆盖中心点默认锚点、非法坐标，以及非中心例外原因与坐标换算必须同时声明的边界。 */
test("scene_asset_usage 默认使用中心 origin，非中心坐标必须说明原因和换算", () => {
  const baseRegion = contract().coverage_regions[1];
  assert.deepEqual(validateSceneAssetUsageContract(baseRegion, {}, "V5"), []);

  const invalidOrigins = [
    undefined,
    { x: 0.5 },
    { x: "0.5", y: 0.5 },
    { x: NaN, y: 0.5 },
    { x: 1.01, y: 0.5 },
    { x: 0.5, y: -0.01 },
  ];
  for (const origin of invalidOrigins) {
    const region = structuredClone(baseRegion);
    if (origin === undefined) delete region.scene_asset_usage.origin;
    else region.scene_asset_usage.origin = origin;
    assert(validateSceneAssetUsageContract(region, {}, "V5").some((error) => error.includes("origin")), `origin=${String(origin)}`);
  }

  const offCenter = structuredClone(baseRegion);
  offCenter.scene_asset_usage.origin = { x: 0.25, y: 0.5 };
  let errors = validateSceneAssetUsageContract(offCenter, {}, "V5");
  assert(errors.some((error) => error.includes("origin_exception_reason")), errors.join("\n"));
  assert(errors.some((error) => error.includes("origin_coordinate_conversion")), errors.join("\n"));

  offCenter.scene_asset_usage.origin_exception_reason = "目标美术明确要求从左侧边缘对齐";
  errors = validateSceneAssetUsageContract(offCenter, {}, "V5");
  assert(errors.some((error) => error.includes("origin_coordinate_conversion")), errors.join("\n"));
  offCenter.scene_asset_usage.origin_coordinate_conversion = "按目标边界宽度乘以 x=0.25 换算运行时锚点";
  assert.deepEqual(validateSceneAssetUsageContract(offCenter, {}, "V5"), []);
});

test("未绑定 target SHA 的旧布局合同返回 V1", () => {
  const value = structuredClone(contract()); value.responsive_contract.layout_contract_binding.target_sha256 = "sha256:" + "b".repeat(64);
  const errors = validateSceneReconstructionContract(value, manifest(), { stage: "V3" });
  assert(errors.some((item) => item.includes("未绑定当前 target SHA") && item.includes("V1/PROPOSAL")));
});

test("V5 fidelity 拒绝字符串 tolerance、尺寸不等价和缺逐区域矩阵", () => {
  const item = { id: "case-1", target_identity: { sha256: SHA }, candidate_identity: { sha256: SHA, diff_fingerprint: "diff-1" }, scene_id: "main", state_id: "default", viewport: { width: 393, height: 852 }, dpr: 2, locale: "zh-CN", seed: 42, input_trace: "trace.json", stable_frame: "frame:1", original_target_size: { width: 390, height: 844 }, original_candidate_size: { width: 393, height: 852 }, normalization_transform: { type: "scale", scale_x: 1, scale_y: 1 }, normalized_comparison_canvas: { width: 390, height: 844 }, full_viewport_reference: "ref.png", full_viewport_candidate: "candidate.png", side_by_side_evidence: "side.png", overlay_evidence: "overlay.png", difference_evidence: "diff.png", tolerance: "any-string", conclusion: "passed" };
  const errors = validateStructuredFidelityCases([item], manifest(), { stage: "V5" });
  assert(errors.some((value) => value.includes("逐区域结果矩阵")));
  assert(errors.some((value) => value.includes("tolerance 必须是结构化")));
  const complete = structuredClone(item); complete.tolerance = { id: "layout-tolerance", geometry: { unit: "logical-px", value: 2 } }; complete.per_region_results = [{ region_id: "hud", target_measurement: { width: 100 }, candidate_measurement: { width: 100 }, delta: 0, tolerance: 2, result: "passed", evidence: ["hud.json"] }, { region_id: "board", target_measurement: { width: 100 }, candidate_measurement: { width: 100 }, delta: 0, tolerance: 2, result: "passed", evidence: ["board.json"] }];
  assert(validateStructuredFidelityCases([complete], manifest(), { stage: "V5" }).every((value) => !value.includes("逐区域结果矩阵")));
});

test("Implementation Package 未知 current_stage 不回落", () => {
  const errors = validateVisualImplementationPackageBinding({ visualProductionUnits: [], current_stage: "V9" });
  assert(errors.some((value) => value.includes("current_stage 未知") && value.includes("禁止静默回落")));
});

test("16 项资源 loaded/used 且 missing=0 仍不能掩盖整屏布局差异", () => {
  const fakePass = fidelityCase({
    loaded_assets: 16,
    used_assets: 16,
    missing: 0,
    per_region_results: [
      { region_id: "hud", target_measurement: { width: 390, height: 300 }, candidate_measurement: { width: 64, height: 48 }, delta: { width: 326, height: 252 }, tolerance: { value: 2 }, result: "passed", evidence: ["hud.json"] },
      { region_id: "board", target_measurement: { width: 350, height: 620 }, candidate_measurement: { width: 260, height: 180 }, delta: { width: 90, height: 440 }, tolerance: { value: 2 }, result: "passed", evidence: ["board.json"] },
    ],
  });
  const errors = validateStructuredFidelityCases([fakePass], manifest(), { stage: "V5" });
  assert(errors.some((value) => value.includes("未解释差异") || value.includes("PASS 不能掩盖")));
});

test("HUD、规则、棋盘和工具尺寸位置偏离时 V5 逐区域事实必须失败", () => {
  const item = fidelityCase({ per_region_results: [
    { region_id: "hud", target_measurement: { x: 0, y: 0, width: 390, height: 220 }, candidate_measurement: { x: 4, y: 4, width: 90, height: 24 }, delta: { x: 4, y: 4, width: 300, height: 196 }, tolerance: { value: 2 }, result: "failed", evidence: ["hud.json"] },
    { region_id: "board", target_measurement: { x: 20, y: 180, width: 350, height: 620 }, candidate_measurement: { x: 120, y: 420, width: 160, height: 180 }, delta: { x: 100, y: 240, width: 190, height: 440 }, tolerance: { value: 2 }, result: "failed", evidence: ["board.json"] },
  ], conclusion: "failed" });
  assert(validateStructuredFidelityCases([item], manifest(), { stage: "V5" }).some((value) => value.includes("未解释差异")));
});

test("runtime-program 区域没有完整 fidelity facts 时 V3 阻断", () => {
  const value = structuredClone(contract());
  delete value.coverage_regions[0].typography_facts;
  delete value.coverage_regions[0].fidelity_obligations;
  const errors = validateSceneReconstructionContract(value, manifest(), { stage: "V3" });
  assert(errors.some((item) => item.includes("typography facts")));
  assert(errors.some((item) => item.includes("fidelity obligations")));
});

test("V2→V3 继续使用未绑定 target SHA 的旧布局合同必须返回 V1", () => {
  const value = structuredClone(contract());
  value.responsive_contract.layout_contract_binding.target_sha256 = "sha256:" + "f".repeat(64);
  const errors = validateSceneReconstructionContract(value, manifest(), { stage: "V3" });
  assert(errors.some((item) => item.includes("未绑定当前 target SHA") && item.includes("应退回阶段=V1/PROPOSAL")));
});

test("V5 Fidelity Case 任意字符串 tolerance 不能作为项目容差", () => {
  const errors = validateStructuredFidelityCases([fidelityCase({ tolerance_set: "structured-layout-and-independent-review" })], manifest(), { stage: "V5" });
  assert(errors.some((item) => item.includes("tolerance 必须是结构化")));
});

test("结构化 fidelity 强制 code/build SHA、diff identity、等价证明和有效 difference evidence", () => {
  const noDiff = fidelityCase(); delete noDiff.candidate_identity.diff_fingerprint;
  assert(validateStructuredFidelityCases([noDiff], manifest(), { stage: "V5" }).some((item) => item.includes("diff identity")));
  const noProof = fidelityCase(); delete noProof.normalization_equivalence;
  assert(validateStructuredFidelityCases([noProof], manifest(), { stage: "V5" }).some((item) => item.includes("等价证明")));
  const nullDiffEvidence = fidelityCase({ difference_evidence: null });
  assert(validateStructuredFidelityCases([nullDiffEvidence], manifest(), { stage: "V5" }).some((item) => item.includes("difference evidence 无效")));
});

test("逐区域 tolerance 只引用场景预声明 ID，容差内可通过、超容差必须失败", () => {
  const within = fidelityCase({ per_region_results: [
    { region_id: "hud", target_measurement: { width: 100, height: 50 }, candidate_measurement: { width: 101, height: 50 }, delta: { width: 1 }, tolerance_reference: "layout-tolerance", result: "passed", evidence: ["hud.json"] },
    { region_id: "board", target_measurement: { width: 100, height: 50 }, candidate_measurement: { width: 100, height: 50 }, delta: 0, tolerance_reference: "layout-tolerance", result: "passed", evidence: ["board.json"] },
  ] });
  assert.deepEqual(validateStructuredFidelityCases([within], manifest(), { stage: "V5" }), []);
  const over = structuredClone(within); over.per_region_results[0].candidate_measurement.width = 104; over.per_region_results[0].delta.width = 4;
  assert(validateStructuredFidelityCases([over], manifest(), { stage: "V5" }).some((item) => item.includes("超出预声明 tolerance") && item.includes("验收问题")));
  const localValueOnly = structuredClone(within); delete localValueOnly.per_region_results[0].tolerance_reference;
  assert(validateStructuredFidelityCases([localValueOnly], manifest(), { stage: "V5" }).some((item) => item.includes("预声明 ID")));
});

test("853×1844 对 393×852 未记录归一化变换必须失败", () => {
  const item = fidelityCase({ original_target_size: { width: 853, height: 1844 }, original_candidate_size: { width: 393, height: 852 } });
  delete item.normalization_transform;
  const errors = validateStructuredFidelityCases([item], manifest(), { stage: "V5" });
  assert(errors.some((value) => value.includes("确定性归一化变换")));
});

test("完整参考图和候选图但缺逐区域矩阵必须失败", () => {
  const item = fidelityCase();
  delete item.per_region_results;
  const errors = validateStructuredFidelityCases([item], manifest(), { stage: "V5" });
  assert(errors.some((value) => value.includes("逐区域结果矩阵")));
});

test("正式 Scene 使用错误旧布局时 V5 同屏组合预验收失败", () => {
  const value = structuredClone(contract());
  value.combination_preacceptance.formal_scene_structure = "full-screen-image";
  const errors = validateSceneCombinationPreacceptance(value, "V5");
  assert(errors.some((item) => item.includes("禁止使用整屏截图")) && validateSceneCombinationPreacceptance({ ...value, combination_preacceptance: undefined }, "V5").some((item) => item.includes("combination_preacceptance")));
});

test("current_stage=V5 按 V5 解析，不回落为 V3", () => {
  const errors = validateVisualImplementationPackageBinding({ visualProductionUnits: [], current_stage: "V5" });
  assert(errors.some((value) => value.startsWith("[V5]")));
  assert(!errors.some((value) => value.startsWith("[V3]")));
});

test("V5 Implementation Package 使用完整 manifest 快照时继续执行 F2、fidelity 和 runtime gate", async () => {
  const root = await mkdtemp(join(tmpdir(), "scene-v4-gate-"));
  const snapshot = { schema_version: "1.5", effect_image_reconstruction: { applicability: "effect-image" }, workItemId: "work-item", candidateVersion: "candidate-1", reference_target: { target_sha256: SHA }, candidate_identity: { sha256: SHA, diff_fingerprint: "diff-1" }, assets: [], coverage_audit: { regions: [] }, visual_production_gate: { status: "passed" } };
  const bytes = JSON.stringify(snapshot); const file = "manifest.json"; await writeFile(join(root, file), bytes);
  const errors = validateVisualImplementationPackageBinding({ visualProductionUnits: [], visualManifestFile: file, visualManifestSha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, workItemId: "work-item", candidateVersion: "candidate-1", current_stage: "V5" }, { projectRoot: root, checkFiles: true });
  assert(errors.some((value) => value.includes("F2")), errors.join("\n"));
  assert(errors.some((value) => value.includes("fidelity_cases")), errors.join("\n"));
  assert(errors.some((value) => value.includes("runtime_consumption") || value.includes("runtime replay")), errors.join("\n"));
});

test("V5 Implementation Package 缺少 checkFiles=true 必须明确失败", () => {
  const errors = validateVisualImplementationPackageBinding({ visualProductionUnits: [], current_stage: "V5" }, { checkFiles: false });
  assert(errors.some((value) => value.includes("checkFiles=true") && value.includes("V5 FAIL")), errors.join("\n"));
});

test("完整 reconstruction/layout/V3/V5/F2/F3/V5 happy path 通过场景级门", () => {
  const value = contract();
  const targetManifest = manifest();
  const fidelity = fidelityCase();
  assert.deepEqual(validateSceneReconstructionContract(value, targetManifest, { stage: "V3" }), []);
  assert.deepEqual(validateSceneCombinationPreacceptance(value, "V5"), []);
  assert.deepEqual(validateSceneAssetUsageContract(value.coverage_regions[1], {}, "V5"), []);
  assert.deepEqual(validateStructuredFidelityCases([fidelity], targetManifest, { stage: "V5" }), []);
  const gateManifest = { ...targetManifest, scene_reconstruction_contract: value, fidelity_cases: [fidelity], candidate_identity: { sha256: SHA }, production_contract_audit: { status: "passed" }, visual_production_gate: { status: "passed", v2_status: "passed", v3_status: "passed", implementation_package_status: "passed", v5_status: "passed", f2_status: "passed", f2_machine_validation: { status: "passed", validationMode: "MACHINE", baselineHash: SHA, diffFingerprint: "diff-1" }, f3_status: "passed", runtime_replay: { status: "passed", evidence: "replay.json" }, fidelity_cases: [{ candidate_sha256: SHA, created_at: "2026-08-18T00:00:00Z", freshness_bound: true }], candidate_sha256: SHA, target_sha256: SHA, runtime_consumption: { status: "passed" } } };
  assert.deepEqual(validateV5ProductionGate(gateManifest, { requireSceneReconstruction: true }), []);
});

test("V3 资源阶段不要求正式 Scene 组合或文本 runtime verification", () => {
  const value = textEffectImageContract();
  delete value.combination_preacceptance;
  delete value.text_decomposition.text_nodes[0].runtime_verification;
  assert.deepEqual(validateSceneReconstructionContract(value, effectImageManifest(value), { stage: "V3" }), []);
});

test("动态或本地化文本误用 image-text 时阻断", () => {
  const value = textEffectImageContract({
    dynamic: true,
    localizable: true,
    implementation_route: "image-text",
    route_reason: "固定图中文字",
    ownership: "visual-asset",
    required_resources: [{ kind: "image", path: "assets/text/start.png", sha256: SHA }],
    accessible_semantic: { text: "开始游戏", role: "button" },
  });
  const errors = validateSceneReconstructionContract(value, effectImageManifest(value), { stage: "V3" });
  assert(errors.some((item) => item.includes("动态或本地化文本禁止使用 image-text")), errors.join("\n"));
});

test("文本节点未知 region、layout node 或 bounds 漂移时阻断", () => {
  const unknownRegion = textEffectImageContract({ region_id: "missing-region" });
  const regionErrors = validateSceneReconstructionContract(unknownRegion, effectImageManifest(unknownRegion), { stage: "V3" });
  assert(regionErrors.some((item) => item.includes("现有 coverage region")), regionErrors.join("\n"));

  const unknownLayout = textEffectImageContract({ layout_node_id: "missing-layout" });
  const layoutErrors = validateSceneReconstructionContract(unknownLayout, effectImageManifest(unknownLayout), { stage: "V3" });
  assert(layoutErrors.some((item) => item.includes("现有 layout node")), layoutErrors.join("\n"));

  const drifted = textEffectImageContract({ target_bounds: { x: 1, y: 0, width: 390, height: 96 } });
  const driftErrors = validateSceneReconstructionContract(drifted, effectImageManifest(drifted), { stage: "V3" });
  assert(driftErrors.some((item) => item.includes("target_bounds 必须与绑定 layout node 一致")), driftErrors.join("\n"));
});

test("threejs-text 缺少字体资源或 SHA 时阻断", () => {
  const value = textEffectImageContract({ required_resources: [{ kind: "font", path: "assets/fonts/game-sans.woff2", sha256: "sha256:invalid" }] });
  const errors = validateSceneReconstructionContract(value, effectImageManifest(value), { stage: "V3" });
  assert(errors.some((item) => item.includes("路径和合法 SHA-256") || item.includes("字体资产及 SHA-256")), errors.join("\n"));
});

test("V5 发现字体 fallback 或加载失败时阻断", () => {
  const value = textEffectImageContract();
  value.text_decomposition.text_nodes[0].runtime_verification.fallback_detected = true;
  const errors = validateSceneReconstructionContract(value, effectImageManifest(value), { stage: "V5" });
  assert(errors.some((item) => item.includes("fallback_detected=false")), errors.join("\n"));
});

test("显式 V5 文本验证执行 target/candidate/tolerance 比较并通过", () => {
  const value = textEffectImageContract();
  assert.deepEqual(validateSceneReconstructionContract(value, effectImageManifest(value), { stage: "V5" }), []);
});

test("显式 V5 文本验证发现超容差差异时阻断", () => {
  const value = textEffectImageContract();
  const runtime = value.text_decomposition.text_nodes[0].runtime_verification;
  runtime.actual_bounds.width = 394;
  runtime.candidate_bounds.width = 394;
  runtime.delta.width = 4;
  const errors = validateSceneReconstructionContract(value, effectImageManifest(value), { stage: "V5" });
  assert(errors.some((item) => item.includes("超出预声明 tolerance")), errors.join("\n"));
});

test("文本实际测试 ID 必须等于规划测试 ID", () => {
  const value = textEffectImageContract();
  value.text_decomposition.text_nodes[0].runtime_verification.actual_test_id = "tests/text/other";
  const errors = validateSceneReconstructionContract(value, effectImageManifest(value), { stage: "V5" });
  assert(errors.some((item) => item.includes("actual_test_id 必须等于 planned_test_id")), errors.join("\n"));
});

test("effect-image 无文本时必须使用 not-applicable 并提供 reason", () => {
  const value = effectImageContract();
  assert.deepEqual(validateSceneReconstructionContract(value, effectImageManifest(value), { stage: "V3" }), []);
  delete value.text_decomposition.reason;
  const errors = validateSceneReconstructionContract(value, effectImageManifest(value), { stage: "V3" });
  assert(errors.some((item) => item.includes("not-applicable 必须提供 reason")), errors.join("\n"));
});

test("bitmap-text 和 image-text 成功路径分别绑定所需资源与语义证据", () => {
  const bitmap = textEffectImageContract({
    implementation_route: "bitmap-text",
    route_reason: "有限字符集使用稳定的位图字形",
    required_resources: [
      { kind: "bitmap-font-descriptor", path: "assets/fonts/game.fnt", sha256: SHA },
      { kind: "bitmap-font-texture", path: "assets/fonts/game.png", sha256: SHA },
    ],
    runtime_verification: { ...textNode().runtime_verification, renderer: "bitmap-text" },
  });
  assert.deepEqual(validateSceneReconstructionContract(bitmap, effectImageManifest(bitmap), { stage: "V5" }), []);

  const image = textEffectImageContract({
    implementation_route: "image-text",
    route_reason: "品牌字标是固定图片资产",
    ownership: "visual-asset",
    required_resources: [{ kind: "image", path: "assets/text/start.png", sha256: SHA }],
    accessible_semantic: { text: "开始游戏", role: "button" },
    runtime_verification: {
      renderer: "image-text",
      actual_bounds: { x: 0, y: 0, width: 390, height: 96 },
      target_bounds: { x: 0, y: 0, width: 390, height: 96 },
      candidate_bounds: { x: 0, y: 0, width: 390, height: 96 },
      delta: { x: 0, y: 0, width: 0, height: 0 },
      tolerance_reference: "layout-tolerance",
      glyph_bounds: { x: 120, y: 28, width: 150, height: 38 },
      baseline: 40,
      actual_test_id: "tests/text/hud-title",
      evidence: ["evidence/text/hud-title-image.json"],
      passed: true,
      asset_consumed: true,
      semantic_evidence: ["evidence/text/hud-title-semantic.json"],
    },
  });
  assert.deepEqual(validateSceneReconstructionContract(image, effectImageManifest(image), { stage: "V5" }), []);
});
