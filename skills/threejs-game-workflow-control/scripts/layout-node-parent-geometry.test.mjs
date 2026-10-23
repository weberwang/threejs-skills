import assert from "node:assert/strict";
import test from "node:test";
import { axisAlignmentOffset, validateEffectImageParentChildLayoutNodes } from "./layout-node-parent-geometry.mjs";

const VIEWPORT = { width: 240, height: 160 };
const ROOT = { x: 0, y: 0, ...VIEWPORT };
const PANEL = { x: 40, y: 40, width: 120, height: 80 };

/** 构造有实际父框和独立定位参照的业务节点，供共享几何门验证。 */
function node(id, bounds, parent = "viewport", parentBounds = ROOT, reference = parent, referenceBounds = parentBounds) {
  const alignment = { horizontal: "left", vertical: "top" };
  return {
    layout_node_id: id, parent_layout_node_id: parent, reference_id: reference,
    target_bounds: bounds, parent_target_bounds: parentBounds, reference_target_bounds: referenceBounds,
    axis_alignment: alignment, self_anchor: "top-left", reference_anchor: "top-left",
    offset: axisAlignmentOffset(referenceBounds, bounds, alignment),
    relative_position: { left: bounds.x - parentBounds.x, right: parentBounds.x + parentBounds.width - bounds.x - bounds.width, top: bounds.y - parentBounds.y, bottom: parentBounds.y + parentBounds.height - bounds.y - bounds.height },
    ui_layout: { grouping_basis: ["POSITION"], layout_owner: "SELF", size_policy: "FIXED", overflow_policy: "KEEP_VISIBLE", safe_area_policy: "INSIDE_SAFE_AREA", interaction_policy: "NONE", ...(reference !== parent ? { position_reference_id: reference } : {}) },
  };
}

test("定位参照可以是兄弟，真实父级和相对父框距离保持独立", () => {
  const iconBounds = { x: 50, y: 50, width: 20, height: 20 };
  const nodes = [
    { ...node("panel", PANEL), is_container: true },
    node("icon", iconBounds, "panel", PANEL),
    node("label", { x: 75, y: 50, width: 40, height: 20 }, "panel", PANEL, "icon", iconBounds),
  ];
  assert.deepEqual(validateEffectImageParentChildLayoutNodes(nodes, VIEWPORT), []);
  nodes[2].reference_target_bounds = { ...iconBounds, x: 51 };
  assert(validateEffectImageParentChildLayoutNodes(nodes, VIEWPORT).some((item) => item.message.includes("reference_target_bounds")));
});

test("显式装饰溢出允许负父级边距，缺少理由仍失败", () => {
  const nodes = [
    { ...node("panel", PANEL), is_container: true },
    node("badge", { x: 150, y: 45, width: 20, height: 20 }, "panel", PANEL),
  ];
  assert(validateEffectImageParentChildLayoutNodes(nodes, VIEWPORT).some((item) => item.message.includes("child target_bounds")));
  nodes[1].ui_layout.visual_overflow = { reason: "广告角标突出底板右侧，点击归属仍为按钮" };
  assert.deepEqual(validateEffectImageParentChildLayoutNodes(nodes, VIEWPORT), []);
  assert.equal(nodes[0].target_bounds.width, 120);
});

test("业务节点不能伪装成根来跳过布局校验", () => {
  const business = { ...node("panel", PANEL), is_container: true, is_root_container: true };
  assert(validateEffectImageParentChildLayoutNodes([business], VIEWPORT).some((item) => item.message.includes("非 root")));
});
