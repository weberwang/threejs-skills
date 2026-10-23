# three.js 视口与 HUD 适配

本参考只定义浏览器 CSS 视口、three.js 渲染画布、Camera、输入与屏幕 HUD、DOM Overlay 及适用的屏幕自适应平面内容之间的边界。HUD 可以使用 DOM Overlay 或 OrthographicCamera；透视世界和关卡必须另立[三维世界视口合同](../../threejs-game-workflow-control/references/world-viewport-contract.schema.json)，不套用二维固定设计分辨率。

## 视口和渲染器

- 容器的 `getBoundingClientRect()` 是唯一 CSS 逻辑视口来源，单位为 CSS 像素。宿主 CSS 负责让 Canvas 填满容器；渲染器不得反过来改写布局尺寸。
- 有效 DPR 从 `window.devicePixelRatio` 读取，非正数或非有限数回退为 1，并封顶为 2。设备 DPR、浏览器缩放或容器尺寸变化时，重算同一套画布、Camera 和输入映射。
- 更新渲染器时先 `renderer.setPixelRatio(effectiveDpr)`，再 `renderer.setSize(cssWidth, cssHeight, false)`。最后一个参数为 `false`，所以 CSS 尺寸由宿主样式控制；backing 宽高按 CSS 尺寸乘有效 DPR 向下取整。记录实际 backing 尺寸时读取渲染器/Canvas 的实际结果，不把它当作布局坐标。
- WebGL 2 `WebGLRenderer` 是默认选择。`WebGPURenderer` 需要项目明确采用，并验证异步初始化、目标浏览器、材质/后处理兼容性及回退路径。
- 对透视世界 Camera，按 CSS rect 设置 `PerspectiveCamera.aspect = cssWidth / cssHeight`，随后调用 `updateProjectionMatrix()`。若为不同 viewport 或 Camera 设置了 viewport/scissor，合同还须记录其 CSS 到 backing 映射。

## 坐标空间

必须分别记录 CSS client 坐标、Canvas backing 像素、归一化设备坐标（NDC）、HUD 坐标、世界坐标和对象局部坐标。DPR 只决定渲染分辨率，不改变 CSS 点击尺寸、关卡单位或 Camera 的透视关系。

常规按钮、文字、可访问性与输入焦点优先使用同一 DOM 树内的 DOM Overlay；Three.js 内绘制的屏幕 HUD 使用单独的 OrthographicCamera 和 HUD 根 `Group`，在合同中明确可见范围、坐标原点、缩放、安全区和与世界层的合成顺序。固定 1080×1920 设计基准只适用于已确认采用该基准的 HUD 或屏幕自适应平面 UI，不适用于透视 3D 世界。

透视关卡用自身坐标单位、模型/碰撞体、相机视锥、相机轨迹、地面/导航和交互规则组成独立 world contract。角色与道具的位置来自世界数据；屏幕位置由 Camera 投影得到。不能把透视世界对象当成固定像素的 2D 布局节点，也不能用改变 DPR 或拉伸投影来替代关卡重排。

## 指针输入与三维命中

将 DOM PointerEvent 的 `clientX/clientY` 减去当前 Canvas CSS rect 左上角，再按 CSS rect 宽高换算 NDC：`x = 2 * localX / width - 1`，`y = 1 - 2 * localY / height`。把 NDC 交给 `Raycaster.setFromCamera(ndc, camera)`，再对允许交互的对象子树执行相交测试。命中后按交点、对象身份和玩法规则处理；不直接用物理像素或未经 Camera 投影的屏幕 `x/y` 与世界坐标比较。

相机控制、DOM Overlay 和 WebXR 等输入源各自说明坐标变换与优先级。指针监听器属于场景/输入适配器生命周期，退出或销毁时移除；resize 后立即使用新 CSS rect、相机矩阵和投影重新计算。

## HUD 布局合同

布局合同的固定设计视口、锚点、逻辑点击区域和响应式规则仅约束 HUD、DOM Overlay 和明确采用屏幕适配的平面 UI。透视世界不得使用 `calculateFixedDesignViewport` 的 1080×1920 结果去定位角色、道具、碰撞体或关卡网格；世界布局由三维世界视口合同、关卡数据、世界单位、Camera、投影与玩法空间规则共同约束。

初始装配、容器 resize、方向变化、安全区变化、DPR 变化和 HUD 状态变化都进入同一幂等 `reflowHud(input)` 入口。输入至少包含 CSS rect、安全区、有效 DPR、HUD 坐标合同、Camera 身份和状态；入口重算 Canvas backing 与相关 Camera，并向 DOM、Orthographic HUD 与指针适配器发布同一 viewport revision。监听器随显示服务销毁。

执行前读取每个节点的[唯一执行计划](layout-execution.md)，防止 CSS 布局、共享 reflow 与动画同时改写同一属性。装配与重排后用[运行采集器](layout-runtime-evidence.md)同步读取真实 DOM/HUD 状态。DOM 显式转换 CSS rect 到逻辑坐标；HUD 由项目适配器读取实际对象、Camera 与驱动状态。V4 组合几何和 QA Hook 复用同一批 `runtime_batch/component_snapshots`，不得从冻结目标或计划回填实际读数。

装饰性屏幕空间满幅 HUD 背景只在 HUD 坐标系内执行 cover；关卡天空盒、远景、地形和可交互环境属于 world contract，由世界 Camera、世界尺寸和场景数据控制。屏幕背景适配器不能替代 3D 世界的构图或关卡几何。

## 验收证据

运行验收至少记录容器 CSS rect、Canvas CSS 尺寸与实际 backing 尺寸、raw/effective DPR、Renderer 类型、Camera 投影、NDC 样例、射线命中对象和 viewport revision。HUD 另记录布局、安全区和 DOM/Canvas 合成顺序；世界场景另记录 world contract 与相机状态。代表性视口 resize 与 DPR 变化后，验证画面不拉伸、HUD 不漂移、射线仍命中预期世界对象，并确认监听器随场景退出清理。
