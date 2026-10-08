# 全局视觉控制约束

为每个项目维护单一、版本化的全局视觉基线。候选选择、冻结状态和跨 Work Item 引用以[控制模型](../../threejs-game-workflow-control/references/control-model.md)及对应 Schema 为准；本文件只补充全局视觉基线的锚点、风格和生成记录要求。`docs/global-visual-baseline-selection.json` 是唯一选择根证据模板；`docs/visual-baseline.md` 只保存不可变冻结规则正文，`docs/visual-design.md` 保存可追加的方向探索、版本索引及 V2/V3/V4/V5 证据，`docs/visual-assets.json` 只保存机器绑定与选择证据索引；选择根证据单独保存，不在其中内嵌第二份根对象。

## 生产者与消费者绑定

选择根证据的顶层 `workItemId` 永久表示创建三候选和人工决定的生产者 Work Item。三张候选的 generation record、唯一人工决定文件和根证据必须继续绑定同一生产者，不能因为场景 Work Item 消费该基线而改写这些文件的所有者。消费者只保存 `globalVisualBaselineSelectionRef` 的不可变 `path` + `sha256`；引用中的可选 `workItemId` 也只能复述生产者身份，不能填写或要求等于当前消费者 Work Item。这样同一冻结根证据可以被多个场景、显示层或基础模块 Work Item 复用，同时仍由文件门完整校验生产者链和每个文件的 SHA-256。

## 基线身份与风格指纹

冻结基线时同时记录：

- 基线 ID、语义化版本、状态、冻结日期和负责人；
- 风格指纹：固定使用 `sha256:<64 位小写十六进制>`，其摘要必须等于冻结基线文档完整文件字节的 SHA-256；
- 主锚点：最能代表项目世界幻想、渲染方式、情绪和质量密度的同条件截图或动态片段；
- 分系统锚点：角色、场景、UI、图标、动画、VFX、字体等系统各自的代表画面；
- 基线文档、锚点证据、适用范围、允许变量和已知边界。

基线 ID 表达视觉系统身份，版本表达已批准规则集合，风格指纹只计算 `docs/visual-baseline.md` 完整文件字节。不得把摘要或 V2/V3/V4/V5 留痕写回被哈希正文；阶段证据追加到 `visual-design.md`。规则变化生成新版本和新哈希，使全部受影响决定与证据失效并重验。`--check-files` 重新计算冻结正文 SHA-256。

## 三候选生成与人工冻结门

全局视觉基线必须从一个明确的视觉 brief 开始。使用相同 brief、目标视口、参考输入和条件指纹生成恰好三张候选效果图，并将三张图同屏交给人工比较；候选必须分别绑定图片文件 SHA-256 和 generated generation record 文件 SHA-256。`global-visual-baseline-selection/1.0` 证据还必须绑定生产者 Work Item、brief、generation batch、唯一候选 ID、唯一 `SINGLE_HUMAN`/`CONFIRMED` 选择、selectedCandidateId、决定记录文件/SHA、确认时间和用户原文。

人工确认完成前，`visual_baseline.status` 和 Work Item `globalStaticBaselineState` 只能保持 draft/pending，不能写入 `global-static-baseline-frozen`。确认后冻结身份必须同时绑定 baseline ID/version、`docs/visual-baseline.md`、正文真实 SHA（style fingerprint）、primary anchor 和 selected candidate；任一候选、决定、brief、正文或锚点文件 SHA 漂移均使引用失效并回到三候选流程。该全局人工选择是独立硬门，不能替代每个场景 V2 的拆解图确认。

| 阶段 | 必须产物 | 允许状态 | 禁止旁路 |
| --- | --- | --- | --- |
| brief | brief 文件与 SHA、generation batch、conditions fingerprint | draft/in-progress | 直接冻结 |
| 候选生成 | 恰好 3 张 `origin=generated` PNG/JPEG 效果图及各自 generation record、图片/记录 SHA（文件门检查真实魔数） | generated | 2/4 张、provided、重复 ID、扩展名伪装 |
| 人工选择 | 同屏呈现三张、唯一 `SINGLE_HUMAN`/`CONFIRMED` 决定文件、selectedCandidateId、用户原文 | pending → confirmed | AUTO、pending、说明文字 |
| 正式冻结 | `globalVisualBaselineSelectionRef`、冻结正文、真实风格指纹、primary anchor/selected candidate | global-static-baseline-frozen | 只写状态字段 |

## 全局视觉冻结表

全局规则在 G0/V0 的 brief 与三候选人工选择门中建立，并在确认后正式冻结；之后每个场景的 V1/V2 只冻结该场景的目标和方案，不得把场景 V2 当作全局基线选择。每项写明不变量、量化范围、允许变量、禁止项和证据：

| 系统 | 必须冻结的内容 |
| --- | --- |
| 世界幻想 | 玩家所处世界、时代/文化线索、情绪、叙事用途和项目主题辨识 |
| 形状与轮廓 | 基础几何、圆锐比例、剪影复杂度、负形、边角和轮廓节奏 |
| 角色比例 | 头身比、五官位置、肢体粗细、手脚尺度、表情幅度和角色间比例 |
| 透视与镜头 | 投影方式、焦段感、俯仰角、地平线、镜头高度、景深和构图安全区 |
| 调色板与明度 | 主辅色、强调色、稀有度/状态色、明度层级、饱和度范围和对比预算 |
| 材质 | 表面类型、粗糙度、纹理尺度、体积、高光、阴影和磨损规则 |
| 光源 | 主光方向、色温、软硬度、环境光、轮廓光、投影方向和曝光范围 |
| 描边 | 是否使用、颜色、粗细、内外描边、缩放规则和不同系统的层级关系 |
| 渲染密度 | 单位面积细节、纹理频率、噪声、装饰密度、留白与视觉降噪规则 |
| 字体与排版 | 字族、字重、字号阶梯、行高、字距、数字样式、描边/阴影和文本安全区 |
| 图标语法 | 视角、轮廓、填充、圆角、线宽、体积、光源、状态与稀有度表达 |
| 面板与按钮 | 形状、层级、材质、边框、阴影、状态、按压反馈、主要/次要行动差异 |
| 动画 | 缓动、节奏、预备/命中/恢复、循环幅度、帧率、夸张度和角色动作语言 |
| VFX | 粒子形状、色彩、混合、亮度、持续时间、遮挡预算、峰值密度和降级方式 |

## 锚点与继承

1. 主锚点约束所有正式资源；分系统锚点只能细化对应系统，不能推翻主锚点。
2. 场景差异必须在全局不变量内实现。通过场景用途、构图焦点、专属对象、情绪、允许色彩范围和节奏形成差异，不得把所有页面做成同一模板，也不得让不同场景变成不同美术体系。
3. 局部资源只使用冻结表声明的允许变量。未声明变量默认不可变；需要新材质、光源、描边、比例、图标语法或渲染密度时先提交基线变更提案。
4. 原子资源必须绑定当前有效基线、锚点，以及适用的 V1/V2 `AUTO` 或 `USER_DECISION` 记录与视觉可交付结论。

## AI 生成包契约

每个 AI 生成包按固定顺序保存以下内容，不得只保留最终提示词：

1. **固定全局提示前缀**：从当前基线逐字引用世界幻想、形状、比例、镜头、调色板、材质、光源、描边、渲染密度和系统语法；同一基线版本内不得由单个资源改写。
2. **资产特定段**：只描述资源 ID、用途、构图、尺寸、透明要求、锚点、可见部件和允许变量。
3. **状态段**：描述默认、选中、错误、提示、购买、成功、失败、稀有度或动画时间点等适用状态。
4. **负向段**：逐字引用基线禁止项和负向词，并补充该资产特有的失败模式。
5. **生成记录**：保存系统实际选择的生成器及版本、种子、采样参数、参考输入及权属、遮罩/ControlNet 等控制输入、批次 ID、选择理由和后处理步骤。实际调用的工具身份必须保留，未暴露的版本、模型参数或种子明确记录 `not-provided`，不得编造。

生成结果仍须以锚点和跨资源证据审阅。相同生成器、模型、种子、提示前缀或调色板只能证明生产条件相近，不能证明视觉一致。

上述 AI 专用字段只强制用于路线为 `ai-composite-raster` 且状态为 `producing`、`review` 或 `accepted` 的资源，不泛化到非 AI 生产路线。机器清单中的 AI `generation_record` 必须至少包含非空 `global_prompt_prefix`、`asset_prompt`、`state_prompt`、`negative_prompt`、实际生成器及版本、种子、非空 `reference_inputs` 路径列表和字符串 `postprocess` 数组；未暴露的版本写 `not-provided`。所有路线的 accepted 资源若没有 `source_file/source_files`，仍须满足公共生成身份：record ID、生成器及版本、时间、可执行命令/配方、输入来源和参数。状态段不适用时也必须显式说明原因；`--check-files` 必须验证每个 `reference_inputs` 文件。若 `expected_assets.alpha=true` 且 `origin=generated`，透明策略固定为 `background-removal`：原图必须是整张不透明的指定 HEX 纯色 PNG，显式记录 `source_background_mode=opaque`、`source_background_color`，并先通过 `remove-background-local.mjs --require-solid-background`；棋盘格、网格或复杂背景校验失败时重新生成或修正输入。背景处理尝试按实际追加并记录失败原因和有限重试上限，原图和处理输出的 Alpha 状态、路径、背景颜色、完成时间与 evidence 必须可审计。已有真实透明图按资源复用合同接入；`alpha=false` 的完整场景背景不受纯色要求约束。

## 多资源一致性证据

V5 为每个生产包提交多资源联系表，并至少生成一张同屏组合截图。运行态默认使用 `visual_validation.mode=usability`，检查跨资源关系、可读性、边界、遮挡和交互；只有明确 `exact` 需求时才要求严格像素差异或完整视口/状态覆盖：

| 资源 ID | 基线 ID/版本/指纹 | 主锚点 | 分系统锚点 | 同屏对象 | 形状/比例 | 材质/光源/描边 | 色彩/密度 | 允许变量 | 偏差与结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

同屏截图必须覆盖会同时出现或由玩家连续看到的角色、图标、面板、按钮、场景对象与 VFX，并标注具体区域和可观察事实。V5 再在目标视口、关键状态和动态时间点检查运行态一致性；孤立透明图、单图文件检查或作者声明不得单独通过。

## 漂移判定与处置

出现下列任一情况即判定视觉漂移或未验证：

- 资源未绑定当前基线 ID、版本、风格指纹或适用锚点；
- 风格指纹格式错误，或与冻结基线文档实际 SHA-256 不一致；
- 形状、角色比例、透视、材质、光源、描边、图标语法、字体、按钮、动画或 VFX 超出冻结规则和允许变量；
- 同屏对象像来自不同项目，或场景差异退化为同模板；
- 只有关键词、模型、调色板、单图或主观一致声明，没有联系表、同屏截图和区域事实；
- 新版本资源使旧锚点、状态、页面、图集、布局或运行证据失效。

按根因处置：字段、路径、绑定或生成包记录缺失先 `repair`；上游事实未变的正式文件、执行或机器证据偏差按 `revalidate` 重验当前门。只有方向/全局规则、冻结生产规格、构图、信息层级、资源槽或布局结构真实变化时才 `return` 到 V1/V2/V3/V4/V5 中最早受影响阶段；普通候选身份变化只重验受影响证据，不触发回退。总控只核对绑定、版本和证据完整性；F2 由确定性机器事实判断视觉一致性。

## 基线变更提案

禁止直接修改冻结基线。变更提案必须建立 Change Request，列出新旧基线、原因、影响、需要失效的高影响操作批准/证据、迁移计划、成本与重新执行 V2 拆解图确认的要求；V1/V2 使用 `AUTO` 或 `USER_DECISION` 记录，不写操作审批 pending。无副作用本地集成不因 A4 等级标签额外等待批准，外部写入、付费、真机、破坏性或外部删除、发布才进入精确操作批准。

新基线形成后，将旧决策和证据标为失效或限定范围，并从最早受影响阶段重验。明确规则下的忠实更新记录新 `AUTO` 决策；新方向或可见结构/交互取舍请求一次精确确认。

## 审核模板

```md
# 全局视觉一致性审核

- 审核 ID / 候选版本：
- 基线 ID / 版本 / 风格指纹 / 状态：
- 基线文档：
- 主锚点与分系统锚点：
- 机器验证器版本与运行标识：

## 绑定与证据

| 资源/系统 | 基线绑定 | 锚点 | 联系表 | 同屏截图及区域 | 可观察一致事实 | 允许变量 | 偏差 | P0-P3 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

## 结论

- 漂移：无 / 方向规则 / 生产规格 / 资源执行 / 结构根因
- 处置：repair / revalidate / return（仅 return 填 V1/V2/V3/V4/V5）
- 基线变更提案：无 / 路径与版本
- 失效证据与影响面重验：
- 视觉一致性 F2：通过 / 失败 / 缺少机器事实
```

## 生成前全局基线硬门

全局三候选人工选择并正式冻结后，所有场景主图、reference target、宿主场景 contextual effect image 和原子生成式位图资产都必须引用同一份 `visual_baseline`。冻结基线必须是 `global-static-baseline-frozen`，并固定 `id`、`version`、`style_fingerprint`、`document=docs/visual-baseline.md` 与完整 `anchor_evidence`。项目具体美术风格只写入该正文和锚点证据，通用提示词不硬编码项目风格；候选阶段的生成记录使用 `global-visual-baseline-candidate-generation/1.0`，不冒充已经冻结的全局基线。

| 记录 | 必填生成身份 | 全局锚点 | 实际提示词 | 输出/证据 | 失效条件 |
| --- | --- | --- | --- | --- | --- |
| generated | baseline 四元组、`origin`、`style_drift_policy=forbid` | 全部 `style_reference_inputs`，路径与真实 SHA | `global_visual_consistency_prompt` + `full_prompt`，并证明实际发送 | `output_sha256`、`consistency_status=passed`、证据路径与 SHA | 基线/锚点/目标/提示词/证据身份变化 |
| provided | 仅 `origin=provided` | 不伪造生成输入 | 不要求生成记录 | 外部文件按普通文件门核验 | 文件路径或 SHA 变化 |

原子资产仍以完整冻结效果图作为主参考，全局锚点只作为额外强制 style references。文件门会复算基线正文、锚点、冻结目标、输出和一致性证据的真实 SHA，旧记录不能跨身份复用；记录或路径问题先原地修复，候选未变的证据更新只重验当前门，冻结身份真实漂移时才返回最早受影响阶段。

生成式单图在绑定全局基线后仍按“生成原图 →（`alpha=true` 时）校验不透明纯色背景 → 公共脚本去背景 → Sharp 尺寸归一化 → V3/final/runtime”交付；生成式透明路线固定使用 `background-removal`，不请求透明 PNG/Alpha，公共脚本必须记录实际工具/版本、输入输出、`source_background_color`、Alpha 和失败历史。首次输出比例不符时最多重生一次，第二次仍不符时，若已冻结裁切焦点和安全事实，则使用 `crop-and-resize-to-contract` 并绑定两次真实原始生成 attempt、SHA、尺寸、focus 和 `crop_rect`，否则先由生产流程对原图生成式延展到目标比例，再重新校验纯色背景、执行背景处理和普通归一化。该分流适用于所有生成式位图；`padding_policy=none`，禁止非等比拉伸、padding、contain、复制边缘、以及裁切冻结 `reference_target`。归一化后的 PNG/JPEG 才是最终输出（`alpha=true` 只能是 PNG，`alpha=false` 可是 JPEG），透明目标前后都要保留 Alpha，并以 `normalization_record` 绑定当前输入、尺寸、路径、SHA 和工具版本。
