# UI 布局阶段门

本参考只收紧布局领域。全局状态、A4-A6 审批、F0-F4 和结构化文件以 [`threejs-game-workflow-control`](../../threejs-game-workflow-control/SKILL.md) 为唯一权威；普通任务不要求独立授权记录或 F0 授权有效门。

## 统一门

- F0：校验 Work Item、当前任务范围、A 等级、路径、基线、模块门与停止门；只有带外部写入、付费、真机、破坏性或外部删除、发布副作用的 A4-A6 操作检查对应审批。
- F1：核对布局实现与已批准需求、布局合同、V 阶段及 Implementation Package 一致。
- F2：独立验证坐标空间、参照关系、尺寸、断点、安全区、滚动、文案和视觉层级质量。
- F3：实际运行合同验证器、类型检查、测试、构建与响应式测量，并生成绑定当前 diff 的 Evidence Manifest。
- F4：无副作用的本地布局集成不进入额外批准门。涉及控制面列明的受保护副作用时，由控制面处理精确批准；布局技能仅提交候选与证据。`AUTO` 不替代视觉人工确认，统一遵循[控制面不可绕过约束](../../threejs-game-workflow-control/SKILL.md#不可绕过约束)。

effect-image 例外：V1–V3 必须先验证 `scene_reconstruction_contract`、必填 `display_layer_planning` 和 target-bound layout binding；scene master 只包含基础场景与常驻 HUD，瞬态层必须按 required state 提供宿主场景上下文效果图。V4 必须有已保存且人工确认的页面草图，V5/F2 必须消费与 `visual_validation.mode` 匹配的 fidelity 证据，并重放显示层打开→交互→关闭/恢复轨迹。默认 `usability` 检查关系、可读性和交互，不因小幅位置/尺寸差异失败；只有 `exact` 或明确精确需求时才要求逐区域严格 delta。旧通用布局或“资源 loaded/used”工程证据只能作为子门，不能单独产生视觉 PASS 或 COMPLETE。

## 阶段映射

## 高分屏与响应式阶段门

- V1：Implementation Package/布局合同必须填写 `logicalViewportSpace`、`designResolutionPolicy`、`canvasBackingPolicy`、`runtimeDprPolicy`、`maxRuntimeDpr=2`、`scaleMode`、Camera viewport/zoom/origin、输入坐标、安全区、resize、方向、文字/资源分辨率和性能预算。竖屏 1080×1920 按高、横屏 1920×1080 按宽适配，Canvas 填满视口且背景等比 cover；还需说明物理 backing、`gameSize`、弹窗宿主继承、监听清理及显式降级策略。
- V2：机器门确认布局节点使用逻辑 CSS 像素，不能依赖物理像素硬编码；按[节点组织规则](layout-hierarchy.md)核对 `ui_layout` 与确认拆解的父级、容器职责、尺寸、溢出、安全区和唯一输入目标一致；确认 HUD/弹窗与宿主 Scene、Camera/输入合同的关系；确认资源生产 DPR=2 与运行时 DPR 动态封顶 2 分离，资源生产分辨率覆盖 intended scale。
- V3：每项资源登记逻辑显示范围、最大 intended scale、生产分辨率、source/runtime 尺寸、代表性视口放大风险和资源不足阻断条件；简单插值放大不能作为清晰度修复，性能预算必须绑定机器/结果证据。
- V4：生成并读取草图 JSON，核对正式资源、显示树、父子移动和实际文件保存；用户确认绑定内容 SHA。未确认或来源/资源漂移时禁止 V5 正式实施。
- V5：消费同一 V4 确认草图并记录 `pageSketchSha256`，提交真实运行证据，记录 `requiredRuntimeEvidence` 全部字段、`designTransform` 主轴比例和可见逻辑区域、raw/effective DPR、CSS/backing 尺寸、Camera、背景完整覆盖、输入命中、resize 轨迹和候选身份。默认 usability 覆盖四类代表性视口、DPR 1/1.25或1.5/2/大于2封顶、连续 resize、DPR 降至1、同 DPR 再 resize，以及独立 DISPLAY_LAYER 的打开/交互/resize/关闭/宿主恢复；缺测量为 `unverified`。

`FIT` 和 `NONE` 不满足填屏约束；`RESIZE` 或等效 `custom` 还必须配合实测变换、背景覆盖、输入命中及连续 resize 证据，不能单靠模式名称、构建、单测或静态截图驱动 V5 PASS。

- V1/V2 处于 `PROPOSAL`、`REVIEW`；V2 固定先生成并人工确认拆解图和技术 JSON，再由智能视觉判断生成逐元素双轴对齐决策，最后消费已确认元素与该决策在同一候选目录生成布局标注 PNG、节点 JSON、决策 JSON、离线 `review.html` 和生成结果。布局决策或任一布局产物人工修改后必须重新生成并通过独立 `layout-annotation-confirmation/1.0`；缺失视觉决策时不得按距离兜底。审阅页合同见[离线布局审阅产物](layout-review-artifacts.md)。
- V3/V5 处于 `IMPLEMENTING`、`VALIDATING`、`PASSED`、`INTEGRATING`。
- G0-G3 保留为 `stageId`，不能改变全局状态。

合同验证通过不能覆盖 F0 任务范围越界或 F1 规格漂移。合同、候选、基线、视口输入或代码/diff 指纹变化后，只使受影响证据失效；任务内路径、方案和资源清单更新可在当前门修复/重验。
