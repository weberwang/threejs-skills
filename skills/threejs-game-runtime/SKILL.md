---
name: threejs-game-runtime
description: 为 three.js Web 3D 游戏实现固定时间步、输入、场景生命周期、暂停恢复、资源所有权及性能预算；用于搭建游戏基础或排查帧率相关玩法、场景泄漏与后台恢复问题。
---

# three.js 游戏运行基础

可提议、审查并在当前 Work Item 范围内修改，完成后回到 [threejs-game-workflow-control](../threejs-game-workflow-control/SKILL.md) 提交候选与验证证据。

three.js 提供渲染与场景图；玩法循环、输入状态、物理世界、资源生命周期和游戏状态由项目负责。先复用项目服务；新工程以 TypeScript、Vite、three 为核心。

1. 把渲染 Scene 与玩法 scene controller 分离。控制器负责 enter、fixedUpdate、renderUpdate、exit、dispose，入口只装配服务。规则与数值模块不依赖 WebGL、DOM 或材质。
2. 使用 [固定步与输入辅助模块](scripts/game-runtime.mjs)：物理和规则用固定 dt，渲染用 accumulator/step 插值。后台暂停、失焦与 Pointer Lock 解除清空按键；恢复时重置时间戳和积累量，禁止补算整段后台时间。最多追赶有限步数，记录丢弃时间；输入边沿每模拟步只消费一次。
3. 世界使用米、秒、弧度、Y 向上，明确前向和玩家尺寸。模型 pivot、碰撞体中心、HUD 锚点是不同契约。高速物体按实测使用 CCD；Raycaster 负责选取，不替代刚体碰撞。物理与导航见 [插件选择](../threejs-game-plugins/SKILL.md)。
4. resize 从 Canvas CSS rect 推导 renderer 大小与相机投影；输入 CSS→NDC→Raycaster。DOM HUD 消费 CSS 尺寸，正交 HUD 单独定义逻辑坐标。禁止把二维效果图拆解直接当作三维世界变换；[UI 适配器](../threejs-game-ui-layout/references/threejs-adapter.md)只管理屏幕布局。
5. GPU 资源由资产服务引用计数持有；移除 Object3D 不会自动释放 geometry、material、texture 或 render target。异步加载返回后先核对场景代次，过期资源交还资产服务。退出清理事件、定时器、mixer、physics/nav handle 和独占资源；共享资源仅在最后持有者释放时 dispose。
6. 最坏玩法密度记录帧时间 p50/p95、draw calls、triangles、材质与纹理数量、阴影与后处理开销、加载字节和切场景后的资源基线。先减少冗余绘制、材质、阴影和全屏 pass，再按已声明档位调整画质；不得在无数据时承诺 FPS。

新项目运行 `node <技能目录>/scripts/create-game.mjs <空目录>`，脚本复制 [工程模板](assets/starter/package.json)并注入同一运行模块；模板目录本身不是完整可构建产物。生成后执行 `npm ci`、`npm run build`，落实实际玩法再验收。它只演示渲染、响应式输入、固定步和暂停恢复，不是完整游戏。先测试确定性规则、步进与坐标转换，再按需浏览器烟测；启动服务前检查可复用实例，不自动执行真机验收。
