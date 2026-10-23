# three.js 游戏协作 Skills

面向 three.js Web 3D、TypeScript 与 Vite 的游戏协作包；Capacitor 仅在项目需要移动端原生宿主时按需采用。项目使用一个全局控制面统一管理任务范围、风险门、实施证据和状态迁移；领域 Skill 可在当前用户任务内迭代并回到控制面。

Android/iOS 原生平台功能优先通过插件实现：先复用项目现有插件，再评估官方插件、社区插件；仅在明确能力缺口下补充最小自建原生实现。选型、平台适配边界和必要宿主配置遵循[原生平台插件选型](skills/threejs-game-architecture/SKILL.md#原生平台插件选型)。

项目已采用的 SDK 按[SDK 单文件独立初始化](skills/threejs-game-architecture/references/sdk-initialization.md)统一在 `src/platform/initialize-sdks.ts` 实现启动、回调、幂等和初始化重试；各 SDK 独立发起，不互相等待，也不把 SDK 批次完成作为隐私流程、游戏首帧或场景启动的前置。无 SDK 时不创建占位实现。

MAX 接入必须在初始化前手动调用 `AppLovinMAX.setHasUserConsent(false)` 并关闭内建隐私流程，随后正常初始化并等待真实完成回调；`hasUserConsent=false` 不作为业务层拒绝广告加载或展示的条件。项目启用 AppsFlyer 时保持独立初始化与启动，不等待 MAX、其隐私流程或广告就绪。配置与验证要求见[广告接入合同](skills/threejs-game-ad-integration/references/applovin-max-contract.md#初始化与隐私独立编排)。

## 安装

需要 Node.js 22.20 或更高版本：

以下两种方式二选一：

从 GitHub 远程安装：

```powershell
npx -y github:weberwang/threejs-skills
```

在已克隆的仓库中安装到目标项目：

```powershell
node .\scripts\install-project-skills.mjs E:\Projects\my-threejs-game
```

安装器以 `--copy` 安装已验证的 Skill 版本，不修改目标 ThreeJS 项目的 `package.json`；需要图片归一化时由仓库已安装的 Sharp 支持。

## 最短工作流

游戏工程按[游戏项目目录规范](skills/threejs-game-architecture/references/project-structure.md)组织代码，生产与收尾按[产物目录与归档规范](skills/threejs-game-architecture/references/artifact-storage.md)分别存放临时文件、已确认成果、游戏资源和工作流记录：

| 用途 | 目标游戏项目内的目录 |
| --- | --- |
| 临时中间文件 / 未送审候选 | `output/intermediate/` / `output/candidates/`，按工作项、阶段、候选分组 |
| 已确认非运行设计成果 | `docs/confirmed/<owner>/<artifact-id>/<version>/` |
| 可编辑源文件与必要生产输入 | `assets-source/<owner>/` |
| 已验收正式游戏资源 | `public/assets/<owner>/` |
| 审阅、截图、录屏与验证文件 | `evidence/<workItemId>/reviews/`、`evidence/<workItemId>/validation/` |
| 工作流机器记录 | `.workflow-control/`，沿用控制工具实际布局 |
| 受保护用户确认账本与回执 | `.threejs-workflow/user-resolutions/`，沿用现有固定位置 |

`<owner>` 为 `shared`、`scenes/<scene-id>` 或 `display-layers/<display-layer-id>`。送审前将真实候选持久保留，确认后按用途归档；已绑定的审阅文件保持原路径，归档副本不建立第二套确认状态。正式资源与必要证据不能只留在可清理的 `output/`。

Git 按[最小提交集](skills/threejs-game-architecture/references/artifact-storage.md#最小提交集)仅保存运行/构建/必要验证所需的工程文件，以及当前工作项仍读取的规格、有效确认和执行/证据记录。非运行文档、源素材、证据及控制记录默认忽略，执行代理在 `.gitignore` 中逐文件精确放行实际依赖；不自动提交全部 JSON、文本报告、历史记录或已确认归档。当前有效记录引用的图片、视频、审阅页及必要附件必须随记录精确入库，保证重新检出可续接；无有效引用的历史产物留在本地，不自动删除或取消既有文件跟踪。

先按[简化工作流视图](skills/threejs-game-workflow-control/references/simplified-workflow.md)理解当前任务：

```text
需求与范围 → 全局基线 → 基础工程 → 逐场景生产 → 全局集成验证 → 发布
```

单场景视觉任务在“逐场景生产”内按“场景定义 → 拆解与布局确认 → 正式资源验收 → 正式场景实现、校准与运行验收”推进。V4 直接读取 V2 的结构和目标布局、V3 验收通过的正式资源，在实际场景中迭代还原效果。该视图只简化展示；全局状态、G0-G3、V0/V1/V2/V3/V4、A0-A6、F0-F4 和证据硬门继续由控制面维护，详见[控制模型](skills/threejs-game-workflow-control/references/control-model.md)与[状态、阶段与停止门](skills/threejs-game-workflow-control/references/state-gates.md)。

通用帧动画按普通、角色动作、特效或 UI 选择制作规则，默认视频抽帧，图片递归补帧仅在用户明确选用时启用。按用途委派对应职业的动画设计师，完成动作分析、时间轴、尺寸与批次方案后，先说明设计理念、目标感受和节奏取舍，等待用户明确确认当前方案，再在已有授权内制作真实视频或关键帧。真实视频人工验收后才能抽帧；图片首尾、关键帧和递归父图逐张确认后继续制作，最终真实序列仍由用户验收。分辨率、条数、预算、来源证据和 ThreeJS 接入见[通用帧动画技能](skills/threejs-frame-animation/SKILL.md)与[区域规划](skills/threejs-frame-animation/references/region-planning.md)。

先在目标 ThreeJS 项目根目录初始化一个 Work Item。下面的 PowerShell 示例会以当前 Git HEAD 作为不可变基线，可直接复制执行：

```powershell
$repo = (Get-Location).Path
$head = (git rev-parse HEAD).Trim()
node .\.agents\skills\threejs-game-workflow-control\scripts\workflow-control.mjs init --repo $repo --work-item-id WI-1 --project-id my-threejs-game --module-id core --domain code --stage-id G0 --baseline-id $head --baseline-version 1 --baseline-hash $head --objective "建立当前功能的 ThreeJS 工作流记录" --user-text "请建立当前功能的 ThreeJS 工作流记录并限制在 core 模块" --object "core ThreeJS 功能" --allowed-path src
```

初始化会生成 `$repo\.workflow-control\work-items\WI-1.json`；涉及 A4-A6 的具体操作时才按需使用 `$repo\.workflow-control\approvals\ledger.json`。也可以把同样字段写入 JSON 后通过 `init --record <bootstrap.json>` 传入。然后只使用三个稳定入口：

```powershell
node .\.agents\skills\threejs-game-workflow-control\scripts\workflow-control.mjs run --repo . --work-item <work-item> [--input <file> ...]
node .\.agents\skills\threejs-game-workflow-control\scripts\workflow-control.mjs check --repo . --work-item <work-item> [--implementation-package <package>] [--evidence <manifest>] [--input <file> ...]
node .\.agents\skills\threejs-game-workflow-control\scripts\workflow-control.mjs status --repo . --work-item <work-item> [--input <file> ...]
```

`run` 只读取、校验、推导路线，并连续推进已满足条件的安全控制面状态，进入实施或遇到缺证据、用户决定时停止；它不运行业务代码、测试、服务、外部动作或发布，也不会自动选择 `RETURN`。`check` 完全只读。三个入口可重复传入 `--input <file>` 绑定显式关键输入，默认文本优先显示六阶段/四步视图；JSON 仍输出稳定的 `status/stage/changed/blocking/next/metadata`，并在 `metadata.workflowView` 提供展示映射、`metadata.planFingerprint` 返回不含时间戳的确定性计划指纹。

图片与动画任务遵循[图片优先的确认方式](skills/threejs-game-workflow-control/references/simplified-workflow.md#图片优先的确认方式)：技术记录、拆解分析、布局决策和提示词由代理内部维护；帧动画先说明设计理念并取得动作方案确认，其余图片任务直接展示真实图片或预览供用户确认；同目标局部返修直接展示前后对照。

## 控制面边界

- `$threejs-game-workflow-control` 独占全局状态、风险门、任务范围、状态迁移和证据一致性。普通 A0-A3 工作直接依据当前用户任务，不创建独立授权记录，也不设置 F0 授权有效硬门。
- 任务内可以调整实现方案、文件路径、资源清单和测试范围；同步更新 Work Item/实施包并重验受影响部分即可。无外部副作用的本地 A4 集成可按任务执行；涉及外部写入、付费、真机、破坏性或外部删除、发布的 A4-A6 操作仍必须逐对象建立 pending 并获得显式批准。控制面只校验和记录，不代执行这些动作。
- V0→V1→V2→V3→V4 的视觉硬门、全局静态基线、场景拆解与布局确认、高保真前置继续使用带真实路径和任务归属的证据；V4 直接消费当前 V2/V3 产物并对正式场景调整验收。缺失或失效时 fail closed。阶段与字段以控制面文档和 Schema 为准。
- 共享工作区不自动回滚、不覆盖他人修改；启动本地验证服务前先查找同项目健康实例并复用。
- 阶段任务验收完成后，执行代理自动按需维护 `.gitignore`，只提交本次任务涉及的文件并报告提交哈希；使用当前分支，不自动推送。具体规则见[阶段收尾与 Git 提交](skills/threejs-game-workflow-control/SKILL.md#阶段收尾与-git-提交)。

视觉几何与测试默认以可用性为准：位置、尺寸、边距、换行允许合理偏差，越界、裁切、关键遮挡、不可读和交互失效必须修复。像素级容差、全视口/全状态矩阵只在任务明确要求或项目合同明确指定时启用；V2 拆解确认、布局确认、独立资源产物和关键功能证据仍然保留。

美术质量另按[游戏美术体验与质量契约](skills/threejs-game-asset-integration/references/art-quality-contract.md)验收：结构化 brief 关联主题、受众、核心循环与观看情境；常态、操作反馈和关键事件分别限制视觉刺激。全局三候选逐项记录实际人工质量结果，所选候选任一失败或未验证都不能冻结，三张都不合格时返工。V4 提交正常游玩、重复反馈、叠加与收尾的适用动态片段，由用户检查持续观看效果；机器 PASS 只说明结构、参数和证据有效，不能代替美术验收。该要求复用既有阶段与确认，不增加审批流程或自动真机验收。

所有任务和阶段都逐一以当前用户明确要求和[实际完成情况](skills/threejs-game-workflow-control/references/control-model.md#按实际完成情况验收)判断验收，覆盖设计、工程、玩法、场景、UI、资源、动画、音频、数值、测试、性能、集成与发布。任何任务已按要求完成时，不因中途方案或内部实现调整而回改历史合同；记录实际结果并更新受影响证据即可。只有真实改变后续依赖的范围、公开接口或硬约束时才更新对应契约，不能通过修订合同降低未满足要求的验收标准。

工作流已取消所有 SHA 摘要验收校验，不要求提供或比对摘要，也不因摘要缺失、错误或变化阻断验收。摘要核对留到最终人工验收后处理；文件可读取、实际功能与内容约束、任务归属和人工确认仍会检查，内部缓存及事务并发保护保留。

UI 响应式验证按合同的 `orientationPolicy.allowed` 选择视口方向：单方向项目只验证支持方向内的窄宽尺寸、DPR 和连续 resize；只有同时支持竖屏与横屏时才验证方向切换。

V2 布局分别记录真实功能父级与位置参照：`parent_element_id` 表示功能、状态、交互或布局管理归属，`ui_layout.position_reference_id` 表示定位参照，省略时使用真实父级。简单组件优先让可承载内容的底板兼任组件根，额外结构容器须说明独立职责；显式视觉溢出不扩大父框，关键内容仍须满足安全区。`center` 默认严格居中，设计偏移必须说明理由；图标和文字可按明确成员的联合框整体居中，角标独立停靠。布局只平移派生矩形，保留原始拆解测量与尺寸，确认入口从绑定的 proposal 和 decision 复算结果。详见[功能语义分组](skills/threejs-game-ui-layout/references/functional-semantic-grouping.md)和[居中策略](skills/threejs-game-ui-layout/references/center-alignment.md)。

V2 同时派生[布局执行计划](skills/threejs-game-ui-layout/references/layout-execution.md)，分别指定 DOM/HUD 的位置与尺寸控制权。V4 和 QA Hook 读取[同批实际组件快照](skills/threejs-game-ui-layout/references/layout-runtime-evidence.md)，校验候选身份、viewport revision、实际参照、单一写入者和图片模式；普通图源像素、局部尺寸与屏幕显示尺寸分别记录。透视世界继续使用独立 world contract。

资源加载按[运行资源路径绑定](skills/threejs-game-asset-integration/references/runtime-resource-binding.md)区分磁盘文件、部署 URL 与模块导入表达式。帧动画生成器允许未绑定候选用于制作预览，正式 accepted 合同要求明确绑定，禁止用图集文件名猜测加载地址。

玩家可见内容遵循[游戏内文案](skills/threejs-game-ui-layout/references/game-copy.md)：优先图片、图标、数字与符号，例如金币图标 `+100`，不重复写「获得 100 金币」；文字只保留必要的短名称、短动作、短状态或说明。该原则贯穿策划、美术 brief、效果图、布局和验收。程序化文本仍须支持英语、简体中文、日语、俄语和西班牙语，并逐语言验证字形宽度、字体回退、基线、断行和容器适配；每种语言独立选择单行或换行，禁止截断，也不把符号表达扩写成解释句。

详细状态、门、Schema 和返工语义见 [`threejs-game-workflow-control`](skills/threejs-game-workflow-control/SKILL.md) 及其 [`control-model.md`](skills/threejs-game-workflow-control/references/control-model.md)、[`state-gates.md`](skills/threejs-game-workflow-control/references/state-gates.md)、[`schemas.md`](skills/threejs-game-workflow-control/references/schemas.md)。

## 领域 Skill 索引

- `$threejs-game-orchestrator`：领域拆分、交接和执行协调。
- `$threejs-game-production`：制作策划、GDD、功能契约和验收范围。
- [`$threejs-game-juice`](skills/threejs-game-juice/SKILL.md)：汁水感与动态反馈的独立领域能力；用户明确提出相关需求，或当前核心事件缺少明确反馈语义时按需引用。它沿用当前 Work Item 和既有制作、玩法、UI、动画、音频与 QA 流程，不把普通玩法任务扩成全量润色。见[完整设计指南](skills/threejs-game-juice/references/design-guide.md)。
- `$threejs-game-architecture`：工程架构与公开契约。
- `$threejs-gameplay-development`：玩法规则、状态和交互实现。
- `$threejs-game-asset-integration`、`$threejs-game-ui-layout`：资源、效果图还原和 UI 布局。
- [`$threejs-frame-animation`](skills/threejs-frame-animation/SKILL.md)：普通、角色、特效、UI 分类规则；设计理念与动作方案确认后制作真实视频或关键帧，再进行素材验收，默认视频抽帧，可明确选用图片递归补帧。适用于 HUD、billboard 与贴图序列表现，不替代 `SkinnedMesh` 三维骨骼动画；分辨率、批次与预算按[区域规划](skills/threejs-frame-animation/references/region-planning.md)执行，输出独立图集与预览。
- [`$threejs-game-runtime`](skills/threejs-game-runtime/SKILL.md)、[`$threejs-game-model-pipeline`](skills/threejs-game-model-pipeline/SKILL.md)、[`$threejs-game-plugins`](skills/threejs-game-plugins/SKILL.md)：固定步、输入与生命周期；Blender/GLB 模型、材质、灯光、Camera、碰撞和 `AnimationMixer`；物理、导航、解码与后处理插件。
- `$threejs-game-image-optimization`：图片尺寸、格式、透明度和运行时纹理优化。
- `$threejs-game-audio`、`$threejs-game-balance`：音频和数值平衡。
- [`$threejs-game-ad-integration`](skills/threejs-game-ad-integration/SKILL.md)：通过 AppLovin 官方 MAX Cordova 原生插件接入移动端 Banner、插页与激励视频，管理全屏广告位静默预加载与持续重试、Banner 按需创建与布局刷新、视频不可用提示和隐私验收。
- `$threejs-game-qa-performance`：质量、测试和性能验证。
- [`$threejs-game-artifact-cleanup`](skills/threejs-game-artifact-cleanup/SKILL.md)：核对引用、保留策略与文件归属，清理过期记录和未使用中间产物，保留有效证据与审计链。
- `$threejs-game-release`：发布候选、渠道和合规交付。
- `$grilling`：只处理无法由事实确定且会改变范围、行为、预算、合规或数据边界的用户决定。

新三维工程先读 [`threejs-game-runtime`](skills/threejs-game-runtime/SKILL.md) 确定渲染循环、输入、暂停恢复和资源生命周期，再按需用 [`threejs-game-model-pipeline`](skills/threejs-game-model-pipeline/SKILL.md) 交付模型/材质/灯光/Camera/关卡/碰撞与三维骨骼动画，或用 [`threejs-game-plugins`](skills/threejs-game-plugins/SKILL.md) 选物理、导航、模型解码和后处理。二维 V2 图片拆解与九宫格只约束适用的 HUD、DOM 和平面纹理，不用来替代三维场景结构。

## 生图与去背景

系统根据提示词、参考图、边缘特征和已验证能力选择透明路线。硬边且主体与背景明显分离时可用纯色去背；直接 Alpha 必须经过工具与边缘类型能力验证，并解码 PNG 证明真实透明像素；复杂边缘使用独立遮罩/人工创作、重新生成或经明确合同批准的 ThreeJS 特效。半透明、辉光、柔和阴影、毛发、玻璃和混合边缘不得默认阈值去背。所有透明路线都绑定实际来源、生产记录、归一化实际输出与深浅底预览，SHA 仅可选追踪；已有透明图按 provided/reuse 接入，不伪造生成或去背记录。详见[资产生产路线](skills/threejs-game-asset-integration/references/asset-production-routes.md)。

在本仓库中处理简单纯色背景 PNG：

```powershell
npm run remove:background -- --source art/raw.png --output art/transparent.png --background-color '#00FF00' --tolerance 24 --require-solid-background --edge-profile hard-edge --color-separation-verified --record art/removal.json --preview-dir art/previews
```

该脚本只适用于 hard-edge 且颜色分离已确认的输入。背景与主体应有明显颜色差异；校验失败时修正输入或换路线，不提高容差吞掉棋盘格、硬抠复杂轮廓或删除光效。脚本输出处理记录与深浅底预览，不能替代 V4 对主体缺损、背景残留、色边和半透明区域的视觉检查。

## 高级诊断

稳定入口之外，控制面仍提供以下底层命令：

| 命令 | 用途 |
| --- | --- |
| `init` | 首次创建控制目录和 Work Item |
| `route` | 只推导风险通道与下一命令 |
| `preflight` | 写入或副作用前校验动作、路径和目标 |
| `advance` / `transition` | 迁移已满足门的状态；`transition` 支持显式回退记录 |
| `diff-audit` / `evidence-check` | 绑定真实候选 diff 与 F0-F3 证据 |
| `delegate-check` / `parallel-check` / `unit-check` | 管理 A3 委派、并行批次和执行单元 |
| `prepare-approval` / `handoff` / `approve` | 仅处理 A4-A6 的精确操作审批 |
| `lint` | 仓库级 Skill、Schema 和链接静态检查 |

底层命令不会改变任务范围、A4-A6 批准、视觉硬门或 fail-closed 约束。缺少非关键元数据时优先提醒并自动补齐；只有身份、所有权、关键产物或安全边界无法判断时才阻断。

## 测试入口

```powershell
npm run test:quick
npm run test:workflow
npm run test:frame-animation
npm run test:minimal-git
npm run test:production-build
npm run test:game-build
npm run test:full
npm test
```

`test:quick` 覆盖稳定输出与指纹，`test:workflow` 覆盖控制面和视觉工作流，`test:frame-animation` 覆盖视频抽帧、图片规划/来源/打包及 accepted 文件门，`test:full`/`test` 保留全量回归。工作流先按风险推荐 T0（仅静态检查）、T1（定向验证）、T2（受影响模块）或 T3（完整验证），说明理由、覆盖和命令后自动执行适用等级；不等待人工选择。T3 仍不包含隐式真机、外部写入或发布。

这些 Node 测试入口统一使用隔离运行器：每次运行的临时目录会在正常结束、失败、超时或可处理信号后回收。默认总超时为 10 分钟，可通过 `THREEJS_TEST_TIMEOUT_MS`（毫秒）覆盖；超时返回 `124`。运行器只终止本次创建的测试进程树，不会停止已有 Vite 或外部服务，也不会删除显式项目路径下的证据输出。

`test:game-build` 在系统临时目录生成实际 ThreeJS 工程，按锁文件安装依赖并执行类型检查、生产构建和 Source Map 产物检查；不启动开发服务或浏览器。
