/**
 * 项目适配占位：此文件不是可直接运行的 three.js 接入示例。
 *
 * 项目须注入其真实 HUD Scene/Camera、已确认的 V2 HUD 节点映射、CSS viewport
 * 与正式 reflow 入口后，再实现此窄接口。此编辑器只编辑屏幕 HUD/DOM Overlay；
 * 透视世界对象、关卡坐标、碰撞和相机轨迹不属于二维 layout_nodes。
 * nodes、targetSha256、sceneId、stateId 必须绑定同一份已确认的 V2 HUD 产物；
 * getBounds 返回 HUD 合同坐标内的 bounds，getViewportRect 返回实际 Canvas 的 CSS
 * client rect。reflow 应只把确认后的 HUD 增量交给正式布局入口，由真实父级变换
 * 传递子节点；不得把 HUD 像素写进透视世界坐标。
 * 当前占位实现显式失败，避免空对象或合成坐标被误认为已接入、已验收。
 *
 * @param {HTMLElement} host 游戏 Canvas/HUD 的宿主容器
 * @returns {Promise<{nodes: object[], targetSha256: string, sceneId: string, stateId: string, referenceUrl: string, viewport: {width: number, height: number}, getBounds: (id: string) => object, getViewportRect?: () => object, reflow: (layout: object) => void, destroy?: () => void}>}
 */
export async function createGameEditorAdapter(host) {
  void host;
  throw new Error("此文件是项目适配占位；请为 HUD 接入实际 three.js Scene/Camera、V2 节点映射和正式 reflow 入口");
}
