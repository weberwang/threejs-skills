/**
 * Three.js 世界视口合同与证据校验。
 *
 * 该模块仅检查工作流提交的结构化事实，不启动渲染器或浏览器，也不把
 * 合同通过表述为游戏已完成运行验收。
 */
import { isDeviceDprInput, RUNTIME_MAX_DPR } from './workflow-dpr-contract.mjs';

/** 世界视口合同独立版本，避免复用二维 HUD 的设计分辨率版本。 */
export const WORLD_VIEWPORT_SCHEMA_VERSION = 'world-viewport/1.0';

/** 世界合同要求声明的字段，作为导出接口供控制面和测试复用。 */
export const WORLD_VIEWPORT_CONTRACT_FIELDS = Object.freeze([
  'schemaVersion', 'renderSpace', 'renderer', 'cssLogicalRect', 'canvasBackingPolicy',
  'runtimeDprPolicy', 'cameraPolicy', 'inputCoordinatePolicy', 'orientation',
  'representativeViewports', 'performanceBudget', 'requiredRuntimeEvidence', 'validationScope',
]);

/** 世界运行记录要求直接提供的机器可核对字段。 */
export const WORLD_VIEWPORT_EVIDENCE_FIELDS = Object.freeze([
  'capturedAt', 'measurementSource', 'viewportId', 'canvasCssRect', 'canvasBackingSize',
  'rawDevicePixelRatio', 'effectiveDevicePixelRatio', 'camera', 'inputHitResults',
  'resizeTrajectory', 'rendererMetrics', 'screenshot', 'sceneId', 'stateId', 'pageReloaded',
]);

/** 运行记录必须列出的证据字段；它们描述观察数据，不代表人工验收。 */
export const WORLD_VIEWPORT_REQUIRED_EVIDENCE = Object.freeze([...WORLD_VIEWPORT_EVIDENCE_FIELDS]);

const EPSILON = 1e-6;
const ALLOWED_ORIENTATIONS = new Set(['portrait', 'landscape']);
const ALLOWED_RENDERERS = new Set(['webgl2', 'webgpu']);

/** 判断值是否为非数组对象。 */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 判断字符串是否包含有效内容。 */
function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** 兼容控制面现存的 camelCase 与 snake_case 输入。 */
function readField(value, name) {
  if (value?.[name] !== undefined) return value[name];
  const snake = name.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
  return value?.[snake];
}

/** 判断 CSS 视口矩形是否具有有限原点和正数尺寸。 */
function isRect(value) {
  return isObject(value)
    && Number.isFinite(value.x) && Number.isFinite(value.y)
    && Number.isFinite(value.width) && value.width > 0
    && Number.isFinite(value.height) && value.height > 0;
}

/** 把 CSS 尺寸和有效 DPR 按 Three.js setSize 的 floor 规则映射到 backing。 */
export function expectedWorldBackingSize(cssRect, effectiveDpr) {
  if (!isRect({ x: 0, y: 0, ...cssRect }) || !Number.isFinite(effectiveDpr) || effectiveDpr <= 0) return null;
  return {
    width: Math.floor(cssRect.width * effectiveDpr),
    height: Math.floor(cssRect.height * effectiveDpr),
  };
}

/** 从证据结构中提取内嵌或直接传入的世界视口合同。 */
export function resolveWorldViewportContract(value) {
  if (!isObject(value)) return null;
  if (value.renderSpace === 'world-3d') return value;
  for (const candidate of [value.responsiveViewportContract, value.responsiveContract, value.responsive_contract]) {
    if (isObject(candidate) && candidate.renderSpace === 'world-3d') return candidate;
  }
  return null;
}

/** 判断对象本身是否是 world-3d 合同。 */
export function isWorldViewportContract(value) {
  return isObject(value) && value.renderSpace === 'world-3d';
}

/** 生成统一的定位错误信息。 */
function error(stage, scope, message, missing = '') {
  return `[${stage}] world viewport scene=${scope || '*'} ${message}${missing ? ` 缺失=${missing}` : ''}`;
}

/** 校验近远裁面和相机类型，并阻止合同退回固定 2D 设计分辨率。 */
function validateCameraPolicy(policy, stage, scope, errors) {
  if (!isObject(policy)) {
    errors.push(error(stage, scope, 'cameraPolicy 必须为对象', 'cameraPolicy'));
    return;
  }
  const near = policy.near;
  const far = policy.far;
  const invalidNear = policy.type === 'perspective' ? near <= 0 : near < 0;
  if (!Number.isFinite(near) || invalidNear || !Number.isFinite(far) || far <= near) {
    errors.push(error(stage, scope, 'cameraPolicy.near/far 必须满足透视相机 0 < near < far，或正交相机 0 <= near < far'));
  }
  if (policy.projectionUpdate !== 'updateProjectionMatrix-on-resize') errors.push(error(stage, scope, '相机尺寸变化必须调用 updateProjectionMatrix'));
  if (policy.type === 'perspective') {
    if (!isObject(policy.perspective)
      || !Number.isFinite(policy.perspective.fovDegrees)
      || policy.perspective.fovDegrees <= 0 || policy.perspective.fovDegrees >= 180
      || policy.perspective.aspectSource !== 'cssLogicalRect') {
      errors.push(error(stage, scope, '透视相机必须声明有效 fovDegrees 和 cssLogicalRect aspect 来源'));
    }
  } else if (policy.type === 'orthographic') {
    if (!isObject(policy.orthographic)
      || !Number.isFinite(policy.orthographic.verticalSpan) || policy.orthographic.verticalSpan <= 0
      || policy.orthographic.horizontalSpan !== 'derive-from-css-aspect') {
      errors.push(error(stage, scope, '正交相机必须声明正数 verticalSpan 并按 CSS aspect 推导 horizontalSpan'));
    }
  } else {
    errors.push(error(stage, scope, 'cameraPolicy.type 必须为 perspective 或 orthographic'));
  }
}

/** 校验合同代表视口尺寸、唯一标识和允许方向覆盖。 */
function validateRepresentativeViewports(contract, stage, scope, errors) {
  const allowed = contract.orientation?.allowed;
  if (!Array.isArray(allowed) || allowed.length === 0 || new Set(allowed).size !== allowed.length
    || allowed.some((orientation) => !ALLOWED_ORIENTATIONS.has(orientation))) {
    errors.push(error(stage, scope, 'orientation.allowed 必须是非空、唯一的 portrait/landscape 数组'));
    return;
  }
  const viewports = contract.representativeViewports;
  if (!Array.isArray(viewports) || viewports.length === 0) {
    errors.push(error(stage, scope, 'representativeViewports 必须为非空数组', 'representativeViewports'));
    return;
  }
  const ids = new Set();
  const covered = new Set();
  for (const [index, viewport] of viewports.entries()) {
    if (!isObject(viewport) || !nonEmptyString(viewport.id) || !isRect({ x: 0, y: 0, ...viewport.cssLogicalRect })) {
      errors.push(error(stage, scope, `representativeViewports[${index}] 必须声明 id 和正数 cssLogicalRect`));
      continue;
    }
    if (ids.has(viewport.id)) errors.push(error(stage, scope, `representativeViewports.id 重复：${viewport.id}`));
    ids.add(viewport.id);
    const orientation = viewport.cssLogicalRect.width >= viewport.cssLogicalRect.height ? 'landscape' : 'portrait';
    if (!allowed.includes(orientation)) errors.push(error(stage, scope, `${viewport.id} 的方向 ${orientation} 不在 orientation.allowed 中`));
    covered.add(orientation);
  }
  for (const orientation of allowed) if (!covered.has(orientation)) errors.push(error(stage, scope, `representativeViewports 缺少 ${orientation} 代表视口`));
}

/** 校验独立 world-3d 合同，不读取浏览器或声明运行验收结果。 */
export function validateWorldViewportContract(value, options = {}) {
  const contract = resolveWorldViewportContract(value) ?? value;
  const stage = String(options.stage ?? 'V1').toUpperCase();
  const scope = options.scope ?? '*';
  const errors = [];
  if (!isObject(contract)) return [error(stage, scope, 'world-3d 响应式合同必须为对象')];
  if (contract.schemaVersion !== WORLD_VIEWPORT_SCHEMA_VERSION) errors.push(error(stage, scope, `schemaVersion 必须为 ${WORLD_VIEWPORT_SCHEMA_VERSION}`));
  if (contract.renderSpace !== 'world-3d') errors.push(error(stage, scope, 'renderSpace 必须为 world-3d'));
  if (!ALLOWED_RENDERERS.has(contract.renderer)) errors.push(error(stage, scope, 'renderer 必须为 webgl2 或 webgpu'));
  const css = contract.cssLogicalRect;
  if (!isObject(css) || css.coordinateSpace !== 'css-pixel' || css.origin !== 'top-left'
    || css.source !== 'canvas.getBoundingClientRect' || css.fill !== 'viewport') {
    errors.push(error(stage, scope, 'cssLogicalRect 必须定义 Canvas 的 CSS 像素逻辑矩形'));
  }
  const backing = contract.canvasBackingPolicy;
  if (!isObject(backing) || backing.method !== 'threejs-renderer-setSize'
    || backing.rounding !== 'floor' || backing.updateStyle !== false
    || backing.pixelRatioSource !== 'effectiveDevicePixelRatio') {
    errors.push(error(stage, scope, 'canvasBackingPolicy 必须声明 setSize、floor、updateStyle=false 和有效 DPR'));
  }
  const dpr = contract.runtimeDprPolicy;
  if (!isObject(dpr) || !String(dpr.source ?? '').includes('devicePixelRatio') || dpr.dynamic !== true
    || dpr.invalidFallback !== 1 || dpr.maximum !== RUNTIME_MAX_DPR
    || !Array.isArray(dpr.updatesOn) || !dpr.updatesOn.includes('resize') || !dpr.updatesOn.includes('display-density-change')) {
    errors.push(error(stage, scope, `runtimeDprPolicy 必须动态读取设备 DPR、非法回退 1、封顶 ${RUNTIME_MAX_DPR} 并覆盖 resize/密度变化`));
  }
  validateCameraPolicy(contract.cameraPolicy, stage, scope, errors);
  const input = contract.inputCoordinatePolicy;
  if (!isObject(input) || input.from !== 'css-client-pixel' || input.to !== 'ndc'
    || input.raycaster !== 'THREE.Raycaster' || input.mapping !== 'canvas-local-to-ndc') {
    errors.push(error(stage, scope, 'inputCoordinatePolicy 必须描述 CSS client → NDC → THREE.Raycaster'));
  }
  validateRepresentativeViewports(contract, stage, scope, errors);
  const budget = contract.performanceBudget;
  const budgetFields = ['maxDrawCalls', 'maxTriangles', 'maxGeometries', 'maxTextures', 'maxFrameTimeMs'];
  if (!isObject(budget)) errors.push(error(stage, scope, 'performanceBudget 必须声明 Three.js renderer metrics 上限'));
  else for (const name of budgetFields) if (!Number.isFinite(budget[name]) || budget[name] < 0) errors.push(error(stage, scope, `performanceBudget.${name} 必须是非负有限数值`));
  if (!Array.isArray(contract.requiredRuntimeEvidence)
    || WORLD_VIEWPORT_REQUIRED_EVIDENCE.some((name) => !contract.requiredRuntimeEvidence.includes(name))) {
    errors.push(error(stage, scope, 'requiredRuntimeEvidence 必须覆盖世界视口实测字段'));
  }
  if (contract.validationScope !== 'machine-contract-only') errors.push(error(stage, scope, 'validationScope 必须明确为 machine-contract-only'));
  return [...new Set(errors)];
}

/** 按 renderer coordinate system 生成 Three.js 透视投影矩阵期望值。 */
function perspectiveProjection(camera, renderer) {
  const f = 1 / Math.tan(camera.fovDegrees * Math.PI / 360);
  const near = camera.near;
  const far = camera.far;
  const webgpu = renderer === 'webgpu';
  const matrix = Array(16).fill(0);
  matrix[0] = f / camera.aspect;
  matrix[5] = f;
  matrix[10] = webgpu ? far / (near - far) : (far + near) / (near - far);
  matrix[11] = -1;
  matrix[14] = webgpu ? far * near / (near - far) : (2 * far * near) / (near - far);
  return matrix;
}

/** 按 renderer coordinate system 生成 Three.js 正交投影矩阵期望值。 */
function orthographicProjection(camera, renderer) {
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

/** 比较实测投影矩阵与相机参数推导出的 Three.js 矩阵。 */
function matricesMatch(actual, expected) {
  return Array.isArray(actual) && actual.length === 16
    && actual.every((value, index) => Number.isFinite(value) && Math.abs(value - expected[index]) <= EPSILON);
}

/** 校验当前相机参数、视口 aspect、近远裁面与实际投影矩阵。 */
function validateCameraEvidence(camera, cssRect, contract, stage, scope, errors) {
  const policy = contract.cameraPolicy;
  if (!isObject(policy)) {
    errors.push(error(stage, scope, 'cameraPolicy 必须为对象'));
    return;
  }
  if (!isObject(camera)) {
    errors.push(error(stage, scope, 'camera 必须提供真实类型、裁面与投影矩阵'));
    return;
  }
  if (camera.type !== policy.type) errors.push(error(stage, scope, 'camera.type 与合同投影类型不一致'));
  if (camera.near !== policy.near || camera.far !== policy.far) errors.push(error(stage, scope, 'camera near/far 与合同裁面不一致'));
  const expectedAspect = cssRect.width / cssRect.height;
  let expectedMatrix;
  if (policy.type === 'perspective') {
    if (camera.fovDegrees !== policy.perspective?.fovDegrees) errors.push(error(stage, scope, '透视 camera.fovDegrees 与合同不一致'));
    if (!Number.isFinite(camera.aspect) || Math.abs(camera.aspect - expectedAspect) > EPSILON) errors.push(error(stage, scope, '透视 camera.aspect 必须等于 CSS 逻辑矩形宽高比'));
    if ([camera.near, camera.far, camera.fovDegrees, camera.aspect].every(Number.isFinite) && camera.near > 0 && camera.far > camera.near && camera.fovDegrees > 0 && camera.fovDegrees < 180 && camera.aspect > 0) {
      expectedMatrix = perspectiveProjection(camera, contract.renderer);
    }
  } else if (policy.type === 'orthographic') {
    const { left, right, top, bottom, near, far } = camera;
    if (![left, right, top, bottom].every(Number.isFinite) || right <= left || top <= bottom) {
      errors.push(error(stage, scope, '正交 camera bounds 必须为有限且有正跨度的矩形'));
    } else {
      const aspect = (right - left) / (top - bottom);
      const verticalSpan = top - bottom;
      if (Math.abs(aspect - expectedAspect) > EPSILON) errors.push(error(stage, scope, '正交 camera bounds aspect 必须等于 CSS 逻辑矩形宽高比'));
      if (Math.abs(verticalSpan - policy.orthographic.verticalSpan) > EPSILON) errors.push(error(stage, scope, '正交 camera verticalSpan 与合同不一致'));
      if (near === policy.near && far === policy.far) expectedMatrix = orthographicProjection(camera, contract.renderer);
    }
  }
  if (expectedMatrix && !matricesMatch(camera.projectionMatrix, expectedMatrix)) errors.push(error(stage, scope, 'camera.projectionMatrix 与相机参数、renderer coordinate system 不一致'));
  if (!Array.isArray(camera.projectionMatrix) || camera.projectionMatrix.length !== 16) errors.push(error(stage, scope, 'camera.projectionMatrix 必须是 16 个有限实数'));
}

/** 检查 DPR 封顶、CSS/backing 尺寸与 Canvas setSize floor 关系。 */
function validateMeasuredViewport(rect, backing, rawDpr, effectiveDpr, contract, stage, scope, errors) {
  if (!isRect(rect)) errors.push(error(stage, scope, 'canvasCssRect 必须是正数 CSS 矩形'));
  if (!isObject(backing) || !Number.isInteger(backing.width) || !Number.isInteger(backing.height) || backing.width <= 0 || backing.height <= 0) errors.push(error(stage, scope, 'canvasBackingSize 必须为正整数尺寸'));
  if (!isDeviceDprInput(rawDpr)) errors.push(error(stage, scope, 'rawDevicePixelRatio 必须为正有限数值'));
  const expectedDpr = isDeviceDprInput(rawDpr) ? Math.min(rawDpr, RUNTIME_MAX_DPR) : null;
  if (!Number.isFinite(effectiveDpr) || effectiveDpr !== expectedDpr) errors.push(error(stage, scope, `effectiveDevicePixelRatio 必须从原始设备 DPR 动态归一并封顶为 ${RUNTIME_MAX_DPR}`));
  if (isRect(rect) && isObject(backing) && Number.isFinite(effectiveDpr) && effectiveDpr > 0) {
    const expectedBacking = expectedWorldBackingSize(rect, effectiveDpr);
    if (backing.width !== expectedBacking.width || backing.height !== expectedBacking.height) {
      errors.push(error(stage, scope, 'Canvas backing 必须按 CSS 尺寸 × 有效 DPR 并使用 setSize floor 规则计算'));
    }
  }
  if (isRect(rect) && contract.cssLogicalRect?.fill !== 'viewport') errors.push(error(stage, scope, 'Canvas CSS 矩形必须填满 viewport'));
}

/** 检查 CSS client 点到 Canvas NDC 的换算以及 Raycaster 真实布尔结果。 */
function validateInputHits(hits, rect, stage, scope, errors) {
  if (!Array.isArray(hits) || hits.length === 0) {
    errors.push(error(stage, scope, 'inputHitResults 必须包含 Raycaster 布尔命中样本'));
    return;
  }
  for (const [index, hit] of hits.entries()) {
    const client = hit?.cssClientPoint;
    const ndc = hit?.ndc;
    if (!isObject(client) || !isObject(ndc) || ![client.x, client.y, ndc.x, ndc.y].every(Number.isFinite)) {
      errors.push(error(stage, scope, `inputHitResults[${index}] 缺少 CSS client 点或 NDC 实测值`));
      continue;
    }
    if (!isRect(rect)) {
      errors.push(error(stage, scope, `inputHitResults[${index}] 无法绑定有效的 canvasCssRect`));
      continue;
    }
    const localX = client.x - rect.x;
    const localY = client.y - rect.y;
    if (localX < 0 || localX > rect.width || localY < 0 || localY > rect.height) errors.push(error(stage, scope, `inputHitResults[${index}] CSS 点超出 Canvas rect`));
    const expectedNdc = { x: (localX / rect.width) * 2 - 1, y: 1 - (localY / rect.height) * 2 };
    if (Math.abs(ndc.x - expectedNdc.x) > EPSILON || Math.abs(ndc.y - expectedNdc.y) > EPSILON) errors.push(error(stage, scope, `inputHitResults[${index}] NDC 未按 CSS client → Canvas → NDC 计算`));
    if (typeof hit.hit !== 'boolean' || typeof hit.expectedHit !== 'boolean' || hit.hit !== hit.expectedHit) errors.push(error(stage, scope, `inputHitResults[${index}] 必须记录相符的真实 hit/expectedHit 布尔结果`));
  }
}

/** 检查 renderer.info 及帧耗时数据均落在合同性能预算内。 */
function validateRendererMetrics(metrics, contract, stage, scope, errors) {
  const fields = ['drawCalls', 'triangles', 'geometries', 'textures', 'frameTimeMs'];
  if (!isObject(metrics) || metrics.renderer !== contract.renderer) {
    errors.push(error(stage, scope, 'rendererMetrics 必须绑定合同 renderer'));
    return;
  }
  const budget = isObject(contract.performanceBudget) ? contract.performanceBudget : {};
  for (const name of fields) {
    if (!Number.isFinite(metrics[name]) || metrics[name] < 0) errors.push(error(stage, scope, `rendererMetrics.${name} 必须为非负有限数值`));
    else if (metrics[name] > budget[name === 'frameTimeMs' ? 'maxFrameTimeMs' : `max${name[0].toUpperCase()}${name.slice(1)}`]) errors.push(error(stage, scope, `rendererMetrics.${name} 超出 performanceBudget`));
  }
}

/** 校验每个同页 resize 样本的 CSS/backing、DPR、aspect 和投影矩阵。 */
function validateResizeTrajectory(record, contract, stage, scope, errors) {
  const trajectory = record.resizeTrajectory;
  if (!Array.isArray(trajectory) || trajectory.length < 2) {
    errors.push(error(stage, scope, 'resizeTrajectory 至少包含初始和变化后的两个样本'));
    return;
  }
  let changed = false;
  for (const [index, sample] of trajectory.entries()) {
    if (!isObject(sample) || sample.samePage !== true || sample.pageReloaded !== false) errors.push(error(stage, scope, `resizeTrajectory[${index}] 必须声明同页 resize 且未重载`));
    validateMeasuredViewport(sample?.canvasCssRect, sample?.canvasBackingSize, sample?.rawDevicePixelRatio, sample?.effectiveDevicePixelRatio, contract, stage, scope, errors);
    if (isRect(sample?.canvasCssRect)) validateCameraEvidence(sample.camera, sample.canvasCssRect, contract, stage, scope, errors);
    if (index > 0) {
      const previous = trajectory[index - 1];
      const before = previous?.canvasCssRect;
      const after = sample?.canvasCssRect;
      if (isRect(before) && isRect(after) && (before.width !== after.width || before.height !== after.height)) changed = true;
    }
  }
  if (!changed) errors.push(error(stage, scope, 'resizeTrajectory 必须包含同一页面内真实变化的 CSS viewport 尺寸'));
}

/** 校验单条世界视口运行观察记录；只返回结构合同错误，不输出验收结论。 */
export function validateWorldViewportEvidenceRecord(record, contract, options = {}) {
  const stage = String(options.stage ?? 'V4').toUpperCase();
  const scope = options.scope ?? record?.sceneId ?? '*';
  const errors = [];
  if (!isObject(record)) return [error(stage, scope, '世界视口运行证据必须为对象')];
  if (!isObject(contract)) return [error(stage, scope, 'world-3d 运行证据缺少对应响应式合同')];
  const contractErrors = validateWorldViewportContract(contract, { stage, scope });
  if (contractErrors.length) return contractErrors;
  for (const name of WORLD_VIEWPORT_EVIDENCE_FIELDS) if (readField(record, name) === undefined) errors.push(error(stage, scope, `证据缺少 ${name}`, name));
  if (!nonEmptyString(record.capturedAt) || Number.isNaN(Date.parse(record.capturedAt))) errors.push(error(stage, scope, 'capturedAt 必须是有效测量时间'));
  if (record.measurementSource !== 'browser-runtime') errors.push(error(stage, scope, 'measurementSource 必须指向 browser-runtime 观察来源'));
  if (!nonEmptyString(record.sceneId) || (options.sceneId && record.sceneId !== options.sceneId)) errors.push(error(stage, scope, 'sceneId 必须绑定当前场景'));
  if (!nonEmptyString(record.stateId) || (options.stateId && record.stateId !== options.stateId)) errors.push(error(stage, scope, 'stateId 必须绑定当前场景状态'));
  if (record.pageReloaded !== false) errors.push(error(stage, scope, 'resize 证据必须声明 pageReloaded=false'));
  validateMeasuredViewport(record.canvasCssRect, record.canvasBackingSize, record.rawDevicePixelRatio, record.effectiveDevicePixelRatio, contract, stage, scope, errors);
  if (isRect(record.canvasCssRect)) validateCameraEvidence(record.camera, record.canvasCssRect, contract, stage, scope, errors);
  validateInputHits(record.inputHitResults, record.canvasCssRect, stage, scope, errors);
  validateResizeTrajectory(record, contract, stage, scope, errors);
  validateRendererMetrics(record.rendererMetrics, contract, stage, scope, errors);
  const viewport = contract.representativeViewports?.find((item) => item.id === record.viewportId);
  if (!viewport) errors.push(error(stage, scope, `viewportId ${record.viewportId ?? '<missing>'} 不属于 representativeViewports`));
  else if (!isRect(record.canvasCssRect) || Math.abs(viewport.cssLogicalRect.width - record.canvasCssRect.width) > EPSILON
    || Math.abs(viewport.cssLogicalRect.height - record.canvasCssRect.height) > EPSILON) errors.push(error(stage, scope, '运行 CSS 尺寸与声明的 representative viewport 不一致'));
  if (!(typeof record.screenshot === 'string' && record.screenshot.trim()) && !isObject(record.screenshot)) errors.push(error(stage, scope, 'screenshot 必须引用运行时截图证据'));
  return [...new Set(errors)];
}

/** 校验世界证据清单中的候选绑定、场景/状态和代表视口覆盖。 */
export function validateWorldViewportEvidenceManifest(value, contract, options = {}) {
  const stage = String(options.stage ?? value?.currentStage ?? value?.current_stage ?? 'V4').toUpperCase();
  const errors = [];
  if (!isObject(contract)) return [error(stage, '*', '世界视口证据清单缺少 world-3d 响应式合同')];
  const contractErrors = validateWorldViewportContract(contract, { stage, scope: '*' });
  if (contractErrors.length) return contractErrors;
  const records = Array.isArray(value) ? value : value?.responsiveEvidence ?? value?.responsiveRuntimeEvidence ?? value?.runtimeEvidence;
  if (!Array.isArray(records) || records.length === 0) return [error(stage, '*', '世界视口证据清单必须包含运行观察记录')];
  const sceneId = options.sceneId ?? (!Array.isArray(value) ? value.sceneId : undefined);
  const stateId = options.stateId ?? (!Array.isArray(value) ? value.stateId : undefined);
  if (!options.requiredUnits?.length && !nonEmptyString(sceneId)) errors.push(error(stage, '*', '清单必须绑定当前 sceneId'));
  if (!options.requiredUnits?.length && !nonEmptyString(stateId)) errors.push(error(stage, '*', '清单必须绑定当前 stateId'));
  const expectedUnits = Array.isArray(options.requiredUnits) ? options.requiredUnits.filter(isObject) : [];
  for (const [index, record] of records.entries()) {
    // 只按实际声明的标识匹配单位，避免两个缺省 undefined 被误判为同一场景。
    const unit = expectedUnits.find((item) => (item.sceneId !== undefined && item.sceneId === record?.sceneId)
      || (item.displayLayerId !== undefined && item.displayLayerId === record?.displayLayerId));
    errors.push(...validateWorldViewportEvidenceRecord(record, contract, {
      ...options,
      sceneId: unit?.sceneId ?? sceneId,
      stateId: unit?.stateId ?? stateId,
      scope: record?.sceneId ?? `record-${index}`,
      stage,
    }));
  }
  const scopes = expectedUnits.length
    ? expectedUnits.map((unit) => ({
      id: unit.displayLayerId ?? unit.sceneId ?? '*',
      records: records.filter((record) => unit.sceneId
        ? record?.sceneId === unit.sceneId && (unit.stateId === undefined || record?.stateId === unit.stateId)
        : record?.displayLayerId === unit.displayLayerId),
    }))
    : [{ id: sceneId ?? '*', records: records.filter((record) => (!sceneId || record?.sceneId === sceneId) && (!stateId || record?.stateId === stateId)) }];
  for (const scope of scopes) {
    if (!scope.records.length) errors.push(error(stage, scope.id, '当前场景/状态缺少独立世界视口记录'));
    for (const viewport of contract.representativeViewports ?? []) {
      if (!scope.records.some((record) => record?.viewportId === viewport.id
        && record?.canvasCssRect?.width === viewport.cssLogicalRect.width
        && record?.canvasCssRect?.height === viewport.cssLogicalRect.height)) {
        errors.push(error(stage, scope.id, `证据未覆盖代表视口 ${viewport.id}`));
      }
    }
  }
  return [...new Set(errors)];
}
