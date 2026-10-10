# 简化工作流视图

本文件是面向用户的工作流入口。它把项目展示为六个阶段、把单场景视觉生命周期展示为五步，帮助用户理解当前任务和下一项工作。普通任务直接依据用户当前指令推进，任务内方案、路径、资源清单和测试范围可随实施更新；不要求独立授权记录或 F0 授权有效门。它只是只读投影，不写回 Work Item，也不替代 `globalState`、G0-G3、V0-V5、A0-A6、F0-F4、审批账本、证据哈希或任何 Schema。

## 六阶段项目视图

| 阶段 ID | 用户阶段 | 聚合产物 | 内部映射 |
| --- | --- | --- | --- |
| `requirements-scope` | 需求与范围 | Work Item 摘要、用户目标、范围、基线和验收清单 | `INTAKE` |
| `global-baseline` | 全局基线 | GDD、TDD、全局视觉基线、任务范围和全局选择证据 | `G0`、`BASELINE`、`PROPOSAL`、`REVIEW` |
| `foundation-engineering` | 基础工程 | foundation-only 实施包、`SHARED`/`MODULE` 基础代码和验证证据 | 仅含 `SHARED`/`MODULE` 的实施包；纯工程包可在全局选图前实施，视觉依赖包仍受全局基线门约束 |
| `scene-production` | 场景与弹窗生产 | 场景或独立弹窗的规格、V2 拆解方案、V3 正式资源、V4 草图确认、正式实现和 V5 运行验收证据 | `V0`-`V5`，或独立包含 `SCENE`/`DISPLAY_LAYER` 的实施包 |
| `global-integration-validation` | 全局集成验证 | 跨场景集成候选、导航/存档/音频/性能/响应式回归和联合证据 | `G2`、`INTEGRATING`，或纯 `INTEGRATION` 实施包 |
| `release` | 发布 | 独立发布 Work Item、可复现发布包、平台/合规/回滚资料和精确审批回执 | `G3`、`RELEASE_APPROVAL_REQUIRED`、`RELEASING` 或发布 Work Item |

判断有冲突时按“发布 → 集成 → foundation-only → 场景 → 需求/基线”的固定顺序检查；包内单元类型跨越不相容阶段、视觉阶段声明冲突或无法识别时返回 `unknown`，同时保留内部 `stage`，不伪造进度。foundation-only 仅按单元类型识别范围，是否等待全局选图由包内视觉合同/资产生产字段和正式视觉行为决定。

基础工程阶段必须按[基础显示约束](../../threejs-game-orchestrator/references/game-implementation.md#基础显示约束)完成游戏全屏显示；目标包含 Android 时，启动首帧、启动画面切换及运行全程均不得显示窗口标题栏或 ActionBar，并在后台返回和窗口焦点恢复后保持沉浸式全屏。此项属于基础平台能力，不等待场景视觉生产；无实际运行证据的验收项须明确标记未验证，真机验收仍需用户明确授权。

音频生命周期也在基础工程阶段完成：按[后台暂停与恢复约束](../../threejs-game-audio/SKILL.md#后台暂停与恢复约束)，进入后台暂停播放，返回前台后从原位置继续；手动暂停、停止或销毁的音频不自动恢复，后台新请求不补播。

基础工程同时按[游戏项目目录规范](../../threejs-game-architecture/references/project-structure.md)建立实际需要的目录：入口与基础服务分层，场景内部按功能聚合，平台适配、独立显示层、正式资源、源素材、测试和生成产物分清归属；路径与所有权在 TDD 和实施包中明确，不预建空壳目录。

## 五步单场景视图

| 步骤 ID | 用户步骤 | 内部阶段 | 关键产物 |
| --- | --- | --- | --- |
| `scene-definition` | 场景定义 | `V0`/`V1` | 场景功能契约、scene master/reference target、宿主上下文图、视觉合同、布局/容差合同和初步还原草案 |
| `direction-confirmation` | 拆解确认 | `V2` | 拆解图、技术 JSON、coverage、component×state、父子/停靠/对齐/显示层事实和生产方案 |
| `production-ready` | 正式资源验收 | `V3` | 已验收正式资源、组件状态、资产文件身份与生产记录 |
| `page-sketch` | 页面还原草图 | `V4` | `page-sketch.json`、正式资源预览、显示树、坐标调整和绑定内容 SHA 的人工确认 |
| `formal-implementation-runtime-validation` | 正式实现与运行验收 | `V5` | 正式 `SCENE`/`DISPLAY_LAYER` 实现、运行轨迹、视觉/功能联合验收、响应式和性能证据 |

V2→V3→V4→V5 在同一场景 Work Item 内通过显式阶段入口相邻推进。每个入口默认写入 `in-progress`。V3 正式资源验收后进入 V4，草图保存仍留在 V4；用户确认当前草图后写入 `v4-page-sketch-confirmed` 并绑定文件 SHA，才允许进入 V5 正式功能实施。V5 运行态证据闭合后提交 `v5-runtime-integration-candidate`。视图直接消费真实视觉阶段，实施包状态不能提前跳过草图阶段。

V4 草图页面读取一份草图数据和 V3 正式资源，以冻结效果图为可调透明度的对照底图，展示显示树、节点选择与坐标调整；移动父节点带动子孙。保存与确认分别执行，任何后续修改使确认失效。V5 正式 Scene 消费同一确认文件，记录 `pageSketchSha256`。数据、页面和确认合同见[页面还原草图作业](../../threejs-game-asset-integration/references/visual-alignment-authoring.md)。

场景路线还需在 V1 确定[显示对象默认中心锚点与渲染分层](../../threejs-game-ui-layout/references/display-object-layering.md)：对象例外、背景/世界/特效/HUD/瞬态层顺序和每层的坐标、输入、生命周期归属。V2 固化布局与显示层合同，V4 检查草图同屏合成，V5 用遮挡、命中和恢复轨迹验证；渲染分层不新增全局阶段，也不把普通世界层误记为独立 `DISPLAY_LAYER` Work Item。

### 序列帧路线映射

帧动画不新增全局状态机。全局 V2 根据主体、动作、镜头、时长、画幅和背景要求生成视频提示词，并等待真实视频文件；全局 V3 接收视频后按目标 FPS、尺寸和是否去背景抽帧，输出图集、报告与网页预览；全局 V5 完成 ThreeJS 运行接入。重新生成视频或调整抽帧参数后，须重做图集与预览。详见[帧动画工作流接入合同](../../threejs-frame-animation/references/workflow-integration.md)。

### Blender 模型路线映射

生成三维模型在当前 Work Item 内执行：V1 生成或复用参考图 → V2 拆解一致多视图 → V3 使用 Blender MCP 控面数建模并制作 AI 纹理与有效法线贴图 → V3 人工审查模型。图像工作交给 `image_generator`，实际模型和材质制作使用 Blender MCP。人工确认绑定当前模型与贴图文件身份后，才作为正式资源进入适用的 V4 场景组合/草图与 V5 ThreeJS 接入；静态验收通过不表示人工模型审查完成。详见[Blender 模型生产合同](../../threejs-game-model-pipeline/references/blender-model-production.md)。该路线不新增状态机或聊天，不自动执行截图与真机验收。

例如，V2 完成后可在同一 Work Item 上执行：

```powershell
node <skill-dir>/scripts/workflow-control.mjs transition --work-item <work-item> --to REVIEW --visual-stage V3
```

V3 证据闭合后显式进入 V4 页面还原草图。用户完成草图确认并登记 `visualStageEvidenceRefs.V4` 后，提交 `--visual-stage-state v4-page-sketch-confirmed`；随后显式进入 V5 并激活正式实施包。V5 实施及运行证据闭合后提交 `--visual-stage-state v5-runtime-integration-candidate`，再进入 `VALIDATING → PASSED → COMPLETE`。阶段入口使用的全局状态与命令参数以控制面当前校验结果为准，禁止直接改状态字段跨过确认门。

没有可识别的 `V0`-`V5` 声明时，生产阶段仍可显示为“场景与弹窗生产”，但 `sceneStepId` 和 `sceneStepLabel` 必须为 `null`；这表示缺少可投影的步骤，不表示任何视觉门已通过。

## CLI 输出

`run` 连续推进已满足条件的安全内部状态，每步重新校验并在 `changed` 中记录实际迁移。进入 `IMPLEMENTING`、缺少包/审计/证据、遇到用户决定或操作批准时停止；它不执行实施或测试，也不选择视觉阶段或 `RETURN`。视觉阶段仍使用上述显式 `transition` 入口，底层 `advance` 保持单步诊断语义。

`run`、`check`、`status` 的 JSON 顶层字段保持 `status`、`stage`、`changed`、`blocking`、`next`、`metadata` 不变。`stage` 继续使用内部 `${stageId}/${globalState}`；`metadata.workflowView` 只增加稳定的 `phaseId`、`phaseLabel`、`sceneStepId`、`sceneStepLabel` 四个展示字段。

默认文本优先显示简化阶段，例如：

```text
阶段：场景与弹窗生产 · 拆解确认
下一步：完成当前待执行单元
```

下一步文案使用用户可理解的聚合称呼，例如“更新当前阶段实施包”“完成当前待执行单元”“记录当前候选变更审计”“提交当前候选验证证据”“准备正式集成审批”。这些文案只改变显示，不改变原有条件、状态迁移或门禁逻辑。测试等级先按改动风险推荐并说明理由、覆盖和命令，再自动执行适用等级，不等待人工选择。

## 门禁边界

简化视图不改变关键门：V2 仍是还原方案与生产边界，V3 是正式资源验收边界，V4 是草图保存与人工确认边界，V5 负责正式还原及真实运行态联合验收；G2 只验证完整候选，G3 仍必须是独立发布 Work Item；涉及外部写入、付费、真机、破坏性或外部删除、发布副作用的 A4-A6 操作仍按明确对象和影响逐项审批，无副作用本地 A4 不因等级标签额外审批；F0-F4、证据文件路径和 SHA 仍由控制面校验。普通视觉验证默认使用 `visual_validation.mode=usability`，允许位置、尺寸、边距和换行有合理偏差，重点检查越界、裁切、遮挡、可读性和交互；只有明确精确需求时才使用 `exact`，启用像素容差或全视口/全状态矩阵。缺少非关键元数据优先提醒并自动补齐，局部修改只重验受影响范围。
