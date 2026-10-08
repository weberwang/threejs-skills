import assert from "node:assert/strict";
import test from "node:test";
import { calculateComponentDisplaySize, validateImageGenerationSizeContract, validateImageGenerationSizeManifest } from "./visual-generation-size-contract.mjs";

const BASE_USAGE = {
  target_display_size: { width: 30, height: 20 },
  intended_scale_range: { min: 1, max: 1.5 },
  max_dpr: 2,
  padding_policy: "none",
};

/** 构造单个 图像生成 原子部件的最小场景合同。 */
function region(overrides = {}) {
  const component = {
    component_id: "hero",
    atomic_visual_key: "hero-atomic",
    role: "visual-component",
    reusable: true,
    placements: [
      { placement_id: "hero-1", bounds: { x: 0, y: 0, width: 30, height: 20 }, interaction_required: false },
    ],
  };
  const expected = { asset_id: "hero-default", asset_scope: "atomic-component", atomic_visual_key: "hero-atomic", component_id: "hero", state_id: "default", width: 90, height: 60 };
  return {
    annotation_number: 7,
    id: "region-hero",
    owner_type: "fixed-production-visual",
    production_method: "image-generation",
    image_generation_required: true,
    scene_asset_usage: structuredClone(BASE_USAGE),
    component_inventory: { granularity: "single-component", component_count: 1, visible_instance_count: 1, delivery_mode: "individual", atlas_allowed: false, created_at: "2026-08-19T00:00:00Z", components: [component] },
    expected_assets: [expected],
    ...overrides,
  };
}

/** 构造带声明尺寸的 图像生成 输出元数据。 */
function output(width = 90, height = 60) { return { width, height, mime_type: "image/png", alpha: true, sha256: `sha256:${"a".repeat(64)}` }; }

/** 运行单资产尺寸合同，统一传入当前 expected asset 和区域上下文。 */
function check(currentRegion, asset = output(), contract = currentRegion) {
  const expected = currentRegion.expected_assets[0];
  return validateImageGenerationSizeContract(asset, contract, { stage: "V3", annotation_number: currentRegion.annotation_number, region_id: currentRegion.id, component_id: expected.component_id, state_id: expected.state_id, asset_id: expected.asset_id, region: currentRegion }, { expectedAsset: expected });
}

test("正确的最小尺寸通过，尺寸合同不要求 human_review", () => {
  assert.deepEqual(check(region(), output()), []);
});

test("expected asset 小于最小尺寸失败", () => {
  const current = region({ expected_assets: [{ ...region().expected_assets[0], width: 89 }] });
  const errors = check(current, output(89, 60));
  assert(errors.some((item) => item.includes("精确使用机器计算的最小尺寸")));
});

test("expected asset 大于最小尺寸也失败，不能借大图放行", () => {
  const current = region({ expected_assets: [{ ...region().expected_assets[0], width: 91 }] });
  const errors = check(current, output(91, 60));
  assert(errors.some((item) => item.includes("精确使用机器计算的最小尺寸")));
});

test("max_dpr 缺失失败并包含完整定位上下文", () => {
  const current = region({ scene_asset_usage: { ...structuredClone(BASE_USAGE), max_dpr: undefined } });
  delete current.scene_asset_usage.max_dpr;
  const errors = check(current);
  assert(errors.some((item) => item.includes("max_dpr 必须严格为图片生产基线 2") && item.includes("annotation_number=7") && item.includes("component_id=hero") && item.includes("state_id=default") && item.includes("asset_id=hero-default")));
});

test("max_dpr 表示图片生产基线，只能为数字 2", () => {
  for (const maxDpr of [0.5, 1, 1.5, 3, "2"]) {
    const current = region({ scene_asset_usage: { ...structuredClone(BASE_USAGE), max_dpr: maxDpr } });
    const errors = check(current);
    assert(errors.some((item) => item.includes("max_dpr 必须严格为图片生产基线 2")), `max_dpr=${maxDpr}: ${errors}`);
  }
});

test("padding_policy 非 none 失败，不设计额外留白", () => {
  const errors = check(region({ scene_asset_usage: { ...structuredClone(BASE_USAGE), padding_policy: "bleed" } }));
  assert(errors.some((item) => item.includes("padding_policy=none")));
});

test("scale 非法失败", () => {
  const errors = check(region({ scene_asset_usage: { ...structuredClone(BASE_USAGE), intended_scale_range: { min: 2, max: 1 } } }));
  assert(errors.some((item) => item.includes("intended_scale_range")));
});

test("同一 component 的多 placement 按各轴最大值计算", () => {
  const current = region();
  current.component_inventory.components[0].placements = [
    { placement_id: "hero-1", bounds: { x: 0, y: 0, width: 11, height: 20 }, interaction_required: false },
    { placement_id: "hero-2", bounds: { x: 20, y: 0, width: 30, height: 9 }, interaction_required: false },
  ];
  current.scene_asset_usage.target_display_size = { width: 30, height: 20 };
  current.expected_assets[0].width = 90;
  current.expected_assets[0].height = 60;
  assert.deepEqual(check(current, output(90, 60)), []);
});

test("placement bounds 缺失失败", () => {
  const current = region();
  delete current.component_inventory.components[0].placements[0].bounds;
  const errors = check(current);
  assert(errors.some((item) => item.includes("placement[0] bounds") && item.includes("region_id=region-hero")));
});

test("非 图像生成 方法不受尺寸门影响", () => {
  const current = region({ production_method: "authored-raster", image_generation_required: false, scene_asset_usage: {} });
  assert.deepEqual(check(current, { width: 1, height: 1 }, current), []);
});

test("actual output 尺寸漂移被尺寸门拒绝", () => {
  const current = region();
  const errors = check(current, output(90, 60), current);
  assert.deepEqual(errors, []);
  const drift = validateImageGenerationSizeContract(null, current, { stage: "V4", annotation_number: 7, region_id: current.id, component_id: "hero", state_id: "default", asset_id: "hero-default" }, { expectedAsset: current.expected_assets[0], region: current, actualAsset: { width: 91, height: 60 } });
  assert(drift.some((item) => item.includes("实际输出尺寸漂移")));
});

test("manifest 尺寸门核对 V4 actual_assets，且不依赖 human_review", () => {
  const current = region();
  const manifest = {
    coverage_audit: { regions: [current] },
    assets: [{ id: "hero-default", width: 90, height: 60 }],
    production_contract_audit: { units: [{ annotation_number: 7, region_id: "region-hero", actual_assets: [{ asset_id: "hero-default", width: 91, height: 60 }] }] },
  };
  const errors = validateImageGenerationSizeManifest(manifest, { stage: "V4" });
  assert(errors.some((item) => item.includes("V4 actual_assets 实际输出尺寸漂移")));
});

test("组件显示尺寸计算返回各轴最大值", () => {
  const current = region();
  current.component_inventory.components[0].placements.push({ placement_id: "hero-2", bounds: { x: 0, y: 0, width: 41, height: 7 }, interaction_required: false });
  assert.deepEqual(calculateComponentDisplaySize(current, "hero", { stage: "V3", annotation_number: 7, region_id: current.id }).displaySize, { width: 41, height: 20 });
});
