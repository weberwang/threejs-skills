#!/usr/bin/env node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createGame } from '../skills/threejs-game-runtime/scripts/create-game.mjs';
import { validateProductionBuild } from '../skills/threejs-game-architecture/scripts/validate-production-build.mjs';

/** 在生成工程内执行真实工具，失败时保留退出状态和诊断。 */
function runNpm(args, cwd) {
  // npm run 提供 CLI 的真实路径，优先由 Node 直接执行，避免 Windows shell 转义。
  const npmCli = process.env.npm_execpath;
  const command = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const commandArgs = npmCli ? [npmCli, ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd, encoding: 'utf8', shell: !npmCli && process.platform === 'win32', windowsHide: true,
    timeout: 300_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ${args.join(' ')} 失败：${result.stderr}\n${result.stdout}`);
  console.log(result.stdout.trim());
}

/** 验证实际生成、锁文件安装、类型检查、压缩构建和最终公开字节。 */
function main() {
  const temporaryRoot = resolve(tmpdir());
  const project = mkdtempSync(join(temporaryRoot, 'threejs-build-verification-'));
  try {
    createGame(project);
    runNpm(['ci', '--no-audit', '--no-fund'], project);
    runNpm(['run', 'build'], project);
    const report = validateProductionBuild(join(project, 'dist'));
    if (!report.ok) throw new Error(JSON.stringify(report));
    console.log(`工程生成、依赖安装、类型检查与生产构建通过；已检查 ${report.checkedFiles} 个实际产物，无 Source Map。`);
  } finally {
    // 仅回收本次创建的系统临时工程，禁止对共享仓库或已有工程执行递归删除。
    if (dirname(project) !== temporaryRoot || !basename(project).startsWith('threejs-build-verification-')) throw new Error('拒绝清理验证工程以外的目录');
    rmSync(project, { recursive: true, force: true });
  }
}

try { main(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
