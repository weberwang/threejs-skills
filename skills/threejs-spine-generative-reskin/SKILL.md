---
name: threejs-spine-generative-reskin
description: 为 three.js 项目制作可选 2D HUD 或 billboard Spine 素材，执行可审计的 schema v3 换皮、Skeleton 结构审计、逐批人工锁定、Atlas 重建与项目专用适配器验证。
---

# three.js Spine 生成式换皮

本 Skill 只在已授权的 three.js Work Item 内使用，产物限于可选 2D HUD 或 billboard 素材，不承担三维角色主动画。它保留原 Skeleton、Attachment、锚点、Atlas Region 几何和 Mesh UV 语义；候选资源始终在独立诊断目录中验证。three.js 本身不内置 Spine Runtime；运行验证和任何项目接入都必须使用目标项目专门实现的 Spine 适配器，不能把候选资源直接描述成 three.js 原生 Spine 对象。

## 入口

```powershell
node <skill-dir>/scripts/spine_reskin_progress.mjs --help
```

正式原版目录可用 `inspect --asset-dir <原版资源目录>` 或 `init --asset-dir <原版资源目录>`；独立 Skeleton/Atlas/Page 会直接审计，Cocos `sp.SkeletonData` 的 `_atlasText`/`_skeletonJson` 会先导出到独立规范化候选目录，绝不改写源目录。`init` 必须同时传入控制面 manifest，绑定 Work Item、production contract 和适用的 V2 方案证据。

进度清单必须是 schema v3。所有会修改清单的命令使用跨进程锁和原子写入；禁止手动编辑状态伪造完成。详细规则见：

- [Skeleton 审计与升级](references/skeleton-upgrade.md)
- [批次计划与人工锁定](references/batch-review.md)
- [运行态验证与最终交付](references/runtime-validation.md)
- [状态、恢复与锁](references/progress-state.md)
- [Atlas 重建](references/atlas-rebuild.md)

## 固定流程

1. `inspect` 读取 Skeleton JSON 与 Atlas，输出版本、Bone、Slot、Skin、Attachment、Mesh、Animation、Page、Region 统计、attachment path 映射和 Mesh 顶点/三角形/UV 稳定哈希。
2. `init` 建立 schema v3 清单，记录所有源文件 SHA-256。低于目标 Runtime 时只接受外部官方工具生成的候选，使用 `upgrade-check` 比较结构投影；未通过目标 Runtime 解析证据前，任何批次命令都会阻断。
3. `freeze-contract` 冻结角色名、目标 Runtime、暗黑视觉方向、六项色板、材质语言、光向和默认 `strict_alpha=true`。首批前不得使用临时色板。
4. `plan-batches` 导入精确 Region 顺序、mode、alpha lock 和可选连续特效序列，机器校验全集覆盖、无重复/遗漏、Mesh 使用 `mesh-safe` 且锁 Alpha。
5. 按 `batch prepare → mark generated → batch review → 停止 → batch accept` 执行。`batch accept` 必须绑定当前审阅图 SHA、候选 SHA/fingerprint 和当前批次 revision；在刚展示且由 `--batch` 与 `--review-sha` 精确绑定的审阅上下文中，简短“确认”即可通过，也可使用当前批次对应的完整确认句（初始批次“确认第N批”、返工“确认重启版第N批”）。空白、无关或否定文本仍拒绝。回执是 V4 局部 `spine_batch_acceptance`，不是全局第二次视觉审批。返工使用 `batch reopen` 增加 revision，只影响当前批。
6. 所有批次 `ACCEPTED+locked` 后执行 `pack`。默认且正式固定 `padding=0`、`extrusion=0`，Page 名必须保持原名并且实际为 PNG；Atlas Page/Region 间空行格式由序列化器固定。
7. 使用 `runtime-validate` 提交 `spine-runtime-validation/2.0` 结构化报告，明确 `integration_adapter.mode=project-specific` 和用途 `optional-2d-hud` 或 `optional-2d-billboard`，并提供目标项目适配器的真实解析证据、动态动画全集、Idle 循环、纹理/锚点/Mesh/闪烁/裁剪检查、摘要、URL、桌面和约 390px 移动截图及 SHA。通过后才能 `finalize`，最后用 `report` 生成最终交付报告。该验证只覆盖 2D HUD/billboard 资源，不代表 three.js 自带 Spine 支持，也不授予三维角色动画或主游戏接入能力。

## 状态硬门

Cell 状态固定为：

```text
pending → generating → generated → validating → packing → packed → runtime_validating → completed
```

正式 Cell 必须是实际 PNG、含 Alpha、尺寸等于正向 Atlas Region；`alpha_lock=true` 时 Alpha 掩码像素级一致，Mesh 永远锁 Alpha。`constrained-redraw` 只有显式 `alpha_lock=false` 才允许使用。

## 全局视觉与批次确认边界

全局视觉阶段、状态和确认规则以 `threejs-game-workflow-control` 的[控制模型](../threejs-game-workflow-control/references/control-model.md)、[状态与门](../threejs-game-workflow-control/references/state-gates.md)及 Schema 为准。Spine 换皮中的方案提议、审查或审阅、批次锁定都必须在当前用户任务的既有 Work Item 范围内完成；本 Skill 只修改自身候选工件，不自行扩展任务范围或创建全局审批。任务内范围、方案或路径变化同步更新计划并重验受影响部分；需要改变产品方向、视觉方向或接入主游戏时，回到控制面重新审查。Spine 批次确认属于 V4 局部生产锁定回执，不进入 Approval Ledger，也不改变场景 V2 的拆解与布局确认。
