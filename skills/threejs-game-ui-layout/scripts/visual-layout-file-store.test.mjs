import assert from "node:assert/strict";
import test from "node:test";
import { createVisualLayoutFileStore, pickVisualLayoutFileStore } from "./visual-layout-file-store.mjs";

const TARGET_SHA = `sha256:${"a".repeat(64)}`;
const NODES = [{ layout_node_id: "panel", parent_layout_node_id: "viewport", target_bounds: { x: 10, y: 20, width: 100, height: 40 } }];
const INITIAL = { schema: "threejs-visual-layout/1.0", target_sha256: TARGET_SHA, scene_id: "main", state_id: "default", offsets: { panel: { x: 0, y: 0 } } };

/** 用内存模拟浏览器文件句柄，观察真实写入、冲突和失败路径。 */
function memoryHandle(initialText = JSON.stringify(INITIAL)) {
  let contents = initialText;
  let failWrite = false;
  return {
    get contents() { return contents; },
    set contents(value) { contents = value; },
    set failWrite(value) { failWrite = value; },
    async getFile() { return { async text() { return contents; } }; },
    async createWritable() {
      let pending = null;
      return {
        async write(value) { if (failWrite) throw new Error("磁盘写入失败"); pending = value; },
        async close() { contents = pending; },
        async abort() { pending = null; },
      };
    },
  };
}

test("拖拽后的布局保存到选中文件并可重新载入", async () => {
  const handle = memoryHandle();
  const store = await createVisualLayoutFileStore(handle, NODES);
  const updated = { ...store.layout, offsets: { panel: { x: 12, y: -4 } } };
  await store.save(updated);
  assert.deepEqual((await store.load()).offsets.panel, { x: 12, y: -4 });
  assert.deepEqual(JSON.parse(handle.contents).offsets.panel, { x: 12, y: -4 });
});

test("外部修改不能被编辑器静默覆盖", async () => {
  const handle = memoryHandle();
  const store = await createVisualLayoutFileStore(handle, NODES);
  handle.contents = JSON.stringify({ ...INITIAL, offsets: { panel: { x: 3, y: 0 } } });
  await assert.rejects(store.save({ ...INITIAL, offsets: { panel: { x: 8, y: 0 } } }), /外部修改/);
  assert.equal(JSON.parse(handle.contents).offsets.panel.x, 3);
});

test("保存失败不会更新快照或报告成功", async () => {
  const handle = memoryHandle();
  const store = await createVisualLayoutFileStore(handle, NODES);
  handle.failWrite = true;
  await assert.rejects(store.save({ ...INITIAL, offsets: { panel: { x: 8, y: 0 } } }), /磁盘写入失败/);
  assert.equal(JSON.parse(handle.contents).offsets.panel.x, 0);
});

test("只能通过用户选择已有布局文件建立文件存储", async () => {
  const handle = memoryHandle();
  const store = await pickVisualLayoutFileStore(NODES, async () => [handle]);
  assert.equal(store.layout.scene_id, "main");
  await assert.rejects(pickVisualLayoutFileStore(NODES, async () => []), /请选择一个/);
});
