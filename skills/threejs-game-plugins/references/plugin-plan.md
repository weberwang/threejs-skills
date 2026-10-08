# 按能力选择插件

| 能力与触发条件 | 方案 | 接入与验证 |
| --- | --- | --- |
| 核心渲染、构建 | three、TypeScript、Vite | 精确锁版本；three/addons 内置于 three 包，无需单独安装 |
| glTF 模型与骨骼动画 | GLTFLoader、AnimationMixer、SkeletonUtils | GLB 默认交换格式；克隆骨骼角色用 SkeletonUtils.clone；验证独立播放与释放 |
| 已有压缩纹理 | KTX2Loader | setTranscoderPath、detectSupport(renderer)，转码文件同源部署；不是压缩任意 PNG 的工具 |
| 已有 meshopt/Draco 模型 | MeshoptDecoder 或 DRACOLoader | 按资产扩展注册解码器；不对同一资源盲目叠加两种压缩；WASM/worker 路径纳入构建 |
| 刚体、角色、碰撞反馈 | @dimforge/rapier3d-compat | await init 后创建世界；固定 dt，kinematic/dynamic/fixed 类型与碰撞分组明确；退出 free；compat 提供便捷 WASM 打包，但须测包体 |
| 大量静态三角面选取/空间查询 | three-mesh-bvh | 加速场景中实际瓶颈 mesh 的查询；记录 prototype 修改范围或使用实例封装，退出 disposeBoundsTree；不能替代完整物理世界 |
| 复杂地形 NPC 寻路 | @recast-navigation/core 与必要的 @recast-navigation/generators | 世界单位一致，离线或 worker 生成 NavMesh，动态障碍方案明确；销毁 WASM 资源；简单图寻路无需该依赖 |
| 玩家视角 | PointerLockControls 或项目相机控制器 | Pointer Lock 由用户手势触发，解除锁定清空输入；触屏与手柄另设映射；OrbitControls 用于检查，不默认作为角色控制器 |
| WebGL 后处理 | three/addons EffectComposer 与所需 Pass | 与场景/颜色空间一致；测每个全屏 pass、resize 和 render target 释放；WebGPU 采用其节点后处理管线，不混接 WebGL Pass |
| 调试和自动化 | lil-gui、stats.js、Vitest、Playwright 按需 | 调试面板只在开发启用；本地服务先复用，浏览器和真机范围分别记录 |
| 原生设备能力 | Capacitor 与实际需要的插件 | 仅已确定 iOS/Android 容器时采用；不是 Web 游戏默认必备 |

先从需求确定必要能力，再从官方文档与项目锁文件核对 API；本表不声称所有包组合在所有设备已验证。没有真实性能证据时不使用“必装优化插件”作为结论。

一手来源（2026-10-08 核实）：[GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)、[KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html)、[Rapier 角色控制](https://rapier.rs/docs/user_guides/javascript/character_controller/)、[three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)、[Recast Navigation JS](https://github.com/isaac-mason/recast-navigation-js)。
