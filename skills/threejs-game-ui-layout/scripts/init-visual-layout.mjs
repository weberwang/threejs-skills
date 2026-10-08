#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateVisualLayoutDocument } from "./visual-layout-editor.mjs";

/** 从已确认的 V2 节点快照建立独立的 V3 布局实现配置。 */
export function buildInitialVisualLayout(nodesDocument) {
  if (nodesDocument?.schema !== "threejs-layout-nodes/1.0" || !Array.isArray(nodesDocument.layout_nodes) || nodesDocument.layout_nodes.length === 0) {
    throw new Error("输入必须是非空的 V2 layout-nodes.json");
  }
  return validateVisualLayoutDocument({
    schema: "threejs-visual-layout/1.0",
    target_sha256: nodesDocument.target_sha256,
    scene_id: nodesDocument.scene_id,
    state_id: nodesDocument.state_id,
    offsets: {},
  }, nodesDocument.layout_nodes);
}

/** CLI 只创建新配置，不覆盖已有 V3 实现或 V2 证据。 */
export async function initVisualLayout(inputPath, outputPath) {
  if (!inputPath || !outputPath) throw new Error("用法：node init-visual-layout.mjs <V2/layout-nodes.json> <V3/visual-layout.json>");
  const input = resolve(inputPath);
  const output = resolve(outputPath);
  if (input === output) throw new Error("V3 输出不能覆盖 V2 节点文件");
  const nodesDocument = JSON.parse(await readFile(input, "utf8"));
  const layout = buildInitialVisualLayout(nodesDocument);
  await writeFile(output, `${JSON.stringify(layout, null, 2)}\n`, { flag: "wx" });
  return layout;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  initVisualLayout(process.argv[2], process.argv[3]).then(
    () => process.stdout.write("V3 布局实现配置已创建\n"),
    (error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; },
  );
}
