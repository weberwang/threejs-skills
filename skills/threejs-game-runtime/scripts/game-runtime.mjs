/** 校验正有限数，阻止尺寸或时间步污染后续计算。 */
function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(name + ' 必须为正有限数');
  return value;
}

/** 有限追赶的固定步调度器，避免低帧率下无限补算。 */
export function createFixedStepper({ step = 1 / 60, maxSteps = 5 } = {}) {
  positive(step, 'step');
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1) throw new TypeError('maxSteps 必须为正整数');
  let accumulator = 0;
  return {
    /** 恢复与场景切换时清空余量，禁止补算后台停留时间。 */
    reset() { accumulator = 0; },
    /** 返回插值比例和丢弃时间，便于记录性能问题。 */
    advance(delta, update) {
      if (!Number.isFinite(delta) || delta < 0) throw new TypeError('delta 必须为非负有限秒数');
      if (typeof update !== 'function') throw new TypeError('update 必须是函数');
      const accepted = Math.min(delta, step * maxSteps);
      accumulator += accepted;
      let count = 0;
      while (accumulator + Number.EPSILON >= step && count < maxSteps) {
        update(step);
        accumulator = Math.max(0, accumulator - step);
        count++;
      }
      return { steps: count, alpha: Math.min(accumulator / step, 1), droppedSeconds: delta - accepted };
    },
  };
}

/** CSS 客户区转为 Raycaster 使用的 NDC；DPR 不参与输入计算。 */
export function clientToNdc(clientX, clientY, rect) {
  positive(rect.width, 'rect.width');
  positive(rect.height, 'rect.height');
  if (![clientX, clientY, rect.left, rect.top].every(Number.isFinite)) throw new TypeError('坐标必须为有限数');
  return { x: (clientX - rect.left) / rect.width * 2 - 1, y: 1 - (clientY - rect.top) / rect.height * 2 };
}

/** 更新透视渲染尺寸；backing 由渲染器按 DPR 分配，布局使用 CSS 像素。 */
export function resizePerspective(renderer, camera, { width, height }, rawDpr = 1) {
  positive(width, 'width');
  positive(height, 'height');
  const dpr = Number.isFinite(rawDpr) && rawDpr > 0 ? Math.min(rawDpr, 2) : 1;
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  return { width, height, dpr };
}
