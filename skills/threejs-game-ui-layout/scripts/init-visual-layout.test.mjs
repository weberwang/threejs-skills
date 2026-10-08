import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildInitialVisualLayout, initVisualLayout } from "./init-visual-layout.mjs";

const SHA = `sha256:${"a".repeat(64)}`;
const NODES = { schema: "threejs-layout-nodes/1.0", target_sha256: SHA, scene_id: "main", state_id: "default", layout_nodes: [{ layout_node_id: "panel", parent_layout_node_id: "viewport", target_bounds: { x: 10, y: 20, width: 100, height: 40 } }] };

test("从 V2 节点建立独立且无偏移的 V3 配置", () => {
  const value = buildInitialVisualLayout(NODES);
  assert.equal(value.schema, "threejs-visual-layout/1.0");
  assert.equal(value.target_sha256, SHA);
  assert.deepEqual(value.offsets, {});
  assert.deepEqual(NODES.layout_nodes, [{ layout_node_id: "panel", parent_layout_node_id: "viewport", target_bounds: { x: 10, y: 20, width: 100, height: 40 } }]);
});

test("初始化 CLI 不覆盖已有配置或 V2 源文件", async () => {
  const directory = await mkdtemp(join(tmpdir(), "visual-layout-init-"));
  try {
    const source = join(directory, "layout-nodes.json");
    const output = join(directory, "visual-layout.json");
    await writeFile(source, JSON.stringify(NODES));
    await initVisualLayout(source, output);
    assert.equal(JSON.parse(await readFile(output, "utf8")).scene_id, "main");
    await assert.rejects(initVisualLayout(source, output), { code: "EEXIST" });
    await assert.rejects(initVisualLayout(source, source), /不能覆盖/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
