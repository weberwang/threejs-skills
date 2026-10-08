---
name: threejs-game-qa-performance
description: three.js Web 3D 游戏的测试与性能角色。用于功能、参考还原、动态玩法视觉、HUD/场景、浏览器兼容、资源预算、渲染/模拟性能、稳定性和发布候选验证，并产出可复现证据。
---

# three.js 测试与性能

## 全局控制接入

控制面边界：可提议、可审查、可在当前用户任务的 Work Item 范围内修改，且必须回到 `$threejs-game-workflow-control` 风险门。

本领域可提议验证计划并审查候选，可在当前用户任务、A 等级和路径范围内写测试或证据；结果回到 [`threejs-game-workflow-control`](../threejs-game-workflow-control/SKILL.md) 审计和状态迁移。测试通过不能覆盖任务范围、路径、基线或 A4-A6 操作批准失败。

证据优先于主观结论。项目未定义量化指标时只报告实测与决策缺口，不自造通用阈值。

1. 读取 Work Item、质量门、TDD、qa-plan 和当前候选。F0 校验任务范围与流程，F1 校验规格一致，F2 形成独立 QA 领域结论，F3 绑定实际命令、环境、数据源、文件、判定与未覆盖项；缺少独立审查时标记未验证。
2. 启动服务前检查同一项目、服务类型、模式、端口和健康状态；存在健康实例时复用，不终止归属不明的进程。
3. 视觉任务核对 V0 分流及 V1/V2 条件门。Work Item 指定效果图为还原目标时，QA 按[视觉还原](../threejs-game-asset-integration/references/visual-reconstruction.md)核对冻结视觉目标、对比条件和必要的区域关系；`visual_validation.mode` 默认是 `usability`，允许合理的位置、尺寸、边距和换行差异，重点检查越界、裁切、关键遮挡、不可读和交互失效。effect-image 不自动启用 `exact`；只有用户明确要求精确还原时才使用 `exact` 并核对严格容差与差异证据。
4. 适用 V1 时检查视觉目标、信息层级、草图/灰盒、交互、布局、失败恢复与预算。已有明确冻结事实时按当前模式验证；任务内专业修复、工程适配和资源更新可直接更新计划并重验受影响部分。只有改变产品方向、玩法语义或冻结上游事实时才请求一次 `USER_DECISION`，不把普通细节偏差升级为授权阻塞。
5. 普通资产/布局允许还原 `not-applicable`。效果图在 V2 `v2-ready` 后核对目标、合同回对、带 bounds 的 coverage 和条件编号证据；V3 还必须逐 `annotation_number/region_id` 记录显式 `production_method`、`delivery_kind`、`image_generation_required`、`generation_record_required`、`substitution_policy` 与 `expected_assets`。V3 实施包的 `visualProductionUnits` 必须与 coverage 一一映射，输出路径、所有权和格式不得冲突。
6. V3 必须提交 `production_contract_audit`，逐区域核对预期方法与实际方法、交付类型、输出文件、生成/提示词记录和运行时消费；F2 只接受 `validationMode=MACHINE` 的当前身份机器验证事实。V5 再要求运行测量、F3 runtime replay、freshness-bound fidelity cases、实际消费和无未批准替换；仅上游事实或当前受影响候选身份变化会使对应旧证据失效，其他单元的路径级结果继续有效，不重复请求无关拆解和布局确认。
7. 同条件截图记录 CSS 视口、Canvas backing、raw/effective DPR、Renderer 类型、Camera/FOV/姿态、世界与 HUD 状态、玩家轨迹、语言、随机种子、时间点/稳定帧、ROI 和遮罩理由。默认 `usability` 使用代表性视口与关键状态，检查轮廓、比例、可读性、遮挡、交互和玩法关系；世界构图用相机/关卡事实审核，HUD 用布局合同审核。完整视口、严格容差、逐区域 delta、叠加/像素差及全状态矩阵仅在 `exact` 或项目明确要求时启用；生成式内容、动画和 VFX 不得只靠像素差判断。
8. HUD 读取 [`threejs-game-ui-layout`](../threejs-game-ui-layout/SKILL.md) 合同，并按 [响应式视觉验证](references/responsive-visual-validation.md) 采集真实稳定帧。默认 `usability` 按已声明的 `orientationPolicy.allowed` 覆盖代表 CSS 视口；项目没有该字段时按实际目标浏览器视口选择。仍需覆盖窄/宽尺寸、有效 DPR 1、中间值与 2 封顶、raw DPR 大于 2 时的封顶、同页连续 resize、DPR 不变 resize 和代表性弹窗轨迹。固定设计分辨率只验证 HUD；每个样例记录 CSS rect、实际 Canvas backing、Renderer、相机投影、输入 NDC/射线命中、安全区、关键 UI、截图及 resize 轨迹。世界对象记录 world contract、关卡/相机状态和世界空间命中，不得以二维像素误差代替。正式报告绑定候选 SHA、scene/state、布局或 world contract 版本和视觉基线；缺测量为 `unverified`，宿主场景证据不能代替独立 DISPLAY_LAYER。
9. V5 检查结构化集成、玩法所有权、低保真零引用、性能峰值和功能契约，并提交动态证据供 F3。修订候选重跑受影响 F0-F3；只有带外部写入、付费、真机、破坏性或外部删除、发布副作用的 A4-A6 操作重跑 F4 批准门。模块边界变化仅有实质取舍时进入 grilling。
10. 共享基础完成后验证代表性浏览器/Vite 启动、WebGL2 Renderer、Boot/首场景、glTF/纹理资源加载和已选能力插件；关键玩法流完成后在声明的目标浏览器与硬件档验证核心循环、固定步模拟、失败恢复和 GPU 资源清理；只有最终集成/G3/release 才覆盖项目实际声明的完整浏览器/分发渠道矩阵。原生容器只有在项目采用时才列入矩阵。局部任务证据不得宣称全平台通过，不得自动发起真机验收。

没有可复现证据时标记“未验证”。性能结论至少区分主线程帧时间、固定步模拟耗时和可获得的 GPU 计时；记录 `renderer.info` 的 draw calls/triangles/geometries/textures、纹理显存估算、阴影贴图、透明过绘、加载/解码峰值和场景资源释放前后趋势。不得把对象移出 Scene 当作 GPU 释放证据，也不得用平均帧率掩盖长帧或最坏负载。V1/V2 条件门必须绑定当前候选；沉默、继续工作或旧决定不能替代真正需要的 `USER_DECISION`，用户决定也不能跳过 V2 拆解与 HUD 布局确认所需的确定性机器 F2。FIT 只证明等比不溢出，不证明满屏或 HUD 响应式重排；禁止用构建成功、元素存在或无控制台错误假通过。

可复用自动化脚本位于 `scripts/responsive-visual-validation.mjs`，纯计算测试位于 `scripts/responsive-visual-validation.test.mjs`。脚本通过 Node ESM 动态导入 Playwright；运行时从设备读取 DPR 并按 `dynamic-capped-2` 封顶，在同一页面通过 `setViewportSize` 调整视口并保留 resize 语义；有效声明必须为 `(0,2]`，原始 `deviceScaleFactor` 允许大于 2，报告同时保留原始值与封顶为 2 的有效值，零、负数、非有限数和字符串在验证前失败。默认报告输出代表性视口与关键状态；`exact` 模式或明确的全覆盖需求再输出完整页面截图、实测矩阵和结构化 JSON。
