# three.js 游戏工作流

面向 three.js Web 3D 游戏项目的技能集，涵盖工作项、阶段门、实施包、所有权、返工、证据链，以及架构、相机、输入、模型、动画和性能指导。three.js 负责渲染与场景图，游戏循环和平台服务由项目负责。

## 安装全部技能

要求 Node.js >=22.20.0、npm 和 Git。直接在需要安装技能的当前目录运行，无需进入本仓库：

```powershell
npx skills add weberwang/threejs-skills
```

按交互提示选择全部技能、Codex 和项目级安装，并确认覆盖已有同名技能。技能写入当前目录下的 `.agents/skills/`。使用 [Skills CLI](https://github.com/vercel-labs/skills) 管理安装；覆盖后按下方步骤重新安装工具依赖。

只查看可用技能，或仅安装一个技能：

```powershell
npx --yes skills add weberwang/threejs-skills --list
npx --yes skills add weberwang/threejs-skills --skill threejs-game-runtime --agent codex --copy
```

工作流技能存在跨技能引用，完整游戏生产建议安装全部技能。安装后可用 `npx skills list` 查看、`npx skills update` 更新。技能安装不自动安装 npm 运行依赖；使用图像工具前，在对应技能目录执行：

```powershell
npm --prefix .agents/skills/threejs-game-workflow-control ci --omit=dev
npm --prefix .agents/skills/threejs-frame-animation ci --omit=dev
npm --prefix .agents/skills/threejs-spine-generative-reskin ci --omit=dev
```

这些依赖清单位于技能内部，项目自己的 package.json 无需加入 Sharp。远程安装需要仓库已推送技能文件。

## 日常流程

项目按需求与范围 → 全局基线 → 基础工程 → 逐场景生产 → 全局集成验证 → 发布推进。场景保留 V0–V5 视觉与资源链；具体门及字段以 [控制面](skills/threejs-game-workflow-control/SKILL.md) 和 [简化视图](skills/threejs-game-workflow-control/references/simplified-workflow.md) 为准。

```powershell
node .agents/skills/threejs-game-workflow-control/scripts/workflow-control.mjs init --help
node .agents/skills/threejs-game-workflow-control/scripts/workflow-control.mjs run --help
node .agents/skills/threejs-game-workflow-control/scripts/workflow-control.mjs check --help
node .agents/skills/threejs-game-workflow-control/scripts/workflow-control.mjs status --help
```

`run` 提示下一步并推进已满足门的安全状态；`check`、`status` 检查与显示当前事实。工具不代执行玩法代码或受保护操作。初始化和工作项参数见 CLI 的帮助与 Schema；高阶入口包含 preflight、diff-audit、evidence-check、return、委派和执行单元检查。

默认使用当前工作区和当前分支；只有用户明确要求才使用 worktree 或新分支。启动验证服务前检查同项目健康实例并复用。普通本地实施与修复按当前任务推进；真机、外部写入、付费、破坏性操作和发布须有对应明确授权。

## 游戏项目支持

- [运行基础](skills/threejs-game-runtime/SKILL.md)：固定步模拟、插值、有限追赶、暂停恢复、输入坐标和资源生命周期。
- [模型与关卡](skills/threejs-game-model-pipeline/SKILL.md)：参考图 → 多视图拆解 → Blender MCP 控面数建模与 AI 纹理/法线 → 人工模型审查，再接入 glTF/GLB、PBR、AnimationMixer、碰撞代理与 LOD。
- [插件方案](skills/threejs-game-plugins/SKILL.md)：按实际需求选择 Rapier、three-mesh-bvh、Recast Navigation、模型解码器与后处理。
- [架构](skills/threejs-game-architecture/SKILL.md)：WebGL 2 默认，WebGPU 显式采用；渲染 Scene 与游戏状态分离。
- [HUD 布局](skills/threejs-game-ui-layout/SKILL.md)：CSS/DPR、DOM 或正交 HUD，世界空间与屏幕空间分开验证。

核心依赖为 three、TypeScript、Vite。three/addons 随 three 包提供；物理、导航、复杂射线查询和压缩解码器只有能力被玩法或资产触发时才成为必要依赖。React Three Fiber 用于已选择 React 的项目；Capacitor、广告和原生插件仅用于明确的渠道需求。接入规则和一手来源见 [插件表](skills/threejs-game-plugins/references/plugin-plan.md)。

从已安装技能生成可构建的最小工程（目标目录须为空；已有技能的项目目录内可生成到独立子目录）：

```powershell
node .agents/skills/threejs-game-runtime/scripts/create-game.mjs .\game
cd .\game
npm ci
npm run build
```

开发预览需要时先检查已有服务，再运行 `npm run dev`。模板演示旋转方块、CSS→NDC 选取、固定步和暂停恢复，不代表完整游戏或浏览器运行验收。

## 领域技能

| 工作 | 技能 |
| --- | --- |
| 控制与协调 | [workflow-control](skills/threejs-game-workflow-control/SKILL.md)、[orchestrator](skills/threejs-game-orchestrator/SKILL.md) |
| 策划、规则、数值 | [production](skills/threejs-game-production/SKILL.md)、[gameplay-development](skills/threejs-gameplay-development/SKILL.md)、[balance](skills/threejs-game-balance/SKILL.md) |
| 资源、HUD 与贴图 | [asset-integration](skills/threejs-game-asset-integration/SKILL.md)、[ui-layout](skills/threejs-game-ui-layout/SKILL.md)、[image-optimization](skills/threejs-game-image-optimization/SKILL.md) |
| 动画与音频 | [frame-animation](skills/threejs-frame-animation/SKILL.md)、[audio](skills/threejs-game-audio/SKILL.md)；[Spine](skills/threejs-spine-generative-reskin/SKILL.md)仅作可选二维 HUD/billboard |
| 验证、清理、发布 | [qa-performance](skills/threejs-game-qa-performance/SKILL.md)、[artifact-cleanup](skills/threejs-game-artifact-cleanup/SKILL.md)、[release](skills/threejs-game-release/SKILL.md) |
| 可选渠道与决策 | [ad-integration](skills/threejs-game-ad-integration/SKILL.md)、[grilling](skills/grilling/SKILL.md) |

二维图像工具支持归一化、去背景、图集和布局审阅；图像用于纹理、HUD 或明确的 billboard 资产。帧动画使用 TextureLoader/SpriteMaterial/Sprite 的 UV 采样；三维骨骼角色走模型管线。

## 验证

先推荐 T0（静态检查）、T1（定向）、T2（模块）或 T3（完整）的理由、覆盖与命令，再自动执行。失败在授权范围内修复并复验；T3 不包含自动真机、外部写入或发布。

```powershell
npm run test:game
npm run test:quick
npm run test:workflow
npm run lint:workflow
npm test
```

隔离测试运行器默认超时十分钟，可用 `THREEJS_TEST_TIMEOUT_MS` 调整；只清理本次测试临时目录和进程树。静态/合同测试不证明目标设备 FPS 或 GPU 运行正确，真实运行结果需要项目自己的证据。
