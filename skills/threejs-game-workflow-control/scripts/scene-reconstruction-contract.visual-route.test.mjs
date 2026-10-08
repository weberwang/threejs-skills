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

test("effect-image 每个 coverage region 在资源规划与 V5 运行验收均要求 visual_route_analysis", () => {
  for (const stage of ["V1", "V2", "V3", "V5"]) {
    const value = effectImageContract();
    delete value.coverage_regions[0].visual_route_analysis;
    const errors = validateSceneReconstructionContract(value, effectImageManifest(value), { stage });
    assert(errors.some((item) => item.includes("visual_route_analysis") && item.includes("region_id=hud")), `${stage}: ${errors.join("\n")}`);
  }
});

test("非整屏原子装配允许图片资产，旧整屏字段不得继续混入视觉路线", () => {
  const value = effectImageContract();
  assert.equal(value.coverage_regions[1].visual_route_analysis.selected_route, "image-asset");
  assert.deepEqual(validateSceneReconstructionContract(value, effectImageManifest(value), { stage: "V3" }), []);

  value.coverage_regions[1].visual_route_analysis.is_full_screen_capture = false;
  const legacyErrors = validateSceneReconstructionContract(value, effectImageManifest(value), { stage: "V3" });
  assert(legacyErrors.some((item) => item.includes("已从视觉来源路线移除") && item.includes("assembly_analysis")), legacyErrors.join("\n"));
});

test("全程序视觉路线必须提供绑定冻结目标且可复核的独立分析工件", async () => {
  const value = effectImageContract();
  for (const region of value.coverage_regions) {
    region.implementation_owner = "runtime-program";
    region.implementation_plan = { mode: "runtime-program" };
    region.fidelity_obligations = { geometry: "target-bound" };
    region.visual_route_analysis = {
      ...region.visual_route_analysis,
      element_type: "simple-geometry",
      visual_complexity: "simple",
      distinctive_visual: false,
      observed_features: ["纯色基础几何"], dynamic_requirements: { is_dynamic: true, description: "几何状态随运行时数据变化" },
      asset_first_decision: "native-allowed",
      selected_route: "threejs-native",
      final_owner: "runtime-program",
      implementation_plan_mode: "runtime-program",
      production_method: "threejs-graphics",
      delivery_kind: "runtime-drawing",
      native_suitability: { eligible: true, primitive_basis: ["pure-color", "basic-geometry"], evidence: [`evidence/route/${region.region_id}-native.json`] },
    };
  }
  const missing = validateSceneReconstructionContract(value, effectImageManifest(value), { stage: "V3" });
  assert(missing.some((item) => item.includes("all_native_justification")), missing.join("\n"));
  value.all_native_justification = allNativeJustification();
  assert.deepEqual(validateSceneReconstructionContract(value, effectImageManifest(value), { stage: "V3" }), []);

  value.all_native_justification.reviewed_region_ids = ["hud"];
  const incomplete = validateSceneReconstructionContract(value, effectImageManifest(value), { stage: "V3" });
  assert(incomplete.some((item) => item.includes("精确覆盖全部 coverage region")), incomplete.join("\n"));

  const projectRoot = await mkdtemp(join(tmpdir(), "all-native-analysis-"));
  const artifact = {
    analysis_schema: "all-native-visual-analysis/1.0",
    analysis_id: "all-native-review-1",
    producer_role: "independent-visual-reviewer",
    target_sha256: SHA,
    reviewed_region_ids: ["board", "hud"],
    conclusion: "all-native-eligible",
    region_findings: ["board", "hud"].map((region_id) => ({ region_id, eligible: true, observed_features: ["纯色基础几何"], primitive_basis: ["pure-color", "basic-geometry"], evidence: [`evidence/${region_id}.json`] })),
  };
  const artifactBytes = Buffer.from(JSON.stringify(artifact));
  await writeFile(join(projectRoot, "all-native-analysis.json"), artifactBytes);
  value.all_native_justification = allNativeJustification({ analysis_artifact_file: "all-native-analysis.json", analysis_artifact_sha256: `sha256:${createHash("sha256").update(artifactBytes).digest("hex")}` });
  assert.deepEqual(validateSceneVisualRouteContract(value, null, { stage: "V3", checkFiles: true, projectRoot }), []);

  value.all_native_justification.analysis_artifact_sha256 = SHA;
  const tampered = validateSceneVisualRouteContract(value, null, { stage: "V3", checkFiles: true, projectRoot });
  assert(tampered.some((item) => item.includes("工件 SHA-256 不匹配")), tampered.join("\n"));
});

test("特色按钮皮肤或背景框错误选择 ThreeJS 原生路线时阻断", () => {
  const button = effectImageContract();
  const buttonRegion = button.coverage_regions[0];
  buttonRegion.visual_route_analysis = {
    ...buttonRegion.visual_route_analysis,
    element_type: "button-skin",
    selected_route: "threejs-native",
    asset_first_decision: "native-allowed",
    final_owner: "runtime-program",
    implementation_plan_mode: "runtime-program",
    production_method: "threejs-graphics",
    delivery_kind: "runtime-drawing",
    distinctive_visual: true,
    native_suitability: { eligible: true, primitive_basis: ["basic-geometry"], evidence: ["evidence/route/button-native.json"] },
  };
  buttonRegion.implementation_owner = "runtime-program";
  buttonRegion.fidelity_obligations = { geometry: "target-bound" };
  const buttonErrors = validateSceneReconstructionContract(button, effectImageManifest(button), { stage: "V3" });
  assert(buttonErrors.some((item) => item.includes("独特视觉") && item.includes("等价性")), buttonErrors.join("\n"));

  const frame = effectImageContract();
  const frameRegion = frame.coverage_regions[1];
  frameRegion.visual_route_analysis = {
    ...frameRegion.visual_route_analysis,
    element_type: "background-frame",
    selected_route: "threejs-native",
    asset_first_decision: "native-allowed",
    final_owner: "runtime-program",
    implementation_plan_mode: "runtime-program",
    production_method: "threejs-graphics",
    delivery_kind: "runtime-drawing",
    distinctive_visual: true,
    native_suitability: { eligible: true, primitive_basis: ["basic-geometry"], evidence: ["evidence/route/frame-native.json"] },
  };
  frameRegion.implementation_owner = "runtime-program";
  frameRegion.fidelity_obligations = { geometry: "target-bound" };
  const frameErrors = validateSceneReconstructionContract(frame, effectImageManifest(frame), { stage: "V3" });
  assert(frameErrors.some((item) => item.includes("独特视觉") && item.includes("等价性")), frameErrors.join("\n"));
});

test("特色视觉提供精确等价性例外时可以通过原生路线", () => {
  const value = effectImageContract();
  const region = value.coverage_regions[0];
  region.implementation_owner = "runtime-program";
  region.implementation_plan = { mode: "runtime-program" };
  region.fidelity_obligations = { geometry: "target-bound" };
  region.visual_route_analysis = {
    ...region.visual_route_analysis,
    element_type: "button-skin",
    selected_route: "threejs-native",
    asset_first_decision: "native-allowed",
    final_owner: "runtime-program",
    implementation_plan_mode: "runtime-program",
    production_method: "threejs-graphics",
    delivery_kind: "runtime-drawing",
    distinctive_visual: true,
    native_suitability: {
      eligible: true,
      primitive_basis: ["pure-color", "basic-geometry"],
      evidence: ["evidence/route/button-native.json"],
      equivalence_evidence: ["evidence/route/button-equivalence.json"],
      tolerance_reference: "layout-tolerance",
    },
  };
  assert.deepEqual(validateSceneReconstructionContract(value, effectImageManifest(value), { stage: "V3" }), []);
});

test("静态非文本优先图片，动态进度与纹理 Sprite/NineSlice 分别走正确路线", () => {
  const geometry = effectImageContract();
  const geometryRegion = geometry.coverage_regions[1];
  geometryRegion.implementation_owner = "runtime-program";
  geometryRegion.implementation_plan = { mode: "runtime-program" };
  geometryRegion.fidelity_obligations = { geometry: "target-bound" };
  geometryRegion.visual_route_analysis = {
    ...geometryRegion.visual_route_analysis,
    element_type: "simple-geometry",
    visual_complexity: "simple",
    distinctive_visual: false,
    observed_features: ["纯色基础几何"],
    asset_first_decision: "native-allowed",
    selected_route: "threejs-native",
    final_owner: "runtime-program",
    implementation_plan_mode: "runtime-program",
    production_method: "threejs-graphics",
    delivery_kind: "runtime-drawing",
    native_suitability: { eligible: true, primitive_basis: ["pure-color", "basic-geometry"], evidence: ["evidence/route/geometry-native.json"] },
  };
  geometry.all_native_justification = allNativeJustification();
  const geometryErrors = validateSceneReconstructionContract(geometry, effectImageManifest(geometry), { stage: "V3" }); assert(geometryErrors.some((item) => item.includes("除文本外的静态视觉元素必须优先使用图片资产")), geometryErrors.join("\n"));

  const progress = structuredClone(geometry);
  progress.coverage_regions[1].visual_route_analysis = {
    ...progress.coverage_regions[1].visual_route_analysis,
    element_type: "progress-fill",
    observed_features: ["动态进度填充"],
    dynamic_requirements: { is_dynamic: true, description: "进度值随运行时数据变化" },
    native_suitability: { eligible: true, primitive_basis: ["progress-fill"], evidence: ["evidence/route/progress-native.json"] },
  };
  assert.deepEqual(validateSceneReconstructionContract(progress, effectImageManifest(progress), { stage: "V3" }), []);

  const texturedAsset = effectImageContract();
  texturedAsset.coverage_regions[1].visual_route_analysis.element_type = "sprite";
  texturedAsset.coverage_regions[1].scene_asset_usage.nine_slice = { policy: "texture-nine-slice", source: "board-surface" };
  assert.deepEqual(validateSceneReconstructionContract(texturedAsset, effectImageManifest(texturedAsset), { stage: "V3" }), []);
  const nineSliceAsset = structuredClone(texturedAsset);
  nineSliceAsset.coverage_regions[1].visual_route_analysis.element_type = "nine-slice";
  assert.deepEqual(validateSceneReconstructionContract(nineSliceAsset, effectImageManifest(nineSliceAsset), { stage: "V3" }), []);
});

test("语义相似图标没有精确身份时不得 reuse，混合区域必须退回 V1 重新拆分", () => {
  const similar = effectImageContract();
  const region = similar.coverage_regions[1];
  region.visual_route_analysis = {
    ...region.visual_route_analysis,
    element_type: "icon",
    selected_route: "image-asset",
    asset_first_decision: "asset-first",
    implementation_plan_mode: "reuse-existing",
    production_method: "reuse",
    delivery_kind: "existing-asset",
    reuse_suitability: { eligible: true, exact_asset_identity: { reason: "semantic-similar icon" }, evidence: ["evidence/route/icon-similar.json"] },
  };
  const similarErrors = validateSceneReconstructionContract(similar, effectImageManifest(similar), { stage: "V3" });
  assert(similarErrors.some((item) => item.includes("精确资产身份") && item.includes("语义相似")), similarErrors.join("\n"));

  // 独立 image-asset 与 threejs-native region 仍是合法混合场景合同，两者不再包装为单一区域路线。
  const independentRoutes = effectImageContract();
  assert.deepEqual(validateSceneReconstructionContract(independentRoutes, effectImageManifest(independentRoutes), { stage: "V3" }), []);

  const composite = effectImageContract();
  composite.coverage_regions[1].visual_route_analysis = {
    ...composite.coverage_regions[1].visual_route_analysis,
    selected_route: "composite",
    asset_first_decision: "composite-required",
    implementation_plan_mode: "asset-and-scene",
    final_owner: "runtime-program",
    production_method: "runtime-program",
    delivery_kind: "runtime-program",
  };
  composite.coverage_regions[1].implementation_owner = "runtime-program";
  composite.coverage_regions[1].fidelity_obligations = { geometry: "target-bound" };
  const compositeErrors = validateSceneReconstructionContract(composite, effectImageManifest(composite), { stage: "V3" });
  assert(compositeErrors.some((item) => item.includes("程序逻辑与独立视觉资产必须重新拆解")), compositeErrors.join("\n"));
  assert(compositeErrors.some((item) => item.includes("禁止单一 composite region 继续生产或验收")), compositeErrors.join("\n"));
  assert(compositeErrors.some((item) => item.includes("应退回阶段=V1/PROPOSAL")), compositeErrors.join("\n"));

  composite.coverage_regions[1].visual_route_analysis.composite_parts = [
    { part_id: "board-appearance", part_role: "appearance", selected_route: "image-asset", final_owner: "fixed-production-visual", production_method: "authored-raster", delivery_kind: "raster-image", evidence: ["evidence/route/board-appearance.json"] },
    { part_id: "board-behavior", part_role: "behavior", selected_route: "threejs-native", final_owner: "runtime-program", production_method: "runtime-program", delivery_kind: "runtime-program", evidence: ["evidence/route/board-behavior.json"] },
  ];
  const completeCompositeErrors = validateSceneReconstructionContract(composite, effectImageManifest(composite), { stage: "V3" });
  assert(completeCompositeErrors.some((item) => item.includes("程序逻辑与独立视觉资产必须重新拆解")), completeCompositeErrors.join("\n"));
  assert(completeCompositeErrors.some((item) => item.includes("禁止单一 composite region 继续生产或验收")), completeCompositeErrors.join("\n"));

  composite.coverage_regions[1].visual_route_analysis.composite_parts[0] = {
    ...composite.coverage_regions[1].visual_route_analysis.composite_parts[0],
    selected_route: "threejs-native",
    final_owner: "runtime-program",
    production_method: "threejs-graphics",
    delivery_kind: "runtime-drawing",
  };
  const stillBlocked = validateSceneReconstructionContract(composite, effectImageManifest(composite), { stage: "V3" });
  assert(stillBlocked.some((item) => item.includes("程序逻辑与独立视觉资产必须重新拆解")), stillBlocked.join("\n"));

  for (const [index, route] of [[1, "image-asset"], [0, "threejs-native"]]) {
    const legalRouteWithLegacyParts = effectImageContract();
    legalRouteWithLegacyParts.coverage_regions[index].visual_route_analysis.composite_parts = structuredClone(composite.coverage_regions[1].visual_route_analysis.composite_parts);
    const errors = validateSceneReconstructionContract(legalRouteWithLegacyParts, effectImageManifest(legalRouteWithLegacyParts), { stage: "V3" });
    assert(errors.some((item) => item.includes("程序逻辑与独立视觉资产必须重新拆解")), `${route}: ${errors.join("\n")}`);
    assert(errors.some((item) => item.includes("禁止单一区域闭环")), `${route}: ${errors.join("\n")}`);
    assert(errors.some((item) => item.includes("应退回阶段=V1/PROPOSAL")), `${route}: ${errors.join("\n")}`);
  }
});

test("文本视觉路线委托 text_decomposition，普通非 effect-image 合同仍不受新路线门影响", () => {
  const value = textEffectImageContract();
  value.coverage_regions[0].visual_route_analysis = {
    ...value.coverage_regions[0].visual_route_analysis,
    element_type: "text", dynamic_requirements: { is_dynamic: false, description: "固定标题文本" },
    text_decomposition_ref: "hud.title.label",
  };
  assert.deepEqual(validateSceneReconstructionContract(value, effectImageManifest(value), { stage: "V3" }), []);
  assert.deepEqual(validateSceneReconstructionContract(contract(), manifest(), { stage: "V3" }), []);
});

test("visual_route_analysis 必须与 coverage/实施计划/实施包字段一致", () => {
  const value = effectImageContract();
  value.coverage_regions[1].implementation_plan.mode = "runtime-program";
  const planErrors = validateSceneReconstructionContract(value, effectImageManifest(value), { stage: "V3" });
  assert(planErrors.some((item) => item.includes("implementation_plan.mode") && item.includes("visual_route_analysis")), planErrors.join("\n"));

  const boundManifest = effectImageManifest(effectImageContract());
  boundManifest.coverage_audit.regions[1].production_method = "threejs-graphics";
  const methodErrors = validateSceneReconstructionContract(boundManifest.scene_reconstruction_contract, boundManifest, { stage: "V3" });
  assert(methodErrors.some((item) => item.includes("coverage_audit region") && item.includes("production_method")), methodErrors.join("\n"));
});

test("三份场景 Schema 同步分离 assembly_analysis 与 visual_route_analysis", () => {
  const paths = [
    "skills/threejs-game-workflow-control/references/evidence-manifest.schema.json",
    "skills/threejs-game-workflow-control/references/implementation-package.schema.json",
    "skills/threejs-game-workflow-control/references/work-item.schema.json",
  ];
  const schemas = paths.map((path) => JSON.parse(readFileSync(path, "utf8")));
  const required = schemas.map((schema) => schema.$defs.sceneCoverageRegion.required);
  assert(required.every((fields) => fields.includes("visual_route_analysis")));
  assert(required.every((fields) => fields.includes("assembly_analysis")));
  assert.deepEqual(required[0], required[1]);
  assert.deepEqual(required[1], required[2]);
  assert.deepEqual(schemas[0].$defs.sceneVisualRouteAnalysis, schemas[1].$defs.sceneVisualRouteAnalysis);
  assert.deepEqual(schemas[1].$defs.sceneVisualRouteAnalysis, schemas[2].$defs.sceneVisualRouteAnalysis);
  assert.deepEqual(schemas[0].$defs.allNativeJustification, schemas[1].$defs.allNativeJustification);
  assert.deepEqual(schemas[1].$defs.allNativeJustification, schemas[2].$defs.allNativeJustification);
  assert(schemas.every((schema) => schema.$defs.allNativeJustification.required.includes("analysis_artifact_sha256")));
  assert(schemas.every((schema) => schema.$defs.allNativeJustification.required.includes("reviewed_region_ids")));
  assert(schemas.every((schema) => schema.$defs.sceneCoverageRegion.properties.visual_route_analysis.$ref === "#/$defs/sceneVisualRouteAnalysis"));
  assert(schemas.every((schema) => schema.$defs.sceneCoverageRegion.properties.assembly_analysis.$ref === "#/$defs/assemblyAnalysis"));
  assert(schemas.every((schema) => !schema.$defs.sceneVisualRouteAnalysis.required.includes("is_full_screen_capture")));
  assert(schemas.every((schema) => !Object.hasOwn(schema.$defs.sceneVisualRouteAnalysis.properties, "is_full_screen_capture")));
  assert(schemas.every((schema) => !schema.$defs.sceneVisualRouteAnalysis.properties.asset_first_decision.enum.includes("composite-required")));
  assert(schemas.every((schema) => !schema.$defs.sceneVisualRouteAnalysis.properties.selected_route.enum.includes("composite")));
  assert(schemas.every((schema) => !schema.$defs.sceneVisualRouteAnalysis.properties.implementation_plan_mode.enum.includes("asset-and-scene")));
  assert(schemas.every((schema) => !Object.hasOwn(schema.$defs.sceneVisualRouteAnalysis.properties, "composite_parts")));
});
