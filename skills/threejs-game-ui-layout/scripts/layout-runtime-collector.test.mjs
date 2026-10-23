import assert from "node:assert/strict";
import test from "node:test";
import { collectLayoutRuntimeSnapshots, createDomLayoutBinding } from "./layout-runtime-collector.mjs";

const VIEWPORT = { x: 0, y: 0, width: 200, height: 100 };
const SAFE_AREA = { x: 0, y: 10, width: 200, height: 80 };

/** 构造只含实际批次事实的测试上下文。 */
function batch(revision = 4, id = "batch-1") {
  return {
    schema: "threejs-layout-runtime/1",
    batch_id: id,
    viewport_revision: revision,
    scene_id: "scene-main",
    state_id: "default",
    candidate_id: "candidate-a",
    coordinate_space: "layout-logical-px",
    viewport_bounds: structuredClone(VIEWPORT),
    safe_area_bounds: structuredClone(SAFE_AREA),
  };
}

/** 构造只从实际渲染组件读取的快照回调。 */
function binding(id, parentId, referenceId, bounds, extras = {}) {
  return {
    layout_node_id: id,
    readSnapshot: () => ({
      renderer: "HUD",
      active: true,
      parent_layout_node_id: parentId,
      reference_id: referenceId,
      position_writers: ["SHARED"],
      size_writers: ["FIXED"],
      layout_bounds: structuredClone(bounds),
      local_size: { width: bounds.width, height: bounds.height },
      image: null,
      ...extras,
    }),
  };
}

/** 构造真实 IMG DOM 适配器测试输入，按节点或祖先配置浏览器计算矩阵。 */
function imageDomBinding({
  elementTransform = "none",
  parentTransform = "none",
  width = 100,
  height = 50,
  naturalWidth = 100,
  naturalHeight = 50,
} = {}) {
  const styleByElement = new Map();
  const parent = { isConnected: true, parentElement: null };
  const element = {
    tagName: "IMG",
    isConnected: true,
    parentElement: parent,
    naturalWidth,
    naturalHeight,
    clientWidth: width,
    clientHeight: height,
    offsetWidth: width,
    offsetHeight: height,
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 100, height: 100 }),
  };
  styleByElement.set(element, { display: "block", visibility: "visible", objectFit: "contain", transform: elementTransform });
  styleByElement.set(parent, { display: "block", visibility: "visible", transform: parentTransform });
  return createDomLayoutBinding(element, {
    layout_node_id: "image",
    cssToLayout: (rect) => rect,
    readParentLayoutNodeId: () => "panel",
    readReferenceId: () => "panel",
    readPositionWriters: () => ["SHARED"],
    readSizeWriters: () => ["FIXED"],
    getComputedStyle: (target) => styleByElement.get(target),
  });
}

test("采集器将组件引用解析到同批实际节点或逻辑根，并标注同一 revision", () => {
  const panelBounds = { x: 20, y: 20, width: 100, height: 60 };
  const childBounds = { x: 30, y: 30, width: 20, height: 10 };
  const result = collectLayoutRuntimeSnapshots([
    binding("panel", "viewport", "viewport", panelBounds),
    binding("child", "panel", "panel", childBounds),
    binding("safe-child", "safe-area", "safe-area", { x: 20, y: 20, width: 10, height: 10 }),
  ], () => batch());
  assert.deepEqual(result.runtime_batch, batch());
  assert.deepEqual(result.component_snapshots.map((entry) => entry.component_snapshot.batch_id), ["batch-1", "batch-1", "batch-1"]);
  assert.deepEqual(result.component_snapshots.map((entry) => entry.component_snapshot.viewport_revision), [4, 4, 4]);
  assert.deepEqual(result.component_snapshots[0].component_snapshot.reference_bounds, VIEWPORT);
  assert.deepEqual(result.component_snapshots[1].component_snapshot.reference_bounds, panelBounds);
  assert.deepEqual(result.component_snapshots[2].component_snapshot.reference_bounds, SAFE_AREA);
});

test("同一批采集中 viewport_revision 或 batch_id 变化会整体拒绝", () => {
  let reads = 0;
  const changingRevision = () => batch(reads++ === 0 ? 4 : 5);
  assert.throws(() => collectLayoutRuntimeSnapshots([binding("item", "viewport", "viewport", { x: 0, y: 0, width: 10, height: 10 })], changingRevision), /viewport_revision 发生变化/);
  reads = 0;
  const changingId = () => batch(4, reads++ === 0 ? "batch-1" : "batch-2");
  assert.throws(() => collectLayoutRuntimeSnapshots([binding("item", "viewport", "viewport", { x: 0, y: 0, width: 10, height: 10 })], changingId), /runtime_batch 或 viewport_revision 发生变化/);
});

test("采集接口不接受冻结节点、计划或异步回调伪造正式运行证据", () => {
  const item = binding("item", "viewport", "viewport", { x: 0, y: 0, width: 10, height: 10 });
  assert.throws(() => collectLayoutRuntimeSnapshots([{ ...item, layout_execution: {} }], () => batch()), /只能包含 layout_node_id 和 readSnapshot/);
  assert.throws(() => collectLayoutRuntimeSnapshots([item], async () => batch()), /必须同步返回运行上下文/);
  assert.throws(() => collectLayoutRuntimeSnapshots([{ layout_node_id: "item", readSnapshot: async () => ({}) }], () => batch()), /必须同步返回实际/);
  assert.throws(() => collectLayoutRuntimeSnapshots([item], () => ({ ...batch(), layout_nodes: [] })), /不能携带冻结 layout nodes/);
});

test("DOM adapter 读取实际 AABB、未变换局部尺寸、图像内容和动态父参照", () => {
  const styleByElement = new Map();
  const parent = { isConnected: true, parentElement: null };
  const element = {
    tagName: "IMG",
    isConnected: true,
    parentElement: parent,
    naturalWidth: 120,
    naturalHeight: 60,
    clientWidth: 20,
    clientHeight: 10,
    offsetWidth: 20,
    offsetHeight: 10,
    getBoundingClientRect: () => ({ x: 40, y: 20, width: 80, height: 30 }),
  };
  styleByElement.set(element, { display: "block", visibility: "visible", objectFit: "contain" });
  styleByElement.set(parent, { display: "block", visibility: "visible" });
  const domBinding = createDomLayoutBinding(element, {
    layout_node_id: "image",
    cssToLayout: (rect) => ({ x: rect.x / 2, y: rect.y / 2, width: rect.width / 2, height: rect.height / 2 }),
    readParentLayoutNodeId: () => "panel",
    readReferenceId: () => "panel",
    readPositionWriters: () => ["SHARED"],
    readSizeWriters: () => ["FIXED"],
    getComputedStyle: (target) => styleByElement.get(target),
  });
  const snapshot = domBinding.readSnapshot();
  assert.equal(domBinding.layout_node_id, "image");
  assert.equal(snapshot.renderer, "DOM");
  assert.equal(snapshot.active, true);
  assert.deepEqual(snapshot.layout_bounds, { x: 20, y: 10, width: 40, height: 15 });
  assert.deepEqual(snapshot.local_size, { width: 10, height: 5 });
  assert.deepEqual(snapshot.image.source_size, { width: 120, height: 60 });
  assert.deepEqual(snapshot.image.display_size, { width: 10, height: 5 });
  assert.deepEqual(snapshot.position_writers, ["SHARED"]);

  const collected = collectLayoutRuntimeSnapshots([
    binding("panel", "viewport", "viewport", { x: 10, y: 10, width: 100, height: 50 }),
    domBinding,
  ], () => batch());
  const collectedImage = collected.component_snapshots.find((entry) => entry.layout_node_id === "image").component_snapshot;
  assert.deepEqual(collectedImage.reference_bounds, { x: 10, y: 10, width: 100, height: 50 });
  assert.deepEqual(collectedImage.layout_bounds, snapshot.layout_bounds);
});

test("默认 IMG 适配器拒绝元素或祖先的非等比变换", () => {
  const elementScale = imageDomBinding({ elementTransform: "matrix(2, 0, 0, 1, 0, 0)", width: 100, height: 100, naturalWidth: 100, naturalHeight: 100 });
  assert.throws(() => elementScale.readSnapshot(), /累计 CSS transform 非等比或含剪切.*readImage/);

  const ancestorScale = imageDomBinding({ parentTransform: "matrix(1, 0, 0, 2, 0, 0)", width: 100, height: 100, naturalWidth: 100, naturalHeight: 100 });
  assert.throws(() => ancestorScale.readSnapshot(), /累计 CSS transform 非等比或含剪切.*readImage/);
});

test("默认 IMG 适配器允许旋转与累计等比缩放并记录变换后的内容尺寸", () => {
  const binding = imageDomBinding({
    elementTransform: "matrix(0, 1, -1, 0, 0, 0)",
    parentTransform: "matrix(2, 0, 0, 2, 0, 0)",
    width: 50,
    height: 50,
    naturalWidth: 100,
    naturalHeight: 50,
  });
  const snapshot = binding.readSnapshot();
  assert.deepEqual(snapshot.image.source_size, { width: 100, height: 50 });
  assert.deepEqual(snapshot.image.display_size, { width: 100, height: 50 });
  assert.deepEqual(snapshot.local_size, { width: 50, height: 50 });
});

test("DOM adapter 通过祖先可见性和挂载状态标记卸载节点，保留空父参照与空几何", () => {
  const parent = { isConnected: true, parentElement: null };
  const element = {
    isConnected: true,
    parentElement: parent,
    offsetWidth: 0,
    offsetHeight: 0,
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0 }),
  };
  const binding = createDomLayoutBinding(element, {
    layout_node_id: "unmounted",
    cssToLayout: (rect) => rect,
    readParentLayoutNodeId: () => null,
    readReferenceId: () => null,
    readPositionWriters: () => [],
    readSizeWriters: () => [],
    getComputedStyle: (target) => target === parent
      ? { display: "none", visibility: "visible" }
      : { display: "block", visibility: "visible" },
  });
  const snapshot = binding.readSnapshot();
  assert.equal(snapshot.active, false);
  assert.equal(snapshot.parent_layout_node_id, null);
  assert.equal(snapshot.reference_id, null);
  assert.equal(snapshot.layout_bounds, null);
  assert.equal(snapshot.local_size, null);
  assert.deepEqual(snapshot.position_writers, []);
});

test("采集器拒绝回调提供与同批实测参照不一致的矩形", () => {
  const wrong = { x: 1, y: 1, width: 9, height: 9 };
  assert.throws(() => collectLayoutRuntimeSnapshots([
    binding("item", "viewport", "viewport", { x: 2, y: 2, width: 10, height: 10 }, { reference_bounds: wrong }),
  ], () => batch()), /reference_bounds 与同批实际参照 viewport 不一致/);
});
