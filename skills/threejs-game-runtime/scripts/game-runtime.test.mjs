import test from 'node:test';
import assert from 'node:assert/strict';
import { clientToNdc, createFixedStepper, resizePerspective } from './game-runtime.mjs';

/** 不同渲染帧率下一秒产生相同模拟步数。 */
test('固定步与渲染帧率解耦', () => {
  for (const fps of [30, 60, 120]) {
    const loop = createFixedStepper();
    let ticks = 0;
    for (let frame = 0; frame < fps; frame++) loop.advance(1 / fps, () => ticks++);
    assert.equal(ticks, 60);
  }
});

/** 慢帧有限追赶，恢复后不保留过期余量。 */
test('慢帧限步与恢复重置', () => {
  const loop = createFixedStepper();
  const frame = loop.advance(10, () => {});
  assert.equal(frame.steps, 5);
  assert.ok(frame.droppedSeconds > 9);
  loop.advance(1 / 120, () => {});
  loop.reset();
  assert.equal(loop.advance(1 / 120, () => {}).steps, 0);
  assert.throws(() => loop.advance(NaN, () => {}));
  assert.throws(() => createFixedStepper({ maxSteps: 0 }));
});

/** 页面偏移下仍正确映射中心和角点。 */
test('CSS 坐标转换不依赖 DPR', () => {
  const rect = { left: 20, top: 30, width: 400, height: 200 };
  assert.deepEqual(clientToNdc(220, 130, rect), { x: 0, y: 0 });
  assert.deepEqual(clientToNdc(20, 30, rect), { x: -1, y: 1 });
  assert.throws(() => clientToNdc(0, 0, { ...rect, width: 0 }));
});

/** DPR、CSS 尺寸和相机投影同时更新。 */
test('透视相机 resize 与 DPR 上限', () => {
  const calls = [];
  const renderer = { setPixelRatio: value => calls.push(value), setSize: (...args) => calls.push(args) };
  const camera = { updateProjectionMatrix: () => calls.push('projection') };
  assert.equal(resizePerspective(renderer, camera, { width: 800, height: 400 }, 3).dpr, 2);
  assert.equal(camera.aspect, 2);
  assert.deepEqual(calls, [2, [800, 400, false], 'projection']);
  assert.equal(resizePerspective(renderer, camera, { width: 1, height: 1 }, NaN).dpr, 1);
});
