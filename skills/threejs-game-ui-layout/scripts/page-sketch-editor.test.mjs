import assert from "node:assert/strict";
import test from "node:test";
import { calculateDevicePreviewGeometry, initializePageSketchApplication } from "./page-sketch-editor.mjs";

const SHA = `sha256:${"e".repeat(64)}`;

/** 创建可暂停的异步步骤，以便在保存/确认未完成时检查 UI 是否仍可编辑。 */
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

/** 提供页面控制器所需的轻量 DOM 节点与可观察事件监听器。 */
class FakeElement {
  /** 初始化模拟元素的样式、属性、子树和交互状态。 */
  constructor(tagName, document) {
    this.tagName = tagName;
    this.ownerDocument = document;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.disabled = false;
    this.value = "";
    this.textContent = "";
  }

  /** 注册页面控件事件。 */
  addEventListener(type, callback) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), callback]);
  }

  /** 只向未禁用控件派发事件，并返回监听器结果供测试等待打开过程。 */
  dispatch(type, details = {}) {
    if (this.disabled) return [];
    const event = { ...details, type, target: this, currentTarget: this, preventDefault() {} };
    return (this.listeners.get(type) ?? []).map((callback) => callback.call(this, event));
  }

  /** 追加子节点并维护 DOM 父子关系。 */
  append(...children) { this.children.push(...children); }

  /** 替换子树内容。 */
  replaceChildren(...children) { this.children = [...children]; }

  /** 设置并保存页面可访问性属性。 */
  setAttribute(name, value) { this.attributes.set(name, String(value)); }

  /** 移除本地 data 属性。 */
  removeAttribute(name) { this.attributes.delete(name); }
}

/** 创建页面控制器使用的必要按钮、画布和 window。 */
function createPageDocument() {
  const elements = new Map();
  const document = {
    createElement(tagName) { return new FakeElement(tagName, document); },
    getElementById(id) { return elements.get(id); },
    listeners: new Map(),
    addEventListener(type, callback) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), callback]); },
  };
  for (const [id, tag] of [
    ["stage-frame", "section"], ["stage-surface", "div"], ["open-sketch", "button"], ["toggle-preview", "button"], ["save-sketch", "button"], ["reset-sketch", "button"],
    ["confirm-sketch", "button"], ["page-status", "span"], ["resource-errors", "aside"],
    ["stage-device", "div"], ["layout-controls", "div"], ["preview-device", "select"], ["device-orientation", "select"],
    ["device-summary", "p"], ["toggle-fullscreen", "button"],
  ]) elements.set(id, document.createElement(tag));
  elements.get("stage-frame").clientWidth = 600;
  elements.get("stage-frame").clientHeight = 400;
  const window = {
    location: { origin: "https://game.test" },
    listeners: new Map(),
    addEventListener(type, callback) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), callback]); },
    removeEventListener() {},
  };
  document.documentElement = document.createElement("html");
  document.documentElement.requestFullscreen = async () => { document.fullscreenElement = document.documentElement; };
  document.exitFullscreen = async () => { document.fullscreenElement = null; };
  document.defaultView = window;
  return { document, elements };
}

/** 创建最小草图文档；实际依赖由 adapters 控制，不触发浏览器文件或网络操作。 */
function createSketch() {
  const layout = { schema: "threejs-visual-layout/1.0", target_sha256: SHA, scene_id: "HudScene", state_id: "default", offsets: {} };
  return {
    schema: "threejs-page-sketch/1.0", target_sha256: SHA, scene_id: "HudScene", state_id: "default", work_item_id: "WI-1", candidate_version: "candidate-1",
    viewport: { width: 200, height: 100 }, reference_file: "refs/reference.png", v2_nodes_file: "evidence/nodes.json", v2_nodes_sha256: SHA,
    v3_manifest_file: "evidence/manifest.json", v3_manifest_sha256: SHA, v3_evidence_file: "evidence/v3-pass.json", v3_evidence_sha256: SHA,
    v3_assets: [], nodes: [{ layout_node_id: "hud.root", parent_layout_node_id: "viewport", target_bounds: { x: 0, y: 0, width: 200, height: 100 } }],
    node_presentations: { "hud.root": { kind: "container" } }, layout, confirmation: null,
  };
}

test("应用层保存和确认期间锁住节点、打开、保存、确认并最终解锁", async () => {
  const { document, elements } = createPageDocument();
  const saveGate = deferred();
  const saveStarted = deferred();
  const confirmGate = deferred();
  const confirmStarted = deferred();
  let diskDocument = createSketch();
  let openCount = 0;
  let saveCount = 0;
  let confirmCount = 0;
  let store;
  let editor;
  let selectDisplayed;

  store = {
    getDocument() { return structuredClone(diskDocument); },
    async saveDraft(layout) {
      saveCount += 1;
      saveStarted.resolve();
      await saveGate.promise;
      diskDocument = { ...diskDocument, layout: structuredClone(layout), confirmation: null };
      return structuredClone(diskDocument);
    },
    async confirm({ previewReady, layout }) {
      confirmCount += 1;
      confirmStarted.resolve();
      assert.equal(previewReady, true);
      assert.deepEqual(layout, diskDocument.layout);
      await confirmGate.promise;
      diskDocument = { ...diskDocument, confirmation: { status: "accepted", confirmed_at: "2026-10-01T00:00:00.000Z", content_sha256: SHA } };
      return structuredClone(diskDocument);
    },
  };

  await initializePageSketchApplication({
    document,
    projectRootUrl: new URL("https://game.test/game/"),
    adapters: {
      async pickStore() { openCount += 1; return store; },
      async loadSources() { return { assets: new Map(), confirmationError: null, errors: [], referenceUrl: "blob:reference", revoke() {} }; },
      async verifySources() { return { errors: [], healthy: true }; },
      async mountPreview(options) {
        selectDisplayed = options.onNodeSelect;
        return { destroy() {}, errors: [], getBounds: () => ({ x: 0, y: 0, width: 200, height: 100 }), getViewportRect: () => ({ left: 0, top: 0, width: 200, height: 100 }), isHealthy: () => true, reflow() {} };
      },
      mountEditor(options) {
        assert.equal(options.controlsHost, elements.get("layout-controls"));
        assert.notEqual(options.controlsHost, options.host);
        let layout = structuredClone(options.layout);
        editor = {
          interactionEnabled: true,
          previewMode: false,
          geometryRefreshes: 0,
          selectedId: null,
          /** 模拟公共选择入口，验证显示节点回调不绕过编辑器操作锁。 */
          selectNode(id) {
            if (!this.interactionEnabled || this.previewMode) return false;
            this.selectedId = id;
            return true;
          },
          refreshViewport() { this.geometryRefreshes += 1; },
          destroy() {},
          getLayout() { return structuredClone(layout); },
          setInteractionEnabled(enabled) { this.interactionEnabled = enabled; },
          setPreviewMode(enabled) { this.previewMode = enabled; },
          /** 模拟恢复初始偏移并通知宿主草稿已修改。 */
          resetToInitial() {
            if (!this.interactionEnabled || this.previewMode) throw new Error("当前不能重置");
            layout = { ...layout, offsets: {} };
            options.onLayoutChange(layout);
            return structuredClone(layout);
          },
          attemptEdit(nextLayout) {
            if (!this.interactionEnabled) return false;
            layout = structuredClone(nextLayout);
            options.onLayoutChange(layout);
            return true;
          },
        };
        return editor;
      },
    },
  });

  const [openOperation] = elements.get("open-sketch").dispatch("click");
  await openOperation;
  assert.equal(selectDisplayed("hud.root"), true);
  assert.equal(editor.selectedId, "hud.root");
  assert.equal(openCount, 1);
  const originalSketch = structuredClone(diskDocument);
  const device = elements.get("preview-device");
  device.value = "phone";
  device.dispatch("change");
  assert.equal(elements.get("stage-device").style.width, "390px");
  assert.equal(elements.get("stage-device").style.height, "844px");
  assert.equal(elements.get("stage-surface").style.transform, "scale(1.95)");
  const refreshBeforeRotate = editor.geometryRefreshes;
  elements.get("device-orientation").value = "landscape";
  elements.get("device-orientation").dispatch("change");
  assert.equal(elements.get("stage-device").style.width, "844px");
  assert.equal(elements.get("stage-device").style.height, "390px");
  assert(editor.geometryRefreshes > refreshBeforeRotate);
  assert.deepEqual(diskDocument, originalSketch);
  const [enterFullscreen] = elements.get("toggle-fullscreen").dispatch("click");
  await enterFullscreen;
  assert.equal(document.fullscreenElement, document.documentElement);
  assert.equal(elements.get("toggle-fullscreen").textContent, "退出 Web 全屏");
  document.fullscreenElement = null;
  for (const callback of document.listeners.get("fullscreenchange")) callback();
  assert.equal(elements.get("toggle-fullscreen").textContent, "进入 Web 全屏");
  const previewButton = elements.get("toggle-preview");
  const beforePreview = editor.getLayout();
  previewButton.dispatch("click");
  assert.equal(previewButton.textContent, "返回布局编辑");
  assert.equal(editor.previewMode, true);
  assert.equal(elements.get("reset-sketch").disabled, true);
  assert.deepEqual(editor.getLayout(), beforePreview);
  previewButton.dispatch("click");
  assert.equal(previewButton.textContent, "预览正式效果");
  assert.equal(editor.previewMode, false);
  assert.deepEqual(editor.getLayout(), beforePreview);

  elements.get("save-sketch").dispatch("click");
  await saveStarted.promise;
  assert.equal(editor.interactionEnabled, false);
  assert.equal(selectDisplayed("hud.other"), false);
  assert.equal(editor.selectedId, "hud.root");
  for (const id of ["open-sketch", "toggle-preview", "reset-sketch", "save-sketch", "confirm-sketch"]) assert.equal(elements.get(id).disabled, true);
  const attemptedLayout = { ...createSketch().layout, offsets: { "hud.root": { x: 30, y: 0 } } };
  assert.equal(editor.attemptEdit(attemptedLayout), false);
  elements.get("save-sketch").dispatch("click");
  elements.get("open-sketch").dispatch("click");
  assert.equal(saveCount, 1);
  assert.equal(openCount, 1);
  saveGate.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(editor.interactionEnabled, true);
  assert.deepEqual(diskDocument.layout.offsets, {});
  assert.equal(elements.get("confirm-sketch").disabled, false);

  elements.get("confirm-sketch").dispatch("click");
  await confirmStarted.promise;
  assert.equal(editor.interactionEnabled, false);
  for (const id of ["open-sketch", "toggle-preview", "reset-sketch", "save-sketch", "confirm-sketch"]) assert.equal(elements.get(id).disabled, true);
  assert.equal(editor.attemptEdit(attemptedLayout), false);
  elements.get("save-sketch").dispatch("click");
  elements.get("confirm-sketch").dispatch("click");
  assert.equal(saveCount, 1);
  assert.equal(confirmCount, 1);
  confirmGate.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(editor.interactionEnabled, true);
  assert.equal(Object.hasOwn(diskDocument.confirmation, "confirmed_by"), false);
  assert.equal(elements.get("confirm-sketch").disabled, true);
  const confirmedDisk = structuredClone(diskDocument);
  editor.attemptEdit({ ...createSketch().layout, offsets: { "hud.root": { x: 48, y: -8 } } });
  assert.deepEqual(editor.getLayout().offsets, { "hud.root": { x: 48, y: -8 } });
  elements.get("reset-sketch").dispatch("click");
  assert.deepEqual(editor.getLayout().offsets, {});
  assert.match(elements.get("page-status").textContent, /恢复初始坐标与父子关系/);
  assert.deepEqual(diskDocument, confirmedDisk, "重置不能绕过显式保存直接覆写文件");
  assert.equal(elements.get("confirm-sketch").disabled, true);
  elements.get("save-sketch").dispatch("click");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(diskDocument.confirmation, null);
  assert.equal(elements.get("confirm-sketch").disabled, false);
});


test("设备预览两层缩放保持逻辑坐标，手机、平板和全屏留边都位于可用区域", () => {
  for (const device of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    for (const available of [{ width: 600, height: 400 }, { width: 1500, height: 1000 }]) {
      const viewport = { width: 1280, height: 720 };
      const result = calculateDevicePreviewGeometry(viewport, device, available);
      assert(result.deviceLeft >= 0 && result.deviceTop >= 0);
      assert(result.contentLeft >= 0 && result.contentTop >= 0);
      assert(device.width * result.deviceScale <= available.width + 1e-8);
      assert(device.height * result.deviceScale <= available.height + 1e-8);
      assert(viewport.width * result.contentScale <= device.width + 1e-8);
      assert(viewport.height * result.contentScale <= device.height + 1e-8);
      assert.deepEqual(viewport, { width: 1280, height: 720 });
    }
  }
  assert.throws(() => calculateDevicePreviewGeometry({ width: 0, height: 10 }, { width: 10, height: 10 }, { width: 10, height: 10 }), /正有限数/);
});
