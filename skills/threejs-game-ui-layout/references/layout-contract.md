# UI 布局合同

布局合同是某个场景、状态和候选的可验证关系规范。它不是流程状态机，也不能自动批准、自动合并或替代 F0–F4。视觉验证通过 `visual_validation.mode=usability|exact` 选择严格程度，默认 `usability`；effect-image 不自动启用 `exact`。模板采用 JSON-compatible YAML：文件是合法 YAML 1.2 的 JSON 子集，验证器使用 Node.js `JSON.parse` 解析。

## 合同身份与范围

schema 1.2.0 根对象包含 `fidelity`、`frozen_visual_target`、`layout_nodes`、`critical_alignments` 和 `parity_cases`。普通布局使用 `not-applicable/not-applicable`，`layout_nodes`、`critical_alignments` 和 `parity_cases` 都是空数组；冻结目标使用 `specified` 或 `verified`，场景先绑定拆解确认中的 `decomposition_elements`，再登记后置生成的布局节点。冻结目标还记录 `visual_baseline_version`。verified parity 的 scene/state 必须属于 scope，合同版本和视觉基线版本必须分别等于根合同与冻结目标；`actual_test_id` 必须等于 `planned_test_id`。冻结目标节点的 `ui_layout` 按[节点组织规则](layout-hierarchy.md)声明，并纳入布局合同身份哈希；职责变化须重新确认受影响的 V2 方案。

`regions` 是声明式布局区域；`decomposition_elements` 是效果图拆解阶段确认的元素事实，`layout_nodes` 则是确认后由元素 bounds 与显式功能归属推导出的可装配几何节点。普通布局 `fidelity.applicability=not-applicable` 必须使用空数组；`frozen-target` 合同在布局完成门才声明至少一个布局节点。布局节点把效果图的目标几何与 ThreeJS 运行时的唯一布局入口绑定，不能用整屏截图、隐藏覆盖层或散落的绝对坐标替代。

## 全局响应式视口合同

任何可见 Scene、HUD、弹窗或 `DISPLAY_LAYER` 都必须在根对象声明以下字段：`logicalViewportSpace`、`designResolutionPolicy`、`canvasBackingPolicy`、`runtimeDprPolicy`、`maxRuntimeDpr`、`scaleMode`、`cameraViewportPolicy`、`cameraZoomPolicy`、`cameraOriginPolicy`、`inputCoordinatePolicy`、`safeAreaPolicy`、`resizePolicy`、`orientationPolicy`、`textResolutionPolicy`、`assetResolutionPolicy`、`performanceBudget`、`representativeViewports` 和 `requiredRuntimeEvidence`。这些字段是事实合同，不绑定某个临时函数名；缺失、用旧字段替代或只写一句说明均不能通过。

`logicalViewportSpace` 的单位固定为 CSS 逻辑像素（`css-px`/`css-logical-px`）。布局、safe area、断点、点击区域、`gameSize`、Camera viewport、Camera zoom 和程序化文字排版都在该空间计算。`canvasBackingPolicy` 必须明确 `backingWidth = ceil(cssWidth × effectiveDPR)`、`backingHeight = ceil(cssHeight × effectiveDPR)`，并声明 backing 是物理像素；物理 backing 像素不得直接作为布局坐标或命中坐标。CSS display 尺寸、逻辑尺寸和 backing 尺寸必须分别记录，不能把一个数值重复贴到三种空间。

`runtimeDprPolicy` 必须从设备动态读取，非法、零、负数、非有限或字符串值回退为 1，有效值严格位于 `(0, 2]`，原始值大于 2 时有效值封顶为 2。DPR 不是启动常量：resize 和显示密度变化都要重新读取；若 `orientationPolicy.allowed` 同时包含 `portrait` 与 `landscape`，方向切换也要重新读取并清理监听器。`maxRuntimeDpr` 固定为数字 `2`。资源生产基线另由 `assetResolutionPolicy.productionDpr=2` 声明，和运行时 DPR 分离；2 只表示生成/生产清晰度，不代表运行时固定使用 2。运行时代表性矩阵仍必须覆盖 DPR `1.25/1.5`。

`orientationPolicy.allowed` 必须是非空且无重复的 `portrait`/`landscape` 数组，不从缺省值推断双方向支持。`designResolutionPolicy` 只要求声明 `allowed` 中方向的分支：竖屏基准为 1080×1920、按高度适配；横屏基准为 1920×1080、按宽度适配。实际 CSS 视口为 `W×H` 时，竖屏比例 `s=H/1920`、可见逻辑区域为 `(W/s)×1920`；横屏比例 `s=W/1920`、可见逻辑区域为 `1920×(H/s)`。设计区域在可见区域中居中，另一轴可以展开或裁切；安全区、UI 锚点和输入命中必须使用实际可见区域。横竖屏以运行时视口宽高判断，宽高相等时按横屏处理。

Canvas 必须填满真实 CSS 视口，`scaleMode` 采用 `RESIZE` 或能证明同等行为的 `custom`，不能用 `FIT` 留黑边。逻辑尺寸、CSS 尺寸、物理 backing、`gameSize`、Camera viewport/zoom/origin 和输入映射之间的关系仍需实证；单独声明模式或构建成功都不是高分屏兼容证明。

Camera 合同必须说明逻辑 viewport 如何映射到物理 backing，zoom 不得偷换 DPR，origin 必须显式声明；输入合同必须说明 CSS client 坐标如何经过逻辑 viewport、Camera 再到世界/命中空间。弹窗和 `DISPLAY_LAYER` 默认继承宿主的 CSS 逻辑视口、有效 DPR、Camera/输入合同和 safe area；若使用独立 Camera，必须在自身合同声明并单独验证。

`resizePolicy` 必须在同一页面完成，不得用刷新页面掩盖重排；resize、safe area 和 DPR 变化后至少重新计算逻辑视口、Canvas backing、safe area、Camera viewport、输入映射和文字排版。仅当 `orientationPolicy.allowed` 同时包含两种方向时，事件数组才必须包含 `orientation-change`，并验证方向切换后的同页重排；所有项目都必须覆盖连续 resize 与 DPR 变化。监听器必须可清理且重复计算幂等。允许在超预算时显式减少滤镜、RenderTexture 或透明全屏层，但不得静默降低 DPR、资源质量或文字清晰度。

`performanceBudget` 至少记录最大 Canvas backing、最大像素总量、RenderTexture、全屏滤镜、透明全屏层、代表性设备和真实测量结果。`representativeViewports` 按 `orientationPolicy.allowed` 覆盖类别：支持竖屏时要求窄/标准竖屏，支持横屏时要求横屏/桌面宽屏；单方向项目用该方向的窄宽尺寸覆盖，并仍包含 DPR 1、1.25/1.5、2 和原始 DPR 大于 2 的封顶样本。`requiredRuntimeEvidence` 必须要求 `viewportRect`、`canvasRect`、`designTransform`、`logicalSize`、`backingSize`、`cssDisplaySize`、原始/有效 DPR、两段缩放、Camera、safe area、边距、背景覆盖、关键 UI、输入命中、resize 轨迹、`pageReloaded`、截图及 scene/state、候选 SHA、合同/基线版本；`designTransform` 记录实际方向、设计宽高、适配轴、比例、可见逻辑区域及居中偏移，必须与当前 CSS 视口一致。缺少真实运行测量只能标记 `unverified`。

## V2 串行拆解与布局标注

拆解先按[功能语义分组约束](functional-semantic-grouping.md)确认区域、功能组件、部件和独立元素。最终元素必须包含显式 `parent_element_id` 与 `semantic_grouping.kind/rationale`；位置依赖方必须成为被依赖元素所对应布局容器的子元素，共同表达同一信息且互不依赖位置的元素必须列入同一个功能组件并保持同级。布局父级严格继承该归属，不按几何包含自动挑父容器。文字保持独立节点并归属对应信息组，不按类型集中归组。新增容器或归属变化必须回到拆解确认。

冻结目标进入 V2 后，机器门固定执行两个串行阶段：阶段 A 先从冻结原图、区域与组件事实生成拆解标注图及技术 JSON，并产出有序 `decomposition_elements`；人工可以修改这两项，修改后必须重新生成最终产物，并以 `visual-decomposition-confirmation/1.0` 确认。阶段 B 只有在阶段 A 的最终确认通过后才能启动，布局入口必须按原顺序消费该确认绑定的 `proposal.decomposition_elements`，再推导后置布局节点，不得从预存 `layout_nodes`、未确认清单草案或原图自行识别元素。

阶段 B 生成独立 `layout-annotation/png/1` PNG：原图作为左侧底图，所有已确认父容器、子组件和空容器均需框出；相同层级使用相同确定性颜色，不同层级使用不同确定性颜色。PNG 元数据绑定 `layout_node_id`/`element_id`、`parent_layout_node_id`、`depth`、`color`、`bounds`、`empty_container`、`relative_position` 四边距离、显式 `axis_alignment`、锚点、布局决策文件身份及上游拆解确认身份。

图上每个框与右栏说明必须使用同一个唯一短编号，并显式列出父编号；编号按确认元素原序分配，合成根使用独立编号，不能为展示重排元素或改变 bounds。技术 ID 仅作为追溯信息，不能代替图上可见编号。密集小框的编号需避让，必要时用引线明确指向所属框。右栏为每个节点提供一份完整自身说明：类型、父级、水平左/中/右与垂直上/中/下停靠、自身/父级锚点及双轴偏移；父容器和空容器同样必须说明相对其上级的停靠方案，不能只列子组件或四边距离。根明确“无上级”，不伪造停靠关系。长说明按实际文字宽度换行并扩展画布高度，不得截断；机器校验同时检查编号映射、父子关系、方案内容与可见区域，元数据自报完整不能代替实际可读内容。

布局图也允许人工修改；修改后必须重新生成最终布局图，并以独立 `layout-annotation-confirmation/1.0` 确认。该确认同时绑定布局图文件/SHA、尺寸、schema/layout、metadata identity、`visual-decomposition-confirmation` 的 ID/SHA、proposal SHA、scene/state/target、用户原文和 receipt。任一图、元数据、布局关系或上游拆解身份变化都使旧确认失效；V2 最终完成门必须同时看到两次人工确认。

布局 PNG 生成时必须在 `--output` 所在的同一候选目录同步产出 `layout-nodes.json`、`layout-decision.json`、自包含 `review.html` 和 `generation-result.json`。审阅页直接消费本批冻结参考图与节点数据，不能建立第二套坐标或关系规则；详细的两栏模板、离线约束、名称回退、下载字节、SHA 身份和错误门见[离线布局审阅产物](layout-review-artifacts.md)。

阶段 B 先由智能视觉判断读取原图与确认后的 `proposal.decomposition_elements`，按该列表逐项产出唯一的 `automatic-layout-decision/1.0` JSON：每个元素必须显式给出 `horizontal_alignment=left|center|right` 和 `vertical_alignment=top|center|bottom`。随后使用 `scripts/generate_layout_annotation.mjs` 生成布局 PNG；命令必须显式传入 manifest、project root、scene/state、输出路径、拆解确认 ID/SHA、proposal SHA、`--layout-decision-file` 和 `--layout-decision-sha256`。生成器拒绝缺失决策、非法枚举、元素漏绑、新增伪造、调序、越界或跨场景输入，不会按测量结果兜底猜测对齐，也不会生成多个布局候选或新的视觉参考图。

每个 `layout_nodes` 节点必须包含：

- `layout_node_id`、`region_id`、`coordinate_space`、`reference_id`。
- `parent_layout_node_id`、`parent_target_bounds`、`relative_position`、`axis_alignment`。
- `self_anchor`、`reference_anchor`、`offset`、`target_bounds`、`size_policy`。
- `z_order`、`clip_policy`、`responsive_rule`、`planned_test_id`。

`layout_node_id` 在节点集合内唯一；同一 `region_id` 可以绑定多个元素/layout nodes，但该区域 ID 必须同时存在于 `regions` 和 `scope.ui_ids`，`coordinate_space` 必须存在于 `coordinate_spaces`。`target_bounds` 使用目标 viewport 的逻辑坐标，四边均须为有限数值，宽高为正数，并完全落在 `scene_reconstruction_binding.target_viewport` 内。`offset` 是双轴偏移对象，可以是数值或项目定义的非空表达式；`size_policy`、`clip_policy`、`responsive_rule` 和 `planned_test_id` 不得为空。

效果图还原节点必须先建立父子几何图：`parent_layout_node_id` 只能引用另一个已声明的 `layout_node_id`，或稳定根 `viewport`/`safe-area`；`reference_id` 必须逐字等于该父 ID，父子图不得自引用或成环。`parent_target_bounds` 必须逐字段等于父节点 `target_bounds`；`viewport` 根固定为 `{x:0,y:0,width:target_viewport.width,height:target_viewport.height}`，`safe-area` 根以首次有效测量冻结唯一 bounds，所有引用必须一致且位于 viewport 内。子 `target_bounds` 必须完整落在父内容框内。`relative_position` 必须按 `left=child.x-parent.x`、`right=parent.x+parent.width-child.x-child.width`、`top=child.y-parent.y`、`bottom=parent.y+parent.height-child.y-child.height` 逐项测量，不接受手填近似或负距离；允许的浮点误差不超过 `1e-6`。

`axis_alignment.horizontal` 由智能视觉判断显式选择 `left/center/right`，`vertical` 显式选择 `top/center/bottom`。判断主要依据原图构图、视觉重心和元素语义，不按最近边或测量阈值自动推断。四边距离只记录几何事实；运行时 `offset` 按选定对齐轴计算，其中 `center` 使用子中心相对父中心的有符号偏移。`self_anchor` 与 `reference_anchor` 必须是 `${vertical}-${horizontal}`（例如 `top-center` 或 `center-center`）。视觉决策文件、父子关系、相对距离、对齐、偏移和锚点都属于布局身份，任一变化都必须让旧确认失效。

模板的 `layout_node_example` 是可直接复制到 `layout_nodes` 的完整 effect-image 节点示例；它不是普通 `not-applicable` 合同的活动节点。切换到冻结目标时，应复制该示例、改成项目稳定 ID 和目标几何，并补齐场景绑定与关键对齐证据。

布局节点的 `reference_id` 在普通布局中可以指向已声明的 `regions` 或其他 `layout_node_id`；在 `effect-image` 中必须与 `parent_layout_node_id` 相等，父级只能是具体节点或 `viewport`/`safe-area`。当一个 region 只有一个布局节点时，普通布局可直接用该 region ID 作为参照；当一个 region 绑定多个布局节点时，region ID 参照会产生歧义，必须改用具体 `layout_node_id`。所有节点参照组成有向图，禁止自引用和环；因此不能通过一个孤立或循环的节点绕过布局合同。

`regions` 自身仍是声明式布局区域，每个区域至少包含：

- `id`、`semantic_role`、`parent_space`、`reference_id`、`positioning`。
- `anchors.horizontal` 与 `anchors.vertical`，各自声明 `self`、`reference` 和 `offset`；两者必须有语义参照边界。
- `size.min`、`size.preferred`、`size.max` 和 `size.strategy`。
- `layout_group`、`z_index`、`layout_participation`、`scroll`、`input`、`clip`。
- `origin`、`layout_anchor`、`animation_offset`，三者不可互相代替。

`regions.origin_applicability` 必须区分 `display-object` 与 `layout-only`：可设置资源原点的对象默认将 `origin` 写为 `center`，运行时对应 `(0.5, 0.5)`；非中心值须在该稳定 ID 的区域中填写 `origin_exception.reason` 与 `origin_exception.coordinate_conversion`。纯布局边界与无资源原点的 Container 使用 `layout-only` 和 `origin=not-applicable`，只表达布局参照，不调用不存在的原点接口。跨层的背景、世界、特效、HUD 和瞬态层顺序按[显示对象锚点与显示层分层](display-object-layering.md)规划；局部 `z_index`/`z_order` 不得替代跨层合成顺序。

`reference_id` 只能指向已声明区域，或保留边界 `viewport`；若使用 `safe-area`，必须先声明同名安全区区域。区域引用形成有向图；不得自引用或形成环。`parent_space` 必须存在于 `coordinate_spaces`，坐标空间 parent 也不得自引用或成环。所有 UI ID 必须唯一，稳定 ID 不使用随机值或运行时显示文本。

## 目标与尺寸

`targets` 只定义代表性设备视口的最小、首选和最大逻辑宽高、方向和宽高比，不能覆盖固定设计基准；`targets.orientations` 必须与 `orientationPolicy.allowed` 一致，三个示例目标也只能使用支持方向。`scale` 旧嵌套字段不再承担 DPR 或 backing 合同，相关事实统一写在根级响应式字段。`aspect_ratio.min/max` 必须是正数且顺序合理。`content` 定义 `max_width`、`columns`、`gaps` 和 `margins`；断点和布局关系仍必须使用逻辑像素，不能使用参考截图的物理像素直接硬编码。

尺寸策略可以是 `fixed`、`content`、`proportional`、`stretch`、`contain`、`cover` 或 `nine_slice`，但必须同时给出最小、首选和最大值；三档宽高须为正数或非空表达式，数值最小值不能大于最大值。固定尺寸、绝对定位和悬浮元素是可审查模式，不是格式错误；缺少参照、策略或证据才退回。

装饰性满幅背景的 `cover` 必须在 `designResolutionPolicy.backgroundFit` 中冻结 `mode=cover-v1`、
`sourceFocalPoint` 和 `targetPoint`，并将同一组事实传给 QA 的 `viewport.backgroundFit`。算法与运行时证据遵循
[`装饰性满幅背景`](../../threejs-game-asset-integration/references/full-bleed-background.md)。
这里的背景 cover 与根级 `scaleMode` 的 Canvas 缩放是两层独立职责。

## 断点与结构

普通静态布局允许 `breakpoints: []`；一旦声明断点，每个断点必须有非空 `when` 触发条件和 `structure_changes`。条件键和值、结构变化项必须是非空字符串或有效数值。条件可以基于宽度、高度、宽高比、方向、安全区或内容容量。必须明确变化的区域/列/导航/操作区，以及仍保持的关系。默认 `usability` 验证基准和代表性断点；只有 `exact` 或项目明确要求时才为每个断点执行临界三点 `breakpoint - 1`、`breakpoint`、`breakpoint + 1`。

## 安全区、滚动与覆盖

`platform_insets` 记录系统栏、圆角、刘海、Home Indicator、键盘、折叠和分屏输入，并覆盖零安全区与非零安全区。固定、悬浮或停靠元素在 `overlay_rules` 中记录遮挡检测、回退和输入优先级；区域的 `layout_participation` 为 `fixed-overlay`、`floating-overlay` 或 `docked-overlay` 时，必须存在相同元素和模式的覆盖规则。弹窗、抽屉和 Toast 的宿主关系、生命周期、遮罩、焦点恢复与上下文效果图不写成另一套布局状态机，而是在场景 `display_layer_planning` 中绑定对应 `layer_id`；V5 必须把这些 overlay 放回宿主场景同屏验证。

无滚动的静态 HUD 允许 `scrolling.axes: []`；一旦声明滚动轴，每个轴必须有唯一且非空的 `axis`、`owner_id`、内容区域、边界和手势优先级，禁止多个所有者争抢同一轴。`narrow_height_degradation` 必须声明 `trigger`、`strategy` 和 `fallback`，说明窄高度时折叠、重排或滚动的条件及关键动作可达性。

## 动态内容与文字

`dynamic_content.localization` 记录默认语言、最长文案、程序化文本开关、必需语言、增长、换行与截断策略。`programmatic_text=true` 时，`required_languages` 必须包含英语 `en`、简体中文 `zh-CN`、日语 `ja`、俄语 `ru`、西班牙语 `es`；`wrap` 必须为每种必需语言独立声明 `single-line` 或 `wrap`，允许部分语言单行、部分语言换行；`truncate_policy=forbid`、`growth=locale-adaptive`，并通过 `display_fit_evidence` 绑定五语种真实字形宽度、字体回退、基线、断行和容器适配证据。`copy_style=concise-gameplay` 要求文案在语义准确、玩家可理解的前提下保持短促、游戏化；倍率使用 `multiplier_format=x{value}`，如三倍奖励直接显示 `x3`，数值变化优先使用 `+10`、图标+数值等熟悉表达，不使用可由符号代替的解释性长句。空间不足时应遵守该语言的行布局策略，改短文案、调整字距/字号、扩展容器或合理换行，不能靠截断通过。`text_scaling` 记录默认和最大字号及 `strategy`。无关键动作的静态 HUD 允许 `key_actions: []`；一旦声明关键动作，其 ID 必须引用区域，状态至少包含 `default`、`disabled`、`submitting` 和 `completed`，并声明 `text_truncation`。关键动作不能使用不可恢复的单行省略。`reflow_events` 至少覆盖 `text-change`、`state-change`、`resize` 和 `safe-area-change`；合同还应覆盖动态数字、成员数量、创建/隐藏/销毁后的重排，以及按下、错误等扩展状态。

可见文字应承担图标无法可靠表达的语义，不与含义明显的图标永久并列重复说明。图标存在歧义、首次学习成本高、操作高风险或不可逆，或状态与数值需要精确表达时，应保留可见文字；所有仅图标控件仍须提供无障碍可访问名称，该名称可不进入可见布局。证据应覆盖界面是否存在图标与文字重复、通用图标堆叠，以及视觉层级、位置、颜色、形状和动效能否使功能自解释。

效果图还原的可见文字由场景合同中的 `text_decomposition` 独立管理：有文本时使用 `applicability=has-text` 并逐项登记稳定 `text_node_id`、`region_id`、`layout_node_id`、文案来源、语义角色、动态/本地化标记、目标 bounds 和完整 typography facts；确实没有文本时使用 `not-applicable` 并填写 reason。V3 必须为每个文本节点选择 `threejs-text`、`bitmap-text`、`image-text` 或 `hybrid`，说明路线理由、所有权和带资源 SHA-256 的依赖。动态或本地化文字不能烘焙为 `image-text`；图片字标仍要保留可访问语义。原字体未知时保留 `observable_facts`，不能猜填 family，并明确替代字体或位图方案。V5 逐节点记录实际 renderer、字体加载与 fallback、actual/glyph bounds、baseline、测试 ID 和证据，并把 target/candidate 差异绑定预声明 tolerance 或精确例外。

文本字号必须区分参考图物理像素与 ThreeJS 逻辑坐标：同时冻结 `reference_pixel_bounds`、逻辑 `target_bounds`、`font_size_unit=logical-px`、参考 DPR、glyph bounds 和 baseline。参考图中量到的 48px 不是可以直接写入 ThreeJS 的 `fontSize: 48px`；最终字号需结合逻辑 viewport、DPR、字体 ascent/descent、字距和实际 glyph bounds 验证。文字框尺寸通过布局节点统一计算，字形测量只作为运行时证据，不能用整体区域 bounds 掩盖字体 fallback、基线或断行偏差。

## 不变量与证据

`invariants` 的每一项都包含稳定 ID、非空描述/表达式、非空且全部有效的适用区域、非负容差和 `evidence.automation`/`evidence.visual` 字符串项。关系表达优先描述相对中心、边界距离、间距、遮挡和断点结构，而非一个孤立屏幕坐标。`evidence_matrix` 必须绑定同一候选、合同版本、动态封顶 2 的 DPR 策略和已执行的视口条件；默认 `usability` 覆盖基准及代表性窄/宽、项目支持方向和关键状态，验证关系不变量与可用性。只有 `exact` 或项目明确要求时才覆盖断点邻值、宽高、字号、本地化、安全区、动作态、DPR、动态值、Scene 生命周期和覆盖层/键盘/滚动的完整组合；`orientation` 轴只在项目同时支持两种方向时强制，并只覆盖 `orientationPolicy.allowed` 声明的方向。精确矩阵启用 Golden 精确视觉。

`critical_alignments` 用于冻结目标中的关键 UI/HUD：通过 `layout_node_id` 绑定布局节点，`element_id` 等于对应 `region_id`。`reference_id` 可指向稳定 region、`viewport` 或具体节点；多节点 region 必须指定具体节点。两种模式均保留唯一 ID、双轴关系、目标证据、双方身份和测试计划；verified 需要真实运行测量、运行证据与通过结果。默认 `usability` 不强制目标精确测量、四轴 delta 或预声明容差，允许合理的位置和尺寸差异；若提供测量字段，其结构必须有效。只有 `exact` 才强制目标几何、四轴 delta、精确差值一致性和项目容差。目标或布局结构实质变化才重新确认，普通运行态微调原地验证。

`parity_cases` 不可变绑定 scene/state、已执行 viewport、实际有效 DPR（(0,2]）、语言、随机种子、输入轨迹、稳定帧/动画采样、合同/基线版本、双方证据、容差、例外 ID 与结论。默认 `usability` 只需代表性案例；`exact` 或明确全覆盖需求才要求完整视口/状态组合。目标或上游候选 SHA 不匹配时对应旧证据不得复用。

specified 可只做结构检查；verified 必须追加 `--check-files --project-root .`，验证冻结原图存在且 SHA 匹配，并拒绝缺失或逃逸项目根目录的目标、运行及 parity 证据路径。
# 效果图还原布局绑定

当布局服务于 `effect-image` 时，根节点可声明 `scene_reconstruction_binding`，其中必须包含 `target_sha256`、`scene_id`、`state_id`、`target_viewport`、`visual_baseline_version`、`reconstruction_contract_version`、`layout_contract_sha256` 和 `layout_decomposition_version`。`layout_contract_sha256` 是布局合同身份哈希，不是整个文件的递归自哈希：生产方应对合同身份投影（合同 ID/版本、目标 SHA、scene/state、目标 viewport、布局拆解版本、布局决策文件身份，以及按已确认 `decomposition_elements` 原顺序排列的节点 ID、区域、坐标空间、父节点 ID、父目标 bounds、四边相对距离、显式轴向对齐、参照、锚点、偏移、目标几何、尺寸/裁切/响应式策略、层级和计划测试 ID）做确定性规范化后计算；不得为稳定哈希排序公开节点数组，并排除该哈希字段本身以及运行时证据。合同身份变化必须重新计算。

V2→V3 合同回对必须校验该绑定；`legacy_layout_reused`、`uses_generic_layout` 或 target SHA 不一致均退回 `V1/PROPOSAL`，不能沿用旧响应式骨架。

目标 viewport 在 `usability` 下用于确认整体关系、可读性和可操作性，其他代表性 viewport 验证关系不变量；只有 `exact` 或明确精确需求时才要求目标 viewport 的严格还原。布局区域仍须与正式 Scene 结构绑定；整屏截图不能作为交互 Scene、隐藏覆盖层或绝对叠图不能作为布局实现。
