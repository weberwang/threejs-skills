# V0-V5 视觉生产管线

场景 Work Item 只生产自身画面和常驻 HUD；modal/popup 等弹窗建立独立 DISPLAY_LAYER Work Item。弹窗 required state 仍需完整宿主上下文、拆解、布局和资源前置，但其未完成不阻断场景 V5。字段和调度边界见[控制模型](../../threejs-game-workflow-control/references/control-model.md#弹窗工作项与场景解耦)。

effect-image 生成式位图的完整提示词与实际参考输入合同统一见[Effect-image 生成式位图忠实还原提示词合同](effect-image-prompt-contract.md)；管线只引用该合同，不重复维护模板正文。

## V0 分流

先记录范围、视觉方向是否冻结、结构/交互/布局是否变化、正式资源数量与跨域风险，再选择且只选择一条路径；资源数量和生产方式只服务后续路径、预算与执行规划，不参与效果图适用性判断。Work Item 指定效果图或参考截图为还原目标时启用[忠实还原模式](visual-reconstruction.md)，指定参考是冻结视觉目标而非可自由优化的灵感输入。

效果图/参考图是否适用只看当前场景 Work Item 是否把它指定为正式运行画面的视觉目标，与是否生成、制作或新增资源无关。适用时，参考还原是同一场景实现生命周期内的视觉模式与合同叠加，即使所有覆盖区域均为 `reuse-existing`/`runtime-program`、零新资源且零生成式位图，也必须走 `effect-image` 的 V1→V5 还原合同，并完成布局绑定、coverage、宿主场景同屏组合和 fidelity 验收；不创建第二个场景 Work Item 或第二条 V1→V5。仅仅生成新资源，或仅把图片作为灵感、说明或临时参考，不足以触发 `effect-image`，仍按普通资产、组件或场景路径分类。`image_generation_required`、`generate-now`、资源数量和 `production_method` 只能在触发后于 V2 决定生产路线，不能参与 V0 applicability 判定。

| 类型 | 判定 | 阶段 | 审核 |
| --- | --- | --- | --- |
| 原子资源 | 视觉方向已冻结，结构、交互、布局不变，并有适用、有效、绑定当前范围的玩法视觉契约、V1/V2 决策记录、视觉可交付结论与预算基线；缺少任一项时升级路径 | V2 → V3 → V4 → V5 | F0 范围与流程；F1 规格一致；V3 确定性机器 F2；V5 生成 F3 动态集成工程证据；F4 仅处理有副作用的精确操作批准 |
| 组件/资源集 | 同一组件、角色状态组、图标集或可复用资源集，需要局部探索与一致性控制 | V1 → V2 → V3 → V4 → V5 | 普通候选执行 F0-F3；V3 做确定性机器 F2，V5 形成 F3 工程证据；仅有外部写入、付费、真机、破坏性或外部删除、发布副作用的 A4-A6 操作执行 F4 |
| 场景/视觉系统/重做类任务 | 场景、整套 UI、世界环境、跨场景视觉系统或重做；参考还原作为可选视觉模式 | V1 → V2 → V3 → V4 草图确认 → V5 正式实现与验收 | V1/V2 确定性机器检查强制；实质取舍按条件记录一次 `USER_DECISION` |

局部修复仍执行 F0 范围与流程、F1 规格、适用 F2 与 F3 工程证据；只有涉及外部写入、付费、真机、破坏性或外部删除、发布副作用的 A4-A6 操作执行 F4 批准门。记录缺失优先原地补齐；任务目标范围真实变化才重新分流，普通路径、方案和资源清单调整直接更新计划并重验受影响部分。

所有任务执行适用 V1/V2 确定性机器检查。已有明确需求或冻结基线时可记录 `AUTO`；修复、提升游戏感或工程适配只要改变产品方向、玩法语义或上游视觉事实，才按差异列出影响和候选方案，请求一次 `USER_DECISION`。普通位置、尺寸、边距和换行差异按 `visual_validation.mode=usability` 处理，不升级为精确选择；后续绑定当前决策记录。

全局基线、foundation-only 边界、场景阶段顺序和集成入口以[控制模型](../../threejs-game-workflow-control/references/control-model.md)与[状态、阶段与停止门](../../threejs-game-workflow-control/references/state-gates.md)为准。本管线只补充资源领域的 V0 分流、V2 生产合同、V3 资源验收、V4 草图确认和 V5 运行态证据；参考还原仍属于当前场景 Work Item。

F2 必须由确定性机器验证执行，并绑定当前 baseline/diff 身份。V1/V2 只保留机器事实、拆解图和技术 JSON；V1/V2 使用 `AUTO` 或 `USER_DECISION` 记录，只覆盖所列对象且不写 Approval Ledger；F4 只处理外部写入、付费、真机、破坏性或外部删除、发布等带副作用的 A4-A6 操作。

## V1 玩法视觉契约与必要灰盒

1. 逐状态定义第一视觉目标，以及玩家、目标、危险、交互、装饰的优先顺序。
2. 定义明度、色彩、轮廓和运动区分，可供性（affordance），前摇、命中、受击、奖励反馈时序，遮挡预算及小屏、高速、灰阶、色觉差异阈值。
3. 只有结构、交互或节奏尚不能被运行证据证明时制作必要灰盒；不得为了流程完整重复已冻结灰盒。
4. 在生产前定义每场景纹理、图集、帧数、动画采样、纹理内存、过绘、Draw Call 和最大纹理预算。未能量化的阈值标为项目待定义，不能推迟到 V3。
5. 保留已批准的功能语义、业务状态、交互语义和状态所有权，同时检查构图、信息层级、资源槽、页面模板和布局几何是否足以承载核心玩具、专属场景对象、关键反馈与奖励表达。必要灰盒是功能与结构证据，不是必须原样换皮的最终视觉模板。
6. 建立全局视觉基线候选，记录基线 ID/版本、风格指纹、主锚点与分系统锚点、世界幻想及形状、比例、镜头、色彩、材质、光源、描边、密度、字体、图标、面板、动画和 VFX 规则，并明确允许变量与禁止项。未冻结内容不得作为批量生产依据。

7. 场景、整套 UI、视觉系统和可选参考模式必须同时读取并冻结 [`threejs-game-ui-layout` 的布局合同](../../threejs-game-ui-layout/references/layout-contract.md)：浏览器 viewport、Canvas、逻辑坐标、safe area 四层关系，FIT/RESIZE/COVER/响应式锚点/断点重排，背景覆盖目标，留白/裁切/拉伸许可，代表性视口与关键状态，以及动态文本、显隐、滚动、触控、resize 和项目支持方向策略，并声明 `visual_validation.mode=usability|exact`（默认 `usability`）。方向覆盖遵循 `orientationPolicy.allowed`：单方向项目在同方向覆盖窄宽尺寸与连续 resize，双方向项目才验证方向切换；`exact` 方向轴只覆盖声明的方向。只有 `exact` 或明确全覆盖需求时才冻结完整视口/状态矩阵。缺少影响可用性的核心关系标记“响应式契约缺失”，阻断当前场景 Work Item 的 V2。
8. 参考模式在当前场景 Work Item 的 V1 内生成或接收并冻结参考身份、版本、权属、文件指纹、目标视口/状态、对比条件、scene master/reference target 与宿主上下文效果图；V2 前基于 V1 拆解草案建立区域关系和必要状态证据，字段、容差、冲突处理和失败条件以[视觉还原](visual-reconstruction.md)为准。默认允许合理几何偏差，只有明确 `exact` 需求时才定义严格像素容差和全覆盖矩阵。

玩法拥有规则、状态、交互和功能灰盒。美术拥有视觉契约中的表现目标，不得通过视觉实现改写玩法规则。

### V1 条件门：低保真机器验证与决策记录

顺序为契约/灰盒、证据关闭、条件分类和决策记录。自动路径写 `AUTO`、依据与适用范围后进入 V2；实质取舍路径记录一次用户结论。

决策记录包含候选、范围、契约、灰盒、结构/交互/布局证据和返工影响。自动路径记录 `AUTO` 及依据；需要人工时结论只允许“通过”“修改后重提”或“拒绝”。

“修改后重提”产生新候选并重跑受影响 F0-F3；只有带副作用的 A4-A6 操作重跑 F4 批准门。拒绝按根因留 V1 或退制作契约/GDD；模块边界变化仅有实质取舍时进入 grilling。

## V2 拆解确认与生产方案

功能分组遵守[功能语义分组约束](../../threejs-game-ui-layout/references/functional-semantic-grouping.md)。阶段 A 为每个元素明确 `parent_element_id` 和 `semantic_grouping.kind/rationale`：位置依赖决定父子层级，依赖方必须成为被依赖元素所对应布局容器的子元素；共同表达同一信息但互不依赖位置的元素进入同一个功能组件并保持同级。文字独立登记但归属对应信息组，不按元素类型集中归组。语义歧义留在拆解审阅，机器不根据距离或最小包含矩形补父级。阶段 B 只继承已确认归属；新增容器或修改归属、理由必须重新拆解确认，不能复用旧布局身份。

当前场景 Work Item 的 V1 冻结目标和初步还原草案有效后进入 V2。V2 把 V1 的视觉事实细化为可确认、可执行的还原方案，并按两个串行硬门完成：阶段 A 先冻结拆解图、技术 JSON、按序 `decomposition_elements`、功能归属与理由、component×state 和资源生产事实；阶段 B 仅在拆解确认后继承功能父子归属，补充停靠/对齐关系、布局测量、显示层关系和布局容差，冻结后置布局标注图。

V2 布局必须后置于拆解确认：阶段 A 先由冻结原图、区域和组件事实生成拆解图及技术 JSON，并明确按人工确认顺序排列的 `decomposition_elements`；允许人工修改并确认最终拆解。只有 `visual-decomposition-confirmation/1.0` 通过后，智能布局才可结合原图构图、视觉重心和元素语义，为每个确认元素按原顺序生成唯一的 `left/center/right × top/center/bottom` 对齐决策；几何测量不得替代该视觉判断。布局入口只消费该决策与 `proposal.decomposition_elements`，按原顺序推导后置布局节点并生成独立布局标注图，不能读取预存 `layout_nodes`，也不生成新的视觉参考图或多个布局候选。布局决策和布局图都允许人工修改，重新生成后再以 `layout-annotation-confirmation/1.0` 绑定最终图、决策文件及全部上游身份。

布局图的每个框必须与右栏共用唯一短编号，并注明父编号，保持确认元素原序；编号避让只能调整标注，不得改变元素布局。右栏逐节点说明自身相对上级的双轴停靠、锚点与偏移，父容器、空容器同样必填，根明确无上级。技术 ID 和四边距离仅辅助追溯；长说明必须换行且完整可见，不能用被裁切的文本或元数据完整标记代替可读图。详细规则见 [UI 布局合同](../../threejs-game-ui-layout/references/layout-contract.md#v2-串行拆解与布局标注)。

`docs/visual-assets.json` 使用 schema 1.5。普通资产声明 `not-applicable`；效果图还原进入正式生产前声明 `effect-image/v2-ready`，此时冻结目标、合同回对、coverage、拆解图确认和生产方案必需，而 fidelity case 可为空。coverage 必须逐冻结 scene/state 声明目标画布、画布内 region 和完整性摘要，覆盖率为 1、未覆盖列表为空、状态通过且绑定证据；不能用单个微小区域冒充全覆盖。每个固定视觉 region 还要有稳定编号、实现分类和七个生产合同字段；`production_method` 使用 `image-generation`、`authored-raster`、`authored-svg`、`threejs-graphics`、`runtime-program`、`reuse`，`delivery_kind` 使用 `raster-image`、`vector-image`、`runtime-drawing`、`runtime-program`、`existing-asset`。实现分类为 `generate-now`、`reuse-existing`、`runtime-program`，并在冻结效果图标注图中同时呈现。

拆解提案固定按“冻结视觉事实 → 选择视觉来源路线 → 独立验证场景装配”执行。`visual_route_analysis` 只决定图片资产或 ThreeJS 原生路线；`assembly_analysis` 只声明原子 Scene 装配、禁止整屏捕获并明确允许独立图片资产。路线判定先把文本委托给 `text_decomposition`，其余静态视觉默认并强制选择 `image-asset`；只有 `dynamic_requirements.is_dynamic=true` 且原生资格证据完整的非文本逻辑才可选择 `threejs-native`。任何生成步骤都不得从“不能整屏贴图”推导“所有视觉必须程序绘制”。如果程序逻辑与独立视觉资产出现在同一视觉事实中，必须回到 V1/PROPOSAL 重新划分 coverage/annotation：外观建立独立 image-asset region，行为建立独立 threejs-native/runtime region，并分别进入自己的生产与运行逻辑合同。禁止单一 `composite` region 或 `composite_parts` 继续生产或验收；检测到该输入时无条件阻断并退回 V1/PROPOSAL。如果全部 coverage 都选择 `threejs-native`，必须附带绑定当前 target SHA、完整 region 集合和独立 JSON 工件 SHA 的 `all_native_justification`；文件门会复算 SHA 并逐区核对资格事实，否则停在 V1/PROPOSAL。

固定视觉区域区分 `bitmap-decomposition` 与 `independent-production`；实施顺序是 ownership/实现分类 → 状态分析 → 唯一原子 component/placements 拆解 → 生成左原图+右用户说明 PNG 与 proposal 技术 JSON → 展示用户 → 等待拆解图确认 → 运行完整文件校验 → 生产。拆位图必须先用 `node scripts/generate_effect_image_annotation.mjs ... --output ...png --proposal ...json` 提交绑定目标 SHA/region ID/区域定义 SHA 的提案，并在 confirmation 记录 proposal/decision 文件及 SHA、PNG MIME/版本/SHA、决定 ID、实际消息身份字段后等待用户确认。PNG 用户图示只保留稳定编号、视觉框、中文摘要和“新建图片资产 / 复用现有图片 / 程序绘制或动态逻辑”标签；坐标尺寸、状态、组件/placement、生产合同、atomic requirements 和资源映射完整保存于 proposal 技术 JSON。开始裁切、抠图、分层、AI 分割/补全或派生位图前，必须运行 `node scripts/validate_visual_manifest.mjs docs/visual-assets.json --stage V2 --check-files --project-root .`，结构和文件证据均通过才可执行；PNG 必须由共享无依赖确定性栅格渲染器产出，文件检查会校验 PNG 魔数/MIME/尺寸/用户说明元数据并逐字节重建比较，同时用 proposal 与区域定义 SHA 复核隐藏技术合同；正式流程不生成或接受 SVG 标注。`reuse-existing` 的 `source_manifest` 必须是不可变 `asset-reuse-snapshot/1.0`，并用 `source_file`、`source_manifest_sha256`、`source_sha256`、`compatibility_evidence_sha256` 完成精确身份复核；bitmap 路线资产使用 `ai-composite-raster`。只有 V5 完成后声明 `v5-complete`，case 必须全部满足当前验证模式，并在 `exact` 或明确全覆盖需求时逐一覆盖冻结目标的每个 scene/state 组合。其余条件确认按既有规则触发，`AUTO` 绑定判定证据；owner_type 属于合同/F2 专业事实，不能由验证器从像素推断。

1. 按资产类型选择源文件、运行时输出、生产工具、命名、切片、锚点、图集、帧和压缩策略；保留可编辑源文件或完整生成记录，并继承当前全局基线与适用分系统锚点。
2. 将资源写入 `docs/visual-assets.json`，声明唯一资源 ID、纹理键、输出路径、路线、状态、证据、项目已定义预算，以及与根节点完全一致的基线 ID、版本和风格指纹。每个资源无论处于 `planned`、`producing`、`review`、`accepted`、`rejected` 还是 `replaced`，都必须二选一声明具体 `scene_id`，或 `shared: true` 及至少两个 `shared_scene_ids`；仅运行必需资源可用 `shared_reason: runtime-required` 免除两个场景条件。拒绝或替换资源仍保留原场景归属，确保审计链可追溯。
3. UI、像素美术、逐帧/骨骼动画、Tilemap、VFX、背景和玩法环境走各自路线。框选效果图拆单图只属于 AI 合成栅格路线，不是默认管线。
4. 场景/系统/参考还原在 V2 做确定性机器 F2；原子资源和组件集不重复设置 V2 审核。
5. AI 生成包固定使用“全局提示前缀 + 资产特定段 + 状态段 + 负向段”，并记录模型/版本、种子、参考输入、控制参数和后处理。相同关键词、模型或调色板不得单独证明一致。

V2 使用仍适用的 V1 `AUTO` 或 `USER_DECISION` 记录、视觉可交付与全局基线；还原任务必须绑定冻结视觉目标、必要的区域关系证据和 `visual_validation.mode`。`exact` 才要求严格忠实度矩阵与精确例外；默认 `usability` 允许小幅位置、尺寸、边距和换行差异。

V2 的生产合同字段必须逐 `annotation_number/region_id` 显式记录 `production_origin`、`production_method`、`delivery_kind`、`image_generation_required`、`generation_record_required`、`substitution_policy` 和 `expected_assets`。拆解顺序固定为“先 `state_analysis`，再 `component_inventory`”：所有普通、selected/active、disabled、pressed/hover、victory/defeat/paused 状态必须写 `required` 或 `not-applicable+reason`；`annotation_number` 不是资产数量单位。`component_inventory.component_count` 必须对应可复用部件清单，生成式位图的 `expected_assets` 必须按 `component_id × required state_id` 一一对应。生成式位图使用 individual 位图并声明 `atlas_allowed=false`，一张横向组图或图集均不能满足多个部件；验证器按逻辑像素 `ceil(max placement width/height × intended_scale_range.max × 2)` 自动计算 `width/height`，只能使用精确最小尺寸；`scene_asset_usage.max_dpr` 必须严格为数字 `2`，`padding_policy` 必须为 `none`，这部分机器合同不要求 human_review。这里的 2 是图片生产基线；运行时实际 DPR 按设备动态取值并封顶为 2，不改变资产尺寸合同。历史 1.5 生产证据须重生成或标记 `stale`。其他生产方法只有在显式 `atlas_allowed=true` 且每个部件×状态登记完整 `atlas_slice` 时使用图集。交互热区单独登记，不计入视觉资产数量。`independent-production` 与 `generate-now` 不推断具体生成器；独立生产不等于图片生成，视觉相似不等于生产合同完成。若 `image_generation_required=true`，必须是 `image-generation+raster-image`，并交付独立源/运行时位图、实际生成器及版本、完整提示词与生成记录、MIME/宽高/alpha/SHA、运行时消费证据；工具版本未暴露时记录 `not-provided`。实施包的 `visualProductionUnits` 必须与 coverage 一一映射；编号、部件/状态、输出共享、路径、所有权和格式冲突先在 V2 `repair`，只有冻结生产规格真实变化时才进入必要回退。

生成式位图的源文件、运行时文件和实际输出仅允许 `image/png` 或 `image/jpeg` 以及 `.png`、`.jpg`、`.jpeg` 后缀；通用 authored-raster 可使用其他位图格式。`expected_assets.alpha=true` 的生成式位图必须先生成整张不透明、单一指定 HEX 纯色背景 PNG，再执行公共 `remove-background-local.mjs`；生成器不得请求透明 PNG/Alpha，也不得输出棋盘格、网格或其他可见透明预览。透明策略只能声明为 `transparency_strategy=background-removal`，并显式记录 `source_background_mode=opaque`、`source_background_color`，颜色须与脚本参数一致；`--require-solid-background` 校验失败时重新生成或修正源图。复杂背景不是该生成路线的合格输入。原图、去背景结果和实际 Alpha 必须可审计；`background_removal_attempts` 按实际尝试追加记录，失败保留原因和历史，重试次数由任务配置设定上限。已有真实透明图按资源复用合同接入，不伪造生成去背记录；`alpha=false` 的完整场景背景不受纯色要求约束。V3 须解码 PNG 证明存在透明像素。

生成式位图单图必须按“生成原图 →（`alpha=true` 时）校验不透明纯色背景 → 公共脚本去背景 → 尺寸归一化 → V3/final/runtime”执行。归一化由 Sharp 完成并产生 `normalization_record`；生成式透明路线的 `normalization_record.source_file` 必须绑定背景处理输出，最终 `actual_output` 只能指向归一化后的 PNG/JPEG（`alpha=true` 只能是 PNG，`alpha=false` 可是 JPEG）。首次输出比例不符时最多重生一次；第二次仍不符时，若已冻结裁切焦点和安全事实，使用 `crop-and-resize-to-contract` 并记录两次真实原始生成 attempt、SHA、尺寸、focus 和最大目标比例 `crop_rect`，否则由生产流程先对原图生成式延展到目标比例，再重新校验纯色背景、执行背景处理和普通归一化。该分流适用于所有生成式位图，`expected_assets.width/height` 最终必须精确匹配，`padding_policy=none`，禁止非等比拉伸、裁剪冻结 `reference_target`、补边、contain、复制边缘或静默变形。尺寸已满足时也要记录 `operation=not-required`；透明素材前后都必须保留 Alpha。归一化记录缺失、失败、尺寸、路径或 SHA 不一致均阻断 V3。

V2 阶段 B 的唯一生成入口还必须在 PNG 输出目录同步写入 `layout-nodes.json`、`layout-decision.json`、自包含 `review.html` 和 `generation-result.json`。审阅页直接消费本批冻结参考图/节点数据，使用同一坐标映射展示当前与父节点关系；候选状态、离线约束、名称回退、真实文件 SHA 及独立布局确认的完整字段见[离线布局审阅产物](../../threejs-game-ui-layout/references/layout-review-artifacts.md)。这些产物属于可读审阅和可追溯交付，不能替代标准 PNG、F2 机器门或 V5 证据。

## V3 正式资源生产与资源级验收

V3 只完成正式资源生产和资源级验收，尚不要求正式 Scene 功能代码或组合运行轨迹。验收通过后进入独立的 V4 草图阶段，由[页面还原草图作业](visual-alignment-authoring.md)读取正式资源和 V2 节点初排、调整并确认布局。离线 `review.html` 与 V2 目标节点保持只读。

1. 按冻结场景顺序和 V2 清单生产运行时文件；当前 V3 范围内全部待生成图片统一按下述批量规则提交，不逐张创建或串行等待生成任务。不静默覆盖已验收版本；同步登记来源、生成记录和适用的版权/许可信息。
2. 每项图片必须记录 CSS 逻辑显示范围、最大 intended scale、生产分辨率、source/runtime 文件尺寸，以及在代表性视口中是否会被放大；分辨率不足时阻断 V3，简单插值放大不得作为清晰度修复。生成式图片仍使用固定 2 倍生产基线，不能用运行时动态 DPR 或其上限 2 替代；历史 1.5 生产证据须重生成或标记 `stale`。
3. 逐资源验证透明边缘、尺寸、采样、锚点、九宫格、帧序、缩放、压缩、ThreeJS 加载、目标视口和预算；F2 还要分别验证满幅背景资源能力与响应式绑定。
4. `accepted` 资源必须有可编辑来源或生成记录、正式输出文件和资源级加载/视觉证据；涉及外部素材时保留版权/许可记录。无 `source_file/source_files` 时，生成记录必须带公共 record ID、生成器/版本、时间、可执行命令或配方、输入来源和参数；AI 路线在此基础上保留专用提示词、模型、种子、参考输入和后处理字段。正式 Scene 消费与玩法运行轨迹在 V5 验证。启用 `--check-files` 时所有声明文件必须存在。
5. V3 只验证 V1 已定义或原子资源已引用且在 V2 写入的预算；超预算先阻断并重验当前门，只有预算基线或冻结生产计划必须实质修改时才 `return` 到 V2，不能在验收时临时放宽。
6. 所有标准路径都在 V3 做确定性机器 F2。资源问题留在 V3；跨域集成风险不在资源层提前做 F3。普通本地集成不因 A4 等级标签额外等待审批，外部写入、付费、真机、破坏性或外部删除和发布才进入精确操作批准。
7. 每个生产包提交跨资源联系表与逐资源对照，引用具体区域和可观察事实，检查形状、比例、材质、光源、描边、色彩和渲染密度。同屏组合在 V4 草图中确认，V5 采集正式运行证据。
8. 忠实还原逐资源和同屏核对其是否支持冻结视觉事实；逐资源检查须把冻结 region、原始生成图、最终运行图并排按实际显示尺寸查看，再在正式布局中复核。轮廓、比例、姿态、符号语义、主色分布、材质、光源和装饰密度任一出现可辨认偏离时，该项标为失败并进入修复批次，不能只凭提示词合规、文件齐全或 `usability` 可用性通过。不得用整屏铺图、隐藏层或不可交互栅格绕过结构化实现及差异审计。
9. 运行 `production_contract_audit`，逐区域比较 V2 预期方法/交付类型与实际输出、生成记录和运行时消费；缺文件、缺记录、格式不符或实际方法漂移必须带阶段、编号、区域、expected/observed method 返回失败。

V3 以文件、性能、加载、响应式、`production_contract_audit` 和一致性证据判断工程可交付。工程结论不能覆盖 V2 拆解方案、当前 `AUTO`/`USER_DECISION` 记录、视觉可交付或全局一致性失效。

### 图片批量生成

开始生成前，从当前已完成 V2 确认的生产范围收齐全部待生成图片，按唯一 component × required state 去重，形成一个批量生成任务。每项携带资源身份、完整提示词、实际参考输入、尺寸/背景合同和独立输出路径；共享 placements 复用同一项。复用资源、程序实现和尚未满足 V2 前置的显示层待办不计入本批。

一次提交整批任务，不采用“生成一张 → 等待完成或验收 → 再提交下一张”的调度。工具支持批量请求时一次传入全部条目；只支持单图调用时，在同一批任务内一次编排所有条目并按工具允许的并发执行，不能退回逐图工作项。工具的容量限制只影响批内执行，不改变完整批次范围。

批量是任务提交粒度，每项仍交付独立位图并保留各自生成记录；`individual + atlas_allowed=false` 不变，禁止把整批合成一张图再裁切。每项沿用原图、透明路线去背、尺寸归一化的依赖顺序；批次完成后汇总成功、失败和缺失项，再逐资源验收；同屏组合在 V4 草图确认与 V5 正式运行验收中检查。效果图中的小部件按[提示词合同](effect-image-prompt-contract.md)同时发送完整冻结图与同源局部细节参考。每项先记录具体偏差及对应冻结事实，再只把生成失败、缺失或视觉偏离项汇总为修复批次；调整部件提示词、局部参考或生产方式后重新生成并复核，已通过项不重复生成。沿用每项既有重试上限；到达上限仍无法忠实还原时报告阻塞和差异，不能把偏离项标为成功或用同屏可用性结论掩盖。

## V4 页面还原草图与确认

生成 `threejs-page-sketch/1.0` 草图数据，绑定当前 V2 节点、V3 清单和正式验收文件 SHA。草图页面加载正式资源，提供可调透明度的效果图底板、显示树、选择与坐标编辑；父节点移动带动子孙。保存写回草图 JSON，点击确认后记录确认时间和内容 SHA，无需填写确认人；后续修改必须使确认失效。用户确认与文件校验通过后登记 `visualStageEvidenceRefs.V4`，才允许进入 V5。完整操作与返工边界见[页面还原草图作业](visual-alignment-authoring.md)。

## V5 正式还原与动态玩法视觉验收

1. 消费 V4 已确认草图的节点呈现与布局，记录 `pageSketchSha256`；只把当前场景或合规 shared 的 V3 `accepted` 资源装配为独立 Object3D、命名容器、图层和布局/表现配置。不得另写一套定位或用整张效果图替代可交互结构。
2. 玩法独占规则、状态、碰撞和交互代码；美术可以调整不改变玩法的布局与表现集成。视觉接入只改变表现，不得改变玩法规则、碰撞语义或状态所有权；跨边界改动停止并交回所有者。
3. 提供动态可玩片段、同屏截图或可复现交互轨迹，对照主锚点和分系统锚点验证跨场景/状态的视觉质量；响应式路径提供完整 viewport、resize 前后测量、安全区和多比例证据，并作为 V5 候选的 F2/F3 证据。
4. 清除低保真纹理、占位纹理键、临时路径、fallback、代码分支和运行时引用；保留调试工具必须与正式运行隔离。
5. 所有路径在 V5 后由 F3 绑定当前候选工程证据；只有外部写入、付费、真机、破坏性或外部删除和发布等具有副作用的 A4-A6 操作在 F4 请求精确操作批准。资源执行和上游事实未变的机器证据偏差在当前门 `repair`/`revalidate`；只有生产设计、冻结基线、拆解方案或结构真实变化时才 `return` 到 V1/V2/V3 中最早受影响阶段，并使对应下游证据失效。
6. 忠实还原默认使用 `visual_validation.mode=usability`，在代表性视口/状态以完整可读画面为主证据，检查关系、可读性、边界、遮挡和交互；位置、尺寸、边距和换行的小幅差异不单独阻断。只有 `exact` 或明确精确需求时才逐项验证完整忠实度矩阵、严格容差、ROI/叠加/像素差和全视口/全状态覆盖，动画/VFX 仍不得只看像素差。
7. V5 硬门必须同时绑定 V2、`visualProductionUnits` 实施包、V3 production contract audit、V4 已确认草图文件 SHA、F2 `validationMode=MACHINE` 事实、F3 runtime replay、fidelity cases、运行时实际消费和无未批准替换；任一关键项缺失或身份漂移都不得声明完成。V4 草图确认是独立布局确认，不重新选择 V1 视觉方向。

## 完成条件

当前场景只有在功能代码、V2 规划、全部正式资源 V3 `accepted`、V4 草图确认、V5 正式接入、占位清理，以及功能、视觉、响应式和性能联合证据全部有效后才能报告完成。任务范围内场景和功能关闭前不得据此宣称 G1 完成。

### 拆解图确认（视觉硬门）

V2 完成拆解图、技术 JSON、component×state、生产合同和合同回对后，通过 `visual-decomposition-confirmation/1.0` 冻结还原方案；随后完成独立布局确认。确认记录以 `confirmation_mode=manual`、`status=accepted` 绑定 annotation/proposal/decision SHA、target SHA、candidate SHA、diff fingerprint、baseline SHA、全部编号和用户原文；这些 V2 方案身份变化才需要重新确认。V3 的 fixed asset、component×state 与资源 F2 检查，以及 V5 的同屏组合、full viewport/overlay/diff、适用逐区域 fidelity 与运行 F2 检查，分别由绑定当前身份的确定性机器证据交叉推导，不重复 V1 方向确认；V4 草图仍须独立保存并人工确认。后续生产候选的正常演进不会单独触发人工决定，但任何机器证据缺失、过期或不一致仍不得通过。

### 原子视觉拆解补充

拆解顺序固定为“先状态分析，再按可复用部件拆解”：`component_count` 只计算唯一原子视觉部件，`visible_instance_count` 通过多个 `placements` 表达重复实例。② 的六个顶部按钮分别登记六个 component；⑧ 的三个相同表面可登记一个 component 加三个 placements，⑨ 的三个动作图标按实际复用关系登记。生成式位图每个唯一 `component×required state` 必须独立位图，强制 `individual + atlas_allowed=false`，不能以编号级组合图或图集替代；atlas 仅适用于其他生产方法的显式切片合同。交互热区绑定 placement 且不计入视觉资产。状态证据 SHA、冻结目标 SHA、分析 ID 和完成时间必须先于 component inventory。
# 场景级效果图还原门

效果图路线在 foundation-only 基础实施完成后进入场景 V1，并在 V1 内建立并冻结 `scene_reconstruction_contract`、scene master、显示层 inventory、宿主场景上下文效果图和初步还原草案。V1 负责冻结视觉事实、整屏构图、目标绑定布局、响应式关系、项目容差、`visual_validation.mode`（默认 `usability`）和可供确认的初步拆解；V2 直接输出拆解图和技术 JSON，用同一套拆解事实确认 component×state、尺寸、停靠/父子/对齐关系、显示层、资源生产路线和容差。V3 完成正式资源验收，V4 完成页面草图确认；V5 必须在宿主场景上组合并重放打开→交互→关闭/恢复轨迹。

V3 逐资产验收后进入 V4，以草图数据加载正式资源、调整显示树坐标并人工确认。V5 要求重建合同、layout、V2/V3、适用功能与可用性验证、真实运行及正式 Scene 消费证据通过；完整逐区域精确 fidelity 仅在 exact 模式要求。资源 loaded/used 或 `missing=0` 只能构成工程子门。

### 场景还原硬门与 CLI 回执

效果图路线按 `V1 → V2 → V3 → V4 → V5` 单向推进：V1 生成或接收并冻结 reference target、scene master、宿主上下文图、`reference_technical_conflicts`、整屏构图、布局/响应式关系、逐区域事实、项目 tolerance 和初步还原草案；V2 绑定拆解图、proposal 技术 JSON、合同回对、coverage、component×state、候选 SHA + diff identity 和拆解方案确认；V2→V3 缺字段直接以 `方案缺失` 回 `V1/PROPOSAL`。V3 绑定资源生产实施包与资源合同，完成资源级验收；V4 生成并人工确认页面草图；V5 绑定已确认草图、正式 Scene 结构、`combination_preacceptance` 与 `scene_asset_usage`，执行真实文件门、F2 两类机器证据、F3 runtime replay 和正式 Scene consumption。

默认 `visual_validation.mode=usability` 记录实际 viewport/DPR、可读完整画面、关键关系、可见性和交互证据，允许合理位置/尺寸差异以及已声明的背景出血、滚动裁切。只有 `exact` 才要求 `normalization_equivalence`、非空 `difference_evidence`、完整逐 region 的 target/candidate、delta、预声明 `tolerance_reference`、result、evidence 和 `exception_ids`，并按严格容差判定。局部临时 tolerance 不具备精确合同效力。普通问题先原地修复和定向重验；仅上游目标、设计或任务范围真实变化才回退。

门禁回执示例：

```text
失败：node scripts/validate_visual_manifest.mjs docs/visual-assets.json --stage V5
典型输出：V5 必须显式 checkFiles=true；未执行真实文件门，V5 FAIL。
成功：node scripts/validate_visual_manifest.mjs docs/visual-assets.json --stage V5 --check-files --project-root .
典型输出：结构合同、组合预验收、F2、fidelity、runtime 和文件证据全部通过，退出码 0。
```

### 全局视觉一致性输入

在任何场景效果图或正式资源生成调用前，必须引用已冻结的全局 `visual_baseline`；全局候选、人工选择、冻结状态及跨 Work Item 文件门以[全局视觉控制](global-visual-control.md)和控制面 Schema 为准。该基线同时作用于 scene master/reference target、显示层上下文图和原子生成式位图资产；原子资产必须保留完整冻结效果图主参考，再把全局锚点作为额外 style references。generated 记录必须留下实际完整提示词、实际生成器/版本、canonical 一致性段、禁止风格迁移策略、输出 SHA 和一致性证据；provided 只登记外部来源。文件门复算这些文件身份，基线或锚点变化会使旧证据失效。
