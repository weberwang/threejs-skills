import assert from "node:assert/strict";
import test from "node:test";
import { deriveLayoutExecutionPlans } from "./layout-execution.mjs";
import { validateLayoutRuntimeSnapshots } from "./layout-runtime.mjs";

const VIEWPORT = { x: 0, y: 0, width: 200, height: 100 };
const SAFE_AREA = { x: 0, y: 10, width: 200, height: 80 };

/** 构造带目标布局矩形的业务节点。 */
function node(id, options = {}) {
  return {
    layout_node_id: id,
    parent_layout_node_id: options.parent ?? "viewport",
    ...(options.reference_id !== undefined ? { reference_id: options.reference_id } : {}),
    ...(options.element_type ? { element_type: options.element_type } : {}),
    ...(options.role ? { role: options.role } : {}),
    ...(options.render_kind ? { render_kind: options.render_kind } : {}),
    ...(options.owner_type ? { owner_type: options.owner_type } : {}),
    ...(options.nine_slice ? { nine_slice: structuredClone(options.nine_slice) } : {}),
    ...(options.image_source_size ? { image_source_size: options.image_source_size } : {}),
    ...(options.axis_alignment ? { axis_alignment: options.axis_alignment } : {}),
    ...(options.center_alignment ? { center_alignment: structuredClone(options.center_alignment) } : {}),
    target_bounds: options.target_bounds ?? { x: 10, y: 10, width: 20, height: 10 },
    ui_layout: {
      grouping_basis: ["POSITION"],
      layout_owner: options.layout_owner ?? "PARENT",
      size_policy: options.size_policy ?? "FIXED",
      overflow_policy: options.overflow_policy ?? "KEEP_VISIBLE",
      ...(options.position_driver ? { position_driver: options.position_driver } : {}),
      ...(options.size_driver ? { size_driver: options.size_driver } : {}),
      ...((options.position_reference_id ?? options.reference_id) ? { position_reference_id: options.position_reference_id ?? options.reference_id } : {}),
    },
  };
}

/** 为计划节点构造同批运行读数，默认以目标矩形提供实际值。 */
function geometryFor(sourceNodes, options = {}) {
  const nodes = deriveLayoutExecutionPlans(sourceNodes);
  const viewport = options.viewport_bounds ?? VIEWPORT;
  const safeArea = options.safe_area_bounds ?? SAFE_AREA;
  const byId = new Map(nodes.filter((item) => item.is_root_container !== true)
    .map((item, index) => [item.layout_node_id, item.actual_bounds ?? item.target_bounds ?? { x: 5 + index * 25, y: 5, width: 20, height: 10 }]));
  const componentSnapshots = nodes.filter((item) => item.is_root_container !== true).map((item) => {
    const id = item.layout_node_id;
    const active = options.inactiveIds?.has(id) !== true;
    const bounds = byId.get(id);
    const referenceId = item.layout_execution.reference_id;
    const referenceBounds = referenceId === "viewport" ? viewport
      : referenceId === "safe-area" ? safeArea : byId.get(referenceId) ?? null;
    let image = null;
    if (active && item.layout_execution.image_mode !== "NONE") {
      const source = item.nine_slice?.source_size ?? item.image_source_size ?? { width: 200, height: 100 };
      const display = item.layout_execution.image_mode === "NINE_SLICE"
        ? { width: bounds.width * 1.5, height: bounds.height * 1.25 }
        : { width: 40, height: 20 };
      image = { source_size: structuredClone(source), display_size: display };
    }
    return {
      layout_node_id: id,
      component_snapshot: {
        batch_id: "batch-1",
        viewport_revision: 4,
        renderer: "HUD",
        active,
        parent_layout_node_id: item.parent_layout_node_id,
        reference_id: item.layout_execution.reference_id,
        position_writers: active ? [item.layout_execution.position_driver] : [],
        size_writers: active ? [item.layout_execution.size_driver] : [],
        layout_bounds: active ? structuredClone(bounds) : null,
        reference_bounds: active ? structuredClone(referenceBounds) : null,
        local_size: active ? { width: 13, height: 7 } : null,
        image: active ? image : null,
      },
    };
  });
  return {
    nodes,
    geometry: {
      runtime_batch: {
        schema: "threejs-layout-runtime/1",
        batch_id: "batch-1",
        viewport_revision: 4,
        scene_id: "scene-main",
        state_id: "default",
        candidate_id: "candidate-a",
        coordinate_space: "layout-logical-px",
        viewport_bounds: structuredClone(viewport),
        safe_area_bounds: structuredClone(safeArea),
      },
      component_snapshots: componentSnapshots,
    },
  };
}

/** 从 component_snapshots 中定位单一节点快照。 */
function snapshotOf(geometry, id) {
  return geometry.component_snapshots.find((entry) => entry.layout_node_id === id).component_snapshot;
}

test("同批完整活动快照通过并绑定场景和视口上下文", () => {
  const result = geometryFor([node("panel", { element_type: "container", role: "container" }), node("icon", { parent: "panel" })]);
  const errors = validateLayoutRuntimeSnapshots(result.nodes, result.geometry, [], "geometry", {
    scene_id: "scene-main", state_id: "default", candidate_id: "candidate-a", viewport_bounds: VIEWPORT,
  });
  assert.deepEqual(errors, []);
});

test("活动节点的父级、定位参照和属性写入者必须匹配派生计划", () => {
  const result = geometryFor([node("panel", { element_type: "container", role: "container" }), node("child", { parent: "panel", position_reference_id: "viewport" })]);
  const child = snapshotOf(result.geometry, "child");
  child.parent_layout_node_id = "viewport";
  child.reference_id = "panel";
  child.position_writers = ["SHARED", "DOM_LAYOUT"];
  const errors = validateLayoutRuntimeSnapshots(result.nodes, result.geometry);
  assert(errors.some((message) => message.includes("parent_layout_node_id 与真实父级声明不一致")));
  assert(errors.some((message) => message.includes("reference_id 与派生执行计划不一致")));
  assert(errors.some((message) => message.includes("position_writers 必须唯一匹配")));
});

test("批次安全区冲突、越界与绑定视口不一致都会失败", () => {
  const result = geometryFor([node("safe-item", { parent: "safe-area" })]);
  snapshotOf(result.geometry, "safe-item").reference_bounds.height -= 1;
  result.geometry.runtime_batch.safe_area_bounds.y = 11;
  const errors = validateLayoutRuntimeSnapshots(result.nodes, result.geometry, [], "geometry", { viewport_bounds: { ...VIEWPORT, width: 201 } });
  assert(errors.some((message) => message.includes("viewport_bounds 与调用上下文不一致")));
  assert(errors.some((message) => message.includes("reference_bounds 必须逐字段等于同批参照 safe-area")), errors.join(" | "));
  result.geometry.runtime_batch.safe_area_bounds.x = -2;
  const outsideErrors = validateLayoutRuntimeSnapshots(result.nodes, result.geometry);
  assert(outsideErrors.some((message) => message.includes("safe_area_bounds 必须完全位于 viewport_bounds 内")));
});

test("缺失或非对象运行批次带上下文时返回错误而不抛异常", () => {
  const malformedBatches = [
    { name: "缺失", remove: true },
    { name: "undefined", value: undefined },
    { name: "null", value: null },
    { name: "数组", value: [] },
    { name: "字符串", value: "batch-1" },
    { name: "数字", value: 1 },
  ];
  const context = { scene_id: "scene-main", state_id: "default", candidate_id: "candidate-a" };

  for (const malformed of malformedBatches) {
    const result = geometryFor([node(`item-${malformed.name}`)]);
    if (malformed.remove) delete result.geometry.runtime_batch;
    else result.geometry.runtime_batch = malformed.value;

    let errors;
    assert.doesNotThrow(() => {
      errors = validateLayoutRuntimeSnapshots(result.nodes, result.geometry, [], "geometry", context);
    }, malformed.name);
    assert(errors.some((message) => message.includes("runtime_batch 必须是对象")), malformed.name);
  }
});

test("其他常见 malformed 快照形状只产生校验错误", () => {
  const context = { scene_id: "scene-main", viewport_bounds: VIEWPORT };
  const malformedCases = [
    {
      name: "非对象 geometry",
      geometry: null,
      expected: "必须包含 runtime_batch 和 component_snapshots",
    },
    {
      name: "非数组 component_snapshots",
      mutate(geometry) { geometry.component_snapshots = {}; },
      expected: "component_snapshots 必须是数组",
    },
    {
      name: "非对象快照条目",
      mutate(geometry) { geometry.component_snapshots = [null]; },
      expected: "必须包含 layout_node_id 和 component_snapshot",
    },
    {
      name: "非对象 component_snapshot",
      mutate(geometry) { geometry.component_snapshots[0].component_snapshot = "snapshot"; },
      expected: "必须包含 layout_node_id 和 component_snapshot",
    },
  ];

  for (const malformed of malformedCases) {
    const result = geometryFor([node(`case-${malformed.name}`)]);
    const geometry = Object.hasOwn(malformed, "geometry") ? malformed.geometry : result.geometry;
    malformed.mutate?.(geometry);
    let errors;
    assert.doesNotThrow(() => {
      errors = validateLayoutRuntimeSnapshots(result.nodes, geometry, [], "geometry", context);
    }, malformed.name);
    assert(errors.some((message) => message.includes(malformed.expected)), malformed.name);
  }
});

test("跨批次节点 revision 和缺失或篡改计划会被拒绝", () => {
  const result = geometryFor([node("item")]);
  snapshotOf(result.geometry, "item").viewport_revision = 5;
  let errors = validateLayoutRuntimeSnapshots(result.nodes, result.geometry);
  assert(errors.some((message) => message.includes("viewport_revision 与运行批次不一致")));
  delete result.nodes[0].layout_execution;
  errors = validateLayoutRuntimeSnapshots(result.nodes, result.geometry);
  assert(errors.some((message) => message.includes("layout_execution 缺少派生执行计划")));
  result.nodes[0].layout_execution = { ...deriveLayoutExecutionPlans([node("item")])[0].layout_execution, position_driver: "STATIC" };
  errors = validateLayoutRuntimeSnapshots(result.nodes, result.geometry);
  assert(errors.some((message) => message.includes("layout_execution 与 ui_layout 派生结果不一致")));
});

test("实际严格中心和带理由补偿中心逐一核对矩形，误差上限为半个逻辑像素", () => {
  const strictNode = node("strict", { axis_alignment: { horizontal: "center", vertical: "top" }, target_bounds: { x: 90, y: 0, width: 20, height: 10 } });
  const strict = geometryFor([strictNode]);
  snapshotOf(strict.geometry, "strict").layout_bounds.x = 91;
  let errors = validateLayoutRuntimeSnapshots(strict.nodes, strict.geometry);
  assert(errors.some((message) => message.includes("实际中心与声明的 strict 参照不符")));
  snapshotOf(strict.geometry, "strict").layout_bounds.x = 90.5;
  errors = validateLayoutRuntimeSnapshots(strict.nodes, strict.geometry);
  assert.deepEqual(errors, []);

  const compensatedNode = node("optical", {
    axis_alignment: { horizontal: "center", vertical: "top" },
    center_alignment: { horizontal: { mode: "reference", offset: 5, reason: "图标光学重心补偿" } },
    target_bounds: { x: 100, y: 0, width: 10, height: 10 },
  });
  const compensated = geometryFor([compensatedNode]);
  assert.deepEqual(validateLayoutRuntimeSnapshots(compensated.nodes, compensated.geometry), []);
  snapshotOf(compensated.geometry, "optical").layout_bounds.x = 99;
  errors = validateLayoutRuntimeSnapshots(compensated.nodes, compensated.geometry);
  assert(errors.some((message) => message.includes("reference 参照不符")));
});

test("图文整体中心按活动成员联合矩形验证，角标不加入成员组", () => {
  const group = [
    node("button", { element_type: "container", role: "container", target_bounds: { x: 0, y: 0, width: 200, height: 100 } }),
    node("icon", { parent: "button", axis_alignment: { horizontal: "center", vertical: "top" }, center_alignment: { member_ids: ["icon", "label"] }, target_bounds: { x: 65, y: 10, width: 20, height: 20 } }),
    node("label", { parent: "button", reference_id: "icon", axis_alignment: { horizontal: "center", vertical: "top" }, target_bounds: { x: 90, y: 10, width: 40, height: 20 } }),
    node("badge", { parent: "button", target_bounds: { x: 170, y: 0, width: 20, height: 10 } }),
  ];
  const result = geometryFor(group);
  snapshotOf(result.geometry, "icon").layout_bounds.x = 67.5;
  snapshotOf(result.geometry, "label").layout_bounds.x = 92.5;
  snapshotOf(result.geometry, "label").reference_bounds = structuredClone(snapshotOf(result.geometry, "icon").layout_bounds);
  assert.deepEqual(validateLayoutRuntimeSnapshots(result.nodes, result.geometry), []);
  snapshotOf(result.geometry, "label").layout_bounds.x = 100;
  const errors = validateLayoutRuntimeSnapshots(result.nodes, result.geometry);
  assert(errors.some((message) => message.includes("实际成员联合框未居中到参照")));
});

test("非活动节点仍需结构覆盖和空 writers，卸载节点可如实记录空父级", () => {
  const result = geometryFor([node("hidden")], { inactiveIds: new Set(["hidden"]) });
  const hidden = snapshotOf(result.geometry, "hidden");
  hidden.parent_layout_node_id = null;
  hidden.reference_id = null;
  assert.deepEqual(validateLayoutRuntimeSnapshots(result.nodes, result.geometry), []);
  result.geometry.component_snapshots.length = 0;
  const errors = validateLayoutRuntimeSnapshots(result.nodes, result.geometry);
  assert(errors.some((message) => message.includes("缺少业务节点 hidden")));
});

test("活动后代不能依附非活动父级或定位参照", () => {
  const nodes = [node("panel", { element_type: "container", role: "container" }), node("child", { parent: "panel" })];
  const result = geometryFor(nodes, { inactiveIds: new Set(["panel"]) });
  const errors = validateLayoutRuntimeSnapshots(result.nodes, result.geometry);
  assert(errors.some((message) => message.includes("活动后代不能挂在非活动业务父级 panel")));
  assert(errors.some((message) => message.includes("活动节点不能引用非活动业务定位参照 panel")));
});

test("普通图片验证真实源内容比例而不把 local_size 或变换后 AABB 当作图像尺寸", () => {
  const picture = node("picture", { render_kind: "sprite", owner_type: "fixed-production-visual", image_source_size: { width: 400, height: 200 }, target_bounds: { x: 0, y: 0, width: 30, height: 30 } });
  const result = geometryFor([picture]);
  const snapshot = snapshotOf(result.geometry, "picture");
  snapshot.layout_bounds = { x: 0, y: 0, width: 80, height: 60 };
  snapshot.local_size = { width: 30, height: 30 };
  snapshot.image.display_size = { width: 60, height: 30 };
  assert.deepEqual(validateLayoutRuntimeSnapshots(result.nodes, result.geometry), []);
  snapshot.image.display_size.height = 25;
  const errors = validateLayoutRuntimeSnapshots(result.nodes, result.geometry);
  assert(errors.some((message) => message.includes("必须保持 source_size 宽高比")));
});

test("冻结九宫格可非比例显示，但源像素必须绑定冻结 source_size", () => {
  const panel = node("panel", {
    element_type: "container", role: "panel-frame", render_kind: "sprite", owner_type: "fixed-production-visual",
    nine_slice: { mode: "stretch", reason: "边缘不缩放", source_size: { width: 96, height: 64 }, borders: { left: 12, right: 12, top: 10, bottom: 10 } },
    target_bounds: { x: 0, y: 0, width: 130, height: 90 },
  });
  const result = geometryFor([panel]);
  assert.deepEqual(validateLayoutRuntimeSnapshots(result.nodes, result.geometry), []);
  snapshotOf(result.geometry, "panel").image.source_size.width = 97;
  const errors = validateLayoutRuntimeSnapshots(result.nodes, result.geometry);
  assert(errors.some((message) => message.includes("必须等于冻结九宫格 source_size")));
});
