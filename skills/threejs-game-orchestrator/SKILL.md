---
name: threejs-game-orchestrator
description: three.js 游戏领域编排角色；在全局控制面已建立 Work Item 后协调各领域交付，不拥有全局状态或审批账本。
---

# three.js 游戏编排

以 [`threejs-game-workflow-control`](../threejs-game-workflow-control/SKILL.md) 为唯一全局状态、风险门和任务范围权威。本 Skill 负责拆分领域工作、冻结交接物、收集证据并回到控制面，不批准操作、不扩展范围、不创建第二套状态机。

## 最短流程

用户先按[`simplified-workflow.md`](../threejs-game-workflow-control/references/simplified-workflow.md)理解六阶段项目视图：需求与范围 → 全局基线 → 基础工程 → 逐场景生产 → 全局集成验证 → 发布；单场景按场景定义 → 拆解确认 → 资源与组合验收 → 正式实现与运行验收理解。该视图不改变 G0-G3、V0-V5、A0-A6、F0-F4 或证据硬门。

1. 读取 Work Item、当前任务说明、当前基线和适用状态门；需要字段时按需读取 [`quality-gates.md`](references/quality-gates.md)、[`module-decomposition.md`](references/module-decomposition.md)、[`game-implementation.md`](references/game-implementation.md)、[`delivery-artifacts.md`](references/delivery-artifacts.md) 等 reference。
2. 先提交最小领域提议和验收边界，完成审查后由控制面运行 `check`；已有入口、调用链、任务范围和风险事实足够时停止探索。
3. A3 实施前冻结绑定当前任务范围、基线、文件所有权、执行单元、验收命令和停止条件的实施包；实施后记录候选变更审计并提交当前候选验证证据。
4. 领域交付只在当前任务路径内进行；任务内方案、路径或资源清单变化时更新计划并重验受影响部分，需求或范围真实变化时提交 Change Request；最终回到控制面运行 `run`/`check`，由控制面推进状态。
5. 阶段验收完成后，执行代理按[阶段收尾与 Git 提交](../threejs-game-workflow-control/SKILL.md#阶段收尾与-git-提交)自动维护必要的 `.gitignore` 并提交本次任务文件，记录提交哈希后交接；并行任务由主代理统一收尾，子代理不各自提交共享工作区。

## 交付边界

- 记录和中间产物整理交给 [`threejs-game-artifact-cleanup`](../threejs-game-artifact-cleanup/SKILL.md)：阶段收尾仅清理本任务可再生成且无引用的临时文件，跨任务历史清理须在用户指定范围内另行规划，保留审批、返工及有效证据依赖链。
- 制作、架构、玩法、视觉、资源、音频、数值、QA、性能和发布工作均只能提议、审查或在当前任务内修改。
- A0-A3 依据当前用户任务；无外部副作用的本地 A4 集成可按任务执行。外部写入、付费、真机、破坏性或外部删除和发布由控制面建立精确 pending 并等待显式批准，本 Skill 不执行这些动作。
- V0→V1→V2→V3→V4→V5、全局静态基线、场景拆解确认和高保真前置继续使用控制面的不可绕过证据门；领域文档只补充本领域事实。
- 不覆盖并行代理的修改，不自动回滚共享工作区；启动本地验证服务前先按 [`local-service-validation.md`](references/local-service-validation.md) 查找可复用健康实例。

## 视觉与场景

效果图还原和正式 Scene 接入属于当前场景 Work Item；常驻 HUD 随场景闭环。modal/popup 等弹窗按[独立工作项规则](../threejs-game-workflow-control/references/control-model.md#弹窗工作项与场景解耦)另建 DISPLAY_LAYER Work Item，独立提交宿主上下文、组件/状态、布局合同和运行态证据，不影响大厅或其他宿主场景验收。

场景 V2 的布局交付必须同时提供标准布局 PNG、`layout-nodes.json`、`layout-decision.json`、自包含 `review.html` 和 `generation-result.json`，并在独立布局确认及场景根计划中绑定同批参考、拆解、决策、节点、PNG 和审阅页 SHA。屏幕 UI 还按[ThreeJS UI 节点组织](../threejs-game-ui-layout/references/layout-hierarchy.md)在 V1 定义根层级，在 V2 确认父级职责与 `ui_layout` 字段，在 V4 草图中检查职责、输入和裁切边界，在 V5 验证视口变化下的运行结果。编排只引用[离线布局审阅产物](../threejs-game-ui-layout/references/layout-review-artifacts.md)的通用规则，不为场景手写审阅页；页面候选状态不等于人工确认。

## 状态与返工

本领域不直接迁移全局状态。证据失败优先原地 `repair`，上游事实未变时 `revalidate`，只有上游事实失效、任务范围真实变化或硬门将被绕过时才按最小范围 `return`；普通候选身份变化不触发回退，已确认事实不重复搜索或推翻。

三维项目基础采用 [运行基础](../threejs-game-runtime/SKILL.md)；正式三维资源交给 [模型管线](../threejs-game-model-pipeline/SKILL.md)，按实际玩法采用 [插件方案](../threejs-game-plugins/SKILL.md)。固定视角效果图与 HUD 二维布局不能代替世界模型、相机和碰撞数据。
