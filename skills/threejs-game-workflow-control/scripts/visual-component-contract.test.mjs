import assert from "node:assert/strict";
import test from "node:test";
import { normalizeComponentExpectedAsset, normalizeComponentInventory, normalizeVisualComponentContract, validateVisualComponentContract, visualComponentContractDifferences } from "./visual-component-contract.mjs";

const nineSlice = { mode: "stretch", reason: "底板边角需要固定尺寸", source_size: { width: 96, height: 64 }, borders: { left: 12, right: 12, top: 10, bottom: 10 } };

test("组件、placement 和 expected asset 规范化时保留已冻结九宫格事实", () => {
  const inventory = normalizeComponentInventory({ components: [{
    component_id: "panel", role: "panel-frame", nine_slice_decision_required: true, nine_slice: nineSlice,
    placements: [{ placement_id: "panel-main", bounds: { x: 0, y: 0, width: 300, height: 180 }, nine_slice_decision_required: true, nine_slice: nineSlice }],
  }] });
  const component = inventory.components[0];
  assert.equal(component.nine_slice_decision_required, true);
  assert.deepEqual(component.nine_slice, nineSlice);
  assert.equal(component.placements[0].nine_slice_decision_required, true);
  assert.deepEqual(component.placements[0].nine_slice, nineSlice);
  assert.deepEqual(normalizeComponentExpectedAsset({ asset_id: "panel", component_id: "panel", nine_slice: nineSlice }).nine_slice, nineSlice);
});

test("V2 派生标记参与规范化身份，false 不能与 true 决策等价", () => {
  const region = { component_inventory: { components: [{ component_id: "panel", role: "panel-frame", nine_slice_decision_required: true, nine_slice: nineSlice, placements: [{ placement_id: "panel-main", nine_slice_decision_required: true, nine_slice: nineSlice }] }] }, expected_assets: [{ asset_id: "panel", component_id: "panel", nine_slice: nineSlice }] };
  const normalized = normalizeVisualComponentContract(region);
  assert.equal(normalized.component_inventory.components[0].nine_slice_decision_required, true);
  const bypassAttempt = structuredClone(region);
  bypassAttempt.component_inventory.components[0].nine_slice_decision_required = false;
  assert(visualComponentContractDifferences(region, bypassAttempt).includes("component_inventory"));
});

test("底板功能根在资产规范化和身份比较中保留渲染身份", () => {
  const region = { component_inventory: { components: [{
    component_id: "button", atomic_visual_key: "button", role: "button-skin",
    element_type: "container", is_container: true, render_kind: "sprite", reusable: false,
    placements: [{ placement_id: "button-main", render_kind: "sprite", bounds: { x: 0, y: 0, width: 96, height: 64 } }],
  }] } };
  const normalized = normalizeComponentInventory(region.component_inventory).components[0];
  assert.equal(normalized.element_type, "container");
  assert.equal(normalized.is_container, true);
  assert.equal(normalized.render_kind, "sprite");
  assert.equal(normalized.placements[0].render_kind, "sprite");
  const changed = structuredClone(region);
  delete changed.component_inventory.components[0].render_kind;
  assert(visualComponentContractDifferences(region, changed).includes("component_inventory"));
});

/** 构造只用于验证 V3 九宫格职责边界的最小生产区域。 */
function nineSliceRegion(role, layer = "hud", routeType = undefined) {
  return {
    id: "panel-region", owner_type: "fixed-production-visual", layer, safe_area_policy: "FULL_BLEED",
    bounds: { x: 0, y: 0, width: 320, height: 200 },
    ...(routeType ? { visual_route_analysis: { element_type: routeType } } : {}),
    component_inventory: { components: [{ component_id: "panel", role, nine_slice: nineSlice }] },
  };
}

test("V3沿用权威视觉路线判断角色冲突，并拒绝真实背景层和结构容器", () => {
  const skinErrors = validateVisualComponentContract(nineSliceRegion("background-frame"), { stage: "V3", region_id: "panel-region" });
  assert.equal(skinErrors.some((item) => item.includes("九宫格 stretch")), false);

  const routeOverrideErrors = validateVisualComponentContract(nineSliceRegion("background", "hud", "panel"), { stage: "V3", region_id: "panel-region" });
  assert.equal(routeOverrideErrors.some((item) => item.includes("九宫格 stretch")), false, "panel route 应覆盖可变 role 文本，与 V2/V3 判定一致");

  const backgroundErrors = validateVisualComponentContract(nineSliceRegion("background", "background", "panel"), { stage: "V3", region_id: "panel-region" });
  assert(backgroundErrors.some((item) => item.includes("九宫格 stretch")));

  const containerErrors = validateVisualComponentContract(nineSliceRegion("container", "hud", "panel"), { stage: "V3", region_id: "panel-region" });
  assert(containerErrors.some((item) => item.includes("九宫格 stretch")));
});

test("V3允许图片底板兼任九宫格容器，拒绝丢失图片身份的同一组件", () => {
  const region = nineSliceRegion("panel-frame");
  Object.assign(region.component_inventory.components[0], { element_type: "container", is_container: true, render_kind: "sprite" });
  assert.equal(validateVisualComponentContract(region, { stage: "V3", region_id: "panel-region" }).some((message) => /九宫格 stretch|render_kind/.test(message)), false);
  delete region.component_inventory.components[0].render_kind;
  assert(validateVisualComponentContract(region, { stage: "V3", region_id: "panel-region" }).some((message) => message.includes("render_kind")));
});
