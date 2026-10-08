---
name: threejs-game-ui-layout
description: 为 three.js 游戏建立可验证的 UI 布局合同、坐标空间、响应式重排与证据门禁；当实现或审查游戏 UI、HUD、弹层、滚动区域、安全区、断点、动态文案或视口适配时使用。
---

# three.js 游戏 UI 布局

本技能仅负责屏幕 UI/HUD；透视世界使用独立 world-3d 合同，不应用本技能的固定设计坐标。正式 UI 与独立显示层遵守[显示对象锚点与显示层分层](references/display-object-layering.md)：Sprite.center 默认显式使用中心 `(0.5, 0.5)`；Object3D 的 pivot 是模型局部空间，不设置二维 origin。场景须声明背景、世界、特效、HUD、瞬态层的实际层序、输入和生命周期归属，并在 V4/V5 验证草图组合与运行遮挡。

效果图 V2 拆解与布局遵守[功能语义分组约束](references/functional-semantic-grouping.md)和[ThreeJS UI 节点组织](references/layout-hierarchy.md)：先人工确认位置依赖与信息分组，再生成停靠方案；位置依赖方必须成为被依赖元素所对应布局容器的子元素，共同表达同一信息且彼此无位置依赖的元素列为同组同级项。父容器职责、布局所有者、尺寸、溢出、安全区和输入归属须另行记录；禁止按文字类型或几何最小包含关系自动归父级。

## 全局控制接入

控制面边界：可提议、可审查、可在当前用户任务的 Work Item 范围内修改，且必须回到 `$threejs-game-workflow-control` 审计和状态迁移；仅涉及外部写入、付费、真机、破坏性或发布副作用的 A4-A6 操作请求批准，普通可恢复的本地文件清理沿任务执行。

本领域可提议、审查，并在当前用户任务、Implementation Package、A 等级与路径范围内修改布局；所有动作与证据回到 [`threejs-game-workflow-control`](../threejs-game-workflow-control/SKILL.md) 审计和状态迁移。布局合同和 V 阶段不能旁路带副作用的 A4-A6 操作批准或全局状态。

将 UI 布局从页面坐标修补转换为可追踪的布局合同，并把合同、实现、运行时证据接入全局控制面。仅负责布局关系、坐标空间、尺寸策略、响应式重排和布局证据；不拥有全局状态、审批、玩法规则、资源生产、视觉方向或发布放行。

## 全局视口与高分屏合同

屏幕 HUD、弹窗和 `DISPLAY_LAYER` 都必须在布局合同中填写 `logicalViewportSpace`、`designResolutionPolicy`、`canvasBackingPolicy`、`runtimeDprPolicy`、`maxRuntimeDpr`、`scaleMode`、`cameraViewportPolicy`、`cameraZoomPolicy`、`cameraOriginPolicy`、`inputCoordinatePolicy`、`safeAreaPolicy`、`resizePolicy`、`orientationPolicy`、`textResolutionPolicy`、`assetResolutionPolicy`、`performanceBudget`、`representativeViewports` 和 `requiredRuntimeEvidence`。`orientationPolicy.allowed` 声明项目支持的方向；`designResolutionPolicy` 只需提供这些方向的分支，`targets.orientations` 与其一致。竖屏以 1080×1920 为设计基准并按高度适配，横屏以 1920×1080 为设计基准并按宽度适配；另一轴随视口展开或裁切。Canvas 填满 CSS 视口，装饰性背景等比 cover，禁止黑边。Canvas backing 由 CSS 尺寸乘有效 DPR（WebGLRenderer 向下取整）得到，物理像素不得直接用于布局或命中。

运行时 DPR 从设备动态读取，非法输入回退 1，正有限值封顶 2，且必须覆盖 resize、显示密度变化以及双方向项目的方向切换并清理监听器。资源生产 DPR 固定基线为 2，必须与运行时 DPR 分离。合同中的 scaleMode 使用 `custom` 表示 renderer.setSize 管理的填屏逻辑，实施包必须证明 HUD 逻辑尺寸、正交投影和 CSS/物理映射；声明模式或构建成功不能单独作为高分屏证据。弹窗默认继承宿主逻辑视口、DPR、安全区、Camera 和输入合同，V5 必须独立记录其运行轨迹。

## 视觉语言默认原则

UI 设计与实现优先用符合全局视觉基线且含义清晰、熟悉的图标、形状、层级、位置、颜色和动效表达功能；图标含义已明显时，不并列放置永久可见的重复文字说明。图标有歧义或首次学习成本高、高风险或不可逆操作、必须精确表达的状态或数值仍应使用文字；无障碍可访问名称必须保留，但不要求成为重复的可见标签。F2 应检查图标与文字重复、通用图标堆叠，以及界面脱离说明文字后是否仍足够自解释。

程序化文本必须同时交付英语、简体中文、日语、俄语和西班牙语，并逐语言验证字形宽度、字体回退、基线与容器适配。每种语言独立声明 `single-line` 或 `wrap`，允许部分语言单行、部分语言换行，但均不得截断；空间不足时按该语言策略压缩文案、调整字距/字号、扩展容器或合理换行，不得降到不可读字号。表达应短促、游戏化，倍率统一写成 `x3` 这类 `x{value}` 形式，数值变化优先使用 `+10`、图标+数值等熟悉表达，避免解释性长句。

布局验收默认使用 `visual_validation.mode=usability`：位置、尺寸、边距、换行和少量对齐差异只要保持清晰、可读、可操作且不越界、裁切或关键遮挡即可通过；effect-image 也不自动启用 `exact`。只有用户明确要求像素级还原或项目合同明确指定时才选择 `exact`，启用严格容差、逐项 delta 和全视口/全状态矩阵。V2 仍必须保留拆解顺序、父子归属、锚点语义和内部几何一致性。

## 核心流程

1. 读取项目的 GDD/TDD、当前候选、总控审核漏斗和适用视觉阶段；确定稳定 UI ID、坐标空间、参照物、状态与平台输入。
2. 复制 schema 1.2.0 [合同模板](assets/ui-layout-contract-template.yaml)。普通布局使用 `not-applicable` 并保持 `layout_nodes: []`；冻结视觉目标先用 `frozen-target/specified`。同时冻结上述根级视口/DPR/Camera/Input/性能字段，禁止使用旧 `targets.scale` 字段绕过新门禁。V2 先按位置依赖建立父子、按共同信息建立同级分组，再生成拆解图、技术 JSON 和 `decomposition_elements`，人工修改并确认；屏幕 UI 同时确认 `ui_layout` 职责字段。确认后由智能视觉判断生成逐元素 `left/center/right × top/center/bottom` 决策，再由同一入口同步生成布局 PNG、`layout-nodes.json`、`layout-decision.json`、离线 `review.html` 和 `generation-result.json`。随后登记由确认元素和视觉决策共同推导的非空 `layout_nodes` 与关键对齐合同。
3. V3 资源验收后在独立 V4 阶段执行[页面还原草图](../threejs-game-asset-integration/references/visual-alignment-authoring.md)：生成草图数据，页面读取正式资源，提供可调透明度的效果图底板、显示树、节点选择与坐标调整。父节点移动带动子孙，保存后经用户确认才进入 V5。V5 用 [ThreeJS 适配器](references/threejs-adapter.md) 消费同一确认草图，复用幂等布局入口并绑定 `pageSketchSha256`；V2 目标节点保持只读。
4. specified 阶段运行结构检查 `node scripts/validate_ui_layout_contract.mjs <contract>`；verified 正式验收必须运行 `node scripts/validate_ui_layout_contract.mjs <contract> --check-files --project-root .`，复算冻结原图 SHA 并检查目标/运行/parity 证据文件。
5. 按 [证据矩阵](references/evidence-matrix.md) 生成 `orientationPolicy.allowed` 对应的代表性视口、关键状态和窄/宽尺寸证据；只支持单一方向时不验证另一方向，但仍覆盖同方向尺寸、DPR 和同页连续 resize。关键 UI/HUD 记录稳定 element/reference ID、双轴关系、目标/运行测量、实际测试 ID/状态、视觉证据和项目定义容差。V5 还必须记录 CSS/backing 尺寸、raw/effective DPR、Camera、输入命中、同页 resize 和独立 DISPLAY_LAYER 轨迹。`exact` 或明确的全覆盖需求才扩展到完整矩阵和严格 delta，方向轴仅覆盖项目支持方向。
6. 按 [工作流门禁](references/workflow-gates.md) 接入 V0–V5、F0–F4 和 G0–G3；只有布局结构、父子归属或参照关系真实变化才退回 V1，普通位置/尺寸调整更新计划并重验受影响区域，F3 只接受绑定当前候选的工程证据。

## effect-image 场景绑定

当 Work Item 的 `effect_image_reconstruction.applicability=effect-image` 时，布局合同必须携带 `scene_reconstruction_binding`：绑定冻结目标 SHA、scene/state、visual baseline、reconstruction contract 版本、`layout_contract_sha256`、`layout_decomposition_version` 和目标 viewport。`layout_nodes` 中每个节点必须同时绑定一个 `regions`/`scope.ui_ids` 区域和已声明坐标空间，记录参照、双轴锚点、目标 bounds、尺寸策略、层级、裁切、响应式规则与计划测试 ID；同一 coverage region 可以承载多个 layout nodes，但节点间必须使用唯一 `layout_node_id`，多节点区域不能用 region ID 作为有歧义的参照；关键对齐通过 `layout_node_id` 复用这些几何事实。该绑定描述正式 Scene 的目标关系，不能用旧通用布局合同、整屏截图、隐藏覆盖层或绝对叠图代替；只有 target SHA、父子归属、构图关系或响应式不变量真实漂移时，V2→V3 才退回 V1/PROPOSAL。其他 viewport 默认验证合同声明的不变量和可用性；只有 `visual_validation.mode=exact` 或明确精确需求时才要求目标 viewport 的严格还原。

V2 的布局决策顺序固定为“自动生成拆解图/技术 JSON → 人工修改并确认最终拆解 → 智能视觉判断生成显式双轴对齐决策 → 由确认元素与决策生成独立布局标注图 → 人工修改并独立确认 → 冻结 V2”。布局生成入口拒绝未确认拆解、缺失决策、元素漏绑或未绑定当前 scene/state/target 的输入；布局确认同时绑定上游拆解、视觉决策文件和最终布局图身份。

效果图节点还必须声明 `parent_layout_node_id`、`parent_target_bounds`、`relative_position` 和 `axis_alignment`。拆解确认后，智能布局结合原图构图、视觉重心和元素语义，为每个元素显式判断水平 `left/center/right` 与垂直 `top/center/bottom`；该判断不能由四边距离自动反推。`relative_position` 仍由父子 bounds 测量，用于复核包含关系和几何漂移；`offset`、`self_anchor`、`reference_anchor` 则按已选 `axis_alignment` 计算。`reference_id` 必须等于父 ID，父级仅可为具体节点或 `viewport`/`safe-area`，不得循环。视觉决策文件及其 SHA 会进入布局图和确认身份，缺失决策必须阻断布局生成。

## 资源导航

场景 `display_layer_planning` 只记录 scene master 与常驻 HUD。modal/popup 等瞬态弹窗建立独立 DISPLAY_LAYER Work Item，在自身合同中记录宿主场景、生命周期、输入阻断、层级、遮罩、焦点恢复和响应式事实，并于自身 V5 同屏验证打开→交互→关闭后的底层布局恢复。弹窗证据仍绑定 scene/layer/host，但不进入宿主场景验收。

- 需要字段、关系表达或不变量写法时，读取 [references/layout-contract.md](references/layout-contract.md)。
- 需要 ThreeJS Scale、Camera、Container、DOM Overlay、resize 或重排边界时，读取 [references/threejs-adapter.md](references/threejs-adapter.md)。
- 需要对象默认锚点、例外或跨层合成顺序时，读取 [references/display-object-layering.md](references/display-object-layering.md)。
- 需要 UI 根节点、父容器职责、`ui_layout` 字段或 V1–V5 节点组织规则时，读取 [references/layout-hierarchy.md](references/layout-hierarchy.md)。
- 需要 V/F/G 门禁、退回和候选绑定规则时，读取 [references/workflow-gates.md](references/workflow-gates.md)。
- 需要组合测试、等价类削减或冻结 Golden 条件时，读取 [references/evidence-matrix.md](references/evidence-matrix.md)。
- 需要布局审阅页、同批产物、坐标映射、SHA 绑定或离线安全边界时，读取 [references/layout-review-artifacts.md](references/layout-review-artifacts.md)。
- 合同验证器只接受 JSON-compatible YAML（合法 YAML 1.2 的 JSON 子集），详见合同参考；直接使用 Node.js `JSON.parse`。

## 所有权与输出

布局技能输出合同版本、布局计算输入/输出、不变量和证据索引。玩法继续独占规则、状态和交互；架构维护坐标空间与模块边界；美术维护纯表现资源和预制数据；QA 只读验证可达、截断、遮挡、触控、滚动和证据。布局计算与 Object3D/DOM HUD 测试验证关系不变量，不把孤立绝对坐标当作通用验收标准。
