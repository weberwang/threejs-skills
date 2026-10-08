---
name: threejs-gameplay-development
description: three.js Web 3D 游戏的玩法开发角色。用于依据 GDD、TDD、数值设计、参考输入实现、还原、重构或验收核心循环、场景、交互、状态与可测试功能，并与美术协作完成正式视觉集成。
---

# three.js 玩法开发

全局阶段、视觉硬门和场景前置以[控制模型](../threejs-game-workflow-control/references/control-model.md)、[状态、阶段与停止门](../threejs-game-workflow-control/references/state-gates.md)及对应 Schema 为准。本领域只负责玩法规则、状态、交互和动态验收；场景使用同一 Work Item 的 V1→V5 链，V2 的拆解与布局确认分别执行。

## 全局控制接入

控制面边界：可提议、可审查、可在当前用户任务的 Work Item 范围内修改，且必须回到 `$threejs-game-workflow-control` 审计和状态迁移；仅涉及外部写入、付费、真机、破坏性或外部删除、发布副作用的 A4-A6 操作请求批准。

本领域可提议、审查，并在当前用户任务、冻结 Implementation Package、A 等级与路径范围内修改；任何实现前运行 [`threejs-game-workflow-control`](../threejs-game-workflow-control/SKILL.md) preflight，实施后执行 diff-audit 与 evidence-check，再回总控审计和状态迁移；仅涉及外部写入、付费、真机、破坏性或外部删除、发布副作用的 A4-A6 操作请求批准。

## 所有权

玩法独占玩法规则、状态、碰撞、交互代码、功能灰盒和低保真清理。美术可以拥有纯表现层资源配置、布局/表现预制数据和视觉集成调整，但不得改变玩法规则、碰撞语义或状态所有权；V5 由玩法与美术协作完成运行态联合验收。发现职责、公开契约、状态所有权或依赖方向变化时停止受影响实现，返回模块审计和风险触发的专业审核；只有仍存在受保护取舍时 grilling。

## 实现

1. 读取 GDD、TDD、控制面、总控的审核漏斗和游戏实现规则。视觉任务同时读取视觉质量门、玩法视觉契约；UI 读取 [`threejs-game-ui-layout`](../threejs-game-ui-layout/SKILL.md)；参考还原读取视觉还原规则。
2. 按当前场景 Work Item 的阶段门推进玩法交付：V1 冻结功能规格与必要灰盒，V2 消费已确认的拆解和布局事实，V3 验收正式资源，V4 保存并确认草图，V5 实现正式 `SCENE`/`DISPLAY_LAYER`，V5 完成功能与视觉联合验收。foundation-only 的基础能力和跨场景 `INTEGRATION` 由控制面计划调度；本领域不得把玩法实现提前放入基础包或另建场景生命周期。
3. 对当前场景明确可观察玩家行为、状态迁移、时序、反馈、成功/失败和异常恢复。截图无法证明的行为标为待定义，不自行推断。
4. 只在 V1 需要证明结构、交互或节奏时建立隔离的可运行灰盒，记录稳定 ID、层级、交互区和资源依赖。已冻结结构不为形式重复灰盒；灰盒不得作为场景完成证据。
5. foundation-only 阶段先完成场景无关的 `SHARED`/`MODULE`；场景 V4 草图确认后在 V5 启动正式 SCENE 代码。场景实现只闭环玩法、正式资源、场景自有 UI/常驻 HUD、清理和场景证据。modal/popup 等弹窗必须拆为独立 DISPLAY_LAYER Work Item，读取自己的 V2/V3 证据并在自身 V5 验收；弹窗不属于大厅或其他宿主场景实现，也不阻断其验收。`hostSceneId` 仅用于公开接口和运行上下文接线。
6. 只使用绑定当前 `scene_id` 或合规 `shared` 且 V3 `accepted` 的资源进入正式功能实现。用独立 Object3D/Group、明确的相机与材质结构化装配，按[显示对象锚点与显示层分层](../threejs-game-ui-layout/references/display-object-layering.md)区分模型 pivot、碰撞代理和 Sprite.center，记录单位、坐标变换与例外，并声明背景、世界、特效、HUD 与瞬态层的合成顺序和输入归属；UI 从 [`threejs-game-ui-layout`](../threejs-game-ui-layout/SKILL.md) 布局契约计算，区分坐标空间、资源 origin、布局停靠点与动画偏移，并在视口、安全区、方向、状态和内容变化后通过唯一入口幂等重排。普通测试验证相对关系，不把绝对屏幕坐标当作通用验收标准。
7. 在 V5 与美术重放动态可玩轨迹，检查识别、预警、命中/受击/奖励反馈、遮挡、响应式、性能和功能契约。忠实还原在冻结目标视口/状态提供同条件完整 viewport 并更新逐状态、逐区域忠实度矩阵，其他视口验证布局关系不变量；玩法处理规则/交互失败，美术处理纯表现失败，跨域问题进入 F3。
8. 正式结构通过后，玩法清除低保真代码、纹理键、资源、fallback 和运行时引用，重新执行测试与生产构建。场景功能、资源、接入、场景自有显示层、占位清理和验证关闭后即可标记当前场景完成；独立弹窗另行验收。

## 证据

截图对比记录相同视口、设备像素比、状态、操作轨迹、语言、时间点、ROI、预先定义的项目容差、稳定帧和遮罩说明。完整 viewport 为主证据，ROI、叠加和像素差仅作补充；生成式内容、动画和 VFX 不得只靠像素差判断。未解释或超容差差异、缺同条件双方证据、缺已批准例外或仅凭主观结论不得报告完成；源码、固定坐标、类型检查、构建成功和元素存在只能证明结构或工程状态。

F0 只校验任务范围与流程，F1 核对既定规格，F2 由非作者验证玩法领域质量，F3 绑定当前候选工程证据，F4 只做带副作用的 A4-A6 集成/发布操作批准。行为或验收变化建立 Change Request 并记录用户决定。新增或修改的类、函数、实体及复杂逻辑使用简体中文注释。

三维规则与模拟实现先读 [游戏运行基础](../threejs-game-runtime/SKILL.md)，模型与骨骼资源先读 [模型管线](../threejs-game-model-pipeline/SKILL.md)，物理与导航按 [插件方案](../threejs-game-plugins/SKILL.md)选择。
