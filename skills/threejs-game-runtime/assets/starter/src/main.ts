import * as THREE from 'three';
import { clientToNdc, createFixedStepper, resizePerspective } from './game-runtime.mjs';

/** 最小场景入口，演示三维渲染与游戏循环；正式项目将场景和服务拆开。 */
function createDemo(host: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x172033);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 1, 4);
  camera.lookAt(0, 0, 0);
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardMaterial({ color: 0x47b8ef });
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube, new THREE.HemisphereLight(0xffffff, 0x303040, 3));
  const raycaster = new THREE.Raycaster();
  const loop = createFixedStepper();
  let previousTime: number | undefined;
  let previousAngle = 0;
  let angle = 0;
  let lastSize = { width: 0, height: 0, dpr: 0 };

  /** 零尺寸容器等待下次 resize，避免投影除零。 */
  function resize() {
    const rect = renderer.domElement.getBoundingClientRect();
    const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? Math.min(devicePixelRatio, 2) : 1;
    // 仅尺寸或密度变化时重建 backing，避免每帧重新分配 GPU 缓冲。
    if (rect.width && rect.height && (rect.width !== lastSize.width || rect.height !== lastSize.height || dpr !== lastSize.dpr)) {
      resizePerspective(renderer, camera, rect, dpr);
      lastSize = { width: rect.width, height: rect.height, dpr };
    }
  }

  /** 恢复时重置时间，长时间后台停留不应推进游戏。 */
  function resetTime() { previousTime = undefined; loop.reset(); previousAngle = angle; }

  /** 输入以 CSS rect 转 NDC，禁止使用 backing 像素作为点击坐标。 */
  function select(event: PointerEvent) {
    const ndc = clientToNdc(event.clientX, event.clientY, renderer.domElement.getBoundingClientRect());
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    if (raycaster.intersectObject(cube).length) material.color.setHex(material.color.getHex() === 0x47b8ef ? 0xffb347 : 0x47b8ef);
  }

  /** 固定步更新规则，插值只写表现，渲染帧率不改变模拟速度。 */
  function frame(time: number) {
    resize();
    if (document.hidden || !document.hasFocus()) { resetTime(); return; }
    const delta = previousTime === undefined ? 0 : (time - previousTime) / 1000;
    previousTime = time;
    const result = loop.advance(delta, (dt: number) => { previousAngle = angle; angle += dt * 0.7; });
    cube.rotation.y = previousAngle + (angle - previousAngle) * result.alpha;
    renderer.render(scene, camera);
  }

  window.addEventListener('blur', resetTime);
  document.addEventListener('visibilitychange', resetTime);
  renderer.domElement.addEventListener('pointerdown', select);
  renderer.setAnimationLoop(frame);
  resize();
  /** 当前示例全部资源独占；共享资产在正式项目由资产服务释放。 */
  return function dispose() {
    renderer.setAnimationLoop(null);
    window.removeEventListener('blur', resetTime);
    document.removeEventListener('visibilitychange', resetTime);
    renderer.domElement.removeEventListener('pointerdown', select);
    geometry.dispose(); material.dispose(); renderer.dispose(); renderer.domElement.remove();
  };
}

const dispose = createDemo(document.querySelector<HTMLElement>('#app')!);
// bfcache 保留页面实例，返回时仍需要恢复渲染；真正离开页面才释放独占资源。
window.addEventListener('pagehide', (event: PageTransitionEvent) => { if (!event.persisted) dispose(); });
