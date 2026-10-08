import { validateVisualLayoutDocument } from "./visual-layout-editor.mjs";

export const PAGE_SKETCH_SCHEMA = "threejs-page-sketch/1.0";
export const PAGE_SKETCH_RESOURCE_MAP_SCHEMA = "threejs-page-sketch-resources/1.0";

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const PRESENTATION_KINDS = new Set(["image", "text", "container", "runtime-program"]);

/** 背景仅属于视口显示层，不可成为元素的布局父级；返回明确归属的固定背景节点。 */
export function assertPageSketchBackgroundLayout({ nodes, regions = [], sceneId, stateId, nodePresentations = {} }) {
  const backgroundIds = new Set(nodes.filter((node) => node.layout_role === "background" || node.layer === "background").map((node) => node.layout_node_id));
  const backgroundRegions = regions.filter((region) => region.layer === "background" && region.scene_id === sceneId && region.state_id === stateId);
  const regionIds = new Set(backgroundRegions.map((region) => region.id));
  const nodeIds = new Set(nodes.map((node) => node.layout_node_id));
  for (const region of backgroundRegions) for (const id of region.layout_node_ids ?? []) if (nodeIds.has(id)) backgroundIds.add(id);
  for (const node of nodes) if (regionIds.has(node.region_id)) backgroundIds.add(node.layout_node_id);
  for (const node of nodes) {
    if (backgroundIds.has(node.parent_layout_node_id)) throw new TypeError(`节点 ${node.layout_node_id} 不得相对背景 ${node.parent_layout_node_id} 布局；请在 V2 改用 viewport、safe-area 或功能容器并重新确认`);
    if (backgroundIds.has(node.layout_node_id) && node.parent_layout_node_id !== "viewport") throw new TypeError(`背景 ${node.layout_node_id} 必须独立归属 viewport，不能放入可移动功能容器；请更新 V2 显示树并重新确认`);
  }
  // 即使背景当前没有子节点，也不能把它声明为空容器或用容器配方替代正式显示内容。
  for (const node of nodes) {
    if (!backgroundIds.has(node.layout_node_id)) continue;
    if (node.element_type === "container" || node.is_container === true || node.empty_container === true || node.layout_role === "container" || nodePresentations[node.layout_node_id]?.kind === "container") {
      throw new TypeError(`背景 ${node.layout_node_id} 不能声明为容器或使用 container presentation；请在 V2 改为独立显示节点并重新确认`);
    }
  }
  return [...backgroundIds];
}

/** 判断普通 JSON 对象，避免数组或 null 被误认为合同节点。 */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 校验必需的非空文本字段。 */
function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} 必须是非空字符串`);
  return value;
}

/** 校验真实 SHA-256 格式。 */
function requireSha(value, label) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) throw new TypeError(`${label} 必须是小写 sha256:<64位十六进制>`);
}

/** 校验项目相对资源路径，禁止绝对路径、空片段和上跳。 */
export function validateProjectRelativePath(value, label) {
  requireText(value, label);
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new TypeError(`${label} 不能包含 NUL 或控制字符`);
  const normalized = value.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (normalized.startsWith("/") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized) || segments.some((part) => part === ".." || part === "")) {
    throw new TypeError(`${label} 必须是无路径穿越的项目相对路径`);
  }
  const canonical = segments.filter((part) => part !== ".").join("/");
  if (!canonical) throw new TypeError(`${label} 必须指向项目文件`);
  return canonical;
}

/** 递归排序对象字段，数组次序仍表达用户确认过的业务顺序。 */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError("草图内容不能包含 undefined");
  return encoded;
}

/** 生成不含人工确认回执的规范 JSON；后续编辑始终以此内容身份使旧回执失效。 */
export function canonicalPageSketchContent(document) {
  if (!isRecord(document)) throw new TypeError("page sketch 必须是对象");
  const content = { ...document };
  delete content.confirmation;
  return canonicalJson(content);
}

/** 在浏览器安全上下文中计算页面确认所使用的规范内容哈希。 */
export async function hashPageSketchContent(document) {
  if (!globalThis.crypto?.subtle) throw new Error("当前页面缺少 WebCrypto，不能确认草图");
  const bytes = new TextEncoder().encode(canonicalPageSketchContent(document));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** 校验节点展示配方；图像只引用正式资源 ID，运行时节点必须绑定项目代码及其 SHA。 */
function validatePresentation(layoutNodeId, presentation, assetsById) {
  if (!isRecord(presentation) || !PRESENTATION_KINDS.has(presentation.kind)) {
    throw new TypeError(`node_presentations.${layoutNodeId}.kind 必须为 image/text/container/runtime-program`);
  }
  if (presentation.kind === "image") {
    if (!Array.isArray(presentation.asset_ids) || presentation.asset_ids.length === 0) throw new TypeError(`图像节点 ${layoutNodeId} 必须引用正式 asset_ids`);
    if (!["fill", "contain", "cover", "none", "scale-down"].includes(presentation.object_fit)) throw new TypeError(`图像节点 ${layoutNodeId} 必须声明正式 object_fit`);
    for (const assetId of presentation.asset_ids) {
      requireText(assetId, `node_presentations.${layoutNodeId}.asset_ids[]`);
      if (!assetsById.get(assetId)?.some((asset) => asset.layout_node_id === layoutNodeId)) throw new TypeError(`图像节点 ${layoutNodeId} 引用了未绑定的正式资源：${assetId}`);
    }
  }
  if (presentation.kind === "text") {
    if (typeof presentation.text !== "string") throw new TypeError(`文本节点 ${layoutNodeId} 必须提供正式 text 字符串`);
    const style = presentation.style;
    if (!isRecord(style) || typeof style.font_family !== "string" || style.font_family.trim() === "" || !Number.isFinite(style.font_size_px) || style.font_size_px <= 0 || typeof style.color !== "string" || style.color.trim() === "") {
      throw new TypeError(`文本节点 ${layoutNodeId} 必须声明 font_family、font_size_px、color 正式样式`);
    }
  }
  if (presentation.kind === "runtime-program") {
    validateProjectRelativePath(presentation.module_file, `node_presentations.${layoutNodeId}.module_file`);
    requireSha(presentation.module_sha256, `node_presentations.${layoutNodeId}.module_sha256`);
    if (presentation.export_name !== undefined) requireText(presentation.export_name, `node_presentations.${layoutNodeId}.export_name`);
  }
  if (presentation.z_index !== undefined && !Number.isFinite(presentation.z_index)) throw new TypeError(`node_presentations.${layoutNodeId}.z_index 必须是有限数`);
  return structuredClone(presentation);
}

/** 校验草图数据及其只读 V2 节点、V3 资源、正式布局和确认身份。 */
export function validatePageSketchDocument(document, { expectedIdentity } = {}) {
  if (!isRecord(document)) throw new TypeError("page sketch 必须是对象");
  if (document.schema !== PAGE_SKETCH_SCHEMA) throw new TypeError(`schema 必须为 ${PAGE_SKETCH_SCHEMA}`);
  requireSha(document.target_sha256, "target_sha256");
  for (const field of ["scene_id", "state_id", "work_item_id", "candidate_version"]) requireText(document[field], field);
  if (!isRecord(document.viewport) || ![document.viewport.width, document.viewport.height].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new TypeError("viewport 必须包含正整数 width/height");
  }
  validateProjectRelativePath(document.reference_file, "reference_file");
  for (const field of ["v2_nodes_file", "v3_manifest_file", "v3_evidence_file"]) validateProjectRelativePath(document[field], field);
  for (const field of ["v2_nodes_sha256", "v3_manifest_sha256", "v3_evidence_sha256"]) requireSha(document[field], field);

  if (!Array.isArray(document.nodes) || document.nodes.length === 0) throw new TypeError("nodes 必须是非空 V2 节点快照");
  const nodeById = new Map();
  for (const [index, node] of document.nodes.entries()) {
    if (!isRecord(node) || typeof node.layout_node_id !== "string" || node.layout_node_id.trim() === "") throw new TypeError(`nodes[${index}] 缺少 layout_node_id`);
    if (nodeById.has(node.layout_node_id)) throw new TypeError(`nodes 存在重复节点 ${node.layout_node_id}`);
    nodeById.set(node.layout_node_id, node);
  }
  const layout = validateVisualLayoutDocument(document.layout, document.nodes);
  for (const field of ["target_sha256", "scene_id", "state_id"]) {
    if (layout[field] !== document[field]) throw new TypeError(`layout.${field} 必须与草图根身份一致`);
  }

  if (!Array.isArray(document.v3_assets)) throw new TypeError("v3_assets 必须是数组");
  const assetsById = new Map();
  const assetsByNode = new Map();
  const assetBindings = new Set();
  for (const [index, asset] of document.v3_assets.entries()) {
    const label = `v3_assets[${index}]`;
    if (!isRecord(asset)) throw new TypeError(`${label} 必须是对象`);
    requireText(asset.asset_id, `${label}.asset_id`);
    validateProjectRelativePath(asset.file, `${label}.file`);
    requireSha(asset.sha256, `${label}.sha256`);
    requireText(asset.layout_node_id, `${label}.layout_node_id`);
    if (!nodeById.has(asset.layout_node_id)) throw new TypeError(`${label} 引用了未知 layout_node_id`);
    const binding = `${asset.asset_id}\u0000${asset.layout_node_id}`;
    if (assetBindings.has(binding)) throw new TypeError(`v3_assets 存在重复 asset_id/layout_node_id：${asset.asset_id}/${asset.layout_node_id}`);
    const existingMappings = assetsById.get(asset.asset_id) ?? [];
    if (existingMappings.some((existing) => existing.file !== asset.file || existing.sha256 !== asset.sha256)) throw new TypeError(`同一正式资源 ${asset.asset_id} 在不同节点间必须保持相同文件与 SHA`);
    assetBindings.add(binding);
    assetsById.set(asset.asset_id, [...existingMappings, asset]);
    assetsByNode.set(asset.layout_node_id, [...(assetsByNode.get(asset.layout_node_id) ?? []), asset.asset_id]);
  }

  if (!isRecord(document.node_presentations)) throw new TypeError("node_presentations 必须是对象映射");
  for (const [layoutNodeId, presentation] of Object.entries(document.node_presentations)) {
    if (!nodeById.has(layoutNodeId)) throw new TypeError(`node_presentations 引用了未知 layout_node_id：${layoutNodeId}`);
    const mappedAssets = [...(assetsByNode.get(layoutNodeId) ?? [])].sort();
    const presentationAssets = presentation.kind === "image" && Array.isArray(presentation.asset_ids) ? [...presentation.asset_ids].sort() : [];
    if (mappedAssets.length > 0 && presentation.kind !== "image") throw new TypeError(`节点 ${layoutNodeId} 的 V3 图片资源不能由 ${presentation.kind} presentation 替代`);
    if (mappedAssets.join("\u0000") !== presentationAssets.join("\u0000")) throw new TypeError(`节点 ${layoutNodeId} 的 presentation 必须展示全部且仅展示映射的 V3 正式资源`);
    validatePresentation(layoutNodeId, presentation, assetsById);
  }
  for (const nodeId of nodeById.keys()) {
    if (!Object.hasOwn(document.node_presentations, nodeId)) throw new TypeError(`节点 ${nodeId} 缺少 presentation，不能在草图页准确预览`);
  }

  assertPageSketchBackgroundLayout({ nodes: document.nodes, sceneId: document.scene_id, stateId: document.state_id, nodePresentations: document.node_presentations });

  if (document.confirmation !== null) {
    if (!isRecord(document.confirmation) || document.confirmation.status !== "accepted") throw new TypeError("confirmation 必须是 null 或 accepted 回执");
    requireText(document.confirmation.confirmed_at, "confirmation.confirmed_at");
    if (!Number.isFinite(Date.parse(document.confirmation.confirmed_at))) throw new TypeError("confirmation.confirmed_at 必须是有效时间");
    requireSha(document.confirmation.content_sha256, "confirmation.content_sha256");
  }

  if (expectedIdentity) {
    for (const field of ["target_sha256", "scene_id", "state_id", "work_item_id", "candidate_version"]) {
      if (document[field] !== expectedIdentity[field]) throw new TypeError(`草图 ${field} 与当前 V2/V3 身份不一致`);
    }
  }
  return structuredClone({ ...document, layout, nodes: document.nodes, node_presentations: document.node_presentations });
}
