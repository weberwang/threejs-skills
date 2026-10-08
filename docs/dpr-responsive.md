# three.js 的 DPR 与坐标空间

世界：米、秒、弧度及相机投影。输入：Canvas CSS rect → NDC → Raycaster。HUD：CSS 像素或独立正交逻辑坐标。GPU backing：renderer.setPixelRatio 的有效 DPR 与 renderer.setSize 的 CSS 大小决定；three.js WebGLRenderer 使用向下取整分配 backing，不把 backing 尺寸用于布局。

运行 DPR 从设备读取、非法回退 1、上限 2，resize 与密度变化刷新相机投影和渲染尺寸。二维图片生产倍率只约束图像资产，不代表世界单位或运行 DPR。

固定设计稿坐标只服务 HUD；透视场景不存在按设计稿高/宽缩放世界的规则。三维响应式合同与证据走 world-3d 分支，HUD 合同单独检查，二者共享同一 Canvas CSS 尺寸与设备 DPR。

详见 [three.js 适配器](../skills/threejs-game-ui-layout/references/threejs-adapter.md) 和 [运行模块](../skills/threejs-game-runtime/SKILL.md)。
