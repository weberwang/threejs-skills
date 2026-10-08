---
name: threejs-game-model-pipeline
description: 接入与优化 three.js 游戏的 glTF/GLB 模型、PBR 材质、骨骼动画、碰撞代理和 LOD；用于三维资产生产、关卡装配或加载与显存优化。
---

# 三维模型与关卡管线

可提议、审查并在当前 Work Item 内修改资产与接入代码，完成后回到 [threejs-game-workflow-control](../threejs-game-workflow-control/SKILL.md) 提交资源身份和验证证据。

1. V1 确定世界尺度、轴向、pivot、包围盒、动画命名、PBR 风格、灯光和三维预算；效果图只是目标视角的参考。交互世界必须交付模型/关卡数据、碰撞代理及可观察状态，不能整屏贴图伪装关卡。
2. V2 拆解角色、环境、交互件、特效与 HUD。三维对象记录 parent、TRS、单位、相机、材质、碰撞和可见性；二维布局 JSON 只约束 HUD 和固定视角标注，不能证明三维空间正确。
3. V3 资源清单逐项记录 GLB 路径与 SHA、来源/许可、triangles、draw calls、material/texture、纹理维度/显存估算、骨骼/clip、LOD、碰撞代理和解码依赖。纹理磁盘体积不能替代 GPU 内存预算，生成图片也不能作为已生成模型的证据。
4. 使用 GLTFLoader 加载，按实际资产扩展注册 KTX2/meshopt/Draco；部署 decoder/transcoder 并验证 CSP、路径与失败提示。颜色纹理按颜色空间处理，法线/粗糙度等数据纹理不作为 sRGB；不盲目覆盖加载器已设置的材质。
5. 每实例拥有 AnimationMixer 与角色状态；SkinnedMesh 克隆使用 SkeletonUtils.clone，clip/mixer 时间用于表现，伤害/奖励由玩法状态驱动。切换停止 action 并 uncacheRoot，释放独占 geometry/material/texture；ImageBitmap 和共享纹理由资产所有权管理。
6. 先测密度，再采用 InstancedMesh、合并静态几何、LOD、视锥裁剪、纹理压缩和阴影限制。实例选取绑定 instanceId；动画 bounds、透明排序和碰撞数据与降级档位一起验证。更换 LOD 不能改变玩法命中语义。

V5 在相同相机、光照、时间与游戏状态采集视觉证据，并重放移动、碰撞、动画、切场景/重进和失败恢复。记录真实 renderer.info、加载时间与退出后的资源基线。资产处理工具按项目选择；不得自动上传素材或申请外部付费生成。

参考：[glTF 官方加载器](https://threejs.org/docs/pages/GLTFLoader.html)、[资源释放](https://threejs.org/manual/pages/cleanup.html)、[插件接入](../threejs-game-plugins/SKILL.md)。

静态 GLB 资产验收命令见 [`validate-model.mjs`](scripts/validate-model.mjs)，清单范例见 [`model-manifest.example.json`](references/model-manifest.example.json)：`node skills/threejs-game-model-pipeline/scripts/validate-model.mjs --repo . --manifest <模型清单.json>`。

三维资源的生产单元使用 `production_method=authored-model`、`delivery_kind=gltf-model`，冻结模型清单与验收报告 SHA 并提交控制面的通用文件证据。`sceneVisualRouteAnalysis` 只服务二维 effect-image coverage；GLB 不进入它的 image-asset/threejs-native 分支。固定视角截图可证明视觉结果，模型清单证明空间资产，两者分别记录。
