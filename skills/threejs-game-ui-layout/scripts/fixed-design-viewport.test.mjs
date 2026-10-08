import test from "node:test";
import assert from "node:assert/strict";
import { calculateFixedDesignBackground, calculateFixedDesignViewport } from "./fixed-design-viewport.mjs";

test("竖屏按 1920 高度适配并展开可见宽度", () => {
  const viewport = calculateFixedDesignViewport({ width: 390, height: 844 });
  assert.equal(viewport.orientation, "portrait");
  assert.equal(viewport.designWidth, 1080);
  assert.equal(viewport.designHeight, 1920);
  assert.equal(viewport.scale, 844 / 1920);
  assert.equal(viewport.visibleHeight, 1920);
  assert.equal(viewport.visibleWidth * viewport.scale, 390);
});

test("横屏按 1920 宽度适配并展开可见高度", () => {
  const viewport = calculateFixedDesignViewport({ width: 1366, height: 1024 });
  assert.equal(viewport.orientation, "landscape");
  assert.equal(viewport.designWidth, 1920);
  assert.equal(viewport.designHeight, 1080);
  assert.equal(viewport.scale, 1366 / 1920);
  assert.equal(viewport.visibleWidth, 1920);
  assert.equal(viewport.visibleHeight * viewport.scale, 1024);
});

test("两种方向的背景经设计坐标偏移后仍覆盖 CSS 视口", () => {
  for (const dimensions of [{ width: 320, height: 480 }, { width: 1366, height: 1024 }]) {
    const viewport = calculateFixedDesignViewport(dimensions);
    const background = calculateFixedDesignBackground({
      sourceWidth: viewport.designWidth,
      sourceHeight: viewport.designHeight,
      viewport,
    });
    const cssX = (background.x + viewport.offsetX) * viewport.scale;
    const cssY = (background.y + viewport.offsetY) * viewport.scale;
    assert(cssX <= 1e-9 && cssY <= 1e-9);
    assert(cssX + background.displayWidth * viewport.scale >= dimensions.width - 1e-9);
    assert(cssY + background.displayHeight * viewport.scale >= dimensions.height - 1e-9);
  }
});

test("非法 CSS 视口尺寸失败", () => {
  assert.throws(() => calculateFixedDesignViewport({ width: 0, height: 844 }), /正有限数/);
  assert.throws(() => calculateFixedDesignViewport({ width: Infinity, height: 844 }), /正有限数/);
});
