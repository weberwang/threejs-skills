# 验证记录

验证日期：2026-10-15。范围为从 `E:\Git\phaser-skills` 同步通用工作流，并适配当前 three.js Web 3D 技能集。

## 本次同步

- 统一 V0–V4，V4 直接消费 V2 布局与 V3 正式资源；删除独立页面草图和编辑器链。
- 同步美术体验验收、透明素材路线、九宫格数据合同、图片递归补帧与汁水感指南；二维能力仅用于适用的 HUD、DOM、billboard 和纹理。
- 保留 world-3d、运行基础、Blender/GLB 模型和插件管线；移除 Spine 技能及其依赖、测试和文档入口。
- 摘要只作可选追踪，仍检查实际文件、路径安全、任务归属、模型结构、预算及人工确认。
- 安装器为 workflow-control 与 frame-animation 安装独立依赖，不修改目标游戏的依赖清单。

## T3 验证

| 检查 | 命令或范围 | 结果 |
| --- | --- | --- |
| 全量回归 | `npm test`，全部 62 个测试文件 | 857 项通过，0 失败、0 跳过；退出码 0 |
| 控制面与文档链接 | `npm run lint:workflow` | 通过 |
| 隔离复制安装 | `npm run test:copy-install` | 两个工具技能独立解析 Sharp、跨技能导入成功，目标 package.json 未变 |
| MJS 语法与规模 | `node --check`，scripts/skills | 170 个文件通过，无超过 1000 行的代码文件 |
| 初始化模板 | 导出集合、JSON 声明、已取消摘要门的文字核对 | 6 个核心模板、5 组可选模板，检查通过 |
| 最小三维工程 | `create-game` → `npm ci` → `npm run build` | TypeScript 与 Vite 生产构建通过 |
| 发行内容 | `npm pack --dry-run --json` | 298 个文件，bin 与必要锁文件齐全，无 Spine、旧草图、output 或 node_modules 混入 |
| 差异格式 | `git diff --check`（识别 CRLF 行尾） | 通过 |

## 限制与未执行项

未启动浏览器预览或真机，未进行截图自动分析、WebGL/WebGPU 实际运行、目标设备性能、外部系统写入、推送或发布。机器合同与模型静态校验不能代替真实渲染、三维生产全流程或人工视觉验收。

最小工程保留约 529 kB 主 chunk 的 Vite 大小提示；构建通过不表示加载性能或 GPU 预算达标。Windows npm 的固定参数 `.cmd` 启动另有 Node DEP0190 提示，不影响本次检查结果。
