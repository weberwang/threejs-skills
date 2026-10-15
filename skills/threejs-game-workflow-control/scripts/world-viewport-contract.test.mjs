import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  WORLD_VIEWPORT_REQUIRED_EVIDENCE,
  expectedWorldBackingSize,
} from './world-viewport-contract.mjs';
import {
  validateResponsiveContract,
  validateResponsiveEvidenceManifest,
  validateResponsiveEvidenceRecord,
  extractResponsiveContract,
} from './responsive-viewport-contract.mjs';

const CANDIDATE = `sha256:${'c'.repeat(64)}`;
const WORK_ITEM_SCHEMA = JSON.parse(readFileSync(new URL('../references/work-item.schema.json', import.meta.url), 'utf8'));
const IMPLEMENTATION_PACKAGE_SCHEMA = JSON.parse(readFileSync(new URL('../references/implementation-package.schema.json', import.meta.url), 'utf8'));
const WORLD_SCHEMA = JSON.parse(readFileSync(new URL('../references/world-viewport-contract.schema.json', import.meta.url), 'utf8'));

/** 构造不依赖二维设计分辨率的 Three.js world-3d 合同。 */
function makeWorldContract({ renderer = 'webgl2', cameraType = 'perspective', near = 0.1 } = {}) {
  return {
    schemaVersion: 'world-viewport/1.0',
    renderSpace: 'world-3d',
    renderer,
    cssLogicalRect: { coordinateSpace: 'css-pixel', origin: 'top-left', source: 'canvas.getBoundingClientRect', fill: 'viewport' },
    canvasBackingPolicy: { method: 'threejs-renderer-setSize', rounding: 'floor', updateStyle: false, pixelRatioSource: 'effectiveDevicePixelRatio' },
    runtimeDprPolicy: { source: 'window.devicePixelRatio', dynamic: true, invalidFallback: 1, maximum: 2, updatesOn: ['resize', 'display-density-change'] },
    cameraPolicy: cameraType === 'perspective'
      ? { type: cameraType, near, far: 500, projectionUpdate: 'updateProjectionMatrix-on-resize', perspective: { fovDegrees: 60, aspectSource: 'cssLogicalRect' } }
      : { type: cameraType, near, far: 500, projectionUpdate: 'updateProjectionMatrix-on-resize', orthographic: { verticalSpan: 12, horizontalSpan: 'derive-from-css-aspect' } },
    inputCoordinatePolicy: { from: 'css-client-pixel', to: 'ndc', raycaster: 'THREE.Raycaster', mapping: 'canvas-local-to-ndc' },
    orientation: { allowed: ['portrait', 'landscape'] },
    representativeViewports: [
      { id: 'phone-portrait', cssLogicalRect: { width: 390, height: 844 } },
      { id: 'desktop-landscape', cssLogicalRect: { width: 1280, height: 720 } },
    ],
    performanceBudget: { maxDrawCalls: 500, maxTriangles: 250000, maxGeometries: 400, maxTextures: 256, maxFrameTimeMs: 16.7 },
    requiredRuntimeEvidence: [...WORLD_VIEWPORT_REQUIRED_EVIDENCE],
    validationScope: 'machine-contract-only',
  };
}

/** 计算测试用的 WebGL/WebGPU 透视矩阵，验证相机记录而非状态标签。 */
function perspectiveMatrix(fovDegrees, aspect, near, far, renderer) {
  const f = 1 / Math.tan(fovDegrees * Math.PI / 360);
  const webgpu = renderer === 'webgpu';
  const matrix = Array(16).fill(0);
  matrix[0] = f / aspect;
  matrix[5] = f;
  matrix[10] = webgpu ? far / (near - far) : (far + near) / (near - far);
  matrix[11] = -1;
  matrix[14] = webgpu ? far * near / (near - far) : (2 * far * near) / (near - far);
  return matrix;
}

/** 计算测试用的 WebGL/WebGPU 正交矩阵。 */
function orthographicMatrix(camera, renderer) {
  const width = camera.right - camera.left;
  const height = camera.top - camera.bottom;
  const depth = camera.far - camera.near;
  const webgpu = renderer === 'webgpu';
  const matrix = Array(16).fill(0);
  matrix[0] = 2 / width;
  matrix[5] = 2 / height;
  matrix[10] = webgpu ? -1 / depth : -2 / depth;
  matrix[12] = -(camera.right + camera.left) / width;
  matrix[13] = -(camera.top + camera.bottom) / height;
  matrix[14] = webgpu ? -camera.near / depth : -(camera.far + camera.near) / depth;
  matrix[15] = 1;
  return matrix;
}

/** 按合同类型和当前 CSS rect 构造相机参数及实测投影矩阵。 */
function makeCamera(contract, rect) {
  const policy = contract.cameraPolicy;
  if (policy.type === 'perspective') {
    const camera = { type: 'perspective', near: policy.near, far: policy.far, fovDegrees: policy.perspective.fovDegrees, aspect: rect.width / rect.height };
    camera.projectionMatrix = perspectiveMatrix(camera.fovDegrees, camera.aspect, camera.near, camera.far, contract.renderer);
    return camera;
  }
  const height = policy.orthographic.verticalSpan;
  const width = height * (rect.width / rect.height);
  const camera = { type: 'orthographic', near: policy.near, far: policy.far, left: -width / 2, right: width / 2, top: height / 2, bottom: -height / 2 };
  camera.projectionMatrix = orthographicMatrix(camera, contract.renderer);
  return camera;
}

/** 构造一条视口证据及其同页 resize 轨迹。 */
function makeEvidence(contract, viewport, overrides = {}) {
  const rect = { x: 40, y: 24, ...viewport.cssLogicalRect };
  const dpr = 1.5;
  const resizedRect = { ...rect, width: rect.width - 20 };
  const sample = (cssRect, rawDevicePixelRatio) => {
    const effectiveDevicePixelRatio = Math.min(rawDevicePixelRatio, 2);
    return {
      samePage: true,
      pageReloaded: false,
      canvasCssRect: cssRect,
      canvasBackingSize: expectedWorldBackingSize(cssRect, effectiveDevicePixelRatio),
      rawDevicePixelRatio,
      effectiveDevicePixelRatio,
      camera: makeCamera(contract, cssRect),
    };
  };
  const localPoint = { x: rect.width * 0.25, y: rect.height * 0.75 };
  return {
    capturedAt: '2026-10-08T00:00:00.000Z',
    measurementSource: 'browser-runtime',
    viewportId: viewport.id,
    canvasCssRect: rect,
    canvasBackingSize: expectedWorldBackingSize(rect, dpr),
    rawDevicePixelRatio: dpr,
    effectiveDevicePixelRatio: dpr,
    camera: makeCamera(contract, rect),
    inputHitResults: [
      { cssClientPoint: { x: rect.x + localPoint.x, y: rect.y + localPoint.y }, ndc: { x: -0.5, y: -0.5 }, hit: true, expectedHit: true },
      { cssClientPoint: { x: rect.x + rect.width * 0.5, y: rect.y + rect.height * 0.5 }, ndc: { x: 0, y: 0 }, hit: false, expectedHit: false },
    ],
    resizeTrajectory: [sample(resizedRect, 1), sample(rect, dpr)],
    rendererMetrics: { renderer: contract.renderer, drawCalls: 180, triangles: 42000, geometries: 84, textures: 32, frameTimeMs: 14.2 },
    screenshot: `evidence/${viewport.id}.png`,
    sceneId: 'arena',
    stateId: 'playing',
    candidateSha256: CANDIDATE,
    pageReloaded: false,
    ...overrides,
  };
}

/** 解析本文件内的 JSON Schema $ref，用于测试合同的真实分支定义。 */
function resolveRef(root, node) {
  let current = node;
  while (typeof current?.$ref === 'string' && current.$ref.startsWith('#/')) {
    current = current.$ref.slice(2).split('/').reduce((value, segment) => value?.[segment.replaceAll('~1', '/').replaceAll('~0', '~')], root);
  }
  return current;
}

/** 对合同 Schema 子树执行测试所需的 JSON Schema 结构约束。 */
function schemaAccepts(schemaRoot, schemaNode, value) {
  const node = resolveRef(schemaRoot, schemaNode);
  if (!node || typeof node !== 'object') return true;
  if (node.const !== undefined && value !== node.const) return false;
  if (node.enum && !node.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) return false;
  if (node.oneOf && node.oneOf.filter((branch) => schemaAccepts(schemaRoot, branch, value)).length !== 1) return false;
  if (node.anyOf && !node.anyOf.some((branch) => schemaAccepts(schemaRoot, branch, value))) return false;
  if (node.allOf && !node.allOf.every((branch) => schemaAccepts(schemaRoot, branch, value))) return false;
  if (node.not && schemaAccepts(schemaRoot, node.not, value)) return false;
  if (node.if) {
    const condition = schemaAccepts(schemaRoot, node.if, value);
    if (condition && node.then && !schemaAccepts(schemaRoot, node.then, value)) return false;
    if (!condition && node.else && !schemaAccepts(schemaRoot, node.else, value)) return false;
  }
  if (node.type) {
    const types = Array.isArray(node.type) ? node.type : [node.type];
    const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value === 'object' ? 'object' : typeof value;
    if (!types.includes(actual)) return false;
  }
  if (node.required && (!value || typeof value !== 'object' || Array.isArray(value) || node.required.some((key) => !Object.hasOwn(value, key)))) return false;
  if (node.properties && value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, childSchema] of Object.entries(node.properties)) if (Object.hasOwn(value, key) && !schemaAccepts(schemaRoot, childSchema, value[key])) return false;
    if (node.additionalProperties === false && Object.keys(value).some((key) => !Object.hasOwn(node.properties, key))) return false;
  }
  if (Array.isArray(value)) {
    if (node.minItems !== undefined && value.length < node.minItems) return false;
    if (node.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) return false;
    if (node.items && value.some((item) => !schemaAccepts(schemaRoot, node.items, item))) return false;
    if (node.contains && !value.some((item) => schemaAccepts(schemaRoot, node.contains, item))) return false;
  }
  if (typeof value === 'string' && node.minLength !== undefined && value.length < node.minLength) return false;
  if (typeof value === 'number') {
    if (node.minimum !== undefined && value < node.minimum) return false;
    if (node.exclusiveMinimum !== undefined && value <= node.exclusiveMinimum) return false;
    if (node.exclusiveMaximum !== undefined && value >= node.exclusiveMaximum) return false;
  }
  return true;
}

test('world-3d 合同通过公共入口校验且不会合并二维 HUD 根字段', () => {
  const contract = makeWorldContract();
  const wrapped = { responsiveContract: contract, designResolutionPolicy: { portrait: { width: 1080, height: 1920 } } };
  assert.deepEqual(validateResponsiveContract(contract), []);
  assert.deepEqual(validateResponsiveContract(wrapped), []);
  assert.deepEqual(extractResponsiveContract(wrapped), contract);
  assert.deepEqual(expectedWorldBackingSize({ x: 0, y: 0, width: 390.5, height: 844.5 }, 1.5), { width: 585, height: 1266 });
});

test('合同拒绝非法 renderer、DPR 上限、方向覆盖和裁面策略', () => {
  const badRenderer = makeWorldContract();
  badRenderer.renderer = 'webgl1';
  assert.match(validateResponsiveContract(badRenderer).join('\n'), /renderer 必须为 webgl2 或 webgpu/);
  const badDpr = makeWorldContract();
  badDpr.runtimeDprPolicy.maximum = 3;
  assert.match(validateResponsiveContract(badDpr).join('\n'), /封顶 2/);
  const badCoverage = makeWorldContract();
  badCoverage.representativeViewports.pop();
  assert.match(validateResponsiveContract(badCoverage).join('\n'), /缺少 landscape/);
  const badPlanes = makeWorldContract();
  badPlanes.cameraPolicy.near = badPlanes.cameraPolicy.far;
  assert.match(validateResponsiveContract(badPlanes).join('\n'), /0 < near < far/);
  const negativeOrthoNear = makeWorldContract({ cameraType: 'orthographic', near: -0.01 });
  assert.match(validateResponsiveContract(negativeOrthoNear).join('\n'), /0 <= near < far/);
  const zeroPerspectiveNear = makeWorldContract({ near: 0 });
  assert.match(validateResponsiveContract(zeroPerspectiveNear).join('\n'), /0 < near < far/);
});

test('透视 WebGL2 与正交 WebGPU 按 CSS aspect 验证矩阵，且正交 near=0 合法', () => {
  for (const contract of [makeWorldContract(), makeWorldContract({ renderer: 'webgpu', cameraType: 'orthographic' }), makeWorldContract({ renderer: 'webgpu', cameraType: 'orthographic', near: 0 })]) {
    assert.deepEqual(validateResponsiveContract(contract), []);
    const viewport = contract.representativeViewports[0];
    assert.deepEqual(validateResponsiveEvidenceRecord(makeEvidence(contract, viewport), contract, { candidateSha256: CANDIDATE, sceneId: 'arena', stateId: 'playing' }), []);
  }
});

test('世界证据绑定场景、状态、CSS/backing、输入命中和预算，摘要不参与验收', () => {
  const contract = makeWorldContract();
  const evidence = contract.representativeViewports.map((viewport) => makeEvidence(contract, viewport));
  const manifest = { candidateSha256: CANDIDATE, sceneId: 'arena', stateId: 'playing', responsiveEvidence: evidence };
  assert.deepEqual(validateResponsiveEvidenceManifest(manifest, { responsiveContract: contract }, { candidateSha256: CANDIDATE }), []);

  assert.deepEqual(validateResponsiveEvidenceManifest(manifest, contract, { candidateSha256: '不同的可选摘要' }), []);
  // 摘要缺失、错误或变化都不能阻断验收，真实运行数据与场景归属仍须完整。
  const withoutHashes = { ...manifest, responsiveEvidence: evidence.map(({ candidateSha256, ...record }) => record) };
  delete withoutHashes.candidateSha256;
  assert.deepEqual(validateResponsiveEvidenceManifest(withoutHashes, contract), []);
  const wrongScene = { ...evidence[0], sceneId: 'other' };
  assert.match(validateResponsiveEvidenceRecord(wrongScene, contract, { sceneId: 'arena' }).join('\n'), /sceneId 必须绑定当前场景/);
  const wrongState = { ...evidence[0], stateId: 'paused' };
  assert.match(validateResponsiveEvidenceRecord(wrongState, contract, { stateId: 'playing' }).join('\n'), /stateId 必须绑定当前场景状态/);
  const badProjection = { ...evidence[0], camera: { ...evidence[0].camera, projectionMatrix: Array(16).fill(0) } };
  assert.match(validateResponsiveEvidenceRecord(badProjection, contract).join('\n'), /projectionMatrix/);
  const badAspect = { ...evidence[0], camera: { ...evidence[0].camera, aspect: 1 } };
  assert.match(validateResponsiveEvidenceRecord(badAspect, contract).join('\n'), /camera.aspect/);
  const badBacking = { ...evidence[0], canvasBackingSize: { width: 586, height: 1266 } };
  assert.match(validateResponsiveEvidenceRecord(badBacking, contract).join('\n'), /setSize floor/);
  const badInput = { ...evidence[0], inputHitResults: [{ ...evidence[0].inputHitResults[0], hit: 'true' }] };
  assert.match(validateResponsiveEvidenceRecord(badInput, contract).join('\n'), /真实 hit\/expectedHit 布尔结果/);
  const badTrajectory = { ...evidence[0], resizeTrajectory: [evidence[0].resizeTrajectory[0], { ...evidence[0].resizeTrajectory[1], pageReloaded: true }] };
  assert.match(validateResponsiveEvidenceRecord(badTrajectory, contract).join('\n'), /同页 resize/);
  const overBudget = { ...evidence[0], rendererMetrics: { ...evidence[0].rendererMetrics, triangles: 300000 } };
  assert.match(validateResponsiveEvidenceRecord(overBudget, contract).join('\n'), /triangles 超出 performanceBudget/);
  const wrongViewport = { ...evidence[0], viewportId: 'unknown' };
  assert.match(validateResponsiveEvidenceRecord(wrongViewport, contract).join('\n'), /不属于 representativeViewports/);
});

test('Work Item 和 Implementation Package 的真实合同 Schema 同时保留 HUD 与 world-3d 分支', () => {
  for (const [label, schema] of [['Work Item', WORK_ITEM_SCHEMA], ['Implementation Package', IMPLEMENTATION_PACKAGE_SCHEMA]]) {
    const contractSchema = schema.$defs.responsiveViewportContract;
    const world = makeWorldContract();
    assert.equal(schemaAccepts(schema, contractSchema, world), true, `${label} 应接受 world-3d 合同`);
    assert.equal(schemaAccepts(schema, schema.properties.responsiveViewportContract, world), true, `${label} 的实际 responsiveViewportContract 属性应接受 world-3d 合同`);
    assert.equal(schemaAccepts(schema, schema.properties.responsiveContract, world), true, `${label} 的 responsiveContract 别名应接受 world-3d 合同`);
    const zeroNearOrthographic = makeWorldContract({ renderer: 'webgpu', cameraType: 'orthographic', near: 0 });
    assert.equal(schemaAccepts(schema, contractSchema, zeroNearOrthographic), true, `${label} 应允许正交 near=0`);
    assert.equal(schemaAccepts(schema, contractSchema, makeWorldContract({ near: 0 })), false, `${label} 应拒绝透视 near=0`);
    assert.equal(schemaAccepts(schema, contractSchema, { ...world, renderer: 'webgl1' }), false, `${label} 应拒绝无效 renderer`);
    const hud = { logicalViewportSpace: 'css-logical', designResolutionPolicy: { portrait: true }, canvasBackingPolicy: 'runtime-dpr' };
    assert.equal(schemaAccepts(schema, contractSchema, hud), false, `${label} 仍要求旧 HUD 完整合同字段`);

    const responsiveRule = schema.allOf.find((rule) => JSON.stringify(rule.if ?? {}).includes('responsiveViewportContract')
      && JSON.stringify(rule.if ?? {}).includes('world-3d'));
    const wrapper = {
      responsiveContractVersion: 'world-viewport/1.0',
      layoutContractVersion: 'layout/3d/1',
      visualBaselineVersion: 'baseline/3d/1',
      responsiveContract: world,
    };
    assert.ok(responsiveRule, `${label} 必须有 world-3d 根级条件分支`);
    assert.equal(schemaAccepts(schema, responsiveRule.if, wrapper), true);
    assert.equal(schemaAccepts(schema, responsiveRule.then, wrapper), true);
    assert.deepEqual(responsiveRule.then.required, ['responsiveContractVersion', 'layoutContractVersion', 'visualBaselineVersion']);
  }
  assert.equal(schemaAccepts(WORLD_SCHEMA, WORLD_SCHEMA, makeWorldContract()), true);
  const zeroNearOrthographic = makeWorldContract({ renderer: 'webgpu', cameraType: 'orthographic', near: 0 });
  assert.equal(schemaAccepts(WORLD_SCHEMA, WORLD_SCHEMA, zeroNearOrthographic), true, '正交相机 near=0 应符合独立 world schema');
  const zeroNearPerspective = makeWorldContract({ near: 0 });
  assert.equal(schemaAccepts(WORLD_SCHEMA, WORLD_SCHEMA, zeroNearPerspective), false, '透视相机 near=0 应被 Schema 拒绝');
  const negativeNearOrthographic = makeWorldContract({ cameraType: 'orthographic', near: -0.01 });
  assert.equal(schemaAccepts(WORLD_SCHEMA, WORLD_SCHEMA, negativeNearOrthographic), false, '正交相机仍不得使用负 near');
  const invalidProjectionPolicy = makeWorldContract();
  invalidProjectionPolicy.cameraPolicy.projectionUpdate = 'never';
  assert.equal(schemaAccepts(WORLD_SCHEMA, WORLD_SCHEMA, invalidProjectionPolicy), false);
});

test('模型生产词汇仅进入视觉生产单元，不扩展 effect-image 区域路线枚举', () => {
  const production = IMPLEMENTATION_PACKAGE_SCHEMA.$defs.visualProductionUnit.properties;
  assert.ok(production.production_method.enum.includes('authored-model'));
  assert.ok(production.delivery_kind.enum.includes('gltf-model'));
  const route = IMPLEMENTATION_PACKAGE_SCHEMA.$defs.sceneVisualRouteAnalysis.properties;
  assert.equal(route.production_method.enum.includes('authored-model'), false);
  assert.equal(route.delivery_kind.enum.includes('gltf-model'), false);
});
