# 运行态验证与最终交付

`runtime-validate` 只接受 `spine-runtime-validation/2.0` 结构化报告。用途必须明确为 `optional-2d-hud` 或 `optional-2d-billboard`，并将 `integration_adapter.mode` 标记为 `project-specific`。three.js 不提供内置 Spine Runtime 或 SpineGameObject；报告必须来自目标项目专门实现的适配器，不能把本 Skill 的图集处理能力写成 three.js 原生 Spine 支持。

适配器验证需覆盖目标 Spine Runtime 解析、动态读取 SkeletonData 的动画全集、每个动画切换成功、Idle 默认循环且其他动作单次、纹理缺失/锚点漂移/Mesh 拉伸/闪烁/裁剪检查，并提供真实 Bone/Slot/Animation/Atlas Page/Region 摘要。`target_runtime_parse` 必须记录真实 producer、runtime package/version、command 或 URL、本次运行原始日志路径和 SHA-256；缺少项目适配器实现或真实证据时不得通过验证。

报告的 `build_binding` 必须等于本次 `pack` 生成的 Atlas/Skeleton/每 Page SHA、全部批次 acceptance fingerprint 和总 fingerprint；截图、浏览器日志、Runtime 原始日志和结构化报告都绑定同一个 `validation_run_id`。旧构建或旧验证报告不能复用。

报告还必须包含诊断页 URL、浏览器验证记录、桌面截图和约 390px 移动端截图；每个文件都绑定 SHA-256。截图不能替代结构化字段，任意一张图片也不能直接驱动 `finalize`。只有 `runtime-validate` 通过后才允许 `finalize`，`verify` 会重新计算报告和全部证据哈希。

`report` 生成 `spine-reskin-final/2.0`，包括批次数量/Region 数量、Atlas 完整性、Skeleton 升级结果、Bone/Slot/Attachment/Mesh/Animation 统计、Atlas/Page/Skeleton 哈希、全部 Cell 状态、项目适配器与可选 2D 用途、网页地址、全动画切换结果、桌面/移动截图和验证结果。默认交付为独立验证候选；可将最终产物标记为 `optional-2d-hud-billboard-asset`，但进入目标游戏仍须由项目专门适配器接入和验证。
