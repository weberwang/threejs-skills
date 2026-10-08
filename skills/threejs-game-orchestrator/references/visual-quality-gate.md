# 视觉质量门

场景只验收自身画面和常驻 HUD；modal/popup 等弹窗按[独立工作项规则](../../threejs-game-workflow-control/references/control-model.md#弹窗工作项与场景解耦)完成完整上下文、两次 V2 确认、V3 和自身 V5。弹窗状态不进入场景 V5 门。

视觉拆解确认只能由编排层在收到用户确认消息后写入受保护的 `user-resolution-ledger/1.0`；Work Item 仅引用 `visualConfirmationAuthorityRefs[]`，不得内嵌 receipt 或自称 authority。前置文件冻结在 Work Item 根的 `visualConfirmationPrerequisiteFiles`，控制面写入 ledger/receipt 后必须冻结新的 Git commit/tree 基线；loader 从 `baselineHash` 复读并比对 baseline blob，当前新建、篡改、基线缺文件或非 Git 对象均拒绝。V2 ledger 不记录 `task_authorization_id`。

视觉领域规则只能收紧 [`threejs-game-workflow-control`](../../threejs-game-workflow-control/SKILL.md)。V0-V5 是 `stageId`；全局状态、审批与 F0-F4 语义不得改写。

场景视觉与功能生命周期沿用当前场景 Work Item 的 V0→V5 阶段；本领域只补充视觉质量事实。V2 依次完成拆解确认和布局确认，V3 完成正式资源验收，V4 完成页面草图确认，V5 完成运行态视觉接入和功能/视觉联合复验。全局基线、基础工程和集成入口以控制面文档为准。

正式可见视觉集成的 `visualStage`、`visualStageState`、阶段依赖和不可变证据由[控制模型](../../threejs-game-workflow-control/references/control-model.md)、[状态、阶段与停止门](../../threejs-game-workflow-control/references/state-gates.md)及 Schema 统一校验；领域文档不复制完成状态枚举。

## 路径

- V0 分流原子资源、组件/资源集、场景/整套 UI/视觉系统/重做；参考还原只作为场景实现的可选视觉模式。
- V1 建立功能规格与玩法视觉契约、必要低保真、布局合同和早期预算；基础实施完成后，参考模式在 V1 内冻结 scene master/reference target、宿主上下文图、参考身份、目标视口/状态、对比条件、整屏构图和初步还原草案。
- V2 直接从 V1 拆解事实形成还原方案：拆解图、proposal 技术 JSON、状态分析、component×state、尺寸、停靠关系、父子关系、对齐关系、coverage、显示层、合同回对、生产路线和预声明容差。V2 先通过 `visual-decomposition-confirmation/1.0` 确认拆解，再通过独立布局确认冻结布局结果。
- V3 生产并验收正式资源，V4 在草图页面预览、调整并确认组合；`production_contract_audit` 必须逐区域比较 V2 预期方法/交付类型与实际输出、生成记录和运行时消费。
- V5 在 V3 资源验收和 V4 草图确认之后实施正式功能，再执行运行态视觉接入、动态玩法视觉验证、功能/视觉联合复验、响应式证据和低保真清理。

普通资产在 schema 1.5 使用 `not-applicable`。效果图 V2 完成后标记 `v2-ready`；V2/V3 可暂无 fidelity case，V5 完成态要求 `v5-complete` 且 fidelity case 非空并全部通过。所有带 `annotation_number` 的区域必须先提交绑定冻结目标 SHA、region ID、区域定义 SHA 的完整编号拆解提案，并记录 accepted/manual 的拆解确认；AUTO、pending、旧字段、旧 SHA 或漏编号均拒绝进入 Implementation Package。

效果图必须采用串行拆解工作流：先整屏构图和拆解确认，再冻结布局节点与元素/状态并完成布局确认，随后把 coverage region、布局合同和 placement 三方绑定，最后按布局合同装配，V5 进行布局+视觉双验收。布局、视觉资源和场景装配属于对应 `SCENE`+`DISPLAY_LAYER` 内部实现职责；不得把场景内部子步骤提升为全局执行阶段。

场景内显示层沿用同一条 V0-V5 链。主效果图只冻结基础场景与 persistent/HUD，transient 层按必需状态分别提供绑定宿主场景、遮罩/层级和当前状态的 contextual effect image。V2 确认显示层拆解方案，V4 确认宿主上下文的草图组合，V5 提交正式打开→交互→关闭/恢复轨迹。

生成式位图生产合同贯穿 V2-V5：`independent-production` 与 `generate-now` 不推断具体生成器；每个区域必须完成 `state_analysis`，并让 `expected_assets` 逐唯一 `component_id × required state_id` 对应独立位图。V3 必须审计 `production_contract_audit` 及逐部件 `component_usages`，V5 再绑定 F3 runtime replay、非空 freshness-bound fidelity cases、实际消费及无未批准替换。

每个 V2 布局候选目录必须包含同批标准 PNG、节点 JSON、决策 JSON、离线 `review.html` 和生成结果 JSON；页面按确认元素顺序展示真实参考图及同坐标父子高亮，但只属于候选审阅，不写入确认或业务状态。独立布局 confirmation、decision 和 receipt 必须绑定 `layout_review_file`/SHA/identity、`layout_nodes_file`/SHA 以及原有布局和上游身份字段。具体模板和文件门见[离线布局审阅产物](../../threejs-game-ui-layout/references/layout-review-artifacts.md)。

## 统一门

F0-F4、任务范围、高影响操作批准和失败处置以[控制模型](../../threejs-game-workflow-control/references/control-model.md)与[状态、阶段与停止门](../../threejs-game-workflow-control/references/state-gates.md)为唯一来源。本领域只提交视觉领域 F2、当前候选的 F3 证据，以及与 V2/V3/V4/V5 产物的绑定关系；机器检查不能替代两次 V2 确认。

冻结前候选图、临时提示和评审草稿保持 transient；冻结后记录原图、候选 ID、SHA、时间及 scene/state。V1/V2/V5 沿用同一生产 Scene 骨架；fidelity/parity case 必须绑定目标/候选 SHA、适用的复现条件、合同/基线版本、双方证据、容差、例外和结论。默认 `visual_validation.mode=usability` 使用代表性视口/状态并检查关系、可读性、边界和交互；只有 `exact` 或明确需求时才要求完整矩阵和严格差异。上游事实或当前受影响候选身份变化才使对应案例失效。

## 失效与返回

缺字段、路径、对象绑定或可补证据问题在当前阶段 `repair`；上游事实未变的生产、运行态或机器证据问题在当前门 `revalidate`。只有上游事实失效、任务范围真实变化或硬门将被绕过时才 `return` 到 V1/V2/V3 中最早受影响阶段；普通候选身份变化、路径修正和 V3/V5 候选/diff 正常演进不得使 V2 拆解确认失效。
