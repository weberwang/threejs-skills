#!/usr/bin/env node

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

/** 运行本地验证命令，保留失败诊断和真实退出码。 */
function run(command, args, cwd, shell = false) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(command + " 失败：" + (result.stderr || result.stdout));
}

/** 验证复制安装后的独立依赖与跨技能引用，不改目标项目的依赖清单。 */
function main() {
  const temporaryRoot = resolve(tmpdir());
  const root = mkdtempSync(join(temporaryRoot, "threejs-skills-copy-"));
  try {
    const projectPackage = join(root, "package.json");
    const original = '{"name":"target-game","private":true}\n';
    writeFileSync(projectPackage, original);
    const skillsRoot = join(root, ".agents", "skills");
    // 禁止复制开发机依赖，确保测试真正覆盖安装后的依赖隔离。
    cpSync(resolve("skills"), skillsRoot, { recursive: true, filter: (source) => basename(source) !== "node_modules" });
    const entrypoints = [
      ["threejs-game-workflow-control", "visual-image-normalization.mjs"],
      ["threejs-frame-animation", "video-to-atlas.mjs"],
    ];
    for (const [skillName, entrypoint] of entrypoints) {
      const target = join(skillsRoot, skillName);
      run(process.platform === "win32" ? "npm.cmd" : "npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], target, process.platform === "win32");
      run(process.execPath, ["--input-type=module", "-e", "import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url'; createRequire(process.argv[1])('sharp'); await import(pathToFileURL(process.argv[2]).href);", join(target, "package.json"), join(target, "scripts", entrypoint)], root);
    }
    if (readFileSync(projectPackage, "utf8") !== original) throw new Error("目标项目 package.json 被修改");
    console.log("复制安装验证通过：两个工具技能独立解析依赖，跨技能入口可用，目标项目依赖清单未修改。");
  } finally {
    // 递归删除只允许覆盖本次在系统临时目录中创建的专属目录。
    const resolvedRoot = resolve(root);
    if (!resolvedRoot.startsWith(temporaryRoot + sep) || !basename(root).startsWith("threejs-skills-copy-")) throw new Error("拒绝清理临时目录以外的路径");
    rmSync(resolvedRoot, { recursive: true, force: true });
  }
}

main();
