---
name: threejs-game-model-pipeline
description: 编排 three.js 模型的参考与多视图、正式几何交接、PBR/AI 贴图和人工审查，接入 glTF/GLB、骨骼动画、LOD、碰撞及资源生命周期；独立几何建模交给 threejs-game-3d-modeling。
---

# 三维模型与关卡管线

可提议、审查并在当前 Work Item 内修改资产与接入代码，完成后回到 [threejs-game-workflow-control](../threejs-game-workflow-control/SKILL.md) 提交资源身份和验证证据。

## Blender 模型生成

用户要求生成新模型时，在当前资源或场景 Work Item 内按 **参考与多视图 → 正式几何交接 → 按需制作 PBR/AI 贴图 → 人工模型审查** 编排。读取 [Blender 模型生产合同](references/blender-model-production.md)，将题材、风格、面数和贴图预算写入当前实施包；实际几何、拓扑、法线、UV、槽位、LOD、碰撞代理和静态导出由 [`threejs-game-3d-modeling`](../threejs-game-3d-modeling/SKILL.md) 负责。该建模技能按既有 `gpt-6.1-sol` / `max` 配置委派实际 Blender MCP 制作；图像生成与编辑交给 `image_generator`。已提供有效参考或多视图时复用，不重复生成；不需要新几何的已有模型接入直接执行下述接入流程。

贴图、烘焙、绑定/动画或接入任务先读取[模型交接](../threejs-game-3d-modeling/references/model-handoff.md)。沿用交付网格、实际 UV 位置、槽位与 LOD 用图策略；下游不擅自重展 UV、改顶点顺序、重排槽位或覆盖建模源。几何缺陷交回建模责任人，在同一工作项内局部修复和复验。

该路线复用 V1 参考、V2 拆解、V3 正式资源生产与验收，不创建独立聊天或第二套阶段。人工确认当前模型与贴图候选后才可作为已验收资源进入接入环节；自动静态检查不替代人工审查。截图、渲染及真机验收按用户当前明确授权执行。

## 模型接入与优化

1. V1 确定世界尺度、轴向、pivot、包围盒、动画命名、PBR 风格、灯光和三维预算；效果图只是目标视角的参考。交互世界必须交付模型/关卡数据、碰撞代理及可观察状态，不能整屏贴图伪装关卡。
2. V2 拆解角色、环境、交互件、特效与 HUD。三维对象记录 parent、TRS、单位、相机、材质、碰撞和可见性；二维布局 JSON 只约束 HUD 和固定视角标注，不能证明三维空间正确。
3. V3 资源清单逐项记录 GLB 路径与可选追踪摘要、来源/许可、triangles、draw calls、material/texture、纹理维度/显存估算、骨骼/clip、LOD、碰撞代理和解码依赖。纹理磁盘体积不能替代 GPU 内存预算，生成图片也不能作为已生成模型的证据。
4. 使用 GLTFLoader 加载，按实际资产扩展注册 KTX2/meshopt/Draco；部署 decoder/transcoder 并验证 CSP、路径与失败提示。颜色纹理按颜色空间处理，法线/粗糙度等数据纹理不作为 sRGB；不盲目覆盖加载器已设置的材质。
5. 每实例拥有 AnimationMixer 与角色状态；SkinnedMesh 克隆使用 SkeletonUtils.clone，clip/mixer 时间用于表现，伤害/奖励由玩法状态驱动。切换停止 action 并 uncacheRoot，释放独占 geometry/material/texture；ImageBitmap 和共享纹理由资产所有权管理。
6. 先测密度，再采用 InstancedMesh、合并静态几何、LOD、视锥裁剪、纹理压缩和阴影限制。实例选取绑定 instanceId；动画 bounds、透明排序和碰撞数据与降级档位一起验证。更换 LOD 不能改变玩法命中语义。

V4 为人工视觉验收提供相同相机、光照、时间与游戏状态的检查要点，并检查移动、碰撞、动画、切场景/重进和失败恢复；未实际执行的项目标记未验证。需要截图或检查图时提供给用户人工检查，只有用户明确要求自动视觉验证时才自动分析截图，真机运行验收须另有明确授权。记录实际取得的 renderer.info、加载时间与退出后的资源基线。资产处理工具按项目选择；不得自动上传素材或申请外部付费生成。

参考：[glTF 官方加载器](https://threejs.org/docs/pages/GLTFLoader.html)、[资源释放](https://threejs.org/manual/pages/cleanup.html)、[插件接入](../threejs-game-plugins/SKILL.md)。

静态 GLB 资产验收命令见 [`validate-model.mjs`](scripts/validate-model.mjs)，清单范例见 [`model-manifest.example.json`](references/model-manifest.example.json)：`node <模型管线技能目录>/scripts/validate-model.mjs --repo <项目目录> --manifest <模型清单.json>`。将实际命令写入实施单元的 `acceptanceCommands`；`asset.sceneId` 是需唯一匹配的 glTF 内部 `scene.name`，游戏场景归属另由资源条目的 `scene_id` 记录。

三维资源的生产单元使用 `production_method=authored-model`、`delivery_kind=gltf-model`，绑定模型清单与验收报告路径并提交控制面的通用文件证据；登记和 V0–V4 对齐见[建模工作流接入](../threejs-game-3d-modeling/references/workflow-integration.md)。`sceneVisualRouteAnalysis` 只服务二维 effect-image coverage；GLB 不进入它的 image-asset/threejs-native 分支。固定视角截图用于人工检查视觉结果，模型清单提供空间资产的静态事实，两者分别记录。

摘要仅作为可选追踪信息，不要求提供或比对，不因缺失、错误或变化阻断验收；仍须检查模型实际内容、路径归属、资源预算和人工审查结果。
