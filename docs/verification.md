# 验证记录

验证日期：2026-10-08。范围为 three.js 技能工作流、机器合同、资产静态门和最小工程。

## Skills CLI 接入验证：T1

项目使用官方 `npx skills add` 安装技能。自定义安装脚本、对应测试和 npm 安装入口均已删除；package.json 与锁文件的 bin 清单同步更新。

- `npm run test:game`：4 项通过，0 失败、0 跳过。
- `npm run lint:workflow`：通过。
- `npx --yes skills --version`、`--help`：Skills CLI 1.7.1，参数核对通过。
- `npx --yes skills add E:\Git\threejs-skills --list`：发现全部 20 个技能，退出码 0；仅用于校验技能发现，没有执行安装。
- npm 脚本与 bin 目标存在性、锁文件 bin 同步检查：通过。
- `npm pack --dry-run --json`：294 个发行文件，自定义安装脚本已从发行内容移除。

技能内部 Sharp 依赖由使用者在安装后按 README 执行 npm ci，Skills CLI 不代执行该步骤。命令和 Codex 项目目录已核对 [官方文档](https://github.com/vercel-labs/skills) 与当前 CLI 源码。本次未执行远程仓库安装或向用户项目、全局安装技能，未提交、推送或发布，未执行全量 T3、浏览器或真机验收。

## 基础工作流历史验证：T3

下表记录此前基础工作流实施完成时的验证，不代表本次接入后的全量复验。

| 检查 | 命令或范围 | 结果 |
| --- | --- | --- |
| 全量回归 | npm test，62 个测试文件 | 821 项通过，0 失败，0 跳过 |
| 控制面静态检查 | npm run lint:workflow | 通过 |
| 技能结构 | skill-creator quick_validate.py，Python UTF-8 模式 | 20 个技能通过 |
| MJS 语法 | node --check | 178 个文件通过 |
| 代码规模 | scripts 与 skills 中全部 MJS | 无超过 1000 行文件 |
| 最小工程 | create-game → npm ci → npm run build | TypeScript 检查和 Vite 生产构建通过 |
| 发行内容 | npm pack --dry-run --json | 298 个文件，必要技能锁文件存在，无 output/node_modules 混入 |

首轮全量回归有 1 个共享词汇测试保留旧枚举期望；补入 authored-model/gltf-model 后定向复验通过，最终重新执行全量回归并得到上表结果。

## 未执行与限制

未启动预览服务，未执行浏览器 WebGL/WebGPU、真机、目标设备性能、外部写入或发布验收。合同验证和 GLB 静态检查不代表实际 GPU 渲染或解码通过；压缩模型报告明确标记未解码。插件表是按需求启用的方案，不是所有插件组合均已安装或通过设备验收的声明。

最小工程构建有约 529 kB 主 chunk 的 Vite 大小提示；未把构建成功当作首屏性能达标。实际项目应冻结加载、GPU 和帧时间预算，再验证真实玩法密度。
