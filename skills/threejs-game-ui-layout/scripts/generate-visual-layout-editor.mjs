#!/usr/bin/env node

import { constants } from "node:fs";
import { copyFile, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_ROOT = fileURLToPath(new URL("..", import.meta.url));
const FILES = [
  ["assets/visual-layout-editor-template.html", "index.html"],
  ["scripts/visual-layout-editor.mjs", "visual-layout-editor.mjs"],
  ["scripts/page-sketch-contract.mjs", "page-sketch-contract.mjs"],
  ["scripts/page-sketch-file-store.mjs", "page-sketch-file-store.mjs"],
  ["scripts/page-sketch-preview.mjs", "page-sketch-preview.mjs"],
  ["scripts/page-sketch-editor.mjs", "page-sketch-editor.mjs"],
];

/** 拒绝经现存 symlink/junction 解析到项目外的输出目录。 */
async function assertRealProjectContainment(projectRoot, outputDirectory) {
  const rootReal = await realpath(projectRoot);
  let ancestor = outputDirectory;
  while (true) {
    try {
      const ancestorReal = await realpath(ancestor);
      const targetReal = resolve(ancestorReal, relative(ancestor, outputDirectory));
      const fromRoot = relative(rootReal, targetReal);
      if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(fromRoot)) {
        throw new TypeError("输出目录经真实路径解析后越出游戏项目根目录");
      }
      return;
    } catch (error) {
      if (error instanceof TypeError || error.code !== "ENOENT") throw error;
      const parent = resolve(ancestor, "..");
      if (parent === ancestor) throw error;
      ancestor = parent;
    }
  }
}

/** 将编辑器模板复制到游戏项目中的一个全新开发目录，不覆盖已有文件。 */
export async function generateVisualLayoutEditor(projectRoot, outputDirectory) {
  if (!projectRoot || !outputDirectory) throw new Error("用法：node generate-visual-layout-editor.mjs --project-root <game-project> --output <new-dev-dir>");
  const root = resolve(projectRoot);
  const output = resolve(root, outputDirectory);
  const lexicalRelative = relative(root, output);
  if (!lexicalRelative || lexicalRelative === ".." || lexicalRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(lexicalRelative)) {
    throw new Error("输出目录逃逸游戏项目根目录");
  }
  // mkdir 会跟随父目录链接，因此先检查当前最近真实祖先的最终目标。
  await assertRealProjectContainment(root, output);
  await mkdir(output);
  const files = [];
  for (const [source, name] of FILES) {
    const target = join(output, name);
    await copyFile(join(SKILL_ROOT, source), target, constants.COPYFILE_EXCL);
    files.push(target);
  }
  return files;
}

/** 解析固定的两个 CLI 参数，避免误把其他路径写成输出目录。 */
function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    if (!["--project-root", "--output"].includes(name) || !argv[index + 1]) throw new Error(`未知或缺失的参数：${name}`);
    args[name] = argv[index + 1];
  }
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    generateVisualLayoutEditor(args["--project-root"], args["--output"]).then(
      (files) => process.stdout.write(`${files.join("\n")}\n`),
      (error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; },
    );
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
