import test from "node:test";
import assert from "node:assert/strict";
import {
  applyVisualLayoutDrag,
  mapClientToLogical,
  mapLogicalToClient,
  mountVisualLayoutEditor,
  persistVisualLayoutDocument,
  validateVisualLayoutDocument,
} from "./visual-layout-editor.mjs";

import { calculatePageSketchNodeBounds } from "./page-sketch-preview.mjs";

const targetSha = `sha256:${"a".repeat(64)}`;

/** 为编辑器纯逻辑用例创建含父子节点的冻结布局样例。 */
function createFixture() {
  const nodes = [
    {
      layout_node_id: "hud.group",
      parent_layout_node_id: "viewport",
      target_bounds: { x: 100, y: 100, width: 300, height: 200 },
    },
    {
      layout_node_id: "hud.button",
      parent_layout_node_id: "hud.group",
      parent_target_bounds: { x: 100, y: 100, width: 300, height: 200 },
      target_bounds: { x: 180, y: 150, width: 80, height: 40 },
    },
  ];
  const layout = {
    schema: "threejs-visual-layout/1.0",
    target_sha256: targetSha,
    scene_id: "HudScene",
    state_id: "default",
    offsets: {
      "hud.button": { x: 2, y: -3 },
      "hud.group": { x: 4, y: 6 },
    },
  };
  return { nodes, layout };
}

/** 调整 host 显示尺寸后，映射仍往返到同一逻辑坐标。 */
test("client rect 与逻辑 viewport 的坐标映射适配缩放和偏移", () => {
  const viewport = { width: 1920, height: 1080 };
  const rect = { left: 40, top: 25, width: 960, height: 540 };
  const logical = mapClientToLogical({ clientX: 280, clientY: 160, rect, viewport });
  assert.deepEqual(logical, { x: 480, y: 270 });
  assert.deepEqual(mapLogicalToClient({ ...logical, rect, viewport }), { x: 280, y: 160 });
  const resized = { ...rect, width: 640, height: 360 };
  assert.deepEqual(mapClientToLogical({ clientX: 200, clientY: 115, rect: resized, viewport }), { x: 480, y: 270 });
});

/** 拖动父级只更新父级偏移，V2 子节点几何与自身偏移保持只读。 */
test("父子拖动仅修改选中节点 offset", () => {
  const { nodes, layout } = createFixture();
  const beforeNodes = structuredClone(nodes);
  const changed = applyVisualLayoutDrag(layout, nodes, "hud.group", { x: 16, y: -8 });
  assert.deepEqual(changed.offsets["hud.group"], { x: 20, y: -2 });
  assert.deepEqual(changed.offsets["hud.button"], { x: 2, y: -3 });
  assert.deepEqual(nodes, beforeNodes);
  assert.deepEqual(Object.keys(changed.offsets).sort(), ["hud.button", "hud.group"]);
});

/** 无效节点树、未知偏移 ID 和错误布局身份均被拒绝。 */
test("非法节点或布局不能进入可视化编辑器", () => {
  const { nodes, layout } = createFixture();
  assert.throws(() => validateVisualLayoutDocument({ ...layout, schema: "wrong" }, nodes), /schema/);
  assert.throws(() => validateVisualLayoutDocument({ ...layout, offsets: { unknown: { x: 0, y: 0 } } }, nodes), /未知 layout_node_id/);
  assert.throws(() => applyVisualLayoutDrag(layout, nodes, "unknown", { x: 1, y: 1 }), /未知 layout_node_id/);
  const cyclic = structuredClone(nodes);
  cyclic[0].parent_layout_node_id = "hud.button";
  assert.throws(() => applyVisualLayoutDrag(layout, cyclic, "hud.group", { x: 1, y: 1 }), /循环/);
});

/** 操作栏必须属于同一文档并置于游戏画布子树之外。 */
test("操作栏拒绝跨文档容器与画布内部容器", () => {
  const foreignDocument = {};
  assert.throws(
    () => createMountedEditor({ controlsHostFactory: () => new FakeElement("aside", foreignDocument) }),
    /同属一个 document/,
  );
  assert.throws(
    () => createMountedEditor({ controlsHostFactory: ({ document, host }) => {
      const child = new FakeElement("aside", document);
      host.append(child);
      return child;
    } }),
    /画布子树内/,
  );
  assert.throws(
    () => createMountedEditor({ controlsHostFactory: ({ document }) => ({ ownerDocument: document }) }),
    /支持 append/,
  );
});

/** 持久化回调失败时只报告 error 并拒绝，不会返回成功布局。 */
test("保存失败不报告成功", async () => {
  const { nodes, layout } = createFixture();
  const states = [];
  await assert.rejects(
    persistVisualLayoutDocument(layout, nodes, async () => { throw new Error("disk full"); }, (state) => states.push(state)),
    /disk full/,
  );
  assert.deepEqual(states, ["saving", "error"]);
  assert(!states.includes("saved"));
});

/** 为不依赖浏览器的挂载测试提供最小 DOM 事件目标。 */
class FakeEventTarget {
  /** 创建带监听器集合的轻量事件目标。 */
  constructor() {
    this.listeners = new Map();
  }

  /** 注册事件监听器并保留 capture 选项以检查销毁对称性。 */
  addEventListener(type, callback, options) {
    const entries = this.listeners.get(type) ?? [];
    entries.push({ callback, capture: options === true || options?.capture === true });
    this.listeners.set(type, entries);
  }

  /** 按回调与 capture 配对移除监听器。 */
  removeEventListener(type, callback, options) {
    const capture = options === true || options?.capture === true;
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((entry) => entry.callback !== callback || entry.capture !== capture));
  }

  /** 分发带当前目标的事件，模拟浏览器对元素和 window 的回调传参。 */
  dispatch(type, details = {}) {
    const event = { ...details, type, target: this, currentTarget: this, preventDefault() { this.defaultPrevented = true; } };
    for (const entry of [...(this.listeners.get(type) ?? [])]) entry.callback.call(this, event);
    return event;
  }
}

/** 为布局编辑器测试提供可聚焦、可移除且支持树查询的简化节点。 */
class FakeElement extends FakeEventTarget {
  /** 创建模拟 DOM 节点并关联其文档。 */
  constructor(tagName, ownerDocument) {
    super();
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this.parentNode = null;
    this.textContent = "";
  }

  /** 追加子节点并维护父节点关系。 */
  append(...children) {
    for (const child of children) {
      child.parentNode?.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
    }
  }

  /** 清空子节点，并模拟浏览器在移除焦点节点时退回 body。 */
  replaceChildren(...children) {
    if (this.contains(this.ownerDocument.activeElement)) this.ownerDocument.activeElement = this.ownerDocument.body;
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...children);
  }

  /** 从父节点移除指定子节点。 */
  removeChild(child) {
    this.children = this.children.filter((item) => item !== child);
    child.parentNode = null;
  }

  /** 从 DOM 树中移除本节点。 */
  remove() {
    if (this.contains(this.ownerDocument.activeElement)) this.ownerDocument.activeElement = this.ownerDocument.body;
    this.parentNode?.removeChild(this);
  }

  /** 判断本节点是否包含目标节点。 */
  contains(target) {
    return target === this || this.children.some((child) => child.contains(target));
  }

  /** 设置属性并同步 data-* 到 dataset。 */
  setAttribute(name, value) {
    const stringValue = String(value);
    this.attributes.set(name, stringValue);
    if (name === "class") this.className = stringValue;
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = stringValue;
    }
  }

  /** 读取已设置的节点属性。 */
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  /** 聚焦节点并更新文档的 activeElement。 */
  focus() {
    this.ownerDocument.activeElement = this;
  }
}

/** 模拟 ResizeObserver，暴露 callback 以验证事件参数被安全忽略。 */
class FakeResizeObserver {
  /** 保存最近创建的观察器，供测试主动触发回调。 */
  static latest;

  /** 保存观察器回调。 */
  constructor(callback) {
    this.callback = callback;
    FakeResizeObserver.latest = this;
  }

  /** 记录被观察对象。 */
  observe(target) {
    this.target = target;
  }

  /** 标记观察器已断开。 */
  disconnect() {
    this.disconnected = true;
  }
}

/** 构建足以挂载布局编辑器的 fake document/window/host 环境。 */
function createMountedEditor({ save: saveCallback = async () => {}, getViewportRect, editorOptions = {}, controlsHostFactory, nodes: nodesOverride, layout: layoutOverride } = {}) {
  const document = {
    createElement(tagName) { return new FakeElement(tagName, document); },
    createElementNS(_namespace, tagName) { return new FakeElement(tagName, document); },
  };
  document.body = new FakeElement("body", document);
  document.activeElement = document.body;
  const window = new FakeEventTarget();
  window.ResizeObserver = FakeResizeObserver;
  window.visualViewport = new FakeEventTarget();
  document.defaultView = window;
  const fixture = createFixture();
  const nodes = nodesOverride ?? fixture.nodes;
  const layout = layoutOverride ?? fixture.layout;
  let hostRect = { left: 100, top: 50, width: 400, height: 200 };
  let liveViewportRect = hostRect;
  const host = new FakeElement("div", document);
  host.getBoundingClientRect = () => ({ ...hostRect });
  const controlsHost = controlsHostFactory?.({ document, host }) ?? new FakeElement("aside", document);
  document.body.append(host);
  if (controlsHost.ownerDocument === document && typeof controlsHost.append === "function" && !host.contains(controlsHost)) document.body.append(controlsHost);
  const runtimeBounds = new Map();
  /** 用布局偏移重建运行时节点 bounds，代表正式 Scene 的同步重排入口。 */
  function applyRuntimeLayout(nextLayout) {
    for (const node of nodes) {
      const offset = nextLayout.offsets[node.layout_node_id] ?? { x: 0, y: 0 };
      runtimeBounds.set(node.layout_node_id, {
        ...node.target_bounds,
        x: node.target_bounds.x + offset.x,
        y: node.target_bounds.y + offset.y,
      });
    }
  }
  applyRuntimeLayout(layout);
  let reflowOverride = null;
  const saved = [];
  const editor = mountVisualLayoutEditor({
    host,
    controlsHost,
    referenceUrl: "reference.png",
    viewport: { width: 400, height: 200 },
    nodes,
    layout,
    getBounds: (id) => runtimeBounds.get(id),
    ...(getViewportRect ? { getViewportRect: () => ({ ...liveViewportRect }) } : {}),
    reflow(nextLayout) {
      if (reflowOverride) return reflowOverride(nextLayout);
      applyRuntimeLayout(nextLayout);
    },
    async save(nextLayout) { saved.push(structuredClone(nextLayout)); await saveCallback(nextLayout); },
    ...editorOptions,
  });
  return {
    document,
    window,
    host,
    controlsHost,
    editor,
    nodes,
    runtimeBounds,
    saved,
    setHostRect(rect) { hostRect = rect; liveViewportRect = rect; },
    setViewportRect(rect) { liveViewportRect = rect; },
    setReflowOverride(callback) { reflowOverride = callback; },
  };
}

/** 在模拟 DOM 子树中按谓词查找所有节点。 */
function findElements(root, predicate) {
  const found = [];
  const visit = (node) => {
    if (predicate(node)) found.push(node);
    for (const child of node.children) visit(child);
  };
  visit(root);
  return found;
}

/** 找到编辑器面板中的保存状态节点。 */
function findStatus(document) {
  return findElements(document.body, (node) => node.className === "vle-status")[0];
}

/** 构造真实 HTMLCollection 的只读数组式形态，不提供 Array 扩展方法。 */
function fakeHTMLCollection(items) {
  const collection = { length: items.length };
  items.forEach((item, index) => { collection[index] = item; });
  return collection;
}

/** 创建浏览器中落在节点矩形上的指针事件序列。 */
function dragNode(environment, id, moves) {
  const frame = findElements(environment.document.body, (node) => node.getAttribute("data-layout-node-id") === id)[0];
  frame.dispatch("pointerdown", { button: 0, pointerId: 1, clientX: 110, clientY: 70 });
  for (const [clientX, clientY] of moves) environment.window.dispatch("pointermove", { pointerId: 1, clientX, clientY });
  environment.window.dispatch("pointerup", { pointerId: 1 });
}

/** 异步重排即使按相反顺序完成也会被拒绝，失败结果不触发文件写入。 */
test("异步乱序重排被拒绝且失败布局不保存", async () => {
  const environment = createMountedEditor();
  const pending = [];
  environment.setReflowOverride(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  dragNode(environment, "hud.group", [[126, 70], [142, 70]]);
  assert.equal(pending.length, 2);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(environment.saved.length, 0);
  assert.equal(findStatus(environment.document).dataset.state, "error");
  pending[1].reject(new Error("late reflow failed"));
  pending[0].resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(environment.saved.length, 0);
  assert.notEqual(findStatus(environment.document).textContent, "已保存");
  environment.editor.destroy();
});

/** 同步重排失败后自动保存和手动保存都被阻止。 */
test("同步重排失败不会写文件或报告成功", async () => {
  const environment = createMountedEditor();
  environment.setReflowOverride(() => { throw new Error("scene unavailable"); });
  dragNode(environment, "hud.group", [[126, 70]]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(environment.saved.length, 0);
  assert.equal(findStatus(environment.document).dataset.state, "error");
  const saveButton = findElements(environment.document.body, (node) => node.textContent === "保存布局")[0];
  saveButton.dispatch("click");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(environment.saved.length, 0);
  assert.equal(findStatus(environment.document).textContent, "布局尚未成功重排，不能保存");
  environment.editor.destroy();
});

/** window 与 ResizeObserver 的事件实参不会被误当成 rect，销毁后监听器清理对称。 */
test("视口事件回调忽略事件参数并在销毁时移除", () => {
  const environment = createMountedEditor({ getViewportRect: true });
  const root = findElements(environment.document.body, (node) => node.getAttribute("data-threejs-visual-layout-editor"))[0];
  environment.setViewportRect({ left: 160, top: 80, width: 320, height: 160 });
  environment.window.dispatch("scroll", { left: 1, top: 2, width: 3, height: 4 });
  assert.equal(root.style.left, "160px");
  assert.equal(root.style.width, "320px");
  FakeResizeObserver.latest.callback([{ target: environment.host, contentRect: { left: 1 } }]);
  assert.equal(root.style.top, "80px");
  assert.equal(root.style.height, "160px");
  assert.equal((environment.window.listeners.get("resize") ?? []).length, 1);
  environment.setViewportRect({ left: 200, top: 110, width: 300, height: 150 });
  environment.editor.refreshViewport();
  assert.equal(root.style.left, "200px");
  assert.equal(root.style.width, "300px");
  environment.editor.destroy();
  assert.equal((environment.window.listeners.get("resize") ?? []).length, 0);
  assert.equal(FakeResizeObserver.latest.disconnected, true);
  assert.equal(environment.controlsHost.children.length, 0);
  assert.equal(findElements(environment.document.body, (node) => node.getAttribute("data-threejs-visual-layout-editor")).length, 0);
});

/** viewport 尺寸变化后拖动仍按新 client rect 换算，不受右栏 DOM 层级影响。 */
test("独立右栏挂载后拖动按缩放后的视口映射逻辑坐标", async () => {
  const environment = createMountedEditor({ getViewportRect: true });
  const frame = findElements(environment.document.body, (node) => node.getAttribute("data-layout-node-id") === "hud.group")[0];
  frame.dispatch("pointerdown", { button: 0, pointerId: 1, clientX: 110, clientY: 70 });
  environment.setViewportRect({ left: 100, top: 50, width: 200, height: 100 });
  environment.editor.refreshViewport();
  environment.window.dispatch("pointermove", { pointerId: 1, clientX: 113, clientY: 70 });
  assert.deepEqual(environment.editor.getLayout().offsets["hud.group"], { x: 20, y: 30 });
  environment.window.dispatch("pointerup", { pointerId: 1 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(environment.saved.length, 1);
  environment.editor.destroy();
});

/** 连续键盘微调跨过重绘仍保留同一节点焦点，并累计写入偏移。 */
test("连续键盘微调恢复节点焦点并累计位置", async () => {
  const environment = createMountedEditor();
  let focused = findElements(environment.document.body, (node) => node.getAttribute("data-layout-node-id") === "hud.group")[0];
  focused.focus();
  for (let index = 0; index < 2; index += 1) {
    focused.dispatch("keydown", { key: "ArrowRight", shiftKey: false });
    focused = environment.document.activeElement;
    assert.equal(focused.getAttribute("data-layout-node-id"), "hud.group");
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(environment.editor.getLayout().offsets["hud.group"].x, 6);
  assert.equal(environment.saved.length, 1);
  environment.editor.destroy();
});

/** 数值字段直接编辑相对父容器的最终坐标，并复用正式同步重排及持久化链路。 */
test("数值坐标输入设置所选节点的最终坐标", async () => {
  const environment = createMountedEditor();
  const point = findElements(environment.controlsHost, (node) => node.getAttribute("aria-label") === "父容器参照点")[0];
  point.value = "top-left";
  point.dispatch("change");
  const xInput = findElements(environment.document.body, (node) => node.getAttribute("aria-label") === "节点 X 坐标")[0];
  const yInput = findElements(environment.document.body, (node) => node.getAttribute("aria-label") === "节点 Y 坐标")[0];
  xInput.value = "24";
  yInput.value = "-12";
  xInput.dispatch("change");
  assert.deepEqual(environment.editor.getLayout().offsets["hud.group"], { x: -76, y: -112 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(environment.saved.length, 1);
  environment.editor.destroy();
});

/** 重置清空所有打开时已有的偏移，恢复冻结父子几何并按自动保存策略写入。 */
test("重置布局恢复初始坐标和父子关系且不改写 V2 输入节点", async () => {
  const fixture = createFixture();
  const sourceNodes = structuredClone(fixture.nodes);
  const notifications = [];
  const environment = createMountedEditor({
    nodes: fixture.nodes,
    layout: fixture.layout,
    editorOptions: { onLayoutChange: (layout) => notifications.push(layout) },
  });

  const reset = environment.editor.resetToInitial();
  assert.deepEqual(reset.offsets, {});
  assert.deepEqual(environment.editor.getLayout().offsets, {});
  assert.deepEqual(fixture.nodes, sourceNodes);
  assert.deepEqual(notifications.at(-1).offsets, {});
  const parentFrame = findElements(environment.document.body, (node) => node.getAttribute("data-layout-node-id") === "hud.group")[0];
  const childFrame = findElements(environment.document.body, (node) => node.getAttribute("data-layout-node-id") === "hud.button")[0];
  assert.equal(parentFrame.getAttribute("x"), "100");
  assert.equal(childFrame.getAttribute("x"), "180");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(environment.saved.length, 1);
  assert.deepEqual(environment.saved[0].offsets, {});
  environment.editor.destroy();
});

/** 外部改写传入节点后，重置仍使用挂载时冻结的父级和 target_bounds 副本。 */
test("重置基于编辑器隔离的节点快照", () => {
  const environment = createMountedEditor();
  environment.nodes[1].parent_layout_node_id = "viewport";
  environment.nodes[1].target_bounds.x = 9;

  const childButton = findElements(environment.document.body, (node) => node.dataset.layoutNodeId === "hud.button")[0];
  childButton.dispatch("click");
  environment.editor.resetToInitial();
  const childItem = findElements(environment.document.body, (node) => node.dataset.layoutNodeId === "hud.button")[0];
  const targetFrame = findElements(environment.document.body, (node) => node.getAttribute("class") === "vle-frame-target")[0];
  assert.equal(childItem.style.paddingLeft, "20px");
  assert.equal(targetFrame.getAttribute("x"), "180");
  assert.equal(environment.nodes[1].parent_layout_node_id, "viewport");
  assert.equal(environment.nodes[1].target_bounds.x, 9);
  environment.editor.destroy();
});

/** reset 期间的拖动被取消；锁定、正式预览和销毁状态禁止重置副作用。 */
test("重置取消拖动并遵守锁定预览与销毁状态", async () => {
  const environment = createMountedEditor();
  const frame = findElements(environment.document.body, (node) => node.getAttribute("data-layout-node-id") === "hud.group")[0];
  frame.dispatch("pointerdown", { button: 0, pointerId: 1, clientX: 110, clientY: 70 });
  environment.window.dispatch("pointermove", { pointerId: 1, clientX: 142, clientY: 70 });
  assert.deepEqual(environment.editor.getLayout().offsets["hud.group"], { x: 36, y: 6 });
  assert.deepEqual(environment.editor.resetToInitial().offsets, {});
  environment.window.dispatch("pointerup", { pointerId: 1 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(environment.saved.length, 1);
  assert.deepEqual(environment.saved[0].offsets, {});

  environment.editor.setInteractionEnabled(false);
  assert.throws(() => environment.editor.resetToInitial(), /操作锁定期间/);
  environment.editor.setInteractionEnabled(true);
  environment.editor.setPreviewMode(true);
  assert.throws(() => environment.editor.resetToInitial(), /正式效果预览期间/);
  environment.editor.setPreviewMode(false);
  const beforeDestroy = environment.editor.getLayout();
  environment.editor.destroy();
  assert.deepEqual(environment.editor.resetToInitial(), beforeDestroy);
  assert.deepEqual(environment.editor.getLayout(), beforeDestroy);
  assert.equal(environment.saved.length, 1);
});

/** reset 重排失败时恢复此前运行布局、保留原错误且不会自动保存。 */
test("重置重排失败不保存且恢复原运行布局", async () => {
  const environment = createMountedEditor();
  const initial = environment.editor.getLayout();
  const receivedOffsets = [];
  environment.setReflowOverride((nextLayout) => {
    receivedOffsets.push(structuredClone(nextLayout.offsets));
    for (const node of environment.nodes) {
      const offset = nextLayout.offsets[node.layout_node_id] ?? { x: 0, y: 0 };
      environment.runtimeBounds.set(node.layout_node_id, {
        ...node.target_bounds,
        x: node.target_bounds.x + offset.x,
        y: node.target_bounds.y + offset.y,
      });
    }
    if (Object.keys(nextLayout.offsets).length === 0) throw new Error("reset scene failed");
  });

  assert.throws(() => environment.editor.resetToInitial(), /reset scene failed/);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(receivedOffsets[0], {});
  assert.deepEqual(receivedOffsets.at(-1), initial.offsets);
  assert.deepEqual(environment.editor.getLayout(), initial);
  assert.equal(environment.editor.isPreviewHealthy(), true);
  assert.equal(environment.runtimeBounds.get("hud.group").x, 104);
  assert.equal(environment.saved.length, 0);
  assert.match(findStatus(environment.document).textContent, /布局重置失败：reset scene failed/);
  environment.editor.destroy();
});

/** 重置的自动保存失败会保留 error 状态，不产生未处理 Promise 拒绝。 */
test("重置自动保存失败不报告已保存", async () => {
  const environment = createMountedEditor({ save: async () => { throw new Error("disk full"); } });
  environment.editor.resetToInitial();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(findStatus(environment.document).dataset.state, "error");
  assert.match(findStatus(environment.document).textContent, /保存失败：disk full/);
  environment.editor.destroy();
});

/** 保存或确认锁定期间，树、框、键盘、透明度和数值输入均不能改变布局。 */
test("操作锁禁用布局控件并阻止指针键盘及坐标改动", () => {
  const environment = createMountedEditor();
  const initial = environment.editor.getLayout();
  let frame = findElements(environment.document.body, (node) => node.getAttribute("data-layout-node-id") === "hud.group")[0];
  const xInput = findElements(environment.document.body, (node) => node.getAttribute("aria-label") === "节点 X 坐标")[0];
  const opacityInput = findElements(environment.document.body, (node) => node.getAttribute("aria-label") === "效果图透明度")[0];
  environment.editor.setInteractionEnabled(false);
  frame = findElements(environment.document.body, (node) => node.getAttribute("data-layout-node-id") === "hud.group")[0];
  assert.equal(frame.getAttribute("aria-disabled"), "true");
  assert.equal(frame.getAttribute("tabindex"), "-1");
  assert.equal(xInput.disabled, true);
  assert.equal(opacityInput.disabled, true);
  xInput.value = "90";
  xInput.dispatch("change");
  frame.dispatch("pointerdown", { button: 0, pointerId: 1, clientX: 110, clientY: 70 });
  environment.window.dispatch("pointermove", { pointerId: 1, clientX: 180, clientY: 120 });
  frame.dispatch("keydown", { key: "ArrowRight" });
  assert.deepEqual(environment.editor.getLayout(), initial);
  environment.editor.setInteractionEnabled(true);
  frame = findElements(environment.document.body, (node) => node.getAttribute("data-layout-node-id") === "hud.group")[0];
  assert.equal(frame.getAttribute("aria-disabled"), "false");
  assert.equal(xInput.disabled, false);
  environment.editor.destroy();
});

/** 树控件必须按浏览器 HTMLCollection 数组式遍历，不能依赖 flatMap。 */
test("操作锁兼容没有 flatMap 的 HTMLCollection children", () => {
  const environment = createMountedEditor();
  const tree = findElements(environment.document.body, (node) => node.className === "vle-tree")[0];
  const listItems = [...tree.children];
  const itemChildren = listItems.map((item) => [...item.children]);
  tree.children = fakeHTMLCollection(listItems);
  listItems.forEach((item, index) => { item.children = fakeHTMLCollection(itemChildren[index]); });
  assert.doesNotThrow(() => environment.editor.setInteractionEnabled(false));
  assert.equal(itemChildren[0][0].disabled, true);
  tree.children = listItems;
  listItems.forEach((item, index) => { item.children = itemChildren[index]; });
  environment.editor.destroy();
});

/** 正式效果模式隐藏底图和编辑框，右栏始终保留并禁用布局编辑，切回时恢复。 */
test("面板始终留在独立右栏，纯预览保留右栏且不遮挡画布", () => {
  const environment = createMountedEditor();
  const initial = environment.editor.getLayout();
  const reference = findElements(environment.document.body, (node) => node.className === "vle-reference")[0];
  const svg = findElements(environment.document.body, (node) => node.className === "vle-svg")[0];
  const root = findElements(environment.document.body, (node) => node.getAttribute("data-threejs-visual-layout-editor"))[0];
  const panel = findElements(environment.document.body, (node) => node.className === "vle-panel")[0];
  const styles = root.children[0];
  const opacity = findElements(environment.document.body, (node) => node.getAttribute("aria-label") === "效果图透明度")[0];
  const xInput = findElements(environment.document.body, (node) => node.getAttribute("aria-label") === "节点 X 坐标")[0];
  environment.editor.setPreviewMode(true);
  assert.equal(environment.editor.isPreviewMode(), true);
  assert.equal(reference.style.display, "none");
  assert.equal(svg.style.display, "none");
  assert.notEqual(panel.style.display, "none");
  assert.equal(panel.parentNode, environment.controlsHost);
  assert.equal(root.contains(panel), false);
  assert.match(styles.textContent, /\.vle-panel\{position:static;width:100%/);
  assert.equal(opacity.disabled, true);
  xInput.value = "88";
  xInput.dispatch("change");
  assert.deepEqual(environment.editor.getLayout(), initial);
  environment.editor.setPreviewMode(false);
  assert.equal(environment.editor.isPreviewMode(), false);
  assert.equal(reference.style.display, "");
  assert.equal(svg.style.display, "");
  assert.equal(panel.parentNode, environment.controlsHost);
  assert.equal(reference.style.opacity, "0.35");
  assert.equal(opacity.disabled, false);
  assert.deepEqual(environment.editor.getLayout(), initial);
  environment.editor.destroy();
  assert.equal(panel.parentNode, null);
  assert.equal(root.parentNode, null);
});

/** 越界节点保留逻辑几何，只由 overlay 和 SVG 限制可视与命中范围。 */
test("viewport 裁剪越界叠图但不钳制草图节点坐标", () => {
  const { nodes, layout } = createFixture();
  nodes[0].target_bounds = { x: -24, y: 184, width: 460, height: 32 };
  const environment = createMountedEditor({ nodes, layout });
  const root = findElements(environment.document.body, (node) => node.getAttribute("data-threejs-visual-layout-editor"))[0];
  const svg = findElements(root, (node) => node.className === "vle-svg")[0];
  const styleText = root.children[0].textContent;
  const frame = findElements(svg, (node) => node.getAttribute("data-layout-node-id") === "hud.group")[0];

  assert.match(styleText, /\.vle-root\{[^}]*overflow:hidden/);
  assert.match(styleText, /\.vle-svg\{overflow:hidden/);
  assert.equal(frame.getAttribute("x"), "-20");
  assert.equal(frame.getAttribute("y"), "190");
  assert.equal(frame.getAttribute("width"), "460");
  assert.equal(nodes[0].target_bounds.x, -24);
  assert.equal(nodes[0].target_bounds.width, 460);
  environment.editor.destroy();
});


/** 完全出屏节点保留真实坐标，通过边缘代理框继续拖动，且覆盖层仍受 viewport 裁剪。 */
test("子节点越过父框或完全出屏后仍可通过独立框与边缘框拖动", async () => {
  const fixture = createFixture();
  fixture.layout.offsets["hud.button"] = { x: 500, y: -200 };
  const environment = createMountedEditor({ layout: fixture.layout, editorOptions: { saveOnChange: false } });
  const treeButton = findElements(environment.controlsHost, (node) => node.dataset.layoutNodeId === "hud.button")[0];
  treeButton.dispatch("click");
  const frame = findElements(environment.document.body, (node) => node.getAttribute("data-layout-node-id") === "hud.button")[0];
  assert.equal(frame.getAttribute("data-offscreen-handle"), "true");
  assert(Number(frame.getAttribute("x")) < 400);
  assert(Number(frame.getAttribute("y")) >= 0);
  frame.dispatch("pointerdown", { button: 0, pointerId: 21, clientX: 470, clientY: 60 });
  environment.window.dispatch("pointermove", { pointerId: 21, clientX: 438, clientY: 76 });
  assert.deepEqual(environment.editor.getLayout().offsets["hud.button"], { x: 468, y: -184 });
  environment.window.dispatch("pointerup", { pointerId: 21 });
  const parentFrame = findElements(environment.document.body, (node) => node.getAttribute("data-layout-node-id") === "hud.group")[0];
  assert.equal(parentFrame.style.pointerEvents, "stroke");
  const svg = findElements(environment.document.body, (node) => node.className === "vle-svg")[0];
  const hitFrames = Array.from(svg.children).filter((node) => node.getAttribute("data-layout-node-id"));
  assert.equal(hitFrames.at(-1).getAttribute("data-layout-node-id"), "hud.button");
  environment.editor.destroy();
});

/** 背景和携带背景的父级不可被任何输入移动，普通兄弟节点仍可编辑。 */
test("背景位置锁覆盖拖动键盘数值输入与祖先移动", () => {
  const fixture = createFixture();
  fixture.nodes.push({ layout_node_id: "hud.other", parent_layout_node_id: "hud.group", target_bounds: { x: 20, y: 20, width: 30, height: 30 } });
  const environment = createMountedEditor({ nodes: fixture.nodes, editorOptions: { lockedNodeIds: ["hud.button"], saveOnChange: false } });
  const initial = environment.editor.getLayout();
  for (const id of ["hud.button", "hud.group"]) {
    const treeButton = findElements(environment.controlsHost, (node) => node.dataset.layoutNodeId === id)[0];
    treeButton.dispatch("click");
    const frame = findElements(environment.document.body, (node) => node.getAttribute("data-layout-node-id") === id)[0];
    assert.equal(frame.style.pointerEvents, "none");
    frame.dispatch("pointerdown", { button: 0, pointerId: 11, clientX: 180, clientY: 150 });
    environment.window.dispatch("pointermove", { pointerId: 11, clientX: 210, clientY: 170 });
    frame.dispatch("keydown", { key: "ArrowRight" });
    const xInput = findElements(environment.document.body, (node) => node.getAttribute("aria-label") === "节点 X 坐标")[0];
    assert.equal(xInput.disabled, true);
    xInput.value = "123";
    xInput.dispatch("change");
    assert.deepEqual(environment.editor.getLayout(), initial);
  }
  const otherButton = findElements(environment.controlsHost, (node) => node.dataset.layoutNodeId === "hud.other")[0];
  otherButton.dispatch("click");
  const otherFrame = findElements(environment.document.body, (node) => node.getAttribute("data-layout-node-id") === "hud.other")[0];
  otherFrame.dispatch("keydown", { key: "ArrowRight" });
  assert.deepEqual(environment.editor.getLayout().offsets["hud.other"], { x: 1, y: 0 });
  environment.editor.destroy();
});


/** 子节点在父框外但仍位于预览内时使用自己的真实框命中，不需要先恢复父级坐标。 */
test("子节点离开父容器仍能从真实节点框再次开始拖动", () => {
  const fixture = createFixture();
  fixture.layout.offsets["hud.button"] = { x: -160, y: -120 };
  const environment = createMountedEditor({ layout: fixture.layout, editorOptions: { saveOnChange: false } });
  findElements(environment.controlsHost, (node) => node.dataset.layoutNodeId === "hud.button")[0].dispatch("click");
  const frame = findElements(environment.document.body, (node) => node.getAttribute("data-layout-node-id") === "hud.button")[0];
  assert.equal(frame.getAttribute("x"), "20");
  assert.equal(frame.getAttribute("y"), "30");
  assert.equal(frame.getAttribute("data-offscreen-handle"), null);
  frame.dispatch("pointerdown", { button: 0, pointerId: 22, clientX: 130, clientY: 80 });
  environment.window.dispatch("pointermove", { pointerId: 22, clientX: 162, clientY: 88 });
  assert.deepEqual(environment.editor.getLayout().offsets["hud.button"], { x: -128, y: -112 });
  environment.editor.destroy();
});

/** 坐标验收使用草图正式的祖先偏移算法，确保父容器移动后子节点一起移动。 */
async function createCoordinateEditor(options = {}) {
  const environment = createMountedEditor({ ...options, editorOptions: { saveOnChange: false, ...options.editorOptions } });
  environment.setReflowOverride((layout) => {
    for (const node of environment.nodes) environment.runtimeBounds.set(node.layout_node_id, calculatePageSketchNodeBounds(layout, environment.nodes, node.layout_node_id));
  });
  await environment.editor.reload(environment.editor.getLayout());
  const input = (label) => findElements(environment.controlsHost, (node) => node.getAttribute("aria-label") === label)[0];
  // 显式固定已有换算用例的左上角原点；自动推导及节点独立偏好由专门用例覆盖。
  for (const node of environment.nodes) {
    environment.editor.selectNode(node.layout_node_id);
    input("父容器参照点").value = "top-left";
    input("父容器参照点").dispatch("change");
  }
  environment.editor.selectNode(environment.nodes[0].layout_node_id);
  return { ...environment, x: input("节点 X 坐标"), y: input("节点 Y 坐标"), mode: input("坐标模式"), point: input("父容器参照点") };
}

/** 切换模式只换算显示数值，相对位置包含初始局部位置而非增量偏移。 */
test("父级相对与视口绝对坐标切换不改变布局或保存状态", async () => {
  const environment = await createCoordinateEditor();
  findElements(environment.controlsHost, (node) => node.dataset.layoutNodeId === "hud.button")[0].dispatch("click");
  const baseline = environment.editor.getLayout();
  assert.equal(environment.x.value, "82");
  assert.equal(environment.y.value, "47");
  environment.mode.value = "absolute";
  environment.mode.dispatch("change");
  assert.equal(environment.x.value, "186");
  assert.equal(environment.y.value, "153");
  environment.mode.value = "relative";
  environment.mode.dispatch("change");
  assert.equal(environment.x.value, "82");
  assert.deepEqual(environment.editor.getLayout(), baseline);
  assert.equal(environment.saved.length, 0);
  environment.editor.destroy();
});

/** 两种模式写同一最终位置；移动父容器不改子节点局部坐标，重置恢复初始读数。 */
test("相对及绝对输入等价并正确传播父容器位移", async () => {
  const environment = await createCoordinateEditor();
  const select = (id) => findElements(environment.controlsHost, (node) => node.dataset.layoutNodeId === id)[0].dispatch("click");
  select("hud.button");
  environment.x.value = "-20";
  environment.y.value = "25.5";
  environment.x.dispatch("change");
  assert.deepEqual(environment.editor.getLayout().offsets["hud.button"], { x: -100, y: -24.5 });
  environment.mode.value = "absolute";
  environment.mode.dispatch("change");
  assert.equal(environment.x.value, "84");
  assert.equal(environment.y.value, "131.5");
  environment.x.value = "200";
  environment.y.value = "180";
  environment.x.dispatch("change");
  assert.deepEqual(environment.editor.getLayout().offsets["hud.button"], { x: 16, y: 24 });
  environment.mode.value = "relative";
  environment.mode.dispatch("change");
  assert.equal(environment.x.value, "96");
  assert.equal(environment.y.value, "74");
  select("hud.group");
  environment.x.value = "140";
  environment.y.value = "130";
  environment.x.dispatch("change");
  assert.equal(environment.runtimeBounds.get("hud.button").x, 236);
  select("hud.button");
  assert.equal(environment.x.value, "96");
  assert.equal(environment.y.value, "74");
  environment.editor.resetToInitial();
  assert.equal(environment.x.value, "80");
  assert.equal(environment.y.value, "50");
  environment.x.value = "";
  environment.x.dispatch("change");
  assert.deepEqual(environment.editor.getLayout().offsets, {});
  assert.equal(environment.x.value, "80");
  environment.editor.destroy();
});

/** 顶层安全区使用自身左上角为原点，切换模式、缩放和操作锁不会变更真实坐标。 */
test("安全区原点与操作锁下的坐标模式保持正确", async () => {
  const fixture = createFixture();
  fixture.nodes[0].parent_layout_node_id = "safe-area";
  fixture.nodes[0].parent_target_bounds = { x: 12, y: 30, width: 360, height: 160 };
  const environment = await createCoordinateEditor({ nodes: fixture.nodes });
  assert.equal(environment.x.value, "92");
  assert.equal(environment.y.value, "76");
  environment.x.value = "20";
  environment.y.value = "15";
  environment.x.dispatch("change");
  assert.equal(environment.runtimeBounds.get("hud.group").x, 32);
  assert.equal(environment.runtimeBounds.get("hud.group").y, 45);
  environment.setHostRect({ left: 0, top: 0, width: 800, height: 400 });
  environment.editor.refreshViewport();
  assert.equal(environment.x.value, "20");
  environment.editor.setInteractionEnabled(false);
  assert.equal(environment.mode.disabled, true);
  environment.editor.setInteractionEnabled(true);
  environment.editor.setPreviewMode(true);
  assert.equal(environment.mode.disabled, true);
  environment.editor.destroy();
});

/** 九个参照点都以父容器即时边界换算，切换不得写布局或触发持久化。 */
test("相对参照点支持父容器九点且切换不移动节点", async () => {
  const environment = await createCoordinateEditor();
  findElements(environment.controlsHost, (node) => node.dataset.layoutNodeId === "hud.button")[0].dispatch("click");
  const baseline = environment.editor.getLayout();
  for (const [point, x, y] of [["top-left", 82, 47], ["top-right", -218, 47], ["bottom-left", 82, -153], ["bottom-right", -218, -153], ["top-center", -68, 47], ["bottom-center", -68, -153], ["left-center", 82, -53], ["right-center", -218, -53], ["center", -68, -53]]) {
    environment.point.value = point;
    environment.point.dispatch("change");
    assert.equal(Number(environment.x.value), x);
    assert.equal(Number(environment.y.value), y);
    assert.deepEqual(environment.editor.getLayout(), baseline);
  }
  assert.equal(environment.saved.length, 0);
  environment.mode.value = "absolute";
  environment.mode.dispatch("change");
  assert.equal(environment.point.disabled, true);
  assert.equal(environment.x.value, "186");
  environment.mode.value = "relative";
  environment.mode.dispatch("change");
  assert.equal(environment.point.disabled, false);
  assert.equal(environment.point.value, "center");
  assert.equal(environment.x.value, "-68");
  environment.editor.destroy();
});

/** 各参照点输入换算为同一目标位置，父级位移传播后局部坐标保持不变。 */
test("九种父容器参照点输入等价并随父容器一起移动", async () => {
  for (const [point, x, y] of [["top-left", 10, 20], ["top-right", -290, 20], ["bottom-left", 10, -180], ["bottom-right", -290, -180], ["center", -140, -80], ["top-center", -140, 20], ["bottom-center", -140, -180], ["left-center", 10, -80], ["right-center", -290, -80]]) {
    const environment = await createCoordinateEditor();
    const select = (id) => findElements(environment.controlsHost, (node) => node.dataset.layoutNodeId === id)[0].dispatch("click");
    select("hud.button");
    environment.point.value = point;
    environment.point.dispatch("change");
    environment.x.value = String(x);
    environment.y.value = String(y);
    environment.x.dispatch("change");
    assert.deepEqual(environment.editor.getLayout().offsets["hud.button"], { x: -70, y: -30 });
    assert.equal(environment.runtimeBounds.get("hud.button").x, 114);
    assert.equal(environment.runtimeBounds.get("hud.button").y, 126);
    select("hud.group");
    environment.mode.value = "absolute";
    environment.mode.dispatch("change");
    environment.x.value = "150";
    environment.y.value = "140";
    environment.x.dispatch("change");
    select("hud.button");
    environment.mode.value = "relative";
    environment.mode.dispatch("change");
    assert.equal(Number(environment.x.value), x);
    assert.equal(Number(environment.y.value), y);
    assert.equal(environment.runtimeBounds.get("hud.button").x, 160);
    environment.editor.destroy();
  }
});

/** 顶层视口和安全区也支持非零参照点，中心可为小数；锁定与预览禁用切换。 */
test("视口和安全区中心参照点正确处理尺寸与操作锁", async () => {
  for (const safeArea of [false, true]) {
    const fixture = createFixture();
    if (safeArea) {
      fixture.nodes[0].parent_layout_node_id = "safe-area";
      fixture.nodes[0].parent_target_bounds = { x: 12, y: 30, width: 361, height: 161 };
    }
    const environment = await createCoordinateEditor({ nodes: fixture.nodes });
    environment.point.value = "center";
    environment.point.dispatch("change");
    assert.equal(Number(environment.x.value), safeArea ? -88.5 : -96);
    assert.equal(Number(environment.y.value), safeArea ? -4.5 : 6);
    environment.x.value = "0";
    environment.y.value = "0";
    environment.x.dispatch("change");
    assert.equal(environment.runtimeBounds.get("hud.group").x, safeArea ? 192.5 : 200);
    assert.equal(environment.runtimeBounds.get("hud.group").y, safeArea ? 110.5 : 100);
    environment.editor.setInteractionEnabled(false);
    assert.equal(environment.point.disabled, true);
    environment.editor.setInteractionEnabled(true);
    assert.equal(environment.point.disabled, false);
    environment.editor.setPreviewMode(true);
    assert.equal(environment.point.disabled, true);
    environment.editor.destroy();
  }
});

/** 显示点击和树点击共享一个选择状态，只同步高亮与坐标，不修改布局或保存。 */
test("预览框与节点树选择互相同步且不改变草图", () => {
  const environment = createMountedEditor({ editorOptions: { saveOnChange: false } });
  const baseline = environment.editor.getLayout();
  const frame = findElements(environment.document.body, (node) => node.getAttribute("data-layout-node-id") === "hud.button")[0];
  frame.dispatch("pointerdown", { button: 0, pointerId: 7, clientX: 180, clientY: 150 });
  assert.equal(environment.editor.getSelectedNodeId(), "hud.button");
  const button = findElements(environment.controlsHost, (node) => node.dataset.layoutNodeId === "hud.button")[0];
  assert.equal(button.getAttribute("aria-current"), "true");
  findElements(environment.controlsHost, (node) => node.dataset.layoutNodeId === "hud.group")[0].dispatch("click");
  assert.equal(environment.editor.getSelectedNodeId(), "hud.group");
  assert.equal(findElements(environment.document.body, (node) => node.getAttribute("data-layout-node-id") === "hud.group")[0].getAttribute("class"), "vle-frame vle-frame-selected");
  assert.deepEqual(environment.editor.getLayout(), baseline);
  assert.equal(environment.saved.length, 0);
  environment.editor.destroy();
});

/** 背景允许从显示内容选中查看，但不开放移动；锁定、正式预览及销毁禁止选择变更。 */
test("显示选择允许锁定节点且遵守操作锁与销毁状态", () => {
  const environment = createMountedEditor({ editorOptions: { lockedNodeIds: ["hud.button"], saveOnChange: false } });
  const baseline = environment.editor.getLayout();
  assert.equal(environment.editor.selectNode("hud.button"), true);
  assert.equal(environment.editor.getSelectedNodeId(), "hud.button");
  const input = findElements(environment.controlsHost, (node) => node.getAttribute("aria-label") === "节点 X 坐标")[0];
  assert.equal(input.disabled, true);
  environment.editor.setInteractionEnabled(false);
  assert.equal(environment.editor.selectNode("hud.group"), false);
  findElements(environment.controlsHost, (node) => node.dataset.layoutNodeId === "hud.group")[0].dispatch("click");
  assert.equal(environment.editor.getSelectedNodeId(), "hud.button");
  environment.editor.setInteractionEnabled(true);
  environment.editor.setPreviewMode(true);
  assert.equal(environment.editor.selectNode("hud.group"), false);
  environment.editor.setPreviewMode(false);
  assert.equal(environment.editor.selectNode("hud.group"), true);
  assert.deepEqual(environment.editor.getLayout(), baseline);
  environment.editor.destroy();
  assert.equal(environment.editor.selectNode("hud.button"), false);
});

/** 新节点默认相对坐标，并依据父级内位置推导九个参照点，不继承其他节点的模式。 */
test("按节点相对位置推导默认参照点并独立保留手动偏好", () => {
  const fixture = createFixture();
  fixture.layout.offsets = {};
  fixture.nodes[0].target_bounds = { x: 20, y: 10, width: 100, height: 50 };
  const points = [["top-left", 0.05, 0.05], ["top-right", 0.95, 0.05], ["bottom-left", 0.05, 0.95], ["bottom-right", 0.95, 0.95], ["center", 0.5, 0.5], ["top-center", 0.5, 0.05], ["bottom-center", 0.5, 0.95], ["left-center", 0.05, 0.5], ["right-center", 0.95, 0.5]];
  fixture.nodes = [fixture.nodes[0], ...points.map(([id, x, y]) => ({ layout_node_id: id, parent_layout_node_id: "hud.group", target_bounds: { x: 20 + x * 100, y: 10 + y * 50, width: 5, height: 5 } }))];
  const environment = createMountedEditor({ nodes: fixture.nodes, layout: fixture.layout, editorOptions: { saveOnChange: false } });
  const input = (label) => findElements(environment.controlsHost, (node) => node.getAttribute("aria-label") === label)[0];
  const mode = input("坐标模式"), point = input("父容器参照点");
  const baseline = environment.editor.getLayout();
  for (const [id] of points) {
    environment.editor.selectNode(id);
    assert.equal(mode.value, "relative");
    assert.equal(point.value, id);
  }
  environment.editor.selectNode("top-left");
  mode.value = "absolute";
  mode.dispatch("change");
  environment.editor.selectNode("top-right");
  assert.equal(mode.value, "relative");
  assert.equal(point.value, "top-right");
  point.value = "bottom-left";
  point.dispatch("change");
  environment.editor.selectNode("top-left");
  assert.equal(mode.value, "absolute");
  environment.editor.selectNode("top-right");
  assert.equal(point.value, "bottom-left");
  assert.deepEqual(environment.editor.getLayout(), baseline);
  assert.equal(environment.saved.length, 0);
  environment.editor.destroy();
});

/** 顶层安全区原点同样参与推导，父容器移动与重置不隐式改变已选择的参照点。 */
test("安全区自动参照点保持稳定且使用实际相对坐标", () => {
  const fixture = createFixture();
  fixture.layout.offsets = {};
  fixture.nodes[0].parent_layout_node_id = "safe-area";
  fixture.nodes[0].parent_target_bounds = { x: 10, y: 20, width: 200, height: 100 };
  fixture.nodes[0].target_bounds = { x: 200, y: 110, width: 10, height: 10 };
  const environment = createMountedEditor({ nodes: fixture.nodes, layout: fixture.layout, editorOptions: { saveOnChange: false } });
  const input = (label) => findElements(environment.controlsHost, (node) => node.getAttribute("aria-label") === label)[0];
  assert.equal(input("父容器参照点").value, "bottom-right");
  assert.equal(input("节点 X 坐标").value, "-10");
  assert.equal(input("节点 Y 坐标").value, "-10");
  input("节点 X 坐标").value = "-180";
  input("节点 X 坐标").dispatch("change");
  assert.equal(input("父容器参照点").value, "bottom-right");
  environment.editor.resetToInitial();
  assert.equal(input("父容器参照点").value, "bottom-right");
  environment.editor.destroy();
});
