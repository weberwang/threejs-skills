import { hasSpriteRendering, isBackgroundDisplayNode, isLayoutContainer } from "./display-node-role.mjs";
import { isNineSliceStretchTargetAllowed, requiresNineSliceDecision, validateNineSliceContract, validateNineSliceTargetBounds } from "./nine-slice-contract.mjs";

/** 允许运行时位置控制权的明确来源。 */
export const POSITION_DRIVERS = Object.freeze(["DOM_LAYOUT", "SHARED", "STATIC", "ANIMATION"]);
/** 允许运行时尺寸控制权的明确来源。 */
export const SIZE_DRIVERS = Object.freeze(["FIXED", "CONTENT", "DOM_LAYOUT", "SHARED"]);

const POSITION_DRIVER_SET = new Set(POSITION_DRIVERS);
const SIZE_DRIVER_SET = new Set(SIZE_DRIVERS);
const ROOT_IDS = new Set(["viewport", "safe-area"]);
const PLAN_FIELDS = Object.freeze(["position_driver", "size_driver", "reference_id", "image_mode"]);
const IMAGE_MODES = new Set(["NONE", "PRESERVE_ASPECT", "NINE_SLICE"]);

/** 判断值是否为普通对象。 */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 判断字符串是否包含非空白字符。 */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** 读取布局节点稳定 ID 和父级 ID。 */
function nodeIdentity(node) {
  return {
    id: node?.layout_node_id ?? node?.layoutNodeId,
    parentId: node && Object.hasOwn(node, "parent_layout_node_id") ? node.parent_layout_node_id : node?.parentLayoutNodeId,
  };
}

/** 深拷贝 JSON 风格合同，避免派生计划修改调用方数据。 */
function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
}

/** 将合法合成根与业务节点分开，并拒绝用业务字段伪装根节点。 */
function collectBusinessNodes(nodes, errors, label) {
  if (!Array.isArray(nodes)) {
    errors.push(`${label} 必须是节点数组`);
    return { business: [], roots: [] };
  }
  const business = [];
  const roots = [];
  const seen = new Set();
  for (const [index, node] of nodes.entries()) {
    const itemLabel = `${label}[${index}]`;
    if (!isRecord(node)) {
      errors.push(`${itemLabel} 必须是对象`);
      continue;
    }
    const { id, parentId } = nodeIdentity(node);
    if (!isNonEmptyString(id)) errors.push(`${itemLabel}.layout_node_id 必须是非空字符串`);
    else if (seen.has(id)) errors.push(`${itemLabel}.layout_node_id 重复：${id}`);
    else seen.add(id);

    if (node.is_root_container === true) {
      if (!ROOT_IDS.has(id)) errors.push(`${itemLabel} 合成根 ID 只允许 viewport 或 safe-area`);
      if (parentId !== null) errors.push(`${itemLabel}.parent_layout_node_id 合成根必须为 null`);
      if (node.layout_execution !== undefined) errors.push(`${itemLabel} 合成根不能包含 layout_execution`);
      const elementId = node.element_id ?? node.elementId;
      if (elementId !== undefined && elementId !== id) errors.push(`${itemLabel}.element_id 合成根只能等于 ${id}`);
      if (node.parent_element_id !== undefined && node.parent_element_id !== null) errors.push(`${itemLabel}.parent_element_id 合成根必须为 null`);
      if (node.ui_layout !== undefined && node.ui_layout !== null) errors.push(`${itemLabel}.ui_layout 合成根不能声明业务职责`);
      roots.push(node);
      continue;
    }
    if (ROOT_IDS.has(id) || ROOT_IDS.has(node.element_id ?? node.elementId)) {
      errors.push(`${itemLabel} 业务节点不能占用 viewport/safe-area 合成根身份`);
      continue;
    }
    if (node.layout_execution !== undefined && !isRecord(node.layout_execution)) {
      errors.push(`${itemLabel}.layout_execution 必须是派生计划对象`);
    }
    business.push({ node, index, label: itemLabel, id, parentId });
  }
  return { business, roots };
}

/** 检查布局驱动声明的枚举值及其与职责、尺寸策略的兼容性。 */
export function validateLayoutDriverDeclaration(uiLayout, errors = [], label = "ui_layout") {
  if (!isRecord(uiLayout)) {
    errors.push(`${label} 必须是布局职责对象`);
    return errors;
  }
  const positionDriver = uiLayout.position_driver;
  if (positionDriver !== undefined && !POSITION_DRIVER_SET.has(positionDriver)) {
    errors.push(`${label}.position_driver 必须是 ${POSITION_DRIVERS.join("、")}`);
  }
  const sizeDriver = uiLayout.size_driver;
  if (sizeDriver !== undefined && !SIZE_DRIVER_SET.has(sizeDriver)) {
    errors.push(`${label}.size_driver 必须是 ${SIZE_DRIVERS.join("、")}`);
  }

  if (positionDriver === "STATIC" && uiLayout.layout_owner !== "SELF") {
    errors.push(`${label}.position_driver=STATIC 要求 layout_owner=SELF`);
  }
  if (positionDriver === "ANIMATION" && uiLayout.layout_owner !== "EXTERNAL") {
    errors.push(`${label}.position_driver=ANIMATION 要求 layout_owner=EXTERNAL`);
  }

  if (sizeDriver !== undefined) {
    const compatible = {
      FIXED: new Set(["FIXED"]),
      CONTENT: new Set(["CONTENT"]),
      STRETCH: new Set(["SHARED", "DOM_LAYOUT"]),
      FLEX: new Set(["SHARED", "DOM_LAYOUT"]),
    };
    if (!compatible[uiLayout.size_policy]) {
      errors.push(`${label}.size_driver 无法绑定缺失或无效的 size_policy`);
    } else if (!compatible[uiLayout.size_policy].has(sizeDriver)) {
      errors.push(`${label}.size_driver=${sizeDriver} 与 size_policy=${uiLayout.size_policy} 不匹配`);
    }
  }
  return errors;
}

/** 收集声明在图文整体居中组中的成员，供运行驱动冲突检查使用。 */
function centerGroupMemberIds(nodes) {
  const memberIds = new Set();
  for (const node of nodes) {
    const ids = node?.center_alignment?.member_ids;
    if (Array.isArray(ids)) for (const id of ids) if (isNonEmptyString(id)) memberIds.add(id);
  }
  return memberIds;
}

/** 依据已确认职责和图片合同生成单个节点的唯一执行计划。 */
function derivePlanForNode(record, knownIds, centerMembers, errors) {
  const { node, label, id, parentId } = record;
  const ui = node.ui_layout;
  const localErrors = [];
  validateLayoutDriverDeclaration(ui, localErrors, `${label}.ui_layout`);
  // 委托校验会检查驱动所有权组合；无论职责对象是否成形，都必须汇总其诊断。
  errors.push(...localErrors);
  if (!isRecord(ui)) {
    return null;
  }

  if (!isNonEmptyString(parentId) || parentId === id) {
    errors.push(`${label}.parent_layout_node_id 必须是不同于自身的非空父级 ID`);
  } else if (!ROOT_IDS.has(parentId) && !knownIds.has(parentId)) {
    errors.push(`${label}.parent_layout_node_id 引用未知业务节点或稳定根：${parentId}`);
  }

  const referenceId = ui.position_reference_id ?? parentId;
  if (!isNonEmptyString(referenceId) || referenceId === id) {
    errors.push(`${label}.ui_layout.position_reference_id 必须解析为不同于自身的非空参照`);
  } else if (!ROOT_IDS.has(referenceId) && !knownIds.has(referenceId)) {
    errors.push(`${label}.ui_layout.position_reference_id 引用未知业务节点或稳定根：${referenceId}`);
  }
  if (node.reference_id !== undefined && node.reference_id !== referenceId) {
    errors.push(`${label}.reference_id 必须等于 ui_layout.position_reference_id 或真实父级 ${referenceId}`);
  }

  const positionDriver = ui.position_driver ?? "SHARED";
  if (centerMembers.has(id) && positionDriver !== "SHARED") {
    errors.push(`${label}.图文整体居中组成员的 position_driver 必须为 SHARED`);
  }
  if (positionDriver === "DOM_LAYOUT") {
    if (referenceId !== parentId) errors.push(`${label}.position_driver=DOM_LAYOUT 只能使用真实父级作为定位参照`);
    if (ui.overflow_policy === "REFLOW" || ui.overflow_policy === "SCROLL") {
      errors.push(`${label}.position_driver=DOM_LAYOUT 不能与 REFLOW/SCROLL 布局策略并用`);
    }
  }

  const sizePolicy = ui.size_policy;
  const defaultSizeDriver = ({ FIXED: "FIXED", CONTENT: "CONTENT", STRETCH: "SHARED", FLEX: "SHARED" })[sizePolicy];
  if (!defaultSizeDriver) errors.push(`${label}.ui_layout.size_policy 必须是 FIXED、CONTENT、STRETCH 或 FLEX`);
  const sizeDriver = ui.size_driver ?? defaultSizeDriver;

  const imageInput = {
    ...node,
    role: node.role ?? node.layout_role,
    element_type: node.element_type ?? node.elementType,
    render_kind: node.render_kind,
  };
  const isImage = hasSpriteRendering(imageInput);
  const requiresDecision = requiresNineSliceDecision(imageInput) || node.nine_slice_decision_required === true;
  if (requiresDecision && node.nine_slice === undefined) {
    errors.push(`${label}.nine_slice 必须沿用已确认的九宫格决策`);
  }
  let imageMode = "NONE";
  if (isImage) {
    imageMode = "PRESERVE_ASPECT";
    if (node.nine_slice !== undefined) {
      try {
        const contract = validateNineSliceContract(node.nine_slice, `${label}.nine_slice`);
        if (contract.mode === "stretch") {
          if (!isNineSliceStretchTargetAllowed(imageInput) || isBackgroundDisplayNode(imageInput)) {
            errors.push(`${label}.nine_slice 不允许应用于背景或纯结构容器`);
          }
          const bounds = node.target_bounds ?? node.targetBounds ?? node.bounds;
          if (isRecord(bounds)) validateNineSliceTargetBounds(contract, bounds, `${label}.target_bounds`);
          imageMode = "NINE_SLICE";
        }
      } catch (error) {
        errors.push(error.message);
      }
    }
  } else if (node.nine_slice !== undefined && isLayoutContainer(imageInput)) {
    errors.push(`${label}.nine_slice 不能声明在纯结构容器上`);
  }
  if (isLayoutContainer(imageInput) && !hasSpriteRendering(imageInput) && imageMode === "NINE_SLICE") {
    errors.push(`${label} 纯结构容器不能获得 NINE_SLICE 计划`);
  }

  return {
    position_driver: positionDriver,
    size_driver: sizeDriver,
    reference_id: referenceId,
    image_mode: imageMode,
  };
}

/** 校验业务节点、驱动控制权和可选的派生计划一致性。 */
export function validateLayoutExecutionNodes(nodes, errors = [], label = "layout_nodes", { requirePlan = false } = {}) {
  const { business } = collectBusinessNodes(nodes, errors, label);
  const knownIds = new Set(business.map((record) => record.id).filter(isNonEmptyString));
  const centerMembers = centerGroupMemberIds(business.map((record) => record.node));
  const expectedById = new Map();

  for (const record of business) {
    const expected = derivePlanForNode(record, knownIds, centerMembers, errors);
    if (expected) expectedById.set(record.id, expected);
    const plan = record.node.layout_execution;
    if (requirePlan && plan === undefined) errors.push(`${record.label}.layout_execution 缺少派生执行计划`);
    if (plan === undefined) continue;
    if (!isRecord(plan)) continue;
    const keys = Object.keys(plan).sort();
    const expectedKeys = [...PLAN_FIELDS].sort();
    if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
      errors.push(`${record.label}.layout_execution 只能包含 ${PLAN_FIELDS.join("、")}`);
      continue;
    }
    if (!IMAGE_MODES.has(plan.image_mode) || !POSITION_DRIVER_SET.has(plan.position_driver) || !SIZE_DRIVER_SET.has(plan.size_driver)) {
      errors.push(`${record.label}.layout_execution 包含无效执行计划枚举`);
      continue;
    }
    if (expected && PLAN_FIELDS.some((field) => plan[field] !== expected[field])) {
      errors.push(`${record.label}.layout_execution 与 ui_layout 派生结果不一致`);
    }
  }
  return errors;
}

/** 返回独立节点副本，并为全部业务节点重建执行计划。 */
export function deriveLayoutExecutionPlans(nodes) {
  const errors = [];
  const { business } = collectBusinessNodes(nodes, errors, "layout_nodes");
  const knownIds = new Set(business.map((record) => record.id).filter(isNonEmptyString));
  const centerMembers = centerGroupMemberIds(business.map((record) => record.node));
  const plans = new Map();
  for (const record of business) {
    const expected = derivePlanForNode(record, knownIds, centerMembers, errors);
    if (expected) plans.set(record.id, expected);
  }
  if (errors.length > 0) throw new TypeError(errors[0]);
  const cloned = cloneValue(nodes);
  for (const node of cloned) {
    if (node?.is_root_container === true) continue;
    const { id } = nodeIdentity(node);
    node.layout_execution = cloneValue(plans.get(id));
  }
  return cloned;
}
