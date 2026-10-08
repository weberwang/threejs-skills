---
name: threejs-game-asset-integration
description: 为 three.js 游戏规划、生产、登记、验证并集成 UI、角色、场景、动画、VFX、背景和参考还原资源。用于正式视觉资源、视觉系统、资源接入、视觉重构、运行时视觉验收和来源/许可登记；不用于纯玩法规则修改。
---

# three.js 游戏美术生产与接入

## 全局控制接入

控制面边界：可提议、可审查、可在当前用户任务的 Work Item 范围内修改，且必须回到 `$threejs-game-workflow-control` 风险门。

本领域可提议、审查，并在当前用户任务、Implementation Package、A 等级和路径范围内生产或接入资源；任务内方案、路径和资源清单变化时同步更新计划并重验受影响部分。所有结论回到 [`threejs-game-workflow-control`](../threejs-game-workflow-control/SKILL.md) 审计和状态迁移。V0-V5 是 `stageId`，不得旁路全局状态、带副作用的 A4-A6 精确操作批准、diff 审计和证据门。

## 工作流

### 场景还原合同（effect-image 强制）

V2 拆解先遵守[功能语义分组约束](../threejs-game-ui-layout/references/functional-semantic-grouping.md)：确认区域、功能组件、部件和独立元素的位置依赖、信息分组与理由；位置依赖方划为被依赖元素所对应布局容器的子元素，共同表达同一信息且彼此无位置依赖的元素列为同组同级项。布局不得按文字类型或几何包含重新分组，归属不明留在拆解确认，不自动生成可放行布局。

`effect-image` 表示正式 Scene 的视觉事实与结构关系还原，不是独立 PNG 生产。场景 Work Item 只记录自身常驻 HUD；modal/popup 等弹窗按[独立工作项规则](../threejs-game-workflow-control/references/control-model.md#弹窗工作项与场景解耦)建立 DISPLAY_LAYER Work Item，并在 required state 冻结宿主同屏图。弹窗未完成不阻断场景 V5；弹窗自身仍须完成 V2/V3 和打开→交互→关闭/恢复的 V5 轨迹。运行态默认使用 `visual_validation.mode=usability`，只有明确精确需求时才启用严格像素/全矩阵验证。

效果图/参考图是否适用只看当前场景 Work Item 是否把它指定为正式运行画面的视觉目标，与是否生成、制作或新增资源无关。适用时，参考还原是同一场景实现生命周期内的视觉模式与合同叠加，必须进入 `effect-image` 的 V1→V5 还原链，包含 `scene_reconstruction_contract`、布局绑定、coverage、宿主场景同屏组合和 fidelity 验收；即使所有区域都用 `reuse-existing`/`runtime-program` 实现、零新资源且零生成式位图也不例外。不创建第二个场景 Work Item 或第二条 V1→V5。仅仅生成新资源，或仅把图片作为灵感、说明或临时参考，不足以触发 `effect-image`，仍按普通资产、组件或场景路径分类。`image_generation_required`、`generate-now`、资源数量和 `production_method` 只能在已经触发后由 V2 决定生产路线，不能参与 V0 applicability 判定。

effect-image 生成式位图的完整提示词模板、asset_prompt 事实继承规则、透明生产要求和 generation_record 结构化字段统一见[《Effect-image 生成式位图忠实还原提示词合同》](references/effect-image-prompt-contract.md)。生产分类统一使用 `production_method=image-generation`，具体 `generator`/`generator_version` 由系统根据提示词、参考输入、主体材质、透明需求和可用能力选择并如实记录；工具版本未暴露时记录 `not-provided`，不得编造。生成式透明 alpha 单图只生成不透明指定纯色背景 PNG，再由公共去背景脚本产生真实 Alpha；不请求透明 PNG/Alpha，也不接受棋盘格预览。已有真实透明图按资源复用合同接入；本 Skill 只保留路由和硬不变量，不在此复制模板。

V3 将当前已确认生产范围的全部待生成图片汇总为一个批量任务，一次编排提交，禁止逐张创建任务或等待上一张验收后才生成下一张；每个 component × required state 仍输出独立位图，详见[图片批量生成](references/visual-production-pipeline.md#图片批量生成)。V4 使用正式资源生成草图组合并经用户确认；V5 默认验证代表性完整画面、关键内容可用性、实际交互和正式 Scene 消费证据，仅 exact 模式要求完整逐区域精确测量和差异材料。资源 loaded/used、missing=0、resize 稳定只属于工程子门，不能单独驱动 COMPLETE。

1. 读取项目配置、GDD、visual-design、TDD、控制面和资源登记；执行 [V0-V5 视觉生产管线](references/visual-production-pipeline.md)。
2. V0 先判断任务属于原子资源、组件/资源集，还是场景/整套 UI/视觉系统/重做；参考还原是否适用只由当前场景 Work Item 的正式运行视觉目标声明决定，不由新资源或图像生成需求决定。原子资源只有在结构、布局、交互和视口行为不变，且已有适用视觉契约、视觉可交付结论与预算基线时才能跳过 V1/V2；任务内小幅适配可更新计划并重验，不必重新授权。
3. foundation-only 基础实施完成后，V1 建立功能规格、玩法视觉契约、必要低保真/灰盒与预算，只定义契约，不写正式场景功能代码；Work Item 指定效果图为还原目标时，V1 同时按[视觉还原](references/visual-reconstruction.md)生成或接收并冻结 scene master/reference target、宿主上下文效果图、参考身份、对比条件、可观察视觉事实和初步还原草案。V2 按串行硬门执行：阶段 A 从冻结原图、区域与组件事实生成按人工确认顺序排列的拆解图、技术 JSON 和 `decomposition_elements`，人工修改并确认。阶段 B 结合原图构图、视觉重心与元素语义，按同一顺序生成唯一的逐元素 `left/center/right × top/center/bottom` 决策；布局生成器只消费已确认元素和该视觉决策，不能依赖预存 `layout_nodes` 或用测量距离猜测对齐。布局决策和布局图人工修改后重新生成，并以 `layout-annotation-confirmation/1.0` 确认最终布局。布局只在冻结原图上叠加父子框与右栏说明，不重新生成或替换视觉参考图，也不提供多个布局方案。
4. schema 1.5 `visual-assets.json` 先声明 `effect_image_reconstruction`：普通资产为 `not-applicable`，不要求还原工件；效果图还原为 `effect-image`。后者冻结目标后、进入 V3 前以 `v2-ready` 完成合同回对和 coverage，V2/V3 可暂无 fidelity case；只有 V5 验证完成才为 `v5-complete` 并要求全部 case 通过。效果图 coverage 逐区登记 `annotation_number` 与 `implementation_plan`，先完成 ownership/实现分类，再做带证据 SHA、冻结目标 SHA、分析 ID 和完成时间的 `state_analysis`，严格在 component inventory 之前完成，最后按唯一原子部件填写 `component_inventory`、placements 与 `expected_assets`；编号不是资产数量单位。视觉来源与装配方式必须分开：`visual_route_analysis` 只能在独立 coverage region 上选择 `image-asset` 或 `threejs-native`，`assembly_analysis` 再独立声明原子 Scene 装配、禁止整屏捕获并允许独立图片资产；不得从“不能整屏贴图”推导 `runtime-program`。如果同一视觉事实同时包含程序逻辑与独立视觉资产，必须回到 V1/PROPOSAL 重新划分 coverage/annotation：图片外观进入独立 image-asset region，程序行为进入独立 threejs-native/runtime region，分别进入各自生产与运行逻辑合同。禁止使用单一 `composite` region 或 `composite_parts` 在一个区域内闭环生产、验收。全部区域均为 `threejs-native` 时必须提供绑定目标 SHA、完整 region 集合和独立 JSON 工件 SHA 的 `all_native_justification`，文件门会复算 SHA 并逐区核对资格事实。状态分析必须覆盖普通、selected/active、disabled、pressed/hover、victory/defeat/paused，实际适用写 `required`，不适用写 `not-applicable+reason`。② 顶部 6 个按钮必须 6 个 component；⑧ 的 3 个相同底部表面可登记 1 个 component+3 个 placements，⑨ 的动作图标按实际复用关系登记；③、④、⑦ 只有在明确单部件且其余状态不适用时才保持单图。默认 individual 模式禁止横向组图；`image_generation_required=true` 的生成式位图使用 `individual + atlas_allowed=false`，其 `expected_assets.width/height` 由验证器按逻辑像素 `ceil(max placement width/height × intended_scale_range.max × 2)` 自动计算，必须精确为最小尺寸；`scene_asset_usage.max_dpr` 必须严格为数字 `2`，`padding_policy` 必须为 `none`，尺寸合同本身不需要 human_review。这里的 2 是图片生产基线；运行时实际 DPR 按设备动态读取并封顶为 2。历史 1.5 生产证据须重生成或标记 `stale`。其他生产方法只有在显式合同下才能使用完整 `atlas_slice` 图集。每个 placement 必须声明 `interaction_required`，真实 `interaction_hotspots` 只能按 placement 一一绑定且不计入视觉资产。确认图仍同时呈现 `generate-now`、`reuse-existing` 和 `runtime-program`，但 PNG 仅绘制用户摘要与“新建图片资产 / 复用现有图片 / 程序绘制或动态逻辑”标签；placement ID、坐标尺寸、组件/状态/资产技术字段不进入可见行。运行 `--proposal` 时，这些技术字段完整写入拆解分析技术 JSON，并与 PNG 元数据、区域定义 SHA 及现有 confirmation 字段绑定。系统按提示词、参考输入、材质、透明需求和可用能力决定是否使用图像生成；`independent-production` 与 `generate-now` 不作任何生成器推断。V2 再按 [资产生产路线](references/asset-production-routes.md) 选择路线。
   拆解判定先把文本交给 `text_decomposition`，其余静态视觉一律优先选择 `image-asset`；非文本只有确有运行时变化且完整通过 `native_suitability` 时才可选择 `threejs-native`。
5. V2 可运行 `node scripts/validate_visual_manifest.mjs docs/visual-assets.json --stage V2`；V3 正式验收运行 `node scripts/validate_visual_manifest.mjs docs/visual-assets.json --stage V3 --check-files --project-root .`，V5 正式验收运行同命令但使用 `--stage V5`。独立弹窗工作项必须额外传入 `--work-item-type DISPLAY_LAYER`，场景工作项默认按 `SCENE` 校验；该参数只改变显示层作用域，不把弹窗纳入宿主场景验收。V3 逐项验证真实资源文件、来源/许可信息（如适用）、预算、冻结基线、coverage 和 `production_contract_audit`；V4 独立完成页面草图保存与人工确认；V5 再验证正式 Scene 消费、组合预验收、F2 两类机器证据、F3 runtime replay 与适用 fidelity cases。
6. 当前场景 Work Item 按控制面定义的 V1→V5 阶段推进；本领域负责在 V2 两次独立确认后生产正式资源，在 V3 完成资源级验收，在 V4 按[页面还原草图](references/visual-alignment-authoring.md)生成草图、预览调整并人工确认，在 V5 提供运行态视觉证据。正式代码只消费当前场景或合规 `shared` 且 V3 `accepted` 的资源；公共正式资源只允许至少两个场景稳定复用或属于运行必需。场景联合验收前必须清除灰盒、占位和 fallback。

所有生成式位图单图生产顺序固定为“生成原图 →（`alpha=true` 时）校验不透明指定纯色背景 → 公共脚本去背景 → Sharp 尺寸归一化 → V3/final/runtime”。生成式透明路线固定使用 `transparency_strategy=background-removal`、`source_background_mode=opaque` 和显式 `source_background_color`；源图必须使用 `remove-background-local.mjs --require-solid-background` 校验通过，失败时重新生成或修正输入，不得提高容差吞掉棋盘格。生成记录保存原图、实际工具/版本、输入输出、Alpha、背景颜色、处理参数和每次尝试；失败记录原因并保留历史，重试次数由任务配置设定上限，不能无限重试或自动新增外部调用授权。透明路线的 `normalization_record.source_file` 必须绑定实际去背景输出；不透明 `alpha=false` 可输出 JPEG，透明 `alpha=true` 只能输出含 Alpha 的 PNG。已有真实透明图按资源复用合同接入，不伪造生成去背记录。首次输出比例不符时最多重生一次；第二次仍不符时，若冻结裁切焦点和安全事实允许，使用 `crop-and-resize-to-contract` 并在 `aspect_ratio_correction` 中绑定两次真实原始生成 attempt 的 `attempt_id`、`generation_record_id`、`generated_at`、文件、实际 SHA 和实际宽高；两次 attempt 的路径和 SHA 必须不同，旧的仅路径数组结构拒绝，不要求两次尺寸相同但第二次实际宽高必须等于当前归一化输入。若裁切会损伤主体、文字、透明轮廓或关键构图，则先由生产流程对原图生成式延展到目标比例，再重新校验纯色背景、去背景并普通归一化。`padding_policy=none`，禁止非等比拉伸、padding、contain、复制边缘或裁切冻结 `reference_target`。原图已满足尺寸也必须写 `normalization_record.operation=not-required`，透明资产必须前后保留 Alpha。
7. V2 前的灰盒或视觉样片必须与正式运行链隔离，不得注册正式入口或实现正式业务逻辑；V2 确认后生产 V3 正式资源；V4 草图确认后，V5 正式功能沿生产 Scene 入口/骨架落地，禁止一次性截图 Scene、整屏铺图、隐藏覆盖层和绝对叠层凑像素。V5 在正式功能实现之后与玩法协作完成结构化集成、动态验收和低保真清理；上游事实或当前受影响候选身份变化时才使对应 fidelity case 失效重采，其他单元证据继续有效。

正式效果图标注命令必须带 `--proposal <file>.json`；省略该参数直接失败，不生成只有用户图示的成功产物。

效果图生产必须先引用已冻结的全局视觉基线；全局候选选择、冻结状态和跨 Work Item 引用规则以[控制模型](../threejs-game-workflow-control/references/control-model.md)及[全局视觉控制](references/global-visual-control.md)为准。本领域只补充生成记录、锚点继承和资源合同要求；场景仍在同一 Work Item 内按 V1→V5 完成。

布局生成的标准交付除 PNG 外必须包含同一候选目录的 `layout-nodes.json`、`layout-decision.json`、自包含 `review.html` 和 `generation-result.json`。布局审阅页只用于可读的人工作业，不能替代拆解确认、独立布局确认或 PNG/F2 机器门；其模板、真实 SHA 绑定、候选状态和离线边界见 [`离线布局审阅产物`](../threejs-game-ui-layout/references/layout-review-artifacts.md)。

## 条件参考

- 参考截图、录屏、运行项目或源码还原：读取 [视觉还原](references/visual-reconstruction.md)。
- 装饰性屏幕空间满幅背景：读取 [满幅背景](references/full-bleed-background.md)；世界空间关卡、Tilemap 或玩法环境改读资产生产路线。
- UI：同时读取 [`threejs-game-ui-layout`](../threejs-game-ui-layout/SKILL.md) 的布局合同、ThreeJS 适配器和证据矩阵；资源 origin、布局锚点与动画偏移按合同分离，资产接入不得重新发明布局规则。
- QA 测量、动态 resize、完整 viewport 截图和只读 Hook：读取 [响应式视觉验证](../threejs-game-qa-performance/references/responsive-visual-validation.md)，不得在资产文档复制其字段或阈值。

## 审核与交付

所有候选先通过 F0-F3；F4 只处理带外部写入、付费、真机、破坏性或外部删除、发布副作用的 A4-A6 操作。无副作用本地 A4 集成不因等级标签额外等待批准。V1/V2 确定性机器检查必须执行；用户选择只用于真实设计取舍和 V2 两次视觉确认。自动路径记录 `AUTO` 决策依据，实质取舍记录一次 `USER_DECISION` 并回写权威工件。每个交付包记录当前任务范围、候选身份、基线、来源/许可（如适用）、预算和证据；普通任务不要求独立授权记录。

### 视觉确认边界

同一场景 Work Item 的 V0→V5 链在 V2 依次完成拆解确认和布局确认，冻结还原方案。`visual-decomposition-confirmation/1.0` 绑定 annotation/proposal/decision SHA、target、V2 candidate、diff、baseline、全部编号和用户原文；已确认的目标或方案发生实质变化时重新确认受影响部分，普通运行态布局微调不重开 V2。V2 拆解图、技术 JSON、合同回对、coverage 和结构化机器检查必须齐全，布局确认另行绑定最终布局图与决策文件。V3 资源验收、V4 草图确认、V5 代表性完整画面和关键可用性证据绑定当前身份；overlay、diff 和完整逐区域精确 fidelity 仅在 exact 模式强制。根节点 PASS、布尔值、AI reviewer 字段或旧 `human_review` 均不能代替两次 V2 确认。

## 三维资源边界

GLB/glTF、PBR、骨骼角色、碰撞代理和关卡数据使用 [模型管线](../threejs-game-model-pipeline/SKILL.md)。本技能的 PNG/像素密度/二维布局门只适用于贴图、HUD 和 billboard；三维资源不提交伪造的位图尺寸或二维父子几何证据。
