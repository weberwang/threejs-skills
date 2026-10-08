# Effect-image 生成式位图忠实还原提示词合同

本文件是 `effect-image` 模式的唯一提示词模板与机器合同来源。它定义“非像素复制的高保真忠实重建”，即允许重新绘制全部像素，但不得重新设计任何可观察视觉事实。工作流路由见 [`visual-reconstruction.md`](visual-reconstruction.md)、[`asset-production-routes.md`](asset-production-routes.md) 和 [`visual-production-pipeline.md`](visual-production-pipeline.md)；代码门禁由 [`effect-image-prompt-contract.mjs`](../../threejs-game-workflow-control/scripts/effect-image-prompt-contract.mjs) 执行。

## 全局提示词

`global_prompt_prefix` 必须逐字使用下面的 canonical 内容：

```text
任务类型：对冻结效果图执行“非像素复制的高保真忠实重建”，不是重新设计、概念探索或风格改编。

提供的完整冻结效果图是唯一视觉真值，也是本次生成的实际参考输入。只重绘当前指定的 atomic component。严格保持该部件在参考图中的视觉类别、外轮廓、长宽比例、相对尺寸、朝向、透视、结构分区、颜色分布、材质、明暗关系、光源方向、能量辉光、线条粗细、装饰密度、透明边界及可见裁切关系。

不得进行审美优化，不得补充参考图中不存在的结构，不得替换符号语义，不得改变角色姿态、镜头角度、框体轮廓、字体结构或图标含义。

允许重新绘制全部像素，但禁止把参考图裁切、抠图或复制后直接作为交付结果。

输出单个独立位图资产。背景按本次实际请求中的源图背景要求绘制；主体必须完整落入指定画布。不得生成组合图、atlas、sprite sheet、展示板、说明文字、无关 UI、数字、标签、水印或其他组件。
```

当当前 `expected_assets` 的 `alpha=true` 且 `origin=generated` 时，实际发送的完整提示词必须追加以下默认纯色背景生产段；若绿色与主体冲突，调用前选择其他 HEX 颜色并通过 `buildSolidBackgroundPrompt(color)` 生成对应段落，提示词、`source_background_color` 和脚本参数必须一致：

```text
背景要求：将参考图或 asset_prompt 中用于描述最终透明边界的区域，在本次原图中统一填充为不透明、无纹理的纯色平涂背景；指定颜色为 #00FF00（RGB 0, 255, 0）。
主体必须完整落入画布并与画布边缘保持间隔；保持主体颜色、材质、光影和边缘形状不变，不把背景或背景阴影烘焙进主体。调用方应在发送提示词前选择与主体明显区分的指定纯色。
背景必须整片均匀不透明；禁止棋盘格、网格、渐变、纹理、背景阴影、环境景物、边框、说明文字或色值文字。
```

生成记录必须记录系统实际选择的 `generator` 与 `generator_version`；`generator` 必须记录实际调用的工具，未暴露的版本、模型参数或种子记录 `not-provided`，不得编造。生成式透明路线固定声明 `transparency_strategy=background-removal`、`source_background_mode=opaque` 和显式 `source_background_color`，并提供 `raw_source_file`、背景处理后的 `source_file` 和两侧 Alpha；源图必须先通过 `--require-solid-background` 校验，失败时重新生成或修正输入。背景处理使用公共 `remove-background-local.mjs`；`background_removal_attempts` 只追加返回报告中的 `report.background_removal_attempt`，不嵌入完整报告；每个 attempt 记录 `operation`、`status`、源/输出路径、完成时间、源/输出 Alpha、背景颜色、失败原因和可审计 evidence。每条成功记录的 `evidence.solid_background_check` 必须证明不透明、边缘全数匹配且检查通过；最终记录还必须与当前源图背景色一致。失败历史必须保留，重试由任务配置设定上限，不能无限重试或自动新增外部调用授权；`normalization_record.source_file` 必须绑定当前透明输入。最终 PNG 由 V5 文件解码复核真实 Alpha。已有真实透明图按资源复用合同接入，不伪造生成去背记录。

`background_mode`、`direct_generation_attempt` 和旧的策略值均不属于本合同；`postprocess` 必须是字符串数组，背景移除操作以结构化 `background_removal_attempts` 为权威记录。

`negative_prompt` 必须逐字使用下面的 canonical 内容：

```text
重新设计，二次创作，概念探索，风格迁移，风格改编，审美优化，专业修复，提升游戏感，自由发挥，改变轮廓，改变比例，改变朝向，改变透视，改变姿态，改变构图，替换符号语义，新增参考中不存在的结构，新增装甲，新增武器，新增翅膀，新增徽章，遗漏参考结构，通用科幻图标，过度发光，霓虹泛滥，卡通化，扁平化，低细节，模糊边缘，组图，atlas，sprite sheet，整屏 UI，设计展示板，说明文字，水印，棋盘格烘焙背景，直接裁切参考图，直接抠取参考图，直接复制参考像素。
```

## 禁止与必须

禁止把完整冻结效果图直接裁切、抠取、复制像素后当作输出，也禁止用整屏截图覆盖结构化 Scene。必须将完整冻结效果图作为实际参考输入，严格继承轮廓、比例、朝向、透视、结构、颜色、材质、光影、装饰密度、透明边界和裁切关系，并重新绘制像素。

未经明确 Change Request 或用户例外决定，不得重新设计、风格改编、审美优化、提升游戏感、专业修复、替换图标语义，或改变角色姿态、镜头、构图、字体结构和图标含义。负向提示词中的“重新设计”等词只表达禁止项，不得被正向指令门误报。

## asset_prompt 继承规则

每个 `effect-image` 的 `asset_prompt` 必须来自当前 `scene_reconstruction_contract.coverage_regions` 的冻结 region（按 `region_id` 绑定），不能只写“科幻按钮”“机甲角色”“未来卡框”等通用品类，也不能根据资产名称自行推断参考图中不存在的语义。提示词生成器会将 region 事实序列化为以下字段，并把 `annotation_number/region_id/component_id/state_id` 写入实际提示词：

- 视觉类别和图形语义；
- 外轮廓及关键内部结构；
- 长宽比例和相对尺寸；
- 朝向、视角和透视；
- 颜色分布和材质；
- 光源、高光、阴影及辉光；
- 线条粗细和装饰密度；
- 透明区域、可见裁切及留白；
- 不应烘焙进该资产的其他对象；
- 文字、数值、热区、运行时前景和状态等所有权。

字段允许使用 scene contract 的 snake_case/camelCase 别名或 `visual_facts`/`fidelity_facts` 容器，但必须保留原始值。region 缺少事实时，生成器不得用资产名补全；校验器先输出 `repair` 并阻断当前门，只有冻结方案事实真实失效时才建议 `return`。

## 结构化生成记录

仅对 `effect-image` 的生成式位图强制：

```json
{
  "reconstruction_mode": "reference-faithful",
  "reference_input_mode": "full-reference-guidance",
  "pixel_reuse_policy": "forbid-output-reuse"
}
```

`generation_record.reference_inputs` 必须包含 `reference_target.original_file` 指向的完整冻结效果图；`style_reference_inputs` 只能补充，不能替代它。`source_file`、`runtime_file`、`output_file` 和实际输出路径/文件身份不得等于冻结图。`crop_reference=true`、`reference_crop=true`、裁切/抠图参考图或复用参考像素作为输出都必须失败。

完整效果图中的小部件往往只占少量像素。生产时应同时提供从同一冻结原图按已确认 region bounds 导出的局部细节参考，作为额外的 `reference_inputs`；完整原图仍须同时发送，以保留构图、尺度和相邻关系。细节参考只供模型观察，不能当作资产输出或可复用素材。记录裁取范围、冻结原图 SHA、细节图路径与 SHA，以及实际发送的输入顺序；不得放大裁图后声称获得了原图中不存在的细节。原图分辨率不足以辨认轮廓或纹饰时，先标记该视觉事实不确定并修正 V1/V2 目标或取得更清晰的参考，不能让模型自由补画。

每个原子部件的 `asset_prompt` 还应明确“完整原图用于全局关系、局部细节图用于当前部件形态”，并把 region bounds、部件在整屏中的相对尺度、相邻对象的排除边界写进实际提示词。禁止把局部裁图单独作为唯一参考；禁止把局部裁图、抠图或原图像素直接交付为生成结果。

记录必须保存实际发送的完整提示词（`full_prompt` 或 `actual_prompt`）和真实 `reference_inputs`，不能在生成后拼一份未实际使用的文本。完整提示词至少可复核地包含 canonical 全局段、当前 region 事实资产段、状态段和 canonical 负向段；生成式透明 `alpha=true` 资产还必须包含纯色背景生产段，并绑定当前 `target_sha256`、`region_id`、候选 `candidate_sha256`/`diff_fingerprint`、候选版本与实际 `record_id`。`generator`/`generator_version` 必须记录系统按提示词、参考输入、材质、透明需求和可用能力实际选择的工具身份；未暴露时写 `not-provided`。

普通非 `effect-image` 生成式位图不要求以上三个重建字段，也不要求冻结效果图作为参考输入；仍须记录实际生成器、版本、提示词、输入、输出和后处理。

透明单图必须按“生成不透明纯色原图 → 校验纯色背景 → 公共脚本去背景 → 尺寸归一化 → V5/final/runtime”执行；生成式透明路线只能以背景处理输出作为透明输入。归一化使用 Sharp，写入 `normalization_record`，并把 `normalization_record.source_file` 绑定当前透明输入，最终 `actual_output` 绑定归一化后的 PNG。生成失败、纯色校验失败或背景处理失败时保留历史尝试和失败原因，按任务配置的有限上限重试；不因重试自动新增外部调用授权。所有生成式位图首次输出比例不符时最多重生一次；第二次仍不符时，若冻结裁切焦点和安全事实允许，使用 `crop-and-resize-to-contract`，记录 `aspect_ratio_correction` 中两次真实原始生成 attempt、SHA、尺寸、focus 和最大目标比例 `crop_rect`；若裁切会损伤主体、文字、透明轮廓或关键构图，则先由生产流程对原图生成式延展到目标比例，再重新校验纯色背景并执行背景处理和普通归一化。`padding_policy=none`，禁止非等比拉伸、padding、contain、复制边缘或裁切冻结 `reference_target`；透明目标归一化前后都必须保留 Alpha。

## 全局视觉基线绑定

effect-image 生成必须在生成前绑定已完成三候选人工选择且由 `globalVisualBaselineSelectionRef` 支持的当前 `visual_baseline`，而不是只绑定局部冻结效果图。基线只能处于 `global-static-baseline-frozen`，身份必须包含 `id`、`version`、`style_fingerprint`、`document=docs/visual-baseline.md` 和全部 `anchor_evidence`。原子资产的 `reference_inputs` 仍必须包含完整冻结效果图；`style_reference_inputs` 逐项继承全部全局锚点并记录真实 SHA，不能用锚点替代完整冻结图。

实际生成记录至少包含 `origin=generated`、四个基线身份字段、`global_visual_consistency_prompt`、`style_drift_policy=forbid`、实际发送的 `full_prompt`、`target_sha256`、`output_sha256`、`consistency_status=passed` 与路径+SHA 的 `consistency_evidence`。`full_prompt` 必须同时含本文件既有的忠实重建 canonical 段、全局一致性段、asset/state/negative 段；缺少实际发送证明、漏传/多传锚点、允许风格迁移或身份漂移均失败。用户/外部提供图使用 `origin=provided`，不得补写伪生成记录。共享常量和合同位于 `global-visual-consistency-contract.mjs`。

## V5 同屏组合

V5 不得只凭文件存在、MIME、尺寸、Alpha、component×state 齐全、运行时登记或 `missing=0` 判定视觉通过。`combination_preacceptance` 必须声明当前正式资产与正式布局结构，并以机器可复核事实确认轮廓、比例、姿态、图标语义和整屏构图未偏离冻结目标；还必须记录无未经批准的重新设计。提示词合同/实际 generation record 的绑定必须同时覆盖当前 target SHA、region ID 和候选身份。提示词合同失败属于执行问题，先在 V3/V5 原地修复或重验当前门并阻止进入 V5；只有冻结 target/方向/候选身份真实变化时才进入必要回退。
