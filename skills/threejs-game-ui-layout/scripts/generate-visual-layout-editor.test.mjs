import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { generateVisualLayoutEditor } from "./generate-visual-layout-editor.mjs";

test("在游戏项目新目录生成完整编辑器模板且不覆盖已有目录", async () => {
  const root = await mkdtemp(join(tmpdir(), "visual-layout-template-"));
  try {
    const files = await generateVisualLayoutEditor(root, "editor");
    assert.equal(files.length, 6);
    const html = await readFile(join(root, "editor", "index.html"), "utf8");
    assert.match(html, /initializePageSketchApplication/);
    assert.match(html, /page-sketch-project-root/);
    assert.match(html, /id="stage-device"><div id="stage-surface"/);
    assert.match(html, /id="workspace-controls"/);
    assert.match(html, /id="layout-controls"/);
    assert.match(html, /id="preview-device"/);
    assert.match(html, /id="toggle-fullscreen"/);
    assert.match(html, /id="reset-sketch"/);
    assert.doesNotMatch(html, /confirmed-by|确认人/);
    assert.doesNotMatch(html, /grid-template-columns: 1fr;/);
    assert.doesNotMatch(html, /visual-layout-game-adapter/);
    for (const file of ["visual-layout-editor.mjs", "page-sketch-contract.mjs", "page-sketch-file-store.mjs", "page-sketch-preview.mjs", "page-sketch-editor.mjs"]) {
      assert.equal(await readFile(join(root, "editor", file), "utf8").then(Boolean), true);
    }
    await assert.rejects(generateVisualLayoutEditor(root, "editor"), { code: "EEXIST" });
    await assert.rejects(generateVisualLayoutEditor(root, "../escape"), /逃逸/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
