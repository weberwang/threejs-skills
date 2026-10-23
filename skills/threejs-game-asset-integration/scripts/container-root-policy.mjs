/** 有显式底板时优先复用其根职责；额外纯结构根必须说明独立用途。 */
import { hasSpriteRendering, isLayoutContainer, isSpriteContainer } from "../../threejs-game-ui-layout/scripts/display-node-role.mjs";
import { requiresNineSliceDecision } from "../../threejs-game-ui-layout/scripts/nine-slice-contract.mjs";

/** 读取拆解或布局节点 ID。 */
function nodeId(node) { return node?.element_id ?? node?.layout_node_id; }

/** 读取真实父级，定位参照不参与根职责判断。 */
function parentId(node) { return node?.parent_element_id ?? node?.parent_layout_node_id; }

/** 按显式图片和皮肤职责识别可复用底板。 */
function isPanelRootCandidate(node) {
  return hasSpriteRendering(node) && (isSpriteContainer(node) || node.nine_slice_decision_required === true || requiresNineSliceDecision(node));
}

/** 校验单底板组件的额外结构根，不自动改树或合并资源身份。 */
export function validateContainerRootReuse(nodes, errors = [], label = "nodes") {
  if (!Array.isArray(nodes)) return errors;
  const children = new Map();
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const list = children.get(parentId(node)) ?? [];
    list.push(node);
    children.set(parentId(node), list);
  }
  for (const node of nodes) {
    if (!isLayoutContainer(node) || hasSpriteRendering(node)) continue;
    const candidates = (children.get(nodeId(node)) ?? []).filter(isPanelRootCandidate);
    if (candidates.length !== 1) continue;
    const reason = node.ui_layout?.independent_container_reason;
    if (typeof reason !== "string" || !reason.trim()) errors.push(`${label}.${nodeId(node)} 应优先复用底板 ${nodeId(candidates[0])} 作为根，额外纯结构容器必须声明 ui_layout.independent_container_reason`);
  }
  return errors;
}
