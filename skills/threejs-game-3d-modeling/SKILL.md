---
name: threejs-game-3d-modeling
description: 使用 Blender MCP 为 three.js 游戏制作可追溯的正式静态 3D 几何或装饰背景烘焙源，覆盖网格结构、拓扑、法线、实际 UV、材质槽、按需 LOD/碰撞代理及符合既定路线的导出回读。适用于新建或修改模型几何；贴图、绑定动画、场景装配和运行验收沿用现有三维模型管线。
---

# three.js 游戏 3D 几何建模

把已确定的视觉与玩法规格制作成可编辑、可复查的正式静态几何；按当前 Work Item 将其交付为 three.js 运行模型，或仅作为明确要求烘焙装饰背景的源文件。开始正式建模前阅读[Blender MCP 建模流程](references/mcp-modeling-workflow.md)；涉及下游使用或修改时阅读[模型交接](references/model-handoff.md)；登记资源、安排阶段证据或进入运行接入时阅读[工作流接入](references/workflow-integration.md)。

范围、资源路径、执行权限、状态和风险门由唯一控制面 [threejs-game-workflow-control](../threejs-game-workflow-control/SKILL.md) 约束。本技能可提议、审查，并在当前 WorkItem（工作项）范围内修改；完成后回到控制面提交实际文件与证据，不另建或复制控制状态。本技能与[三维模型与关卡管线](../threejs-game-model-pipeline/SKILL.md)共用当前 Work Item、资源清单和 V0–V4 阶段。V1 冻结模型几何规格，V2 制作路线并在有用时做 blockout，V3 按 V0 分类交付正式模型或烘焙源并核验，只有运行模型在 V4 验证 GLB 的真实消费；不另建 Work Item、状态机或确认阶段。

## 职责与路由

- 本技能负责静态网格形体、结构、拓扑、法线策略、实际 UV 报告、材质槽结构，以及资产确有需要时的 LOD 与碰撞代理。Blockout 只用于比例、轮廓或玩法空间讨论，不能作为正式模型交付。
- 本技能不制作 PBR 贴图，不实现骨架、蒙皮权重或动作，不装配正式场景，也不负责 QA 放行。贴图、骨骼动画、three.js 场景消费和最终运行验收继续由现有模型管线负责。
- 实际几何建模必须委派 `agent_type=default`、`model=gpt-6.1-sol`、`reasoning_effort=max`、`fork_turns=none` 的建模子代理调用 Blender MCP；主代理负责规格、任务包、集成和最终验证。只有明确需要生成或编辑图片时才调用 `image_generator`。
- 源 `.blend` 保持只读；所有建模修改写入获准路径中的版本化派生文件。同一 `.blend`、MCP 会话和目标导出路径保持单一写者，修改与保存按顺序执行。使用 Blender MCP 前实时发现可用工具和参数，不假定固定命令、API 或导出能力。

目标使用正式模型但不改几何时，走现有模型管线的资源接入或优化流程；本技能只在当前 Work Item 明确包含几何生产或修改时承担建模职责。
