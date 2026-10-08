import assert from "node:assert/strict";
import test from "node:test";
import { createPageSketchFileStore, pickPageSketchFileStore } from "./page-sketch-file-store.mjs";
import { hashPageSketchContent } from "./page-sketch-contract.mjs";

const SHA = `sha256:${"b".repeat(64)}`;

/** 生成只含文本和容器的草图文件，避免测试依赖真实图片。 */
function createSketch(confirmation = null) {
  const nodes = [{ layout_node_id: "root", parent_layout_node_id: "viewport", target_bounds: { x: 0, y: 0, width: 200, height: 100 } }];
  return {
    schema: "threejs-page-sketch/1.0", target_sha256: SHA, scene_id: "HudScene", state_id: "default", work_item_id: "WI-1", candidate_version: "candidate-2",
    viewport: { width: 200, height: 100 }, reference_file: "docs/reference.png", v2_nodes_file: "docs/nodes.json", v2_nodes_sha256: SHA,
    v3_manifest_file: "docs/visual-assets.json", v3_manifest_sha256: SHA, v3_evidence_file: "docs/v3-pass.json", v3_evidence_sha256: SHA,
    v3_assets: [], nodes, node_presentations: { root: { kind: "container" } },
    layout: { schema: "threejs-visual-layout/1.0", target_sha256: SHA, scene_id: "HudScene", state_id: "default", offsets: {} }, confirmation,
  };
}

/** 使用内存文件句柄模拟用户选择的 JSON 文件及原子写回结果。 */
function memoryHandle(initial = createSketch(), { delayWrite = false } = {}) {
  let contents = `${JSON.stringify(initial, null, 2)}\n`;
  let failWrite = false;
  let activeWriter = false;
  let releaseDelayedWrite = null;
  return {
    get contents() { return contents; },
    set contents(value) { contents = value; },
    set failWrite(value) { failWrite = value; },
    get activeWriter() { return activeWriter; },
    releaseWrite() { releaseDelayedWrite?.(); },
    async getFile() { return { async text() { return contents; } }; },
    async createWritable(options = {}) {
      if (options.mode !== "exclusive") throw new Error("必须请求跨页面排他流");
      if (activeWriter) throw new Error("文件已有独占写入流");
      activeWriter = true;
      let pending;
      return {
        async write(value) {
          if (delayWrite) await new Promise((resolve) => { releaseDelayedWrite = resolve; });
          if (failWrite) throw new Error("文件写入失败");
          pending = value;
        },
        async close() { contents = pending; activeWriter = false; },
        async abort() { pending = undefined; activeWriter = false; },
      };
    },
  };
}

test("草图保存完整JSON并使已确认回执失效", async () => {
  const confirmed = createSketch({ status: "accepted", confirmed_at: "2026-10-01T00:00:00.000Z", content_sha256: SHA });
  const handle = memoryHandle(confirmed);
  const store = await createPageSketchFileStore(handle);
  const layout = { ...confirmed.layout, offsets: { root: { x: 12, y: -4 } } };
  const saved = await store.saveDraft(layout);
  assert.deepEqual(saved.layout.offsets.root, { x: 12, y: -4 });
  assert.equal(saved.confirmation, null);
  assert.equal(JSON.parse(handle.contents).confirmation, null);
  assert.deepEqual(store.getDocument().layout.offsets.root, { x: 12, y: -4 });
});

test("草图必须先保存且资源预览通过后才能写确认内容hash", async () => {
  const handle = memoryHandle();
  const store = await createPageSketchFileStore(handle);
  const draft = createSketch().layout;
  const changed = { ...draft, offsets: { root: { x: 5, y: 8 } } };
  await assert.rejects(store.confirm({ previewReady: true, layout: changed }), /未保存/);
  await assert.rejects(store.confirm({ previewReady: false, layout: draft }), /未通过/);
  await store.saveDraft(changed);
  const beforeConfirmation = store.getDocument();
  const expectedHash = await hashPageSketchContent(beforeConfirmation);
  const confirmed = await store.confirm({ previewReady: true, layout: changed });
  assert.equal(confirmed.confirmation.status, "accepted");
  assert.equal(Object.hasOwn(confirmed.confirmation, "confirmed_by"), false);
  assert.equal(confirmed.confirmation.content_sha256, expectedHash);
  assert.equal(JSON.parse(handle.contents).confirmation.content_sha256, expectedHash);
});

test("草图被另一个编辑器修改时不会被覆盖", async () => {
  const handle = memoryHandle();
  const store = await createPageSketchFileStore(handle);
  handle.contents = `${JSON.stringify({ ...createSketch(), layout: { ...createSketch().layout, offsets: { root: { x: 3, y: 0 } } } })}\n`;
  await assert.rejects(store.saveDraft(createSketch().layout), /外部修改/);
  assert.equal(JSON.parse(handle.contents).layout.offsets.root.x, 3);
});

test("两个草图存储实例通过文件句柄排他流避免并发覆盖", async () => {
  const handle = memoryHandle(createSketch(), { delayWrite: true });
  const firstStore = await createPageSketchFileStore(handle);
  const secondStore = await createPageSketchFileStore(handle);
  const firstLayout = { ...createSketch().layout, offsets: { root: { x: 7, y: 0 } } };
  const secondLayout = { ...createSketch().layout, offsets: { root: { x: -9, y: 0 } } };
  const firstWrite = firstStore.saveDraft(firstLayout);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(handle.activeWriter, true);
  await assert.rejects(secondStore.saveDraft(secondLayout), /独占写入流/);
  handle.releaseWrite();
  await firstWrite;
  assert.equal(JSON.parse(handle.contents).layout.offsets.root.x, 7);
});

test("写入失败不更新草图快照", async () => {
  const handle = memoryHandle();
  const store = await createPageSketchFileStore(handle);
  handle.failWrite = true;
  const moved = { ...createSketch().layout, offsets: { root: { x: 9, y: 2 } } };
  await assert.rejects(store.saveDraft(moved), /文件写入失败/);
  assert.deepEqual(store.getDocument().layout.offsets, {});
});

test("文件选择器取消或多选时不创建草图存储", async () => {
  const handle = memoryHandle();
  const store = await pickPageSketchFileStore(async () => [handle]);
  assert.equal(store.getDocument().schema, "threejs-page-sketch/1.0");
  await assert.rejects(pickPageSketchFileStore(async () => []), /请选择一个/);
  await assert.rejects(pickPageSketchFileStore(async () => [handle, handle]), /请选择一个/);
});
