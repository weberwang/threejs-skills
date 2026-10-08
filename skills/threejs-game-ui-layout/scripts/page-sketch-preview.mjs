import { assertPageSketchBackgroundLayout, hashPageSketchContent, validatePageSketchDocument, validateProjectRelativePath } from "./page-sketch-contract.mjs";
import { validateVisualLayoutDocument } from "./visual-layout-editor.mjs";

/** 以 WebCrypto 校验已下载源文件的真实内容身份。 */
async function hashBytes(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error("当前开发页面缺少 WebCrypto");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** 将相对资源路径绑定到当前游戏开发服务根目录，并限制同源读取。 */
function projectResourceUrl(projectRootUrl, relativePath, pageOrigin = globalThis.location?.origin) {
  const safePath = validateProjectRelativePath(relativePath, "草图资源路径");
  const root = new URL(projectRootUrl);
  if (!(["http:", "https:"].includes(root.protocol)) || root.username || root.password || root.search || root.hash) throw new Error("项目资源根 URL 必须是无凭据、无查询和片段的同源 HTTP(S) 目录");
  if (!root.pathname.endsWith("/")) root.pathname += "/";
  // 文件名按 URL 片段分别编码，%2e%2e/%2f 等字面名称不会被 URL 解析器当作路径结构。
  const encodedPath = safePath.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  const url = new URL(encodedPath, root);
  if (pageOrigin && url.origin !== pageOrigin) throw new Error("草图资源必须来自当前游戏项目的同源开发服务");
  if (!url.pathname.startsWith(root.pathname)) throw new Error("草图资源 URL 解析后越出配置的游戏项目根目录");
  return url;
}

/** 获取项目文件字节，先校验文件 SHA，只有匹配的正式内容才可进入预览。 */
async function fetchVerifiedFile(file, expectedSha, { projectRootUrl, fetcher, pageOrigin }) {
  const url = projectResourceUrl(projectRootUrl, file, pageOrigin);
  const response = await fetcher(url, { cache: "no-store", credentials: "same-origin" });
  if (!response?.ok) throw new Error(`${file} 读取失败（HTTP ${response?.status ?? "unknown"}）`);
  const bytes = await response.arrayBuffer();
  const actualSha = await hashBytes(bytes);
  if (actualSha !== expectedSha) throw new Error(`${file} SHA 不匹配，资源可能已漂移`);
  return { bytes, mime: response.headers?.get?.("content-type")?.split(";")[0] || "application/octet-stream" };
}

/** 确认图像资源可解码，避免加载成功但无法显示时仍允许确认。 */
async function decodeImage(blob, objectUrl, imageDecoder) {
  if (imageDecoder) return imageDecoder(blob, objectUrl);
  if (typeof globalThis.createImageBitmap === "function") {
    const bitmap = await globalThis.createImageBitmap(blob);
    bitmap.close();
    return;
  }
  if (!globalThis.Image) throw new Error("当前浏览器无法验证图像解码");
  const image = new Image();
  image.src = objectUrl;
  await image.decode();
}

/** 预加载草图所有身份源、冻结底图、V3 正式图片与程序节点预览模块。 */
export async function loadPageSketchSources(sketchInput, { projectRootUrl, fetcher = globalThis.fetch, urlApi = globalThis.URL, BlobCtor = globalThis.Blob, imageDecoder, pageOrigin = globalThis.location?.origin } = {}) {
  const sketch = validatePageSketchDocument(sketchInput);
  if (typeof fetcher !== "function" || !projectRootUrl || !urlApi?.createObjectURL || typeof BlobCtor !== "function") throw new TypeError("缺少项目开发服务 fetch 或浏览器 Blob URL 能力");
  const errors = [];
  const objectUrls = [];
  const assets = new Map();
  const runtimePrograms = new Map();
  let confirmationError = null;

  /** 记录单一文件失败并继续读取其余资源，让页面完整显示所有阻断原因。 */
  async function loadFile(file, expectedSha, label) {
    try { return await fetchVerifiedFile(file, expectedSha, { projectRootUrl, fetcher, pageOrigin }); }
    catch (error) { errors.push(`${label}：${error.message}`); return null; }
  }

  const sources = [
    [sketch.v2_nodes_file, sketch.v2_nodes_sha256, "V2 节点源"],
    [sketch.v3_manifest_file, sketch.v3_manifest_sha256, "V3 资源清单"],
    [sketch.v3_evidence_file, sketch.v3_evidence_sha256, "V3 验收证据"],
  ];
  const sourceFiles = await Promise.all(sources.map(([file, sha, label]) => loadFile(file, sha, label)));
  let lockedNodeIds = [];
  let backgroundLayoutError = null;
  try {
    const manifest = sourceFiles[1] ? JSON.parse(new TextDecoder().decode(sourceFiles[1].bytes)) : {};
    // 共用生成与正式阶段的布局门，不允许开发预览偷偷改写已冻结的父子关系。
    lockedNodeIds = assertPageSketchBackgroundLayout({ nodes: sketch.nodes, regions: manifest.regions ?? [], sceneId: sketch.scene_id, stateId: sketch.state_id, nodePresentations: sketch.node_presentations });
  } catch (error) {
    backgroundLayoutError = error.message;
    errors.push(`背景布局关系无效：${error.message}`);
  }

  const reference = await loadFile(sketch.reference_file, sketch.target_sha256, "冻结效果图");
  let referenceUrl = null;
  if (reference) {
    try {
      const blob = new BlobCtor([reference.bytes], { type: reference.mime });
      referenceUrl = urlApi.createObjectURL(blob);
      objectUrls.push(referenceUrl);
      await decodeImage(blob, referenceUrl, imageDecoder);
    } catch (error) {
      errors.push(`冻结效果图无法解码：${error.message}`);
      if (referenceUrl) urlApi.revokeObjectURL(referenceUrl);
      objectUrls.splice(objectUrls.indexOf(referenceUrl), 1);
      referenceUrl = null;
    }
  }

  // 合同已要求相同 asset_id 在各 placement 上使用同一 file/SHA；去重下载后由节点关系复用。
  const uniqueAssets = [...new Map(sketch.v3_assets.map((asset) => [asset.asset_id, asset])).values()];
  await Promise.all(uniqueAssets.map(async (asset) => {
    const loaded = await loadFile(asset.file, asset.sha256, `正式资源 ${asset.asset_id}`);
    if (!loaded) return;
    try {
      const blob = new BlobCtor([loaded.bytes], { type: loaded.mime });
      const objectUrl = urlApi.createObjectURL(blob);
      objectUrls.push(objectUrl);
      await decodeImage(blob, objectUrl, imageDecoder);
      assets.set(asset.asset_id, objectUrl);
    } catch (error) {
      errors.push(`正式资源 ${asset.asset_id} 无法预览：${error.message}`);
    }
  }));

  await Promise.all(Object.entries(sketch.node_presentations).filter(([, presentation]) => presentation.kind === "runtime-program").map(async ([nodeId, presentation]) => {
    const loaded = await loadFile(presentation.module_file, presentation.module_sha256, `运行时节点 ${nodeId} 预览程序`);
    if (!loaded) return;
    let moduleUrl;
    try {
      moduleUrl = urlApi.createObjectURL(new BlobCtor([loaded.bytes], { type: "text/javascript" }));
      const imported = await import(moduleUrl);
      const exportName = presentation.export_name ?? "mountPreview";
      if (typeof imported[exportName] !== "function") throw new Error(`模块必须导出 ${exportName}(context)`);
      runtimePrograms.set(nodeId, imported[exportName]);
    } catch (error) {
      errors.push(`运行时节点 ${nodeId} 预览模块加载失败（模块必须自包含且不得使用相对 import）：${error.message}`);
    } finally {
      if (moduleUrl) urlApi.revokeObjectURL(moduleUrl);
    }
  }));

  if (sketch.confirmation) {
    try {
      const actualContentSha = await hashPageSketchContent(sketch);
      if (actualContentSha !== sketch.confirmation.content_sha256) confirmationError = "草图 confirmation.content_sha256 与当前正式内容不一致";
    } catch (error) { confirmationError = `草图确认哈希无法复核：${error.message}`; }
  }

  return {
    lockedNodeIds,
    backgroundLayoutError,
    assets,
    confirmationError,
    errors,
    referenceUrl,
    runtimePrograms,
    revoke() { for (const url of objectUrls) urlApi.revokeObjectURL(url); },
  };
}

/** 确认前仅重新下载并复核全部 V2/V3 身份、冻结底图、正式资源及预览模块 SHA。 */
export async function verifyPageSketchSources(sketchInput, { projectRootUrl, fetcher = globalThis.fetch, pageOrigin = globalThis.location?.origin } = {}) {
  const sketch = validatePageSketchDocument(sketchInput);
  if (typeof fetcher !== "function" || !projectRootUrl) throw new TypeError("缺少项目开发服务 fetch 或资源根 URL");
  const errors = [];
  const files = [
    [sketch.v2_nodes_file, sketch.v2_nodes_sha256, "V2 节点源"],
    [sketch.v3_manifest_file, sketch.v3_manifest_sha256, "V3 资源清单"],
    [sketch.v3_evidence_file, sketch.v3_evidence_sha256, "V3 验收证据"],
    [sketch.reference_file, sketch.target_sha256, "冻结效果图"],
  ];
  const uniqueAssets = new Map(sketch.v3_assets.map((asset) => [asset.asset_id, asset]));
  for (const asset of uniqueAssets.values()) files.push([asset.file, asset.sha256, `正式资源 ${asset.asset_id}`]);
  for (const [nodeId, presentation] of Object.entries(sketch.node_presentations)) {
    if (presentation.kind === "runtime-program") files.push([presentation.module_file, presentation.module_sha256, `运行时节点 ${nodeId} 预览程序`]);
  }
  await Promise.all(files.map(async ([file, expectedSha, label]) => {
    try { await fetchVerifiedFile(file, expectedSha, { projectRootUrl, fetcher, pageOrigin }); }
    catch (error) { errors.push(`${label}：${error.message}`); }
  }));
  return { errors, healthy: errors.length === 0 };
}

/** 计算节点显示 bounds；每个祖先偏移只累加一次，使父节点拖动自然带动子孙。 */
export function calculatePageSketchNodeBounds(layout, nodes, layoutNodeId) {
  const nodeById = new Map(nodes.map((node) => [node.layout_node_id, node]));
  const node = nodeById.get(layoutNodeId);
  if (!node) throw new TypeError(`未知 layout_node_id：${layoutNodeId}`);
  let xOffset = 0;
  let yOffset = 0;
  let current = node;
  const visited = new Set();
  while (current) {
    const id = current.layout_node_id;
    if (visited.has(id)) throw new TypeError(`节点父级存在循环：${id}`);
    visited.add(id);
    const offset = layout.offsets?.[id] ?? { x: 0, y: 0 };
    xOffset += offset.x;
    yOffset += offset.y;
    const parentId = current.parent_layout_node_id;
    current = nodeById.get(parentId);
  }
  return { ...node.target_bounds, x: node.target_bounds.x + xOffset, y: node.target_bounds.y + yOffset };
}

/** 安全创建 DOM 元素；文本和资源名称均作为纯文本插入页面。 */
function createElement(document, tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** 把明确的文字节点样式映射到 DOM，避免以占位图替代正式文本。 */
function applyTextStyle(element, presentation) {
  const style = presentation.style;
  element.textContent = presentation.text;
  element.style.fontFamily = style.font_family;
  element.style.fontSize = `${style.font_size_px}px`;
  element.style.color = style.color;
  if (style.font_weight !== undefined) element.style.fontWeight = String(style.font_weight);
  if (style.text_align !== undefined) element.style.textAlign = style.text_align;
  if (style.line_height !== undefined) element.style.lineHeight = String(style.line_height);
}

/** 按节点 presentation 构建正式资产、文字、结构容器和运行时预览元素。 */
export async function mountPageSketchPreview({ host, sketch: sketchInput, sources, onNodeSelect }) {
  const sketch = validatePageSketchDocument(sketchInput);
  if (!host?.ownerDocument || !sources) throw new TypeError("host 与草图预加载 sources 不能为空");
  if (onNodeSelect !== undefined && typeof onNodeSelect !== "function") throw new TypeError("onNodeSelect 必须是节点选择回调");
  const document = host.ownerDocument;
  let destroyed = false;
  /** 显示内容只负责选择，拖动仍由编辑框控制，锁定背景也能被选中查看。 */
  function onDisplayedNodePointerDown(event) {
    if (destroyed || (event.button !== undefined && event.button !== 0)) return;
    onNodeSelect?.(event.currentTarget.dataset.layoutNodeId);
  }
  const nodeElements = new Map();
  const runtimeInstances = new Map();
  const errors = [...sources.errors];
  host.replaceChildren();
  host.style.position = "relative";
  host.style.width = `${sketch.viewport.width}px`;
  host.style.height = `${sketch.viewport.height}px`;

  for (const [index, node] of sketch.nodes.entries()) {
    const presentation = sketch.node_presentations[node.layout_node_id];
    const wrapper = createElement(document, "div", "page-sketch-node");
    wrapper.dataset.layoutNodeId = node.layout_node_id;
    wrapper.style.position = "absolute";
    wrapper.style.boxSizing = "border-box";
    // 空容器没有显示内容，必须穿透命中，防止透明父层遮挡后方实际显示节点。
    const hasDisplay = presentation.kind !== "container" || Boolean(presentation.style?.fill || presentation.style?.stroke);
    wrapper.style.pointerEvents = onNodeSelect && hasDisplay ? "auto" : "none";
    if (onNodeSelect) wrapper.addEventListener("pointerdown", onDisplayedNodePointerDown, true);
    wrapper.style.overflow = presentation.overflow ?? "visible";
    wrapper.style.zIndex = String(presentation.z_index ?? index);

    if (presentation.kind === "image") {
      for (const [layerIndex, assetId] of presentation.asset_ids.entries()) {
        const url = sources.assets.get(assetId);
        if (!url) {
          errors.push(`正式图片资源 ${assetId} 未加载，不能确认草图`);
          continue;
        }
        const image = createElement(document, "img", "page-sketch-asset");
        image.alt = "";
        image.draggable = false;
        image.src = url;
        // 同节点可声明多张正式图层；必须重叠铺满边界，不能按普通文档流横向/纵向排开。
        image.style.position = "absolute";
        image.style.inset = "0";
        image.style.zIndex = String(layerIndex);
        image.style.width = "100%";
        image.style.height = "100%";
        image.style.objectFit = presentation.object_fit;
        wrapper.append(image);
      }
      if (presentation.asset_ids.some((assetId) => !sources.assets.has(assetId))) wrapper.append(createElement(document, "span", "page-sketch-error", "正式图片资源无法预览"));
    } else if (presentation.kind === "text") {
      applyTextStyle(wrapper, presentation);
    } else if (presentation.kind === "container") {
      if (presentation.style?.fill) wrapper.style.backgroundColor = presentation.style.fill;
      if (presentation.style?.stroke) wrapper.style.border = presentation.style.stroke;
      if (presentation.style?.radius_px !== undefined) wrapper.style.borderRadius = `${presentation.style.radius_px}px`;
    } else if (presentation.kind === "runtime-program") {
      const mountPreview = sources.runtimePrograms.get(node.layout_node_id);
      if (!mountPreview) {
        wrapper.append(createElement(document, "span", "page-sketch-error", "运行时节点无法预览；草图不能确认"));
        errors.push(`运行时节点 ${node.layout_node_id} 缺少可用预览程序`);
      } else {
        try {
          const instance = mountPreview({ element: wrapper, node: structuredClone(node), viewport: { ...sketch.viewport }, layout: structuredClone(sketch.layout) });
          if (instance && typeof instance.then === "function") {
            // 运行时预览布局必须同步；及时消费拒绝，避免失败模块泄漏未处理 Promise。
            Promise.resolve(instance).catch(() => {});
            throw new Error("mountPreview 必须同步完成布局更新");
          }
          runtimeInstances.set(node.layout_node_id, instance ?? null);
        } catch (error) {
          wrapper.append(createElement(document, "span", "page-sketch-error", "运行时节点预览失败；草图不能确认"));
          errors.push(`运行时节点 ${node.layout_node_id} 预览失败：${error.message}`);
        }
      }
    }
    host.append(wrapper);
    nodeElements.set(node.layout_node_id, wrapper);
  }

  let currentLayout = validateVisualLayoutDocument(sketch.layout, sketch.nodes);
  let healthy = errors.length === 0;

  /** 同步节点 DOM 和运行时绘制器的位置；异步更新会被拒绝以保持同一帧一致。 */
  function reflow(layoutInput) {
    currentLayout = validateVisualLayoutDocument(layoutInput, sketch.nodes);
    try {
      for (const node of sketch.nodes) {
        const bounds = calculatePageSketchNodeBounds(currentLayout, sketch.nodes, node.layout_node_id);
        const element = nodeElements.get(node.layout_node_id);
        element.style.left = `${bounds.x}px`;
        element.style.top = `${bounds.y}px`;
        element.style.width = `${bounds.width}px`;
        element.style.height = `${bounds.height}px`;
        const runtime = runtimeInstances.get(node.layout_node_id);
        if (runtime && typeof runtime.update === "function") {
          const result = runtime.update({ element, node, viewport: sketch.viewport, bounds, layout: currentLayout });
          if (result && typeof result.then === "function") {
            // update 的异步副作用无法与 DOM 重排保持同帧，立即标记不健康并消费拒绝。
            Promise.resolve(result).catch(() => {});
            throw new Error(`运行时节点 ${node.layout_node_id} update 必须同步完成`);
          }
        }
      }
      healthy = errors.length === 0;
      return currentLayout;
    } catch (error) {
      healthy = false;
      throw error;
    }
  }

  /** 释放项目预览程序并清空临时资源节点。 */
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (onNodeSelect) for (const element of nodeElements.values()) element.removeEventListener("pointerdown", onDisplayedNodePointerDown, true);
    for (const runtime of runtimeInstances.values()) {
      if (typeof runtime === "function") runtime();
      else runtime?.destroy?.();
    }
    host.replaceChildren();
    sources.revoke?.();
  }

  try { reflow(currentLayout); }
  catch (error) { healthy = false; errors.push(`正式预览布局重排失败：${error.message}`); }
  return {
    destroy,
    errors,
    getBounds: (layoutNodeId) => calculatePageSketchNodeBounds(currentLayout, sketch.nodes, layoutNodeId),
    getViewportRect: () => host.getBoundingClientRect(),
    isHealthy: () => healthy && errors.length === 0,
    reflow,
  };
}
