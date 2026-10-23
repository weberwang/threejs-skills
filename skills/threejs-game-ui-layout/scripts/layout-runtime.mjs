import { validateLayoutExecutionNodes } from "./layout-execution.mjs";
import { normalizeCenterAlignment } from "./center-alignment.mjs";

const RUNTIME_SCHEMA = "threejs-layout-runtime/1";
const ROOT_IDS = new Set(["viewport", "safe-area"]);
const SNAPSHOT_FIELDS = Object.freeze([
  "batch_id", "viewport_revision", "renderer", "active", "parent_layout_node_id", "reference_id",
  "position_writers", "size_writers", "layout_bounds", "reference_bounds", "local_size", "image",
]);
const CENTER_TOLERANCE = 0.5;
const BOUNDS_EPSILON = 1e-6;

/** 判断值是否为普通对象。 */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 判断字符串是否包含非空白字符。 */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** 判断矩形是否有有限坐标和正尺寸。 */
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

/** 逐字段比较运行时矩形，避免不同引用源被近似矩形蒙混通过。 */
function sameBounds(left, right) {
  return isBounds(left) && isBounds(right)
    && ["x", "y", "width", "height"].every((key) => Math.abs(left[key] - right[key]) <= BOUNDS_EPSILON);
}

/** 检查子矩形是否完整位于父矩形内。 */
function containsBounds(parent, child) {
  return isBounds(parent) && isBounds(child)
    && child.x >= parent.x - BOUNDS_EPSILON
    && child.y >= parent.y - BOUNDS_EPSILON
    && child.x + child.width <= parent.x + parent.width + BOUNDS_EPSILON
    && child.y + child.height <= parent.y + parent.height + BOUNDS_EPSILON;
}

/** 比较图片源像素尺寸，图集切片尺寸必须保持冻结值。 */
function sameSize(left, right) {
  return isSize(left) && isSize(right)
    && left.width === right.width && left.height === right.height;
}

/** 验证运行批次必需字段和唯一坐标空间。 */
function validateRuntimeBatch(batch, errors, label) {
  const initialErrorCount = errors.length;
  if (!isRecord(batch)) {
    errors.push(`${label}.runtime_batch 必须是对象`);
    return false;
  }
  if (batch.schema !== RUNTIME_SCHEMA) errors.push(`${label}.runtime_batch.schema 必须是 ${RUNTIME_SCHEMA}`);
  for (const field of ["batch_id", "scene_id", "state_id", "candidate_id"]) {
    if (!isNonEmptyString(batch[field])) errors.push(`${label}.runtime_batch.${field} 必须是非空字符串`);
  }
  if (!Number.isSafeInteger(batch.viewport_revision) || batch.viewport_revision < 0) {
    errors.push(`${label}.runtime_batch.viewport_revision 必须是非负安全整数`);
  }
  if (batch.coordinate_space !== "layout-logical-px") errors.push(`${label}.runtime_batch.coordinate_space 必须是 layout-logical-px`);
  if (!isBounds(batch.viewport_bounds)) errors.push(`${label}.runtime_batch.viewport_bounds 必须是有效逻辑矩形`);
  if (!isBounds(batch.safe_area_bounds)) errors.push(`${label}.runtime_batch.safe_area_bounds 必须是同批实测的有效矩形`);
  if (isBounds(batch.viewport_bounds) && isBounds(batch.safe_area_bounds)
    && !containsBounds(batch.viewport_bounds, batch.safe_area_bounds)) {
    errors.push(`${label}.runtime_batch.safe_area_bounds 必须完全位于 viewport_bounds 内`);
  }
  return errors.length === initialErrorCount;
}

/** 绑定调用方已知场景身份和视口，防止快照批次串线。 */
function validateContextBinding(batch, context, errors, label) {
  if (!isRecord(context)) return;
  // batch 结构错误已由 validateRuntimeBatch 报告；上下文绑定不能再解引用无效批次。
  if (!isRecord(batch)) return;
  for (const field of ["scene_id", "state_id", "candidate_id"]) {
    if (context[field] !== undefined && context[field] !== batch[field]) {
      errors.push(`${label}.runtime_batch.${field} 与调用上下文不一致`);
    }
  }
  if (context.viewport_bounds !== undefined && !sameBounds(context.viewport_bounds, batch.viewport_bounds)) {
    errors.push(`${label}.runtime_batch.viewport_bounds 与调用上下文不一致`);
  }
}

/** 验证实际图片像素、显示内容尺寸和可选的冻结源尺寸。 */
function validateImageSnapshot(node, snapshot, plan, errors, label) {
  const image = snapshot.image;
  if (plan.image_mode === "NONE") {
    if (image !== null) errors.push(`${label}.image_mode=NONE 时 image 必须为 null`);
    return;
  }
  if (!isRecord(image)) {
    errors.push(`${label}.image 必须包含实际 source_size 和 display_size`);
    return;
  }
  if (!isSize(image.source_size)) errors.push(`${label}.image.source_size 必须是实际正尺寸`);
  if (!isSize(image.display_size)) errors.push(`${label}.image.display_size 必须是实际正尺寸`);
  if (isSize(image.source_size) && isSize(image.display_size) && plan.image_mode === "PRESERVE_ASPECT") {
    // 以半个逻辑像素作为量化余量，避免把设备像素舍入误判为图像拉伸。
    const expectedWidth = image.display_size.height * image.source_size.width / image.source_size.height;
    if (Math.abs(image.display_size.width - expectedWidth) > CENTER_TOLERANCE) {
      errors.push(`${label}.image.display_size 必须保持 source_size 宽高比`);
    }
  }
  if (plan.image_mode === "NINE_SLICE") {
    const frozenSource = node.nine_slice?.source_size;
    if (!sameSize(image.source_size, frozenSource)) {
      errors.push(`${label}.image.source_size 必须等于冻结九宫格 source_size`);
    }
  }
  if (node.image_source_size !== undefined && !sameSize(image.source_size, node.image_source_size)) {
    errors.push(`${label}.image.source_size 与节点声明的 image_source_size 不一致`);
  }
}

/** 从运行快照检查严格中心、带理由补偿中心和图文组包围框。 */
function validateRuntimeCentering(nodes, snapshotsById, errors, label) {
  const groupByMember = new Map();
  const groups = [];
  for (const node of nodes) {
    const memberIds = node.center_alignment?.member_ids;
    if (!Array.isArray(memberIds)) continue;
    const nodeId = node.layout_node_id ?? node.layoutNodeId;
    const itemLabel = `${label}.${nodeId}.center_alignment`;
    if (memberIds.length < 2 || new Set(memberIds).size !== memberIds.length
      || memberIds.some((id) => !isNonEmptyString(id)) || !memberIds.includes(nodeId)) {
      errors.push(`${itemLabel}.member_ids 必须包含 leader 和至少一个唯一有效成员`);
      continue;
    }
    let normalized;
    try {
      normalized = normalizeCenterAlignment(node.axis_alignment ?? node.axisAlignment, node.center_alignment, itemLabel);
    } catch (error) {
      errors.push(error.message);
      continue;
    }
    const alignment = node.axis_alignment ?? node.axisAlignment;
    const axes = ["horizontal", "vertical"].filter((axis) => alignment?.[axis] === "center");
    if (axes.length === 0) {
      errors.push(`${itemLabel} 整体居中组至少需要一个 center 控制轴`);
      continue;
    }
    const group = { leader: node, leaderId: nodeId, memberIds, memberSet: new Set(memberIds), axes, normalized, label: itemLabel };
    groups.push(group);
    for (const memberId of memberIds) {
      if (groupByMember.has(memberId)) errors.push(`${label}.${memberId} 不能同时属于多个居中组`);
      groupByMember.set(memberId, group);
    }
  }

  for (const group of groups) {
    const leaderSnapshot = snapshotsById.get(group.leaderId);
    const members = group.memberIds.map((id) => nodes.find((node) => (node.layout_node_id ?? node.layoutNodeId) === id));
    for (const member of members) {
      if (!member) {
        errors.push(`${group.label}.member_ids 引用未知节点`);
        continue;
      }
      const memberId = member.layout_node_id ?? member.layoutNodeId;
      if ((member.parent_layout_node_id ?? member.parentLayoutNodeId) !== (group.leader.parent_layout_node_id ?? group.leader.parentLayoutNodeId)) {
        errors.push(`${group.label} 成员 ${memberId} 必须与 leader 拥有相同真实父级`);
      }
      const memberRef = member.layout_execution?.reference_id;
      if (!group.memberSet.has(memberRef) && memberRef !== group.leader.layout_execution?.reference_id) {
        errors.push(`${group.label} 成员 ${memberId} 的组外参照必须与 leader 一致`);
      }
    }
    const activeMembers = group.memberIds.map((id) => ({ id, snapshot: snapshotsById.get(id) }))
      .filter(({ snapshot }) => snapshot?.active === true);
    if (activeMembers.length === 0) continue;
    const actualBounds = activeMembers.map(({ id, snapshot }) => {
      if (!isBounds(snapshot.layout_bounds)) errors.push(`${group.label} 活动成员 ${id} 缺少实际 layout_bounds`);
      return snapshot.layout_bounds;
    }).filter(isBounds);
    if (actualBounds.length !== activeMembers.length) continue;

    for (const axis of group.axes) {
      const policy = group.normalized?.[axis] ?? { mode: "strict" };
      const expectedReference = leaderSnapshot?.reference_bounds
        ?? activeMembers.find(({ snapshot }) => isBounds(snapshot.reference_bounds))?.snapshot.reference_bounds;
      if (!isBounds(expectedReference)) {
        errors.push(`${group.label} 缺少同批实际定位参照 bounds`);
        continue;
      }
      const starts = actualBounds.map((bounds) => axis === "horizontal" ? bounds.x : bounds.y);
      const ends = actualBounds.map((bounds) => axis === "horizontal" ? bounds.x + bounds.width : bounds.y + bounds.height);
      const unionCenter = (Math.min(...starts) + Math.max(...ends)) / 2;
      const referenceCenter = axis === "horizontal"
        ? expectedReference.x + expectedReference.width / 2
        : expectedReference.y + expectedReference.height / 2;
      const offset = policy.mode === "reference" ? policy.offset : 0;
      if (Math.abs(unionCenter - referenceCenter - offset) > CENTER_TOLERANCE) {
        errors.push(`${group.label} ${axis} 轴实际成员联合框未居中到参照（允许 0.5 logical-px 量化误差）`);
      }
    }
  }

  for (const node of nodes) {
    const nodeId = node.layout_node_id ?? node.layoutNodeId;
    const snapshot = snapshotsById.get(nodeId);
    if (snapshot?.active !== true) continue;
    if (!node.axis_alignment && !node.axisAlignment && node.center_alignment === undefined) continue;
    let normalized;
    try {
      normalized = normalizeCenterAlignment(node.axis_alignment ?? node.axisAlignment, node.center_alignment, `${label}.${nodeId}.center_alignment`);
    } catch (error) {
      errors.push(error.message);
      continue;
    }
    if (!normalized) continue;
    const bounds = snapshot.layout_bounds;
    const reference = snapshot.reference_bounds;
    for (const axis of ["horizontal", "vertical"]) {
      if ((node.axis_alignment ?? node.axisAlignment)?.[axis] !== "center") continue;
      const group = groupByMember.get(nodeId);
      if (group?.axes.includes(axis)) continue;
      if (!isBounds(bounds) || !isBounds(reference)) continue;
      const policy = normalized[axis] ?? { mode: "strict" };
      const actualCenter = axis === "horizontal" ? bounds.x + bounds.width / 2 : bounds.y + bounds.height / 2;
      const referenceCenter = axis === "horizontal" ? reference.x + reference.width / 2 : reference.y + reference.height / 2;
      const expected = referenceCenter + (policy.mode === "reference" ? policy.offset : 0);
      if (Math.abs(actualCenter - expected) > CENTER_TOLERANCE) {
        errors.push(`${label}.${nodeId} ${axis} 轴实际中心与声明的 ${policy.mode} 参照不符（允许 0.5 logical-px 量化误差）`);
      }
    }
  }
}

/** 校验真实运行批次与完整业务节点快照，不依赖截图或静态夹具推断通过。 */
export function validateLayoutRuntimeSnapshots(nodes, geometry, errors = [], label = "layout_geometry", context = {}) {
  const planErrors = [];
  validateLayoutExecutionNodes(nodes, planErrors, "layout_nodes", { requirePlan: true });
  errors.push(...planErrors);
  if (planErrors.length > 0) return errors;

  if (!isRecord(geometry)) {
    errors.push(`${label} 必须包含 runtime_batch 和 component_snapshots`);
    return errors;
  }
  const batchOk = validateRuntimeBatch(geometry.runtime_batch, errors, label);
  // 批次缺失或结构无效时立即返回，避免把无法绑定的上下文继续传入后续校验。
  if (!batchOk) return errors;
  validateContextBinding(geometry.runtime_batch, context, errors, label);
  if (!Array.isArray(geometry.component_snapshots)) {
    errors.push(`${label}.component_snapshots 必须是数组`);
    return errors;
  }

  const businessNodes = nodes.filter((node) => isRecord(node) && node.is_root_container !== true);
  const nodeById = new Map(businessNodes.map((node) => [node.layout_node_id ?? node.layoutNodeId, node]));
  const snapshotsById = new Map();
  const expectedIds = new Set(nodeById.keys());
  for (const [index, entry] of geometry.component_snapshots.entries()) {
    const entryLabel = `${label}.component_snapshots[${index}]`;
    if (!isRecord(entry) || !isNonEmptyString(entry.layout_node_id) || !isRecord(entry.component_snapshot)) {
      errors.push(`${entryLabel} 必须包含 layout_node_id 和 component_snapshot`);
      continue;
    }
    const id = entry.layout_node_id;
    if (!expectedIds.has(id)) errors.push(`${entryLabel} 包含未声明的业务节点 ${id}`);
    if (snapshotsById.has(id)) {
      errors.push(`${entryLabel} 重复业务节点快照 ${id}`);
      continue;
    }
    snapshotsById.set(id, entry.component_snapshot);
  }
  for (const id of expectedIds) if (!snapshotsById.has(id)) errors.push(`${label}.component_snapshots 缺少业务节点 ${id}`);

  for (const [id, node] of nodeById) {
    const snapshot = snapshotsById.get(id);
    if (!snapshot) continue;
    const itemLabel = `${label}.${id}`;
    for (const field of SNAPSHOT_FIELDS) if (!Object.hasOwn(snapshot, field)) errors.push(`${itemLabel}.${field} 缺失`);
    if (snapshot.batch_id !== geometry.runtime_batch.batch_id) errors.push(`${itemLabel}.batch_id 与运行批次不一致`);
    if (snapshot.viewport_revision !== geometry.runtime_batch.viewport_revision) errors.push(`${itemLabel}.viewport_revision 与运行批次不一致`);
    if (!["DOM", "HUD"].includes(snapshot.renderer)) errors.push(`${itemLabel}.renderer 必须是 DOM 或 HUD`);
    if (typeof snapshot.active !== "boolean") errors.push(`${itemLabel}.active 必须是布尔值`);
    const expectedParentId = node.parent_layout_node_id ?? node.parentLayoutNodeId;
    if (snapshot.active === true && snapshot.parent_layout_node_id !== expectedParentId) {
      errors.push(`${itemLabel}.parent_layout_node_id 与真实父级声明不一致`);
    }
    if (snapshot.active === true && snapshot.reference_id !== node.layout_execution.reference_id) {
      errors.push(`${itemLabel}.reference_id 与派生执行计划不一致`);
    }
    if (snapshot.active !== true && snapshot.parent_layout_node_id != null && snapshot.parent_layout_node_id !== expectedParentId) {
      errors.push(`${itemLabel}.parent_layout_node_id 非活动时只能为空或仍匹配真实父级`);
    }
    if (snapshot.active !== true && snapshot.reference_id != null && snapshot.reference_id !== node.layout_execution.reference_id) {
      errors.push(`${itemLabel}.reference_id 非活动时只能为空或仍匹配派生计划`);
    }

    if (!Array.isArray(snapshot.position_writers) || !Array.isArray(snapshot.size_writers)) {
      errors.push(`${itemLabel}.position_writers/size_writers 必须是数组`);
    } else if (snapshot.active === true) {
      if (snapshot.position_writers.length !== 1 || snapshot.position_writers[0] !== node.layout_execution.position_driver) {
        errors.push(`${itemLabel}.position_writers 必须唯一匹配 ${node.layout_execution.position_driver}`);
      }
      if (snapshot.size_writers.length !== 1 || snapshot.size_writers[0] !== node.layout_execution.size_driver) {
        errors.push(`${itemLabel}.size_writers 必须唯一匹配 ${node.layout_execution.size_driver}`);
      }
    } else if (snapshot.position_writers.length !== 0 || snapshot.size_writers.length !== 0) {
      errors.push(`${itemLabel} 非活动节点的 writers 必须为空`);
    }

    if (snapshot.active === true) {
      if (!isBounds(snapshot.layout_bounds)) errors.push(`${itemLabel}.layout_bounds 活动节点必须提供实际逻辑矩形`);
      if (!isBounds(snapshot.reference_bounds)) errors.push(`${itemLabel}.reference_bounds 活动节点必须提供实际逻辑矩形`);
      if (!isSize(snapshot.local_size)) errors.push(`${itemLabel}.local_size 活动节点必须提供实际局部尺寸`);
    } else {
      if (snapshot.layout_bounds !== null && snapshot.layout_bounds !== undefined && !isBounds(snapshot.layout_bounds)) errors.push(`${itemLabel}.layout_bounds 非活动节点只能为 null 或有效矩形`);
      if (snapshot.reference_bounds !== null && snapshot.reference_bounds !== undefined && !isBounds(snapshot.reference_bounds)) errors.push(`${itemLabel}.reference_bounds 非活动节点只能为 null 或有效矩形`);
      if (snapshot.local_size !== null && snapshot.local_size !== undefined && !isSize(snapshot.local_size)) errors.push(`${itemLabel}.local_size 非活动节点只能为 null 或有效尺寸`);
    }
    if (snapshot.active === true) validateImageSnapshot(node, snapshot, node.layout_execution, errors, itemLabel);
    else if (snapshot.image !== null && snapshot.image !== undefined && !isRecord(snapshot.image)) errors.push(`${itemLabel}.image 非活动节点只能为 null 或对象`);
  }

  for (const [id, node] of nodeById) {
    const snapshot = snapshotsById.get(id);
    if (snapshot?.active !== true) continue;
    const parentId = node.parent_layout_node_id ?? node.parentLayoutNodeId;
    if (!ROOT_IDS.has(parentId)) {
      const parentSnapshot = snapshotsById.get(parentId);
      if (!parentSnapshot || parentSnapshot.active !== true) errors.push(`${label}.${id} 活动后代不能挂在非活动业务父级 ${parentId}`);
    }
    const referenceId = node.layout_execution.reference_id;
    const referenceSnapshot = ROOT_IDS.has(referenceId) ? null : snapshotsById.get(referenceId);
    const expectedReferenceBounds = referenceId === "viewport"
      ? geometry.runtime_batch.viewport_bounds
      : referenceId === "safe-area"
        ? geometry.runtime_batch.safe_area_bounds
        : referenceSnapshot?.layout_bounds;
    if (!isBounds(expectedReferenceBounds)) {
      errors.push(`${label}.${id} 定位参照 ${referenceId} 缺少同批实际 bounds`);
    } else if (!sameBounds(snapshot.reference_bounds, expectedReferenceBounds)) {
      errors.push(`${label}.${id}.reference_bounds 必须逐字段等于同批参照 ${referenceId} 的实测 layout_bounds`);
    }
    if (!ROOT_IDS.has(referenceId) && referenceSnapshot?.active !== true) {
      errors.push(`${label}.${id} 活动节点不能引用非活动业务定位参照 ${referenceId}`);
    }
  }

  validateRuntimeCentering(businessNodes, snapshotsById, errors, label);
  return errors;
}
