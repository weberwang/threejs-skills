const RUNTIME_SCHEMA = "threejs-layout-runtime/1";
const IDENTITY_TRANSFORM_2D = Object.freeze([1, 0, 0, 1, 0, 0]);
const TRANSFORM_TOLERANCE = 1e-5;
const BATCH_FIELDS = Object.freeze([
  "schema", "batch_id", "viewport_revision", "scene_id", "state_id", "candidate_id",
  "coordinate_space", "viewport_bounds", "safe_area_bounds",
]);

/** 判断值是否为普通对象。 */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 判断字符串是否包含非空白字符。 */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** 判断矩形是否为有限的正尺寸对象。 */
function isBounds(value) {
  return isRecord(value)
    && [value.x, value.y, value.width, value.height].every(Number.isFinite)
    && value.width > 0 && value.height > 0;
}

/** 判断宽高对象是否为有限正尺寸。 */
function isSize(value) {
  return isRecord(value) && Number.isFinite(value.width) && Number.isFinite(value.height)
    && value.width > 0 && value.height > 0;
}

/** 解析浏览器序列化后的二维仿射矩阵，无法证明时要求项目提供实际图片读取器。 */
function parseTransform2D(transform, label) {
  if (transform === undefined || transform === null) return [...IDENTITY_TRANSFORM_2D];
  if (typeof transform !== "string") {
    throw new TypeError(`${label} 的 CSS transform 无法证明为等比二维变换，请提供项目实际 readImage(element)`);
  }
  const value = transform.trim();
  if (value === "" || value === "none") return [...IDENTITY_TRANSFORM_2D];
  const match = value.match(/^matrix\((.*)\)$/);
  if (!match) {
    throw new TypeError(`${label} 的 CSS transform 无法证明为等比二维变换，请提供项目实际 readImage(element)`);
  }
  const values = match[1].split(",").map((part) => Number(part.trim()));
  if (values.length !== 6 || values.some((part) => !Number.isFinite(part))) {
    throw new TypeError(`${label} 的 CSS transform 矩阵无效，请提供项目实际 readImage(element)`);
  }
  return values;
}

/** 按矩阵复合顺序合并祖先与元素二维变换。 */
function multiplyTransform2D(left, right) {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

/** 拒绝默认读取器无法证明为等比二维变换的 perspective/individual transform。 */
function rejectUnsupportedTransformProperties(style, label) {
  const perspective = style?.perspective;
  if (perspective !== undefined && perspective !== null
    && String(perspective).trim() !== "" && String(perspective).trim() !== "none") {
    throw new TypeError(`${label} 的 CSS perspective 无法由默认 IMG 读取器证明内容比例，请提供项目实际 readImage(element)`);
  }
  for (const property of ["translate", "rotate", "scale"]) {
    const value = style?.[property];
    if (value !== undefined && value !== null && String(value).trim() !== "" && String(value).trim() !== "none") {
      throw new TypeError(`${label} 使用了独立 CSS ${property} 变换，请提供项目实际 readImage(element)`);
    }
  }
}

/** 深拷贝本次读取的纯数据，避免后续可变对象污染证据批次。 */
function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
}

/** 同步读取批次上下文，并拒绝把冻结布局节点混入运行采集参数。 */
function readRuntimeBatch(readContext, label) {
  if (typeof readContext !== "function") throw new TypeError(`${label}.readContext 必须是同步实际读取函数`);
  const value = readContext();
  if (value && typeof value.then === "function") throw new TypeError(`${label}.readContext 必须同步返回运行上下文`);
  const batch = isRecord(value?.runtime_batch) ? value.runtime_batch : value;
  if (!isRecord(batch)) throw new TypeError(`${label}.readContext 必须返回 runtime_batch`);
  for (const forbidden of ["nodes", "layout_nodes", "layout_execution", "plans"]) {
    if (Object.hasOwn(value, forbidden) || Object.hasOwn(batch, forbidden)) {
      throw new TypeError(`${label}.readContext 不能携带冻结 layout nodes 或执行计划`);
    }
  }
  for (const field of BATCH_FIELDS) if (!Object.hasOwn(batch, field)) throw new TypeError(`${label}.runtime_batch 缺少 ${field}`);
  if (batch.schema !== RUNTIME_SCHEMA || !isNonEmptyString(batch.batch_id)
    || !Number.isSafeInteger(batch.viewport_revision) || batch.viewport_revision < 0
    || !isNonEmptyString(batch.scene_id) || !isNonEmptyString(batch.state_id)
    || !isNonEmptyString(batch.candidate_id) || batch.coordinate_space !== "layout-logical-px"
    || !isBounds(batch.viewport_bounds) || !isBounds(batch.safe_area_bounds)) {
    throw new TypeError(`${label}.runtime_batch 字段格式无效`);
  }
  return cloneValue(batch);
}

/** 比较两次实际上下文读取，确保采集过程中视口和场景身份没有变化。 */
function sameBatch(left, right) {
  return BATCH_FIELDS.every((field) => {
    if (["viewport_bounds", "safe_area_bounds"].includes(field)) {
      return isBounds(left[field]) && isBounds(right[field])
        && ["x", "y", "width", "height"].every((key) => left[field][key] === right[field][key]);
    }
    return left[field] === right[field];
  });
}

/** 检查回调提供的运行态矩形是否与同批引用源一致。 */
function sameOptionalBounds(actual, expected) {
  if (actual === undefined || actual === null) return true;
  return isBounds(actual) && isBounds(expected)
    && ["x", "y", "width", "height"].every((key) => actual[key] === expected[key]);
}

/** 收集同一 viewport revision 下的实际组件读数并解析同批参照矩形。 */
export function collectLayoutRuntimeSnapshots(bindings, readContext) {
  if (!Array.isArray(bindings)) throw new TypeError("bindings 必须是数组");
  const batch = readRuntimeBatch(readContext, "layout_runtime");
  const ids = new Set();
  const rawSnapshots = [];
  for (const [index, binding] of bindings.entries()) {
    const label = `bindings[${index}]`;
    if (!isRecord(binding) || Object.keys(binding).some((key) => !["layout_node_id", "readSnapshot"].includes(key))) {
      throw new TypeError(`${label} 只能包含 layout_node_id 和 readSnapshot`);
    }
    if (!isNonEmptyString(binding.layout_node_id)) throw new TypeError(`${label}.layout_node_id 必须是非空字符串`);
    if (ids.has(binding.layout_node_id)) throw new TypeError(`${label}.layout_node_id 重复：${binding.layout_node_id}`);
    ids.add(binding.layout_node_id);
    if (typeof binding.readSnapshot !== "function") throw new TypeError(`${label}.readSnapshot 必须是实际同步读取函数`);
    const source = binding.readSnapshot();
    if (!isRecord(source) || (source && typeof source.then === "function")) {
      throw new TypeError(`${label}.readSnapshot 必须同步返回实际 component_snapshot 对象`);
    }
    if (source.layout_node_id !== undefined && source.layout_node_id !== binding.layout_node_id) {
      throw new TypeError(`${label}.readSnapshot 返回了其他布局节点身份`);
    }
    if (source.batch_id !== undefined && source.batch_id !== batch.batch_id) {
      throw new TypeError(`${label}.readSnapshot.batch_id 与采集批次不一致`);
    }
    if (source.viewport_revision !== undefined && source.viewport_revision !== batch.viewport_revision) {
      throw new TypeError(`${label}.readSnapshot.viewport_revision 与采集批次不一致`);
    }
    rawSnapshots.push({ layout_node_id: binding.layout_node_id, component_snapshot: cloneValue(source) });
  }
  const batchAfter = readRuntimeBatch(readContext, "layout_runtime");
  if (!sameBatch(batch, batchAfter)) {
    throw new TypeError("采集期间 runtime_batch 或 viewport_revision 发生变化，拒绝合并跨批次快照");
  }

  const snapshotById = new Map(rawSnapshots.map((entry) => [entry.layout_node_id, entry.component_snapshot]));
  for (const entry of rawSnapshots) {
    const snapshot = entry.component_snapshot;
    const referenceId = snapshot.reference_id;
    let referenceBounds;
    if (referenceId === "viewport") referenceBounds = batch.viewport_bounds;
    else if (referenceId === "safe-area") referenceBounds = batch.safe_area_bounds;
    else referenceBounds = snapshotById.get(referenceId)?.layout_bounds;
    if (!sameOptionalBounds(snapshot.reference_bounds, referenceBounds)) {
      throw new TypeError(`节点 ${entry.layout_node_id} 的 reference_bounds 与同批实际参照 ${referenceId} 不一致`);
    }
    snapshot.reference_bounds = isBounds(referenceBounds) ? cloneValue(referenceBounds) : null;
    snapshot.batch_id = batch.batch_id;
    snapshot.viewport_revision = batch.viewport_revision;
  }
  return { runtime_batch: batch, component_snapshots: rawSnapshots };
}

/** 根据真实 DOM 元素建立运行读数适配器，CSS 矩形必须显式换算到逻辑坐标。 */
export function createDomLayoutBinding(element, options = {}) {
  const {
    layout_node_id: layoutNodeId,
    cssToLayout,
    readParentLayoutNodeId,
    readReferenceId,
    readPositionWriters,
    readSizeWriters,
    readImage,
    readLocalSize,
    getComputedStyle,
  } = options;
  if (!element || typeof element.getBoundingClientRect !== "function") throw new TypeError("DOM binding 需要真实 DOM 元素");
  if (!isNonEmptyString(layoutNodeId)) throw new TypeError("DOM binding.layout_node_id 必须是非空字符串");
  for (const [name, callback] of Object.entries({ cssToLayout, readParentLayoutNodeId, readReferenceId, readPositionWriters, readSizeWriters })) {
    if (typeof callback !== "function") throw new TypeError(`DOM binding.${name} 必须读取当前项目运行状态`);
  }
  const computedStyle = getComputedStyle ?? globalThis.getComputedStyle;
  if (typeof computedStyle !== "function") throw new TypeError("DOM binding 需要 getComputedStyle 读取实际祖先可见性");

  /** 使用 computed style 和实际 DOM 挂载状态检查节点及全部祖先。 */
  function readActive() {
    if (element.isConnected !== true) return false;
    let current = element;
    while (current) {
      const style = computedStyle(current);
      if (style?.display === "none" || style?.visibility === "hidden" || style?.visibility === "collapse"
        || style?.contentVisibility === "hidden") return false;
      current = current.parentElement ?? null;
    }
    return true;
  }

  /** 显式转换 DOM/CSS 几何，绝不把浏览器 CSS 像素直接当作游戏逻辑像素。 */
  function toLayoutRect(rect, label) {
    const converted = cssToLayout({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    if (!isBounds(converted)) throw new TypeError(`${label} 的 cssToLayout 必须返回有效逻辑矩形`);
    return { x: converted.x, y: converted.y, width: converted.width, height: converted.height };
  }

  /** 将 CSS 局部宽高换算为布局坐标单位，同时保留其未变换语义。 */
  function toLayoutSize(size, label) {
    const converted = cssToLayout({ x: 0, y: 0, width: size.width, height: size.height });
    if (!isBounds(converted)) throw new TypeError(`${label} 的 cssToLayout 未能转换局部尺寸`);
    return { width: converted.width, height: converted.height };
  }

  /** 合并元素到祖先的 transform，并证明两个屏幕基向量等长且正交。 */
  function readUniformTransformScale() {
    let accumulated = [...IDENTITY_TRANSFORM_2D];
    let current = element;
    while (current) {
      const style = computedStyle(current);
      const label = `DOM ${layoutNodeId}`;
      rejectUnsupportedTransformProperties(style, label);
      const transform = parseTransform2D(style?.transform, label);
      accumulated = multiplyTransform2D(transform, accumulated);
      current = current.parentElement ?? null;
    }

    const [a, b, c, d] = accumulated;
    const xLength = Math.hypot(a, b);
    const yLength = Math.hypot(c, d);
    const product = xLength * yLength;
    const scale = Math.max(1, xLength, yLength);
    const orthogonal = product > 0 && Math.abs(a * c + b * d) <= TRANSFORM_TOLERANCE * product;
    const uniform = Math.abs(xLength - yLength) <= TRANSFORM_TOLERANCE * scale;
    if (!Number.isFinite(product) || xLength <= TRANSFORM_TOLERANCE || yLength <= TRANSFORM_TOLERANCE
      || !orthogonal || !uniform) {
      throw new TypeError(`DOM ${layoutNodeId} 的累计 CSS transform 非等比或含剪切，默认 IMG 读取器无法证明内容比例，请提供项目实际 readImage(element)`);
    }
    return (xLength + yLength) / 2;
  }

  /** 读取原生 img 源和 object-fit 后的内容尺寸，复杂纹理由项目回调提供。 */
  function readDefaultImage() {
    if (String(element.tagName ?? "").toUpperCase() !== "IMG") return null;
    const sourceWidth = element.naturalWidth;
    const sourceHeight = element.naturalHeight;
    if (!(sourceWidth > 0 && sourceHeight > 0)) return null;
    const boxWidth = element.clientWidth ?? element.offsetWidth;
    const boxHeight = element.clientHeight ?? element.offsetHeight;
    if (!(boxWidth > 0 && boxHeight > 0)) return null;
    const style = computedStyle(element);
    const fit = style?.objectFit ?? "fill";
    let displayWidth = boxWidth;
    let displayHeight = boxHeight;
    if (["contain", "cover", "scale-down", "none"].includes(fit)) {
      const containScale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
      const scale = fit === "cover" ? Math.max(boxWidth / sourceWidth, boxHeight / sourceHeight)
        : fit === "none" ? 1
          : fit === "scale-down" ? Math.min(1, containScale) : containScale;
      displayWidth = sourceWidth * scale;
      displayHeight = sourceHeight * scale;
    }
    // 默认读取器把经过等比元素/祖先变换的内容尺寸计入 display_size；旋转只改 AABB，不改宽高比。
    const transformScale = readUniformTransformScale();
    return {
      source_size: { width: sourceWidth, height: sourceHeight },
      display_size: { width: displayWidth * transformScale, height: displayHeight * transformScale },
    };
  }

  return {
    layout_node_id: layoutNodeId,
    /** 每次直接读取当前 DOM 状态，transform 后 AABB 与局部尺寸分别记录。 */
    readSnapshot() {
      const active = readActive();
      const parentId = readParentLayoutNodeId();
      const referenceId = readReferenceId();
      const positionWriters = readPositionWriters();
      const sizeWriters = readSizeWriters();
      if (!Array.isArray(positionWriters) || !Array.isArray(sizeWriters)) {
        throw new TypeError("DOM binding writers 回调必须返回数组");
      }
      if (!active) {
        return {
          renderer: "DOM",
          active: false,
          parent_layout_node_id: parentId,
          reference_id: referenceId,
          position_writers: cloneValue(positionWriters),
          size_writers: cloneValue(sizeWriters),
          layout_bounds: null,
          reference_bounds: null,
          local_size: null,
          image: null,
        };
      }
      const rect = element.getBoundingClientRect();
      const layoutBounds = toLayoutRect(rect, "DOM layout_bounds");
      const cssLocal = typeof readLocalSize === "function"
        ? readLocalSize(element)
        : { width: element.offsetWidth, height: element.offsetHeight };
      if (!isSize(cssLocal)) throw new TypeError("DOM binding 无法读取有效的未变换 local_size");
      const localSize = toLayoutSize(cssLocal, "DOM local_size");
      const rawImage = typeof readImage === "function" ? readImage(element) : readDefaultImage();
      let image = null;
      if (rawImage !== null && rawImage !== undefined) {
        if (!isRecord(rawImage) || !isSize(rawImage.source_size) || !isSize(rawImage.display_size)) {
          throw new TypeError("DOM binding.readImage 必须返回实际 source_size 和 CSS display_size");
        }
        image = {
          source_size: cloneValue(rawImage.source_size),
          display_size: toLayoutSize(rawImage.display_size, "DOM image.display_size"),
        };
      }
      return {
        renderer: "DOM",
        active,
        parent_layout_node_id: parentId,
        reference_id: referenceId,
        position_writers: cloneValue(positionWriters),
        size_writers: cloneValue(sizeWriters),
        layout_bounds: layoutBounds,
        reference_bounds: null,
        local_size: localSize,
        image,
      };
    },
  };
}
