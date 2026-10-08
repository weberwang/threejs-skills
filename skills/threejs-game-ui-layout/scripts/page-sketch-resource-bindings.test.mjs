import assert from "node:assert/strict";
import test from "node:test";
import { validatePageSketchResourceBindings } from "./page-sketch-resource-bindings.mjs";

/** 构造页面 state 与组件资源 state 不同的覆盖样例，检验按原子 placement 绑定。 */
function createBindingFixture() {
  const nodes = [
    { layout_node_id: "hud.root", region_id: "hud-region" },
    { layout_node_id: "hud.left", region_id: "hud-region" },
    { layout_node_id: "hud.right", region_id: "hud-region" },
  ];
  const regions = [{
    id: "hud-region",
    scene_id: "HudScene",
    state_id: "default",
    owner_type: "fixed-production-visual",
    layout_node_ids: nodes.map((node) => node.layout_node_id),
    // asset 只在 expected_assets 中声明，不能依赖顶层 asset_id/asset_ids 才找到正式范围。
    expected_assets: [
      { asset_id: "left-idle", component_id: "left-component", state_id: "idle", runtime_file: "public/left.png" },
      { asset_id: "right-idle", component_id: "right-component", state_id: "idle", runtime_file: "public/right.png" },
    ],
    component_inventory: { components: [
      { component_id: "left-component", state_coverage: [{ state_id: "idle", requirement: "required" }], placements: [{ placement_id: "left-placement", layout_node_id: "hud.left" }] },
      { component_id: "right-component", state_coverage: [{ state_id: "idle", requirement: "required" }], placements: [{ placement_id: "right-placement", layout_node_id: "hud.right" }] },
    ] },
  }];
  const assets = [
    { id: "left-idle", status: "accepted", scene_id: "HudScene", component_id: "left-component", state_id: "idle", runtime_outputs: ["public/left.png"], coverage_region_ids: ["hud-region"] },
    { id: "right-idle", status: "accepted", scene_id: "HudScene", component_id: "right-component", state_id: "idle", runtime_outputs: ["public/right.png"], coverage_region_ids: ["hud-region"] },
  ];
  const mappings = [
    { asset_id: "left-idle", file: "public/left.png", layout_node_id: "hud.left" },
    { asset_id: "right-idle", file: "public/right.png", layout_node_id: "hud.right" },
  ];
  const nodePresentations = {
    "hud.root": { kind: "container" },
    "hud.left": { kind: "image", asset_ids: ["left-idle"] },
    "hud.right": { kind: "image", asset_ids: ["right-idle"] },
  };
  return { nodes, regions, assets, mappings, nodePresentations };
}

/** expected_assets 中的资源唯一映射到 component/state 与真实 V2 placement。 */
test("共享绑定合同接受组件状态不同于 scene state 的精确映射", () => {
  const fixture = createBindingFixture();
  const result = validatePageSketchResourceBindings({ ...fixture, sceneId: "HudScene", stateId: "default" });
  assert.deepEqual(result, fixture.mappings);
});

/** 错误节点、漏映射和 presentation 替代都不能绕过正式 component placement。 */
test("共享绑定合同拒绝跨组件替换、遗漏与伪装正式资源", () => {
  const swapped = createBindingFixture();
  swapped.mappings[0].layout_node_id = "hud.right";
  assert.throws(() => validatePageSketchResourceBindings({ ...swapped, sceneId: "HudScene", stateId: "default" }), /placement/);

  const missing = createBindingFixture();
  missing.mappings.pop();
  missing.nodePresentations["hud.right"] = { kind: "container" };
  assert.throws(() => validatePageSketchResourceBindings({ ...missing, sceneId: "HudScene", stateId: "default" }), /缺少一个/);

  for (const kind of ["text", "runtime-program"]) {
    const substituted = createBindingFixture();
    substituted.nodePresentations["hud.left"] = { kind };
    assert.throws(() => validatePageSketchResourceBindings({ ...substituted, sceneId: "HudScene", stateId: "default" }), /不能被/);
  }

  const fixedRecipeEvasion = createBindingFixture();
  fixedRecipeEvasion.regions[0].expected_assets = [];
  fixedRecipeEvasion.regions[0].component_inventory.components.forEach((component) => { component.placements = []; });
  fixedRecipeEvasion.mappings = [];
  fixedRecipeEvasion.nodePresentations["hud.left"] = { kind: "container" };
  fixedRecipeEvasion.nodePresentations["hud.right"] = { kind: "container" };
  assert.throws(() => validatePageSketchResourceBindings({ ...fixedRecipeEvasion, sceneId: "HudScene", stateId: "default" }), /expected_assets/);
});

/** runtime-data 和 runtime-rendered 的真实 placement 可使用 text/runtime-program 配方，无需伪造图片。 */
test("runtime placements 接受明确的文本与程序预览配方", () => {
  const nodes = [
    { layout_node_id: "score.value", region_id: "score-region" },
    { layout_node_id: "score.bar", region_id: "bar-region" },
  ];
  const regions = [
    { id: "score-region", scene_id: "HudScene", state_id: "default", owner_type: "runtime-data", layout_node_ids: ["score.value"], component_inventory: { components: [{ component_id: "score-text", placements: [{ placement_id: "score-text-placement", layout_node_id: "score.value" }] }] } },
    { id: "bar-region", scene_id: "HudScene", state_id: "default", owner_type: "runtime-rendered", layout_node_ids: ["score.bar"], component_inventory: { components: [{ component_id: "score-bar", placements: [{ placement_id: "score-bar-placement", layout_node_id: "score.bar" }] }] } },
  ];
  const nodePresentations = {
    "score.value": { kind: "text" },
    "score.bar": { kind: "runtime-program" },
  };
  assert.deepEqual(validatePageSketchResourceBindings({ nodes, sceneId: "HudScene", stateId: "default", assets: [], regions, mappings: [], nodePresentations }), []);
});


/** 生成器和控制门共用绑定校验，阻断错误背景参照而不改写已确认 V2 身份。 */
test("共享绑定门拒绝把背景节点作为父容器", () => {
  const fixture = createBindingFixture();
  fixture.nodes[0].layout_role = "background";
  fixture.nodes[0].parent_layout_node_id = "viewport";
  fixture.nodes[1].parent_layout_node_id = "hud.root";
  assert.throws(() => validatePageSketchResourceBindings({ ...fixture, sceneId: "HudScene", stateId: "default" }), /不得相对背景/);
});

/** 只在正式区域清单标记背景时，也要阻止生成及确认门将背景当成空容器。 */
test("共享绑定门拒绝正式背景区域的容器展示", () => {
  const fixture = createBindingFixture();
  fixture.regions[0].layer = "background";
  for (const node of fixture.nodes) node.parent_layout_node_id = "viewport";
  assert.throws(() => validatePageSketchResourceBindings({ ...fixture, sceneId: "HudScene", stateId: "default" }), /背景 hud.root 不能声明为容器/);
});
