import { assertPageSketchBackgroundLayout } from "./page-sketch-contract.mjs";
/** 收集区域技术合同中声明的 asset_id，覆盖 expected_assets 与原子映射两种合同形态。 */
function collectRegionAssetIds(region) {
  const ids = new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      if (key === "asset_id" && typeof item === "string") ids.add(item);
      else if (key === "asset_ids" && Array.isArray(item)) {
        for (const id of item) if (typeof id === "string") ids.add(id);
      } else visit(item);
    }
  };
  visit(region);
  return ids;
}

const STATE_ALIAS_TO_ID = new Map([
  ["default", "default"], ["normal", "default"], ["idle", "default"],
  ["selected", "selected"], ["select", "selected"],
  ["active", "active"], ["activated", "active"],
  ["disabled", "disabled"], ["disable", "disabled"],
  ["pressed", "pressed"], ["down", "pressed"],
  ["hover", "hover"], ["hovered", "hover"], ["over", "hover"],
  ["victory", "victory"], ["win", "victory"], ["won", "victory"], ["success", "victory"],
  ["defeat", "defeat"], ["lose", "defeat"], ["lost", "defeat"], ["failure", "defeat"], ["fail", "defeat"],
  ["paused", "paused"], ["pause", "paused"],
]);

/** 与视觉组件合同使用相同别名映射，避免 normal/idle 这类状态被误判为缺少 required。 */
function canonicalStateId(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const normalized = value.trim().toLowerCase().replaceAll("_", "-");
  return STATE_ALIAS_TO_ID.get(normalized) ?? normalized;
}

/** 复用组件覆盖或区域状态分析的 required/not-applicable 规则。 */
function componentStateRequirements(component, region) {
  const componentStates = Array.isArray(component.state_coverage) ? component.state_coverage : [];
  const states = componentStates.length > 0 ? componentStates : (region.state_analysis?.states ?? []);
  const requirements = new Map();
  for (const state of states) {
    const stateId = canonicalStateId(state?.state_id ?? state?.stateId ?? state?.canonical_state_id);
    if (!stateId) continue;
    if (requirements.has(stateId)) throw new TypeError(`component ${component.component_id} 的 canonical state_id ${stateId} 重复`);
    requirements.set(stateId, state?.requirement ?? state?.applicability ?? "");
  }
  return requirements;
}

/** 固定视觉永远属于图片生产；运行时区域只能使用明示文本或程序预览配方。 */
function validateRegionPresentationOwner(region, nodeId, presentation, mappedAssets, placementNodeIds) {
  const owner = region?.owner_type;
  const hasPlacement = placementNodeIds.has(nodeId);
  const isDeclaredNode = Array.isArray(region?.layout_node_ids) && region.layout_node_ids.includes(nodeId);
  if (owner === "fixed-production-visual") {
    if (hasPlacement && presentation.kind !== "image") throw new TypeError(`fixed-production-visual 节点 ${nodeId} 有正式图片 placement，必须使用 image presentation`);
    if (mappedAssets.length > 0 && presentation.kind !== "image") throw new TypeError(`fixed-production-visual 节点 ${nodeId} 的 accepted 图片不能被其他 presentation 替代`);
    if (!hasPlacement && isDeclaredNode && presentation.kind !== "container") {
      throw new TypeError(`fixed-production-visual 节点 ${nodeId} 无图片 placement 时只能作为结构 container`);
    }
    return;
  }
  if (owner === "runtime-data" || owner === "runtime-rendered") {
    if (mappedAssets.length > 0) throw new TypeError(`runtime region ${region.id} 不能用 V3 fixed 图片资源替代运行时配方`);
    if ((hasPlacement || isDeclaredNode) && !["text", "runtime-program"].includes(presentation.kind)) {
      throw new TypeError(`runtime region ${region.id} 节点 ${nodeId} 必须使用明确的 text 或 runtime-program presentation`);
    }
    return;
  }
  if (hasPlacement || mappedAssets.length > 0) throw new TypeError(`region ${region?.id ?? "?"} 缺少可识别的 owner_type，不能确认节点 ${nodeId} 的资源配方`);
}

/** 对 shared 资源复用 V3 的场景归属规则，避免草图与正式 manifest 各自解释。 */
function validateAssetOwnership(asset, sceneId, label) {
  const hasScene = typeof asset.scene_id === "string" && asset.scene_id.trim() !== "";
  const isShared = asset.shared === true;
  if (hasScene === isShared) throw new TypeError(`${label} 必须二选一声明 scene_id 或 shared:true`);
  if (hasScene) {
    if (asset.scene_id !== sceneId || "shared_scene_ids" in asset || "shared_reason" in asset) {
      throw new TypeError(`${label} 资源必须归当前 scene，场景资源不得声明 shared_scene_ids/shared_reason`);
    }
    return;
  }

  if (asset.shared_reason === "runtime-required") {
    const ids = asset.shared_scene_ids;
    if (ids !== undefined && (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length)) {
      throw new TypeError(`${label}.shared_scene_ids 必须是无重复的场景 ID 列表`);
    }
    return;
  }
  const ids = asset.shared_scene_ids;
  if (!Array.isArray(ids) || ids.length < 2 || ids.some((id) => typeof id !== "string" || !id.trim())
    || new Set(ids).size !== ids.length || !ids.includes(sceneId)) {
    throw new TypeError(`${label} 普通 shared 资源必须列出至少两个无重复 scene 且包含当前 scene`);
  }
}

/** 找到 V2 节点所属的唯一当前页面 region，节点 region 必须由 V3 布局覆盖合同确认。 */
function findNodeRegion(node, sceneId, stateId, regions) {
  if (typeof node.region_id !== "string" || !node.region_id.trim()) return null;
  const matches = regions.filter((region) => region?.id === node.region_id && region.scene_id === sceneId && region.state_id === stateId);
  if (matches.length !== 1) throw new TypeError(`V2 节点 ${node.layout_node_id} 必须唯一对应当前 scene/state coverage region ${node.region_id}`);
  // 有 region_id 的结构父节点可能不属于该区域的正式 placement 列表，是否可挂资源由后续绑定逐项判定。
  return matches[0];
}

/**
 * 校验 V4 资源到 V3 原子组件与 V2 placement 的唯一映射。
 * 每个组件 placement 恰选一个合法状态资源；组件状态不等同于页面 scene state。
 */
export function validatePageSketchResourceBindings({ nodes, sceneId, stateId, assets, regions, mappings, nodePresentations }) {
  if (!Array.isArray(nodes) || !Array.isArray(assets) || !Array.isArray(regions) || !Array.isArray(mappings)) {
    throw new TypeError("page sketch 资源绑定需要 nodes/assets/regions/mappings 数组");
  }
  if (!nodePresentations || typeof nodePresentations !== "object" || Array.isArray(nodePresentations)) {
    throw new TypeError("nodePresentations 必须是节点 presentation 映射");
  }

  assertPageSketchBackgroundLayout({ nodes, regions, sceneId, stateId, nodePresentations });
  const nodeById = new Map();
  for (const node of nodes) {
    if (!node || typeof node.layout_node_id !== "string" || !node.layout_node_id.trim() || nodeById.has(node.layout_node_id)) {
      throw new TypeError("V2 nodes 必须包含唯一的 layout_node_id");
    }
    nodeById.set(node.layout_node_id, node);
  }
  const assetById = new Map();
  for (const asset of assets) {
    if (!asset || typeof asset.id !== "string" || assetById.has(asset.id)) throw new TypeError("V3 assets 必须包含唯一 asset id");
    assetById.set(asset.id, asset);
  }

  const regionByNode = new Map();
  for (const node of nodes) regionByNode.set(node.layout_node_id, findNodeRegion(node, sceneId, stateId, regions));

  // component/node 是草图资源映射可表达的最小粒度；同一组件在同一 node 不可重复选状态图。
  const placementsByKey = new Map();
  for (const region of new Set(regionByNode.values())) {
    if (!region) continue;
    if (![
      "fixed-production-visual", "runtime-data", "runtime-rendered",
    ].includes(region.owner_type) && region.layout_node_ids?.some((nodeId) => nodeById.has(nodeId))) {
      throw new TypeError(`coverage region ${region.id} 必须声明 fixed-production-visual/runtime-data/runtime-rendered owner_type`);
    }
    const components = Array.isArray(region.component_inventory?.components) ? region.component_inventory.components : [];
    if (region.owner_type === "fixed-production-visual") {
      const regionAssetIds = collectRegionAssetIds(region);
      const acceptedRegionAssets = assets.filter((asset) => asset?.status === "accepted" && asset.coverage_region_ids?.includes(region.id));
      if (acceptedRegionAssets.length > 0 && (!Array.isArray(region.expected_assets) || region.expected_assets.length === 0)) {
        throw new TypeError(`fixed-production-visual region ${region.id} 有 accepted 资源时必须显式声明 expected_assets`);
      }
      for (const asset of acceptedRegionAssets) {
        if (!regionAssetIds.has(asset.id)) {
          throw new TypeError(`fixed-production-visual region ${region.id} 未在 expected_assets/asset_ids 中声明 accepted 资源 ${asset.id}`);
        }
      }
      for (const expected of region.expected_assets ?? []) {
        const component = components.find((item) => item?.component_id === expected?.component_id);
        if (!component || !Array.isArray(component.placements) || component.placements.length === 0) {
          throw new TypeError(`fixed-production-visual region ${region.id} expected asset ${expected?.asset_id ?? "?"} 必须绑定真实 component placement`);
        }
      }
    }
    for (const component of components) {
      if (!component || typeof component.component_id !== "string" || !component.component_id.trim()) {
        throw new TypeError(`coverage region ${region.id} 的 component 缺少 component_id`);
      }
    const placements = Array.isArray(component.placements) ? component.placements : [];
      for (const placement of placements) {
        const placementNodeId = placement?.layout_node_id;
        if (typeof placementNodeId !== "string" || !nodeById.has(placementNodeId) || regionByNode.get(placementNodeId) !== region
          || !Array.isArray(region.layout_node_ids) || !region.layout_node_ids.includes(placementNodeId)) {
          throw new TypeError(`组件 ${component.component_id} placement 必须指向当前 V2 region ${region.id} 的真实节点`);
        }
        const key = `${component.component_id}\u0000${placementNodeId}`;
        if (placementsByKey.has(key)) throw new TypeError(`组件 ${component.component_id} 在节点 ${placementNodeId} 存在重复 placement，当前草图映射无法区分`);
        placementsByKey.set(key, { component, placement, region, nodeId: placementNodeId });
      }
    }
  }

  const mappingByPlacement = new Map();
  const mappedByNode = new Map();
  const placementNodeIds = new Set([...placementsByKey.values()].map((item) => item.nodeId));
  const seenNodeAssets = new Set();
  const normalizedMappings = [];
  for (const [index, mapping] of mappings.entries()) {
    const label = `v3_assets[${index}]`;
    const assetId = mapping?.asset_id;
    const nodeId = mapping?.layout_node_id;
    const file = mapping?.file;
    const node = nodeById.get(nodeId);
    const region = regionByNode.get(nodeId);
    if (typeof assetId !== "string" || !assetId.trim() || typeof file !== "string" || !file.trim() || !node || !region) {
      throw new TypeError(`${label} 必须绑定当前 V2 region 中的 asset_id/file/layout_node_id`);
    }
    if (!Array.isArray(region.layout_node_ids) || !region.layout_node_ids.includes(nodeId)) {
      throw new TypeError(`${label} 节点 ${nodeId} 未列在 coverage region ${region.id} 的 layout_node_ids 中`);
    }
    if (region.owner_type !== "fixed-production-visual") {
      throw new TypeError(`${label} 只能绑定 fixed-production-visual 的正式图片资产`);
    }
    const nodeAssetKey = `${nodeId}\u0000${assetId}`;
    if (seenNodeAssets.has(nodeAssetKey)) throw new TypeError(`${label} 节点 ${nodeId} 的 asset ${assetId} 重复映射`);
    seenNodeAssets.add(nodeAssetKey);

    const asset = assetById.get(assetId);
    if (!asset || asset.status !== "accepted") throw new TypeError(`${label} 只能引用 V3 manifest 中 accepted 的资源 ${assetId}`);
    if (!Array.isArray(asset.runtime_outputs) || !asset.runtime_outputs.includes(file)) {
      throw new TypeError(`${label}.file 必须精确列在资源 ${assetId} 的 runtime_outputs 中`);
    }
    if (!Array.isArray(asset.coverage_region_ids) || !asset.coverage_region_ids.includes(region.id)
      || !collectRegionAssetIds(region).has(assetId)) {
      throw new TypeError(`${label} accepted 资源 ${assetId} 必须在 V3 coverage region ${region.id} 双向声明`);
    }
    validateAssetOwnership(asset, sceneId, label);

    const expectedAssets = Array.isArray(region.expected_assets) ? region.expected_assets : [];
    const expectedForId = expectedAssets.filter((expected) => expected?.asset_id === assetId);
    if (expectedForId.length !== 1) throw new TypeError(`${label} 的 asset_id 必须在 region ${region.id} 中唯一反推 component/state`);
    const expected = expectedForId[0];
    const componentId = expected.component_id;
    const component = region.component_inventory?.components?.find((item) => item?.component_id === componentId);
    if (!component || expected.runtime_file !== file || (asset.component_id !== undefined && asset.component_id !== componentId)
      || (asset.state_id !== undefined && canonicalStateId(asset.state_id) !== canonicalStateId(expected.state_id))) {
      throw new TypeError(`${label} 必须精确匹配 expected_assets 的 component/state/runtime_file`);
    }
    const stateRequirement = componentStateRequirements(component, region).get(canonicalStateId(expected.state_id));
    if (stateRequirement !== "required") throw new TypeError(`${label} 只能选择 component ${componentId} 的 required 状态资源 ${expected.state_id}`);

    const placementKey = `${componentId}\u0000${nodeId}`;
    const placementBinding = placementsByKey.get(placementKey);
    if (!placementBinding || (placementBinding.placement.state_id !== undefined
      && canonicalStateId(placementBinding.placement.state_id) !== canonicalStateId(expected.state_id))) {
      throw new TypeError(`${label} 的 component/state 不匹配节点 ${nodeId} 的正式 placement`);
    }
    if (expectedAssets.filter((item) => item?.component_id === componentId
      && canonicalStateId(item?.state_id) === canonicalStateId(expected.state_id)).length !== 1) {
      throw new TypeError(`${label} 的 component/state expected asset 必须唯一`);
    }
    if (mappingByPlacement.has(placementKey)) throw new TypeError(`${label} 组件 ${componentId} 在节点 ${nodeId} 必须恰选一个状态资源`);
    mappingByPlacement.set(placementKey, mapping);
    mappedByNode.set(nodeId, [...(mappedByNode.get(nodeId) ?? []), assetId]);
    normalizedMappings.push({ ...mapping });
  }

  for (const [key, binding] of placementsByKey) {
    if (binding.region.owner_type === "fixed-production-visual" && !mappingByPlacement.has(key)) {
      throw new TypeError(`组件 ${binding.component.component_id} placement ${binding.nodeId} 缺少一个 V3 accepted 状态资源`);
    }
  }

  for (const [nodeId, node] of nodeById) {
    const presentation = nodePresentations[nodeId];
    if (!presentation || typeof presentation.kind !== "string") throw new TypeError(`V2 节点 ${nodeId} 缺少有效 presentation`);
    const mapped = mappedByNode.get(nodeId) ?? [];
    if (presentation.kind === "image") {
      if (!Array.isArray(presentation.asset_ids) || presentation.asset_ids.length !== mapped.length
        || [...presentation.asset_ids].sort().join("\u0000") !== [...mapped].sort().join("\u0000")) {
        throw new TypeError(`图像节点 ${nodeId} 必须展示其全部且仅展示精确 placement 绑定的 V3 资源`);
      }
    } else if (mapped.length > 0) {
      throw new TypeError(`节点 ${nodeId} 的正式 V3 图片资源不能被 ${presentation.kind} presentation 替代`);
    }
    // 资源类型必须与 V3 冻结 owner 配方相符，fixed 图像不接受改成程序/文本来逃开覆盖。
    validateRegionPresentationOwner(regionByNode.get(nodeId), nodeId, presentation, mapped, placementNodeIds);
    if (node.region_id && !regionByNode.get(nodeId)) throw new TypeError(`节点 ${nodeId} 的 region 不属于当前 scene/state`);
  }
  for (const nodeId of Object.keys(nodePresentations)) {
    if (!nodeById.has(nodeId)) throw new TypeError(`nodePresentations 引用了未知 V2 节点 ${nodeId}`);
  }

  return normalizedMappings;
}
