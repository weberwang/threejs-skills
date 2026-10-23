import assert from "node:assert/strict";
import test from "node:test";
import { resolveLayoutRootBounds } from "./layout-root-bounds.mjs";

const VIEWPORT = { width: 390, height: 844 };
const SAFE_AREA = { x: 0, y: 47, width: 390, height: 763 };

test("一批节点共享实际安全区，缺少重复快照不会扩大为整屏", () => {
  const nodes = [
    { parent_layout_node_id: "safe-area", parent_target_bounds: SAFE_AREA },
    { parent_layout_node_id: "safe-area" },
    { parent_layout_node_id: "viewport", reference_id: "safe-area" },
  ];
  const roots = resolveLayoutRootBounds(nodes, VIEWPORT);
  assert.deepEqual(roots.get("safe-area"), SAFE_AREA);
  assert.deepEqual(roots.get("viewport"), { x: 0, y: 0, ...VIEWPORT });
  assert.notEqual(roots.get("safe-area"), SAFE_AREA);
});

test("安全区父级与参照必须消费同一个矩形", () => {
  assert.throws(() => resolveLayoutRootBounds([
    { parent_layout_node_id: "safe-area", parent_target_bounds: SAFE_AREA },
    { parent_layout_node_id: "viewport", reference_id: "safe-area", reference_target_bounds: { ...SAFE_AREA, height: 750 } },
  ], VIEWPORT), /根快照必须逐字段一致/);
});

test("安全区缺测量会失败，零inset允许显式声明整屏", () => {
  assert.throws(() => resolveLayoutRootBounds([{ parent_layout_node_id: "safe-area" }], VIEWPORT), /缺少实际 safe-area/);
  const full = { x: 0, y: 0, ...VIEWPORT };
  assert.deepEqual(resolveLayoutRootBounds([{ parent_layout_node_id: "safe-area", parent_target_bounds: full }], VIEWPORT).get("safe-area"), full);
  assert.equal(resolveLayoutRootBounds([{ parent_layout_node_id: "viewport" }], VIEWPORT).has("safe-area"), false);
});

test("安全区不得超出视口，完整视口不得由业务快照缩小", () => {
  assert.throws(() => resolveLayoutRootBounds([{ parent_layout_node_id: "safe-area", parent_target_bounds: { ...SAFE_AREA, width: 400 } }], VIEWPORT), /完全位于 viewport/);
  assert.throws(() => resolveLayoutRootBounds([{ parent_layout_node_id: "viewport", parent_target_bounds: SAFE_AREA }], VIEWPORT), /viewport 根快照必须逐字段一致/);
});
