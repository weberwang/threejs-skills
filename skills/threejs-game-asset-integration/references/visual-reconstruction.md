# 视觉与功能还原

缺少瞬态弹窗宿主图时，为弹窗建立独立 DISPLAY_LAYER Work Item 并停留在其自身前置门；宿主场景继续自己的 V1–V5。弹窗的完整上下文要求和运行证据只约束弹窗工作项，不进入宿主场景完成条件。

参考截图、效果图、录屏、运行项目和源码是输入，不是通过结论。参考还原属于 V0 的完整路径并执行 V1-V5；功能契约仍优先定义玩法行为，但当 Work Item 明确以指定效果图或参考截图为还原目标时，必须启用“忠实还原模式”。该模式默认使用 `visual_validation.mode=usability`，不因 effect-image 自动启用 `exact`；只有用户明确要求像素级还原时才选择 `exact`。

effect-image 生成式位图的 canonical 提示词模板、asset_prompt 事实继承和生成记录绑定见[《Effect-image 生成式位图忠实还原提示词合同》](effect-image-prompt-contract.md)；本文只规定场景还原路由与视觉事实门。

## 忠实还原模式

指定参考在已登记的目标视口、设备像素比、语言、状态、随机种子和动画时间点下构成冻结视觉目标。参考中可观察的构图、层级、相对位置与尺寸、比例、色彩、材质、光影、字体、图标和装饰密度是设计事实；不得在没有用户明确要求时改成另一种产品方向或玩法语义。默认可用性验证允许小幅位置、尺寸、边距和换行偏差，明显越界、裁切、关键遮挡、不可读或交互失效仍必须修复。`usability` 只放宽像素级几何测量，不放宽资源形态和画面构图的忠实度；角色姿态、主要轮廓、符号语义、色彩材质或视觉重心出现明显偏离时，仍按还原失败处理。

V1 内生成或接收并冻结参考身份、版本、权属、原始文件指纹、适用状态、scene master/reference target、宿主上下文效果图、布局合同、视觉事实、验证模式和项目容差。参考证据明确且不存在产品方向、玩法语义或上游结构取舍时记录 `AUTO` 决策依据；存在实质冲突或取舍时只请求一次 `USER_DECISION`。默认 `usability` 不把细节几何偏差升级为决定门。

## V2 拆解确认与生产方案

V2 直接基于 V1 冻结图做完整拆解，并按两个串行阶段产出：阶段 A 是拆解方案确认，阶段 B 是布局方案确认。

V2 布局标注在拆解确认之后串行产出：阶段 A 先生成按人工确认顺序排列的拆解图、技术 JSON 和 `decomposition_elements`，人工修改并确认；阶段 B 由智能视觉判断结合原图构图、视觉重心与元素语义，按同一顺序为每个确认元素生成唯一的 `left/center/right × top/center/bottom` 决策。布局生成器只读取确认 proposal 中的元素和该决策，按原顺序推导后置布局节点并生成独立布局标注 PNG，不能读取预存 `layout_nodes`、按距离猜测对齐、生成新的视觉参考图或提供多个布局候选。布局决策和布局图允许人工修改，最终确认同时绑定决策文件、布局图及上游拆解身份。

- 左原图、右说明栏的 PNG 标注图，覆盖全部 scene/state、区域编号和生产标签。
- 技术拆解 JSON，记录每个元素的 bounds、尺寸、位置、父子关系、停靠关系、对齐关系、坐标空间、层级、显示层、状态、文本字形事实和响应式关系。
- coverage 审计，要求每个 scene/state `coverage_ratio=1`、无 uncovered、区域不越界且编号唯一。
- `component_inventory` 与 `state_analysis`，先状态、后组件，每个 component × required state 都有生产要求。
- `visual_route_analysis` 与 `visualProductionContract`，明确 runtime-data、runtime-rendered、fixed-production-visual、reuse-existing、runtime-program 或 generate-now 的边界。
- `visualProductionUnits` 生产计划，逐 annotation number / region ID 绑定 owner、路径、格式、资源、组件状态、交互热区和输出。
- `visual-decomposition-confirmation/1.0`，由用户确认拆解图和生产方案，绑定 annotation/proposal/decision SHA、target SHA、baseline SHA、candidate/diff identity、work item、scene/state、全部编号和用户原文；布局另以 `layout-annotation-confirmation/1.0` 绑定最终布局图、决策文件及上游身份。

确认只冻结还原方案与生产边界，不改变玩法、布局或视觉事实的责任归属。提案、目标、区域定义、用户原文、候选身份或布局字段漂移时，确认失效并回到当前 Work Item 的 V2 重做拆解确认；普通运行候选演进只重验受影响证据。

## 布局与文本拆解

效果图拆解必须先看整屏构图，再冻结 `decomposition_elements`、视觉元素/组件、状态事实和 `display_layer_planning`；不能先拆资产、最后凭感觉补坐标。`target_bounds` 是参考图测量事实，不是运行时硬编码；布局节点在拆解确认后由元素 bounds/role 自动推导，布局合同负责运行时计算和响应式变换；runtime measurement 只是候选证据，不能回写或替代参考事实。

每个区域必须登记唯一 `annotation_number`、`region_id`、`layout_node_ids`、owner、实现计划和精确 `bounds`。每个 placement 必须有唯一 `layout_node_id`，只能引用本区域节点；没有 placement 的运行时区域必须由 `runtime_implementation.layout_node_ids` 消费。节点不得孤立、跨区域、被多个 placement 重复消费或同时被 placement 与 runtime 重复消费，除非另有显式复用合同和 placement 级证据。

文本节点必须作为独立拆解对象登记 `text_node_id`、content/source、semantic role、动态/本地化标记、目标 bounds、字体身份与置信状态、字号/字重/样式、行高、字距、对齐、baseline、fill/stroke/shadow、wrap、planned test ID 和实现路线。动态或本地化文本禁止 `image-text`；固定品牌字标可用图片，但必须保留可访问语义。

父子几何必须可复核：先确定 `parent_layout_node_id`，再冻结 `parent_target_bounds`，测量 child 到父内容框四边的 `relative_position.left/right/top/bottom`。水平 `left/center/right` 与垂直 `top/center/bottom` 由智能布局结合原图构图、视觉重心和元素语义写入显式 `axis_alignment`，不能由距离自动反推；测量只用于包含校验、偏移计算和漂移检测。`offset`、`self_anchor`、`reference_anchor` 必须与该视觉决策一致。

## V3 正式资源验收

V3 消费 V2 已确认的拆解图、技术 JSON、coverage、布局合同和生产计划，生产并验收正式视觉资源。正式资源保留来源、许可信息、机器清单、生成记录、输出文件、组件状态和冻结目标绑定。此阶段不依赖正式 Scene 功能运行。

V3 验收后进入独立 V4 草图阶段。按[页面还原草图作业](visual-alignment-authoring.md)生成草图数据，读取正式资源与冻结底图进行预览；选择、移动父节点带动子孙，保存与确认分别执行。V2 的目标节点和离线审阅页仍只读。

生成式位图区域按 V2 `component_inventory` 收齐全部待生成 component × required state，作为[一个批量生成任务](visual-production-pipeline.md#图片批量生成)一次提交；每项交付 individual 位图，`atlas_allowed=false`，不能将独立文件要求解释为逐张调度。宽高由逻辑像素 `ceil(max placement width/height × intended_scale_range.max × 2)` 决定，`max_dpr=2`，`padding_policy=none`。这里的 2 是图片生产基线；运行时实际 DPR 由设备动态读取并封顶为 2，不改变已冻结的资产尺寸；历史 1.5 生产证据须重生成或标记 `stale`。系统根据提示词、参考输入、主体材质、透明需求和可用能力选择实际生成工具，并在记录中写入工具/版本；生成式透明资产先生成不透明指定 HEX 纯色背景，再由公共脚本去背景并记录 `source_background_mode=opaque`、`source_background_color`、完整透明处理与归一化证据；不得请求透明 PNG/Alpha 或接受棋盘格预览。已有真实透明图按资源复用合同接入，完整场景 `alpha=false` 背景不受纯色要求约束。

## V4 草图组合与确认

草图文件绑定 V2 节点、V3 正式清单和资源文件身份。用户确认当前组合与坐标后冻结内容摘要，登记 `visualStageEvidenceRefs.V4`；后续修改使确认失效。显示层绑定 `displayLayerId` 与 `hostSceneId` 并查看宿主上下文。V5 正式实现消费同一确认草图，运行候选记录 `pageSketchSha256`，再校验正式 `combination_preacceptance` 和动态证据。

组合预验收先完成逐资源对照，再把冻结效果图与候选同条件并排查看。逐项指出差异属于资源本身、缩放/裁切、布局还是显示层；资源偏差退回 V3 修复批次，布局/显示层偏差在当前候选修正并重验，冻结事实或拆解确实错误才退回 V1/V2。`visual_fidelity` 中的 `passed` 必须对应可查看的原图区域、运行资产和组合画面，不得由生成记录合规或“画面能用”直接推断。

## V5 运行态与动态验收

V5 按 `visual_validation.mode` 运行证据验证视觉与功能联合结果。默认 `usability` 在目标及代表性视口/状态提供可读画面，检查布局关系、边界、遮挡、交互和恢复，并与冻结效果图并排核对主要构图及高显著性资源的可观察视觉事实；参考与候选记录视口、实际有效 DPR（动态封顶 2）、语言、操作轨迹、随机种子和动画时间点。只有 `exact` 或明确精确需求时才要求完整 viewport、逐状态/逐区域忠实度矩阵、严格容差、ROI、叠加和像素差证据。默认模式下并排核对不等于逐像素验收，但明显视觉漂移仍须修复。

每个 fidelity/parity case 不可变绑定冻结目标 SHA、当前代码或构建 SHA、scene/state、viewport、实际有效 DPR、语言、随机种子、输入轨迹、动画采样/稳定帧、布局合同版本、视觉基线版本、双方证据、预定义容差、例外 ID 和结论。上游事实或当前受影响候选身份变化才令对应旧案例失效并重新采集；其他单元路径级结果继续有效。默认 `usability` 保留代表性案例，`exact` 或明确全覆盖需求才要求全部视口/状态组合。

机器清单生命周期固定为：非效果图 `not-applicable`；效果图完成 V2 拆解确认后为 `v2-ready`，此时允许 fidelity case 为空；只有 V5 已验证才为 `v5-complete`，此时当前验证模式要求的关键 case 必须通过。默认 `usability` 保留代表性场景/状态案例；`exact` 或明确全覆盖需求才要求冻结目标的每个 scene/state 组合至少有一个 passed case。

## 失败条件

出现下列任一情况，V2、V3、V5 或完成报告不得通过：

- `exact` 模式下存在未解释差异或超出预定义容差的差异；`usability` 下存在明显越界、裁切、关键遮挡、不可读或交互失效。
- 缺少当前验证模式所需的同条件参考证据、候选证据或适用的响应式证据；完整 viewport 只在 `exact` 或明确要求时必需。
- 缺少 V2 拆解图确认、技术 JSON、coverage、生产计划或任一编号绑定。
- 改变产品方向、玩法语义或上游结构却没有对应的 `USER_DECISION` 记录。
- 只有“很像”“更美观”“已专业修复”等主观结论。
- 使用整屏截图、隐藏覆盖层或绝对叠层冒充还原结果。

## 常用命令

```text
失败：node scripts/validate_visual_manifest.mjs docs/visual-assets.json --stage V5
输出：current_stage=V5 未执行真实文件门，V5 FAIL。

成功：node scripts/validate_visual_manifest.mjs docs/visual-assets.json --stage V5 --check-files --project-root .
输出：scene contract、与 `visual_validation.mode` 匹配的 F2 机器证据、runtime replay 和文件门通过（exit 0）。
```

## 全局基线引用

场景效果图和生成式位图资源必须引用已冻结的全局视觉基线；候选生成、人工选择、冻结状态、锚点继承和文件门以[全局视觉控制](global-visual-control.md)及控制面 Schema 为准。场景自身从 V1 开始，按本文件的 V2 两次确认、V4 草图组合确认和 V5 运行态联合验收推进。

生成记录必须明确 `origin=generated|provided`；只有 generated 强制绑定基线四元组、全部 `style_reference_inputs`、canonical 全局一致性段、`style_drift_policy=forbid`、实际完整提示词、输出 SHA 与一致性证据。provided 图不得伪造生成记录。记录或路径问题先原地修复，候选未变的提示词/输出证据更新重验当前门；基线、锚点、target SHA 或冻结生成合同真实变化时才令旧记录失效，并按合同返回最早受影响阶段。
