# 依赖能力档与服务边界

本文件是 three.js 项目按需依赖能力档和 API/服务边界的唯一权威定义。浏览器与 WebGL 2 `WebGLRenderer` 是默认路径；先复用 Web 平台、three.js、TypeScript、构建工具和项目原语，再按玩法需求启用最小能力。初始化不得安装未被实际需求触发的依赖。WebGPU 是显式渲染器选择，不是默认回退假设。

## 能力档

| 能力档 | 典型能力 | 启用边界 |
| --- | --- | --- |
| 核心档 | three.js、WebGL 2 `WebGLRenderer`、TypeScript、项目选定的 Web 构建工具及必要测试工具 | 浏览器游戏的基础运行、构建和测试；WebGPU 需要单独决策和验证 |
| 原生宿主档 | Capacitor 或目标宿主及实际使用的原生插件 | 只有目标渠道明确要求原生宿主/设备能力时启用；每个插件单独验证 |
| 数据/API 档 | 网络客户端、账号、远程配置、云存档和序列化 | 已有明确 API/数据契约，平台原语和现有依赖不足 |
| 物理档 | Rapier 3D、其他物理引擎或项目自有碰撞层 | 存在刚体模拟、关节、连续碰撞检测或角色控制器需求；简单射线、触发器或少量规则碰撞先用轻量方案 |
| 空间查询档 | `three-mesh-bvh` | 复杂高面数网格的三角级射线/空间查询已成为可测瓶颈；普通 Raycaster 或对象级筛选已不足时再启用 |
| 导航档 | Recast Navigation / Detour 的 JS/WASM 实现及 three.js 适配包 | 关卡需要 3D NavMesh 构建/查询、多代理导航等能力；少量路点或简单地图使用显式图/路点即可 |
| React 渲染档 | `@react-three/fiber` | 项目已经采用 React，或项目架构明确选择 React 声明式场景；普通 three.js 项目不为引入它额外迁移 UI/运行时 |
| 复杂玩法档 | ECS、脚本或行为系统 | 多实体状态/系统复杂度证明直接组件与场景控制器不足 |
| 高级视觉档 | Shader、后处理、glTF/纹理压缩或资产生产工具 | 冻结视觉方向和预算确实需要，并有目标平台证据 |
| 商业能力档 | 支付、广告、分析、崩溃报告 | 用户明确批准商业/数据能力、合规范围和发布渠道 |

Rapier、`three-mesh-bvh`、Recast Navigation 和 React Three Fiber 都是按具体玩法/工程条件选择的能力项，不构成默认必备插件。启用 Rapier 时分别评估刚体需求与角色控制需求；启用 Recast 时记录 NavMesh 生成、WASM 初始化和构建集成；BVH 仅加速合适的几何查询，不替代交互层对象筛选；R3F 是 React 渲染器，不是 vanilla three.js 的通用 UI 包装。

每个新增依赖在 TDD 记录能力档、触发需求、被拒绝的轻量方案、维护成本、运行时性能和平台风险、验证命令及所有者。一个项目可组合多个档位；未采用的能力不创建 `N/A` 条目。

## API 与服务边界

适用时记录：契约 ID/版本、服务端所有者、认证授权、幂等键与重试/超时策略、客户端兼容范围、数据或存档迁移、回滚、服务端/客户端测试边界、部署监控、备份恢复和外部故障降级。生产或发布变化按审核漏斗触发技术与 Release 通道。

如果任务不负责服务端实现，只记录外部依赖、所有者、契约与客户端边界，不扩张到服务端开发、部署或运维。密钥、令牌和个人数据不得进入仓库。

## 官方 API 与依赖参考

- three.js 场景树：[Scene](https://threejs.org/docs/pages/Scene.html)、[Object3D](https://threejs.org/docs/pages/Object3D.html)；渲染器：[WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)、[WebGPURenderer](https://threejs.org/docs/pages/WebGPURenderer.html)；相机与输入：[PerspectiveCamera](https://threejs.org/docs/pages/PerspectiveCamera.html)、[OrthographicCamera](https://threejs.org/docs/pages/OrthographicCamera.html)、[Raycaster](https://threejs.org/docs/pages/Raycaster.html)；模型与动画：[GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)、[AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html)、[KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html)；实例与 LOD：[InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)、[LOD](https://threejs.org/docs/pages/LOD.html)；[GPU 资源释放说明](https://threejs.org/manual/pages/how-to-dispose-of-objects.html)。
- [Rapier JavaScript 3D 文档](https://rapier.rs/javascript3d/)、[`three-mesh-bvh` 项目文档](https://github.com/gkjohnson/three-mesh-bvh)、[`recast-navigation-js` 项目文档](https://github.com/isaac-mason/recast-navigation-js)。
- [React Three Fiber 安装与 React 版本配对](https://r3f.docs.pmnd.rs/getting-started/installation)。
