#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 复制最小工程并复用同一运行模块，拒绝覆盖非空工程。 */
export function createGame(target) {
  const destination = resolve(target);
  if (existsSync(destination) && readdirSync(destination).length) throw new Error('目标目录必须为空');
  mkdirSync(destination, { recursive: true });
  const scripts = dirname(fileURLToPath(import.meta.url));
  cpSync(join(scripts, '../assets/starter'), destination, { recursive: true });
  cpSync(join(scripts, 'game-runtime.mjs'), join(destination, 'src/game-runtime.mjs'));
  return destination;
}

// npm 的 bin 链接与源模块路径可能不同，按真实文件身份判断直接执行。
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 1 || args[0].startsWith('-')) throw new Error('用法：node create-game.mjs <空目录>');
    console.log('已创建 three.js 游戏工程：' + createGame(args[0]));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
