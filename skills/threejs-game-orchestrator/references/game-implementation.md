# 游戏实现规则

瞬态弹窗建立独立 DISPLAY_LAYER Work Item；缺参考上下文时停留在弹窗自身前置门，不写入宿主场景 `deferred_layers`。场景只完成自身画面和常驻 HUD，弹窗未完成不影响场景 V5。弹窗正式代码仍需自己的 V2/V3、冻结宿主公开接口和互斥所有权。

实现按可验收场景闭环。玩法独占规则、状态、碰撞和交互代码；美术可维护纯表现层资源配置、布局/表现预制数据和视觉集成调整，但不得改变玩法规则、碰撞语义或状态所有权。G1 内部顺序不构成第二套全局状态机。

## 默认实施闭环

在当前用户任务、适用的 A0-A6/F0-F4 与 V0-V5 硬门允许的边界内，执行/实施使用最小充分事实而不是穷尽式研究：入口、关键调用链或契约、范围、主要风险和验收目标明确且无直接冲突后，立即停止探索；A1/A2 冻结当前候选的范围、假设与验收边界，直接进入适用执行/验证；A3 冻结 `Implementation Package` 后进入实施。可逆、本地的 A1/A2 可记录合理假设后落地，A3 可记录合理假设后实施但必须先冻结包；缺少完全证明不单独阻塞。任务内方案、路径和资源清单可随实施更新计划并重验受影响部分。

仅 A3 包冻结后，implementer 只按包执行，不重新开展开放式方案探索；遇到需求/范围变化、实质冲突或无法实施才返回。默认顺序为：`最小必要事实确认 → 冻结候选边界（A3 冻结 Implementation Package）→ 执行/实施 → diff-audit → 推荐并自动执行适用等级的定向验证 → 仅按失败证据修正 → 完成`。已确认事实不重复读取/搜索/复核；每轮返工必须由测试/类型/构建失败、运行异常、需求不满足、安全或越界问题、可复现缺陷或硬门明确失败驱动；用户明确改变需求/范围时，按真实受影响门重跑。普通候选身份变化按当前门重验，不触发 `RETURN`；另一种可行方案或非阻塞发现不能单独推翻满足需求的实现，记录为未覆盖项/后续事项即可。上述闭环不放宽用户决定、带副作用的 A4-A6 精确批准、视觉硬门、证据哈希/真实性或共享工作区安全约束。

## G1 强制实施序列

基础实施先按[游戏项目目录规范](../../threejs-game-architecture/references/project-structure.md)冻结入口、基础模块、场景、显示层、平台适配、资源、测试和产物的路径与所有权；按实际需要创建目录，后续实施沿同一映射落盘。

1. 全局基线、foundation-only 边界和项目状态顺序按[控制模型](../../threejs-game-workflow-control/references/control-model.md)与[状态、阶段与停止门](../../threejs-game-workflow-control/references/state-gates.md)执行；编排层只建立“需求 → 功能 → 模块 → 场景 → 正式资源 → 测试证据”的追踪。
2. foundation-only 仅承载 `SHARED` 最小骨架和 `MODULE` 场景无关基础能力；在此阶段完成 WebGL2 渲染循环、Canvas CSS 视口适配、输入坐标适配和场景控制器生命周期，并按[后台暂停与恢复约束](../../threejs-game-audio/SKILL.md#后台暂停与恢复约束)处理浏览器音频。具体场景玩法、HUD/布局、正式可见资产消费、Boot→正式可见 Scene 接入和删除旧视觉实现留在场景或集成范围。原生窗口配置和生命周期只在目标项目采用相应原生宿主时实施。
3. 每个场景 Work Item 先在 V1 冻结功能规格、scene master/reference target、宿主上下文和视觉合同；V2 先完成拆解确认，再完成布局确认；V3 完成正式资源验收，V4 完成页面草图确认。
4. V4 草图确认后在 V5 按冻结 `executionUnits` 实现场景与紧邻从属显示层，V5 完成运行态视觉接入、功能/视觉联合验收和清理；任务范围内场景闭环后才进入跨场景 `INTEGRATION`，无副作用本地集成可按任务执行，外部写入、付费、真机、破坏性或外部删除和发布仍按控制面精确批准规则执行。

场景 V1 同时冻结[显示对象锚点与显示层分层](../../threejs-game-ui-layout/references/display-object-layering.md)方案：对每类模型/几何声明局部原点、单位、朝向和业务枢轴；需要组级旋转/缩放时用父级 `Group`，不强制所有 3D 模型使用中心原点。HUD 的停靠锚点只作用于 HUD。背景、世界、特效、HUD 和瞬态层按实际职责划分有名根层并明确 Camera、深度/透明、输入和生命周期。V2 将对象变换与层序意图映射到布局/显示层合同，V4 检查正式资源草图组合，V5 验证遮挡、最上层命中及关闭/resize 后恢复。这里的渲染分层不把世界对象或特效变成独立 `DISPLAY_LAYER` Work Item。

帧动画是上述场景路线中的动态资源子路线。全局 V2 根据动作、构图、镜头和背景要求写视频提示词并等待视频文件；全局 V3 接收实际视频，按可调 FPS、目标尺寸和是否去背景抽帧，生成 spritesheet、报告和浏览器预览，并检查动作节奏与循环衔接。全局 V5 按资源类型接入：骨骼/节点动画使用 `GLTFLoader` 返回的动画片段和 `AnimationMixer`，序列帧由项目动画控制器读取纹理帧数据；采样事件时序、播放状态和性能。资源加载和动画状态由项目服务/控制器拥有，不假设引擎提供游戏级管理器。完整字段见[帧动画工作流接入合同](../../threejs-frame-animation/references/workflow-integration.md)。

## 基础显示约束

- 默认以 WebGL 2 `WebGLRenderer` 建立 Canvas；采用 `WebGPURenderer` 必须是 TDD 中明确选择的路径，并单独验证其浏览器、异步初始化和材质/后处理兼容性。
- 在基础显示模块用宿主 CSS 让 Canvas 填满实际容器。读取 Canvas/宿主的 `getBoundingClientRect()` 得到 CSS 宽高，设备 DPR 非法时回退 1 并封顶 2；调用 `renderer.setPixelRatio(effectiveDpr)` 与 `renderer.setSize(cssWidth, cssHeight, false)`。`false` 代表不让渲染器改写 CSS 尺寸；记录实际 backing 尺寸但不把它用于 HUD 布局。
- 每次 CSS 尺寸变化都更新透视相机的 `aspect` 并调用 `updateProjectionMatrix()`；Orthographic HUD/DOM Overlay 和指针适配器消费同一 CSS viewport revision。DPR 变化只改变 backing 分辨率，不能改变世界单位、点击尺寸或 HUD CSS 坐标。监听器在显示服务销毁时清理。
- 浏览器项目验证视口填充、resize、方向变化和页面可见性；仅在 TDD 声明采用原生宿主时，才增加启动主题、窗口全屏、安全区和原生前后台路径的验收。

## three.js 游戏运行时约束

- `THREE.Scene` 只组织 `Object3D` 树和渲染环境，不持有玩法状态。每个玩法 Scene 配有独立场景控制器，明确 `enter`、固定步 `update`、`exit`、`dispose` 的调用顺序与唯一状态所有者；场景切换先停止旧控制器并清理其监听/动画，再安装新控制器。
- 渲染器使用 `setAnimationLoop()` 驱动帧循环。玩法和物理用配置声明的固定步长与 accumulator 推进，并限制单帧最大补算次数，避免后台恢复后出现过量追帧；渲染插值与固定模拟状态分开。
- 指针输入以 `clientX/clientY - Canvas.getBoundingClientRect().left/top` 得到 CSS 局部坐标，再换算 NDC 并通过 `Raycaster.setFromCamera(ndc, camera)` 命中真实可交互的 Object3D。不得把透视世界当作 1080×1920 的二维屏幕平面。
- 模型优先交付 glTF/GLB；需要时才为对应资产配置 `KTX2Loader`、Meshopt decoder 或 `DRACOLoader`。动画资产通过 `GLTFLoader` 的动画片段和 `AnimationMixer` 更新；贴图色彩空间、纹理压缩和动画所有者写入资产合同。
- 场景退出要停止/释放其拥有的 `AnimationMixer`、控制器、监听器、渲染目标及不再共享的 GPU 资源。移除对象本身不会释放 BufferGeometry、Material 或 Texture；共享缓存资源由资产服务管理引用/所有权，避免一场景清理误释放其他场景仍在用的资源。
- 对重复几何/材质评估 `InstancedMesh`；大场景按可见尺寸/距离评估 `LOD`、视锥裁剪、加载分块和阴影预算。按场景记录 draw call、三角形、纹理显存、阴影贴图、透明过绘、动画对象数和帧时；只根据目标浏览器/设备实测决定预算，不能凭通用阈值宣称通过。

## 单场景完成闭环

每个场景以 `SCENE` 聚合自身完成事实：依次完成 V1 scene master/reference target、视觉合同与初步还原草案，V2 拆解/布局确认与生产方案，V3 正式资源验收，V4 草图调整和人工确认，V5 正式功能实现与运行态验收。modal/popup 等 `DISPLAY_LAYER` 建立独立 Work Item 和实施包，复核自己的上下文图及 scene/layer/host、V2/V3 身份；其缺图或未完成不扩散为宿主前置失败。

场景和显示层分别记录 `functional_status`、`resource_status`、`integration_status`、`lifecycle_cleanup_status` 和 `verification_status`。这些字段是领域完成事实，不得冒充或驱动全局状态。显示层仍复用同一 V0-V5、A0-A6、F0-F4，不建立第二套全局状态机；只有功能、资源、宿主集成、生命周期清理和验证五项均关闭、所有资源归属明确且证据绑定当前候选时，显示层或场景整体才完成。

### 场景与显示层效果图产物

- `scene master`：基础场景、常驻 HUD/导航/状态栏和默认状态；互斥 modal、popup、drawer、toast 不得同时塞入主图。
- `contextual layer images`：每个瞬态层的 required state 都单独出图，但必须包含宿主场景、遮罩/层级、显示层和当前状态，并绑定宿主 target SHA、显示层 target SHA、viewport；孤立组件图只能作为 V3 生产参考。
- `V2 component × state plan`：在拆解确认阶段独立拆解组件和状态，随后 V4 以草图确认宿主组合、V5 在正式场景验证，重放打开→交互→关闭→底层状态/焦点恢复轨迹。

## 增量流程

1. 冻结玩家行为、模块契约、所有权、验收、服务复用和 V0 类型。模块边界变化先查事实，仅实质取舍触发模块门和 grilling。F4 只处理带副作用的 A4-A6 决定。
2. 场景 V1 时定义状态、输入、规则、反馈和必要低保真草图/灰盒；正式场景功能代码不得在 V1/V2 前写入。指定效果图还原时，V1 生成或接收并冻结 scene master/reference target、宿主上下文图、参考身份、目标视口/状态、对比条件、可观察视觉事实和初步还原草案，并声明 `visual_validation.mode=usability|exact`（默认 `usability`）。默认允许小幅位置、尺寸、边距和换行差异；改变产品方向、玩法语义或上游结构，或明确要求 `exact` 时才请求一次 `USER_DECISION`。
3. 场景 V2 基于冻结效果图输出拆解图、技术 JSON、coverage、布局/placement 三方绑定、component×state、显示层规划、文本拆解和生产方案；经用户确认的 `visual-decomposition-confirmation/1.0` 是包含场景/集成单元的正式视觉生产边界。基础阶段的 foundation-only 包不属于场景 V2；纯工程包无需等待全局静态基线，具有视觉依赖的基础包仍须先完成全局静态基线冻结。`usability` 仍需拆解图确认和关系证据；只有 `exact` 或明确全覆盖需求时才要求逐状态/逐区域完整矩阵。
5. 普通资产和效果图还原的清单字段、状态分析、component×state、生产合同与文件校验以[视觉生产管线](../../threejs-game-asset-integration/references/visual-production-pipeline.md)及对应 Schema 为准；编排层只确认当前场景的 V2 两次确认、V3 资源验收、V4 草图确认和实施包引用完整。

效果图的 coverage、layout/placement 双向绑定和父子/双轴关系以[UI 布局合同](../../threejs-game-ui-layout/references/layout-contract.md)为准。编排层只确保这些产物属于当前场景 Work Item，`DISPLAY_LAYER` 紧邻宿主 `SCENE`，V4 草图组合确认和 V5 运行态证据均引用同一份场景事实。

高保真布局节点的父子几何、双轴对齐和身份投影按[UI 布局合同](../../threejs-game-ui-layout/references/layout-contract.md)执行；运行时只能消费校验通过且已完成 V2 布局确认的结果。
6. V3 生产并验证资源，V4 生成和确认草图；只有机器清单状态为 `accepted` 且来源或生成记录、适用的版权/许可信息、正式布局、运行时输出、ThreeJS 和玩法视觉证据完整时，才可交给后续正式功能实现。效果图区域还必须逐 `annotation_number/region_id` 显式声明七个生产合同字段以及状态/部件映射；不得在 V3 之前以占位资源启动正式功能代码。

原子部件补充：`component_count` 只计唯一 `atomic_visual_key`，重复可见实例必须用多个 `placements` 和 `visible_instance_count` 表达。② 六按钮逐部件登记；⑧ 三个相同表面可为一个 component 加三个 placements；⑨ 按实际复用关系登记。生成式位图每个唯一 component×required state 只允许独立位图，强制 individual 且禁止 atlas；说明、图例和 atomic image requirements 放在标注图右侧栏，左侧原图只保留框和编号/placement 标记；热区逐 placement 绑定，不计入资产。
7. V1 灰盒与 V5 正式结构沿用同一生产 Scene 入口/骨架逐步重构，但灰盒不得注册正式入口或承载正式业务逻辑。V4 草图确认后在 V5 实现正式功能，V5 由玩法和美术协作完成结构化接入、动态验收和低保真清理；正式资源绑定场景/覆盖区域，效果图模式以不可变 fidelity case 绑定双方 SHA 与同条件证据。
8. F0 校验任务范围与流程，F1 校验当前候选与既定规格一致，F2 由独立 QA、玩法、技术或视觉角色检查领域质量，F3 只验证当前候选的工程证据，F4 只做带副作用的 A4-A6 精确集成/发布操作批准。V1/V2 的 `USER_DECISION` 不能替代专业缺陷修复。

## 受控并行实现

实施并行边界和 READY/委派校验以[模块划分](module-decomposition.md)及控制面 Schema 为准：`SHARED`/`INTEGRATION` 强制串行，`MODULE`/`SCENE`/`DISPLAY_LAYER` 仅在依赖满足且文件与状态所有权互斥时并行；`DISPLAY_LAYER` 必须紧邻宿主 `SCENE`。

## UI 与背景

HUD 必须使用 [`threejs-game-ui-layout`](../../threejs-game-ui-layout/SKILL.md) 的版本化合同和唯一布局入口，从显式 CSS/HUD 坐标空间、父级 `Group` 或 DOM 节点、双方停靠点、尺寸、安全区与断点计算；模型局部原点、HUD 停靠点和动画反馈偏移分开记录。视口、安全区、方向、内容尺寸、有效 DPR（动态封顶 2）和状态是入口输入，重排必须幂等，不能在多个生命周期回调散布无参照坐标。固定尺寸、绝对定位、悬浮 HUD、正交 Camera/DOM 层和单行省略触发布局专项审核，不凭模式本身判错；合同缺依据或证据时才退回。默认 `usability` 测试关系不变量、可读性、边界、遮挡和交互；`exact` 或明确需求时才启用严格 Golden。二维设计坐标只约束 HUD，透视世界对象、Tilemap/关卡网格、碰撞和玩法环境使用独立 world contract 与地图数据，不能扁平化为屏幕背景。

## 视觉证据

参考与运行图在相同视口、运行时动态设备像素比（封顶 2）、状态、轨迹、语言、随机种子和时间点采集，并记录实际有效 DPR、ROI、验证模式、稳定帧和遮罩。默认 `usability` 使用代表性视口和关键状态，完整 viewport、ROI/叠加/像素差及全矩阵仅在 `exact` 或明确需求时作为严格证据；生成式、动画与 VFX 不能只用像素差判断。明显越界、裁切、关键遮挡、不可读或交互失效不得通过；静态高保真、资源齐全、源码检查和构建成功不能单独证明游戏性。

## 回退

玩法契约或结构问题退 V1，并让旧决定失效；模块边界变化仅在实质取舍时进入 grilling。修订候选重跑受影响的 F0-F3；只有带副作用的 A4-A6 操作重跑 F4 批准门。
视觉拆解确认属于控制面工件：收到用户确认后由编排层写入受保护 ledger/receipt，随后冻结新的 Git 基线；实施代理只能消费确认，不能创建、修改或把 ledger 路径纳入 owned/output 委派范围。

场景与显示层实现消费同一场景 Work Item 的视觉真值。基础实施完成后进入场景 V1，在 V1 内生成或接收并冻结 scene master/reference target、宿主上下文图、对应视觉合同和初步还原草案；V2 随后完成当前场景的拆解图确认、技术 JSON、coverage 和生产方案。场景 V2 前仅允许隔离灰盒或无正式业务逻辑样片。V3 验收正式资源与宿主组合，之后才开始正式场景功能代码；V5 完成运行态视觉接入与功能/视觉联合复验。scene master/reference target、modal/popup/drawer/toast 上下文图和原子资产的 generated 记录都必须绑定当前场景身份与全部锚点。provided 文件只记录来源。全局基线只负责静态视觉一致性，不能替代逐场景 V2；任何基线、锚点、目标或提示词身份变化都要使旧生成证据失效。
