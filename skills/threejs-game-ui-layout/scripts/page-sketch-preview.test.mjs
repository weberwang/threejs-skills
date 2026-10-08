import assert from "node:assert/strict";
import test from "node:test";
import { mountPageSketchPreview, loadPageSketchSources, verifyPageSketchSources } from "./page-sketch-preview.mjs";

const SHA = `sha256:${"d".repeat(64)}`;

/** 创建包含父容器及共享资源多个图层的页面草图。 */
function createSketch({ rootPresentation, imageAssets = ["hero", "badge"] } = {}) {
  return {
    schema: "threejs-page-sketch/1.0",
    target_sha256: SHA,
    scene_id: "HudScene",
    state_id: "default",
    work_item_id: "WI-HUD",
    candidate_version: "candidate-2",
    viewport: { width: 200, height: 100 },
    reference_file: "refs/%2e%2e/reference.png",
    v2_nodes_file: "evidence/nodes.json",
    v2_nodes_sha256: SHA,
    v3_manifest_file: "evidence/manifest.json",
    v3_manifest_sha256: SHA,
    v3_evidence_file: "evidence/v3-pass.json",
    v3_evidence_sha256: SHA,
    v3_assets: imageAssets.map((asset_id) => ({ asset_id, file: `public/${asset_id}.png`, sha256: SHA, layout_node_id: "hud.hero" })),
    nodes: [
      { layout_node_id: "hud.root", parent_layout_node_id: "viewport", target_bounds: { x: 0, y: 0, width: 200, height: 100 } },
      { layout_node_id: "hud.hero", parent_layout_node_id: "hud.root", target_bounds: { x: 20, y: 10, width: 48, height: 48 } },
    ],
    node_presentations: {
      "hud.root": rootPresentation ?? { kind: "container" },
      "hud.hero": { kind: "image", asset_ids: imageAssets, object_fit: "contain" },
    },
    layout: { schema: "threejs-visual-layout/1.0", target_sha256: SHA, scene_id: "HudScene", state_id: "default", offsets: {} },
    confirmation: null,
  };
}

/** 提供预览模块需要的最小 DOM 元素，便于断言实际渲染 bounds。 */
function createHost() {
  const document = {
    createElement(tagName) {
      return {
        tagName,
        ownerDocument: document,
        children: [],
        style: {},
        dataset: {},
        listeners: new Map(),
        /** 记录显示选择事件，以便验证预览卸载后不再回调。 */
        addEventListener(type, callback) { this.listeners.set(type, callback); },
        /** 模拟浏览器移除事件处理器。 */
        removeEventListener(type, callback) { if (this.listeners.get(type) === callback) this.listeners.delete(type); },
        /** 派发实际显示节点的指针事件。 */
        dispatch(type, event = {}) { this.listeners.get(type)?.({ ...event, currentTarget: this }); },
        append(...children) { this.children.push(...children); },
      };
    },
  };
  const host = document.createElement("div");
  host.ownerDocument = document;
  host.replaceChildren = (...children) => { host.children = [...children]; };
  host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 });
  return host;
}

/** 创建已验证资源映射，避免本组测试依赖网络和 ThreeJS 运行时。 */
function createSources(assetIds = ["hero", "badge"], runtimePrograms = new Map()) {
  return {
    assets: new Map(assetIds.map((id) => [id, `blob:${id}`])),
    errors: [],
    runtimePrograms,
    revoke() {},
  };
}

test("父级偏移进入预览实际bounds，子节点与同节点图片按绝对图层叠放", async () => {
  const host = createHost();
  const preview = await mountPageSketchPreview({ host, sketch: createSketch(), sources: createSources() });
  assert.deepEqual(preview.getBounds("hud.hero"), { x: 20, y: 10, width: 48, height: 48 });
  const moved = {
    ...createSketch().layout,
    offsets: { "hud.root": { x: 13, y: -4 } },
  };
  preview.reflow(moved);
  assert.deepEqual(preview.getBounds("hud.hero"), { x: 33, y: 6, width: 48, height: 48 });
  const imageNode = host.children.find((child) => child.dataset.layoutNodeId === "hud.hero");
  assert.equal(imageNode.style.left, "33px");
  assert.deepEqual(imageNode.children.map((image) => [image.style.position, image.style.inset]), [["absolute", "0"], ["absolute", "0"]]);
  assert.deepEqual(imageNode.children.map((image) => image.style.zIndex), ["0", "1"]);
  assert.equal(preview.isHealthy(), true);
  preview.destroy();
});

test("图片资源缺失时画布明确报错且预览不能确认", async () => {
  const host = createHost();
  const preview = await mountPageSketchPreview({ host, sketch: createSketch(), sources: createSources([]) });
  assert.equal(preview.isHealthy(), false);
  assert.equal(preview.errors.filter((message) => message.includes("正式图片资源")).length, 2);
  preview.destroy();
});

test("runtime mount/update Promise 被拒绝为异步布局并阻断预览", async () => {
  const mountHost = createHost();
  const mountPreview = await mountPageSketchPreview({
    host: mountHost,
    sketch: createSketch({ rootPresentation: { kind: "runtime-program", module_file: "runtime.js", module_sha256: SHA } }),
    sources: createSources(["hero", "badge"], new Map([["hud.root", () => Promise.reject(new Error("async mount"))]])),
  });
  assert.equal(mountPreview.isHealthy(), false);
  assert.ok(mountPreview.errors.some((message) => message.includes("mountPreview 必须同步")));
  mountPreview.destroy();

  const updatePreview = await mountPageSketchPreview({
    host: createHost(),
    sketch: createSketch({ rootPresentation: { kind: "runtime-program", module_file: "runtime.js", module_sha256: SHA } }),
    sources: createSources(["hero", "badge"], new Map([["hud.root", () => ({ update() { return Promise.reject(new Error("async update")); } })]])),
  });
  assert.equal(updatePreview.isHealthy(), false);
  assert.ok(updatePreview.errors.some((message) => message.includes("布局重排失败")));
  updatePreview.destroy();
});

test("项目子路径与百分号文件名保持在配置资源根下，控制字符路径被拒绝", async () => {
  const referenceBytes = new TextEncoder().encode("reference bytes");
  const hashes = new Map([
    ["/game/evidence/nodes.json", new TextEncoder().encode("nodes")],
    ["/game/evidence/manifest.json", new TextEncoder().encode(JSON.stringify({ regions: [{ id: "backdrop", layer: "background", scene_id: "HudScene", state_id: "default", layout_node_ids: ["hud.hero"] }] }))],
    ["/game/evidence/v3-pass.json", new TextEncoder().encode("evidence")],
    ["/game/refs/%252e%252e/reference.png", referenceBytes],
    ["/game/public/hero.png", new TextEncoder().encode("hero")],
    ["/game/public/badge.png", new TextEncoder().encode("badge")],
  ]);
  const sha = async (bytes) => {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  };
  const sketch = createSketch();
  sketch.nodes.find((node) => node.layout_node_id === "hud.hero").parent_layout_node_id = "viewport";
  sketch.target_sha256 = await sha(referenceBytes);
  sketch.layout.target_sha256 = sketch.target_sha256;
  sketch.v2_nodes_sha256 = await sha(hashes.get("/game/evidence/nodes.json"));
  sketch.v3_manifest_sha256 = await sha(hashes.get("/game/evidence/manifest.json"));
  sketch.v3_evidence_sha256 = await sha(hashes.get("/game/evidence/v3-pass.json"));
  for (const asset of sketch.v3_assets) asset.sha256 = await sha(hashes.get(`/game/${asset.file}`));
  const requested = [];
  const urlApi = { createObjectURL() { return "blob:preview"; }, revokeObjectURL() {} };
  const sources = await loadPageSketchSources(sketch, {
    projectRootUrl: "https://game.test/game/",
    pageOrigin: "https://game.test",
    fetcher: async (url) => {
      requested.push(url);
      const bytes = hashes.get(url.pathname);
      return bytes
        ? { ok: true, headers: { get: () => url.pathname.endsWith(".png") ? "image/png" : "application/json" }, async arrayBuffer() { return bytes; } }
        : { ok: false, status: 404 };
    },
    urlApi,
    BlobCtor: Blob,
    imageDecoder: async () => {},
  });
  assert.deepEqual(sources.errors, []);
  assert.deepEqual(sources.lockedNodeIds, ["hud.hero"]);
  assert.equal(requested.some((url) => url.pathname === "/game/refs/%252e%252e/reference.png"), true);
  assert.equal(requested.every((url) => url.pathname.startsWith("/game/") && url.origin === "https://game.test"), true);
  hashes.set("/game/public/hero.png", new TextEncoder().encode("externally changed asset bytes"));
  const drift = await verifyPageSketchSources(sketch, {
    projectRootUrl: "https://game.test/game/",
    pageOrigin: "https://game.test",
    fetcher: async (url) => {
      const bytes = hashes.get(url.pathname);
      return bytes
        ? { ok: true, headers: { get: () => "application/octet-stream" }, async arrayBuffer() { return bytes; } }
        : { ok: false, status: 404 };
    },
  });
  assert.equal(drift.healthy, false);
  assert.ok(drift.errors.some((message) => message.includes("正式资源 hero：public/hero.png SHA 不匹配")));
  sources.revoke();

  const invalid = createSketch();
  invalid.reference_file = "refs/bad\u0000name.png";
  await assert.rejects(loadPageSketchSources(invalid, { projectRootUrl: "https://game.test/game/", pageOrigin: "https://game.test" }), /控制字符/);
});

/** 显示内容的点击携带稳定节点身份，空父容器不得阻挡图片节点。 */
test("显示内容支持选择且空容器穿透命中并在卸载时释放事件", async () => {
  const host = createHost();
  const selections = [];
  const preview = await mountPageSketchPreview({ host, sketch: createSketch(), sources: createSources(), onNodeSelect: (id) => selections.push(id) });
  const [container, image] = host.children;
  assert.equal(container.style.pointerEvents, "none");
  assert.equal(image.style.pointerEvents, "auto");
  image.dispatch("pointerdown", { button: 0 });
  assert.deepEqual(selections, ["hud.hero"]);
  image.dispatch("pointerdown", { button: 2 });
  assert.equal(selections.length, 1);
  preview.destroy();
  image.dispatch("pointerdown", { button: 0 });
  assert.equal(selections.length, 1);
});

/** 有可见装饰的容器可以点击选择，纯预览不提供选择回调时保留穿透行为。 */
test("可见容器显示内容可选择且无回调时不截获输入", async () => {
  const host = createHost();
  const selections = [];
  const sketch = createSketch({ rootPresentation: { kind: "container", style: { fill: "#123456" } } });
  const preview = await mountPageSketchPreview({ host, sketch, sources: createSources(), onNodeSelect: (id) => selections.push(id) });
  assert.equal(host.children[0].style.pointerEvents, "auto");
  host.children[0].dispatch("pointerdown", { button: 0 });
  assert.deepEqual(selections, ["hud.root"]);
  preview.destroy();
  const plain = await mountPageSketchPreview({ host, sketch, sources: createSources() });
  assert.equal(host.children[0].style.pointerEvents, "none");
  plain.destroy();
});
