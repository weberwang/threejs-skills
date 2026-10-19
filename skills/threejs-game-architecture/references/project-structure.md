# 游戏项目目录规范

新建 Web 3D 游戏项目、实现基础模块或调整模块边界时读取本文件。默认采用入口与基础服务分层、玩法场景按功能聚合的结构；在 TDD 中记录实际目录、公开入口和文件所有权。目录树是目标组织方式，按实际需要创建，不预建空目录或占位类。

## 方案依据

three.js 的场景对象由 `Object3D` 层级组织，渲染器负责把 Scene 与 Camera 绘制到 Canvas；本目录划分是工程约定，不是 three.js 强制结构。浏览器是默认目标，先采用 WebGL 2 `WebGLRenderer`；只有项目决定并验证采用 WebGPU 后，才使用 `WebGPURenderer`。

[Vite 静态资源规则](https://vite.dev/guide/assets.html#the-public-directory)区分模块导入资源与 `public` 中原样发布的资源；[Capacitor 配置](https://capacitorjs.com/docs/basics/configuring-your-app)管理原生工程路径与 Web 构建目录。本规范不要求更换构建器、引入新依赖或增加未采用的平台。

## 推荐目录

```text
game-project/
├── index.html                       # Web 宿主页面
├── package.json
├── tsconfig.json
├── vite/                            # Vite 构建配置；单配置项目可用根目录 vite.config.ts
├── capacitor.config.ts              # 仅采用 Capacitor 原生宿主时创建
├── src/
│   ├── main.ts                      # 应用装配：选择平台适配器、创建服务、启动游戏
│   ├── styles/                      # 宿主全屏、画布容器等全局样式
│   ├── game/
│   │   ├── main.ts                  # 创建 WebGL2 渲染器、注册控制器并启动渲染循环
│   │   ├── contracts/               # 跨模块公开类型和平台能力接口
│   │   ├── config/                  # 游戏、渲染与运行策略配置
│   │   ├── data/                    # 关卡、数值、配置数据与校验规则
│   │   ├── locales/                 # 本地化文本与语言配置
│   │   ├── modules/                 # 场景无关基础能力，按职责独立组织
│   │   │   ├── audio/               # 音频服务、播放状态和后台暂停/恢复
│   │   │   ├── save/                # 存档仓库
│   │   │   ├── input/               # 统一输入映射
│   │   │   ├── assets/              # 资源清单、glTF/GLB 与纹理加载基础设施
│   │   │   └── physics/             # 采用物理引擎时的固定步世界与同步适配
│   │   ├── scenes/
│   │   │   ├── boot/                # 最小 Boot/Preload 生命周期
│   │   │   ├── menu/                # 菜单场景及其私有组件、配置
│   │   │   └── battle/              # 一个玩法场景的完整功能归属
│   │   │       ├── BattleSceneController.ts # 玩法状态和 enter/update/exit/dispose
│   │   │       ├── battle-scene.ts  # Three.js Scene、Camera 与 Object3D 根
│   │   │       ├── gameplay/        # 场景规则、状态和交互
│   │   │       ├── entities/        # 场景实体与表现对象
│   │   │       ├── ui/              # 常驻 HUD 和场景私有 UI
│   │   │       └── config/          # 场景布局与表现配置
│   │   ├── display-layers/          # 独立瞬态显示层，按 displayLayerId 划分
│   │   │   └── pause-menu/          # 弹窗自身控制、UI、布局和生命周期
│   │   └── shared/                  # 已满足共享条件的实体、UI 或纯函数
│   └── platform/
│       ├── web/                     # 浏览器可见性、存储等适配
│       ├── android/                 # 仅采用 Android 原生宿主时创建
│       └── ios/                     # 仅采用 iOS 原生宿主时创建
├── public/
│   └── assets/                      # 正式运行资源，按所有权划分
│       ├── shared/                  # 启动必需或跨场景稳定复用的资源
│       ├── scenes/<scene-id>/       # 单场景图片、音频、图集等
│       └── display-layers/<layer-id>/ # 独立显示层资源
├── assets-source/                   # 美术/音频源文件，不进入运行构建
├── android/                         # 仅采用 Capacitor Android 时创建
├── ios/                             # 仅采用 Capacitor iOS 时创建
├── tests/
│   ├── integration/                # 跨模块集成测试
│   ├── e2e/                        # 已采用的端到端测试
│   └── fixtures/                   # 测试专用数据与资源
├── scripts/                         # 构建、资源处理和工程检查工具
├── docs/                            # GDD、TDD、资源合同和项目说明
│   └── confirmed/<owner>/<artifact-id>/<version>/ # 已确认的非运行设计成果
├── output/                          # 未被正式引用的可再生成产物，按最小范围忽略
│   ├── intermediate/<workItemId>/<stageId>/<candidateId>/ # 临时转换、缓存与导出
│   └── candidates/<workItemId>/<stageId>/<candidateId>/   # 尚未送审的探索候选
├── evidence/                        # 审阅、截图、录屏与验证文件，按工作项归属
│   └── <workItemId>/
│       ├── reviews/<stageId>/<candidateId>/    # 保留送审实际文件与确认依据
│       └── validation/<stageId>/<candidateId>/ # 验证日志、报告和运行证据
├── .workflow-control/               # 控制面状态与审批工件，沿用工具实际布局
├── .threejs-workflow/user-resolutions/ # 现有受保护用户确认账本与回执
└── dist/                            # Web 构建产物，不手工维护
```

## 代码归属与依赖

- `src/main.ts` 只负责浏览器应用装配；`src/game/main.ts` 创建渲染器、共享服务、场景控制器注册表和渲染循环。three.js `Scene` 只承载 `Object3D` 树，不拥有玩法状态；每个玩法场景由独立控制器提供 `enter(context)`、`update(fixedDelta, frameDelta)`、`exit()` 和 `dispose()`，状态切换时先退出旧控制器再进入新控制器。
- WebGL 2 `WebGLRenderer` 是默认路径。选用 `WebGPURenderer` 属于明确的技术决策：在 TDD 记录目标浏览器、材质/后处理兼容性、异步初始化、回退策略与验证结果；不得因其可自动回退就默认替换 WebGL 2。
- 一个场景的规则、实体、常驻 UI、布局与测试就近组织在 `scenes/<scene-id>/`；不要在根级 `entities/`、`managers/` 或 `ui/` 汇集所有场景的私有实现。按需拆分内部目录，小场景无需机械创建全部子目录。
- `modules/<module-id>/` 归属场景无关的基础服务；场景通过其公开接口调用。模块不得导入具体场景、显示层或其私有实现，场景之间也不得直接访问对方内部状态。纯规则与数据校验优先保持独立于 ThreeJS 显示对象，方便定向测试。
- `platform/` 默认只实现浏览器能力，`game/contracts/` 定义需要的平台接口，`src/main.ts` 完成注入。只有目标渠道明确需要原生宿主时才创建 Capacitor、Android 或 iOS 工程及适配器；业务不得直接导入原生插件或平台适配器。原生主题、Manifest 和 Activity 修改归属对应宿主工程。
- modal/popup 等瞬态层归属 `display-layers/<display-layer-id>/`，独立于宿主的 `ui/`，对应独立 DISPLAY_LAYER Work Item；宿主只提供公开接口与上下文。其常规目录位置不改变 V2/V3 门、实施顺序或互斥文件所有权。
- 通用基础服务进入 `modules/`；跨场景复用的实体、UI 或纯函数进入 `shared/`，二者不重复维护同一能力。只有被至少两个已确认场景稳定复用或属于启动运行必需时才能提取共享实现；禁止无职责边界的 `common/`、`utils/` 和全局可变状态集合。
- 单元测试优先使用相邻 `*.test.ts`，跨模块测试放 `tests/integration/`，端到端测试放 `tests/e2e/`；沿用项目已采用的测试工具，不因目录规范额外安装框架。测试专用资源不放进 `public/assets/`。

## 资源、命名与产物

临时、候选、已确认成果、源文件、运行资源和工作流记录必须按[产物目录与归档规范](artifact-storage.md)分别存放；其中 `<owner>` 为 `shared`、`scenes/<scene-id>` 或 `display-layers/<display-layer-id>`。在 TDD 冻结实际目录映射，送审前保留真实候选，确认后按用途归档，不覆盖或搬走已绑定的证据文件。

- `public/assets/` 只收录当前已验收的正式运行资源；按 `shared`、场景 ID、显示层 ID 分所有权，再按需细分 `images/`、`audio/`、`atlases/` 等类型。资源目录与代码使用同一身份映射，资源键与加载路径由所属清单维护。
- `assets-source/<owner>/` 放可编辑源文件、原始音频和生产输入；临时中间文件与未送审候选分别放 `output/intermediate/`、`output/candidates/`，已确认非运行成果放 `docs/confirmed/`，送审与验证文件放 `evidence/<workItemId>/`。控制记录仍使用 `.workflow-control/` 的实际布局。非运行产物不能放入 `public/`，因为该目录的文件会随构建发布。需要模块导入的小型资源可随所属代码放置，但同一正式资源不得同时维护两份。
- 目录与资源文件默认 `kebab-case`，TypeScript 类或主要组件文件用 `PascalCase.ts`，函数/工具模块用 `kebab-case.ts`；资源 ID、模块 ID、场景 ID、显示层 ID 明确映射。导入大小写必须与磁盘一致，不用 `index.ts` 批量再导出掩盖循环依赖。
- 关卡和角色的常用交付格式为 glTF/GLB；按资产实际压缩方式选择 `KTX2Loader`、Meshopt decoder 或 `DRACOLoader`，只在被引用的资产需要时启用。资源登记还要记录材质纹理色彩空间/压缩、动画片段与共享 GPU 资源的释放所有权。
- `dist/`、`node_modules/`、已采用的原生构建目录、缓存和临时输出按项目 `.gitignore` 排除；已采用的原生工程主题、Manifest、Activity 等项目源配置应纳入版本管理，不能整体忽略对应平台目录。控制面工件和正式证据按现有工作流规则保留，不为整理目录移动它们。

## 基础阶段执行与验收

1. 在 TDD 冻结实际目录映射、模块职责、公开接口、依赖方向与所有权；实施包绑定具体路径，不用目录名称代替模块审计。只建立当期需要的入口、契约、基础模块、平台适配和测试支撑，正式场景与资源仍按原视觉门实施。
2. 在对应基础模块完成 Canvas 视口适配、WebGL2 渲染循环、场景控制器切换与清理，以及浏览器音频暂停/恢复；分别遵守[基础显示约束](../../threejs-game-orchestrator/references/game-implementation.md#基础显示约束)和[音频生命周期约束](../../threejs-game-audio/SKILL.md#后台暂停与恢复约束)。只有确实采用原生宿主时，才把该宿主的窗口与生命周期要求加入基础包。
3. 对现有项目，先检查实际目录和构建/资源入口，仅在本次任务包含结构调整时移动文件并更新导入、资源清单、配置、测试和工作流路径引用；不额外保留旧路径或兼容转发，不因文档规范自动整理无关文件。
4. 按改动推荐并自动执行适用 T0–T3 验证，检查循环依赖、越界导入、文件归属、资源路径大小写、测试资源误发布及构建输出。记录实际命令与未覆盖项，不自动启动真机验收、发布或推送。
