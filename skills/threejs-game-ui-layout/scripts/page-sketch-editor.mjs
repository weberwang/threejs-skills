import { mountVisualLayoutEditor } from "./visual-layout-editor.mjs";
import { pickPageSketchFileStore } from "./page-sketch-file-store.mjs";
import { loadPageSketchSources, mountPageSketchPreview, verifyPageSketchSources } from "./page-sketch-preview.mjs";

/** 开发预览设备尺寸使用 CSS 像素，不代表设备物理分辨率或修改草图 viewport。 */
export const PREVIEW_DEVICES = Object.freeze([
  { id: "sketch", label: "草图原始尺寸" },
  { id: "phone-small", label: "小屏手机 · 360 × 640", width: 360, height: 640 },
  { id: "phone", label: "手机 · 390 × 844", width: 390, height: 844 },
  { id: "phone-large", label: "大屏手机 · 430 × 932", width: 430, height: 932 },
  { id: "tablet", label: "平板 · 768 × 1024", width: 768, height: 1024 },
  { id: "desktop", label: "桌面 · 1440 × 900", width: 1440, height: 900 },
]);

/** 分两层等比缩放：设备适配左侧空间，固定草图适配设备屏幕，避免显示选择改变已确认坐标。 */
export function calculateDevicePreviewGeometry(viewport, device, available) {
  for (const size of [viewport, device, available]) {
    if (![size?.width, size?.height].every((value) => Number.isFinite(value) && value > 0)) throw new TypeError("预览尺寸必须是正有限数");
  }
  const deviceScale = Math.min(available.width / device.width, available.height / device.height);
  const contentScale = Math.min(device.width / viewport.width, device.height / viewport.height);
  return {
    deviceScale, contentScale,
    deviceLeft: (available.width - device.width * deviceScale) / 2,
    deviceTop: (available.height - device.height * deviceScale) / 2,
    contentLeft: (device.width - viewport.width * contentScale) / 2,
    contentTop: (device.height - viewport.height * contentScale) / 2,
  };
}

/**
 * 创建开发阶段草图工作台；adapters可替换pickStore/loadSources/mountPreview/mountEditor，隔离浏览器IO并验证异步操作锁。
 */
export async function initializePageSketchApplication({ document, projectRootUrl, adapters = {} }) {
  if (!document?.defaultView || !projectRootUrl) throw new TypeError("需要浏览器 document 和项目开发服务根 URL");
  const pickStore = adapters.pickStore ?? pickPageSketchFileStore;
  const loadSources = adapters.loadSources ?? loadPageSketchSources;
  const mountPreview = adapters.mountPreview ?? mountPageSketchPreview;
  const mountEditor = adapters.mountEditor ?? mountVisualLayoutEditor;
  const verifySources = adapters.verifySources ?? verifyPageSketchSources;
  if (![pickStore, loadSources, mountPreview, mountEditor, verifySources].every((adapter) => typeof adapter === "function")) throw new TypeError("草图预览 adapters 必须提供有效函数");
  const window = document.defaultView;
  const frame = document.getElementById("stage-frame");
  const surface = document.getElementById("stage-surface");
  const deviceFrame = document.getElementById("stage-device");
  const controlsHost = document.getElementById("layout-controls");
  const deviceSelect = document.getElementById("preview-device");
  const orientationSelect = document.getElementById("device-orientation");
  const deviceSummary = document.getElementById("device-summary");
  const fullscreenButton = document.getElementById("toggle-fullscreen");
  const openButton = document.getElementById("open-sketch");
  const previewButton = document.getElementById("toggle-preview");
  const saveButton = document.getElementById("save-sketch");
  const resetButton = document.getElementById("reset-sketch");
  const confirmButton = document.getElementById("confirm-sketch");
  const status = document.getElementById("page-status");
  const errorsPanel = document.getElementById("resource-errors");
  let fileStore = null;
  let sources = null;
  let preview = null;
  let editor = null;
  let resizeObserver = null;
  let draftSaved = false;
  let previewHealthy = false;
  let confirmationHashValid = true;
  let operationInFlight = false;
  let previewMode = false;
  let fullscreenInFlight = false;

  /** 用安全纯文本方式展示资源读取和解码失败项。 */
  function renderErrors(items) {
    errorsPanel.replaceChildren();
    if (!items.length) return;
    const heading = document.createElement("h2");
    heading.textContent = "确认阻断项";
    const list = document.createElement("ul");
    for (const message of items) {
      const item = document.createElement("li");
      item.textContent = message;
      list.append(item);
    }
    errorsPanel.append(heading, list);
  }

  /** 根据资源、重排、保存和确认状态启用唯一合法的页面操作。 */
  function updateButtons() {
    const current = fileStore?.getDocument();
    const hasConfirmation = current?.confirmation?.status === "accepted" && confirmationHashValid;
    previewButton.disabled = !editor || operationInFlight;
    previewButton.textContent = previewMode ? "返回布局编辑" : "预览正式效果";
    previewButton.setAttribute("aria-pressed", String(previewMode));
    saveButton.disabled = !editor || operationInFlight;
    resetButton.disabled = !editor || operationInFlight || previewMode;
    confirmButton.disabled = !editor || operationInFlight || !draftSaved || !previewHealthy || Boolean(sources?.errors.length) || !confirmationHashValid || hasConfirmation;
    openButton.disabled = operationInFlight;
  }

  /** 设备外框与逻辑画布分别缩放；空布局或隐藏窗口不计算无效比例。 */
  function resizeSurface() {
    if (!surface?.dataset.viewportWidth || frame.clientWidth <= 32 || frame.clientHeight <= 32) return;
    const viewport = { width: Number(surface.dataset.viewportWidth), height: Number(surface.dataset.viewportHeight) };
    const preset = PREVIEW_DEVICES.find((item) => item.id === deviceSelect.value) ?? PREVIEW_DEVICES[0];
    const device = preset.id === "sketch" ? { ...viewport } : { width: preset.width, height: preset.height };
    if (preset.id !== "sketch") {
      const portrait = orientationSelect.value !== "landscape";
      const short = Math.min(device.width, device.height);
      const long = Math.max(device.width, device.height);
      device.width = portrait ? short : long;
      device.height = portrait ? long : short;
    }
    orientationSelect.disabled = preset.id === "sketch";
    const geometry = calculateDevicePreviewGeometry(viewport, device, { width: frame.clientWidth - 32, height: frame.clientHeight - 32 });
    deviceFrame.style.width = `${device.width}px`;
    deviceFrame.style.height = `${device.height}px`;
    deviceFrame.style.transform = `scale(${geometry.deviceScale})`;
    deviceFrame.style.left = `${geometry.deviceLeft + 16}px`;
    deviceFrame.style.top = `${geometry.deviceTop + 16}px`;
    surface.style.transform = `scale(${geometry.contentScale})`;
    surface.style.left = `${geometry.contentLeft}px`;
    surface.style.top = `${geometry.contentTop}px`;
    deviceSummary.textContent = `设备 ${device.width} × ${device.height} · 草图 ${viewport.width} × ${viewport.height} · 显示 ${Math.round(geometry.deviceScale * 100)}%`;
    // CSS transform 不触发 ResizeObserver，主动同步叠图以保持拖拽与显示位置一致。
    editor?.refreshViewport?.();
  }

  /** 切换设备时采用其默认方向，后续横竖屏调整由用户单独控制。 */
  function onDeviceChange() {
    const preset = PREVIEW_DEVICES.find((item) => item.id === deviceSelect.value);
    orientationSelect.value = preset?.width > preset?.height ? "landscape" : "portrait";
    resizeSurface();
  }

  /** 全屏整个工作台，确保右栏仍可操作，退出后重新测量左侧空间。 */
  async function onToggleFullscreen() {
    if (fullscreenInFlight) return;
    fullscreenInFlight = true;
    fullscreenButton.disabled = true;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (error) {
      status.textContent = `无法切换 Web 全屏：${error.message}`;
    } finally {
      fullscreenInFlight = false;
      onFullscreenChange();
    }
  }

  /** 浏览器 Esc 退出与按钮退出使用同一个状态刷新入口。 */
  function onFullscreenChange() {
    const fullscreen = Boolean(document.fullscreenElement);
    fullscreenButton.textContent = fullscreen ? "退出 Web 全屏" : "进入 Web 全屏";
    fullscreenButton.setAttribute("aria-pressed", String(fullscreen));
    fullscreenButton.disabled = fullscreenInFlight || typeof document.documentElement?.requestFullscreen !== "function";
    resizeSurface();
  }

  /** 销毁当前草图叠图、运行时节点预览程序和临时对象 URL。 */
  function clearCurrentPreview() {
    editor?.destroy();
    if (preview) preview.destroy();
    else sources?.revoke?.();
    editor = null;
    preview = null;
    sources = null;
    fileStore = null;
    previewHealthy = false;
    draftSaved = false;
    previewMode = false;
    surface.replaceChildren();
    surface.removeAttribute("data-viewport-width");
    surface.removeAttribute("data-viewport-height");
    errorsPanel.replaceChildren();
    updateButtons();
  }

  /** 打开已生成的真实 page-sketch JSON 并以项目开发服务实际文件加载预览。 */
  async function onOpenSketch() {
    if (operationInFlight) return;
    operationInFlight = true;
    updateButtons();
    clearCurrentPreview();
    status.textContent = "请选择生成的 page-sketch.json…";
    try {
      fileStore = await pickStore();
      const sketch = fileStore.getDocument();
      status.textContent = `正在复核 V2/V3 来源、底图和 ${sketch.v3_assets.length} 个正式资源…`;
      sources = await loadSources(sketch, { projectRootUrl, pageOrigin: window.location.origin });
      confirmationHashValid = !sources.confirmationError;
      if (sources.confirmationError) renderErrors([sources.confirmationError, ...sources.errors]);
      else renderErrors(sources.errors);
      if (sources.backgroundLayoutError) throw new Error(sources.backgroundLayoutError);
      if (!sources.referenceUrl) throw new Error("冻结效果图不能从当前开发服务读取或 SHA 不匹配，请先修复资源路径");

      preview = await mountPreview({ host: surface, sketch, sources,
        // 显示内容与节点树共用编辑器的选择状态；操作锁和预览模式由同一入口约束。
        onNodeSelect: (layoutNodeId) => editor?.selectNode(layoutNodeId),
      });
      surface.dataset.viewportWidth = String(sketch.viewport.width);
      surface.dataset.viewportHeight = String(sketch.viewport.height);
      resizeSurface();
      if (typeof window.ResizeObserver === "function") {
        resizeObserver?.disconnect();
        resizeObserver = new window.ResizeObserver(resizeSurface);
        resizeObserver.observe(frame);
      }

      const hasAcceptedConfirmation = sketch.confirmation?.status === "accepted" && confirmationHashValid;
      draftSaved = hasAcceptedConfirmation;
      previewHealthy = preview.isHealthy() && sources.errors.length === 0;
      editor = mountEditor({
        host: surface,
        controlsHost,
        lockedNodeIds: sources.lockedNodeIds ?? [],
        referenceUrl: sources.referenceUrl,
        viewport: sketch.viewport,
        nodes: sketch.nodes,
        layout: sketch.layout,
        getBounds: preview.getBounds,
        getViewportRect: preview.getViewportRect,
        reflow: preview.reflow,
        save: fileStore.saveDraft,
        saveOnChange: false,
        showSaveButton: false,
        onLayoutChange() {
          draftSaved = false;
          const savedConfirmation = fileStore.getDocument().confirmation;
          if (savedConfirmation) status.textContent = "草图已修改；保存后旧确认会失效。";
          else status.textContent = "草图有未保存修改；请先保存，再点击确认草图。";
          updateButtons();
        },
        onPreviewHealthChange(healthy, message) {
          previewHealthy = healthy && preview.isHealthy() && sources.errors.length === 0;
          if (!healthy) status.textContent = `页面布局预览异常：${message}`;
          updateButtons();
        },
      });
      resizeSurface();
      if (hasAcceptedConfirmation) status.textContent = `V4 草图已确认：${sketch.confirmation.content_sha256}`;
      else if (sources.errors.length || preview.errors.length || !confirmationHashValid) status.textContent = "草图已载入，但存在阻断项；修复全部资源后才能确认。";
      else status.textContent = "页面草图已载入；点击显示节点或右侧节点树选择，调整坐标后先保存草图再确认。";
      renderErrors([...sources.errors, ...preview.errors, ...(sources.confirmationError ? [sources.confirmationError] : [])]);
      updateButtons();
    } catch (error) {
      status.textContent = `无法加载草图：${error.message}`;
      if (sources?.errors.length) renderErrors(sources.errors);
      updateButtons();
    } finally {
      operationInFlight = false;
      updateButtons();
    }
  }

  /** 恢复冻结 V2 的坐标与显示树，先作为未保存草稿，再沿用保存和确认流程。 */
  function onResetSketch() {
    if (!editor || operationInFlight || previewMode) return;
    try {
      editor.resetToInitial();
      // 重置属于布局修改，不能沿用重置前的已保存快照或人工签收状态。
      draftSaved = false;
      status.textContent = "已恢复初始坐标与父子关系；请保存草图并重新确认。";
    } catch (error) {
      draftSaved = false;
      status.textContent = `重置布局失败：${error.message}`;
    }
    updateButtons();
  }

  /** 将当前 V2 布局偏移写入完整 page-sketch 文件并清空旧确认。 */
  async function onSaveDraft() {
    if (!editor || operationInFlight) return;
    operationInFlight = true;
    const lockedEditor = editor;
    updateButtons();
    try {
      // 写盘期间禁止布局继续变化，确保读回确认的是当前画布显示的同一快照。
      lockedEditor.setInteractionEnabled(false);
      const saved = await fileStore.saveDraft(lockedEditor.getLayout());
      if (saved.confirmation !== null) throw new Error("草图修改后 confirmation 必须已清除");
      draftSaved = true;
      confirmationHashValid = true;
      status.textContent = "草图已保存并读回复核；点击确认草图后才可进入 V5。";
    } catch (error) {
      draftSaved = false;
      status.textContent = `保存草图失败：${error.message}`;
    } finally {
      try { lockedEditor.setInteractionEnabled(true); }
      catch (error) { draftSaved = false; status.textContent = `保存后无法恢复编辑器：${error.message}`; }
      operationInFlight = false;
      updateButtons();
    }
  }

  /** 在全部输入 SHA 与显示节点预览通过后写入带内容摘要的确认回执。 */
  async function onConfirmSketch() {
    if (!editor || operationInFlight || !draftSaved || !previewHealthy || sources?.errors.length || !preview.isHealthy()) return;
    operationInFlight = true;
    const lockedEditor = editor;
    updateButtons();
    try {
      // 确认哈希计算与文件回写期间冻结节点及操作按钮，防止签收旧快照后继续编辑。
      lockedEditor.setInteractionEnabled(false);
      const sourceCheck = await verifySources(fileStore.getDocument(), { projectRootUrl, pageOrigin: window.location.origin });
      const sourceErrors = Array.isArray(sourceCheck?.errors) ? sourceCheck.errors : [];
      if (sourceCheck?.healthy !== true || sourceErrors.length > 0) {
        previewHealthy = false;
        renderErrors([...sources.errors, ...sourceErrors]);
        throw new Error(sourceErrors.length ? `确认前来源复核失败：${sourceErrors.join("；")}` : "确认前来源复核未通过");
      }
      const saved = await fileStore.confirm({ previewReady: true, layout: lockedEditor.getLayout() });
      confirmationHashValid = true;
      status.textContent = `草图已确认，可推进 V5：${saved.confirmation.content_sha256}`;
      renderErrors([]);
    } catch (error) {
      status.textContent = `草图确认失败：${error.message}`;
    } finally {
      try { lockedEditor.setInteractionEnabled(true); }
      catch (error) { confirmationHashValid = false; status.textContent = `确认后无法恢复编辑器：${error.message}`; }
      operationInFlight = false;
      updateButtons();
    }
  }

  /** 切换无遮挡正式资源预览；恢复布局模式时继续使用原草图与参考透明度。 */
  function onTogglePreview() {
    if (!editor || operationInFlight) return;
    previewMode = !previewMode;
    editor.setPreviewMode(previewMode);
    status.textContent = previewMode ? "正在预览无遮挡的正式效果；草图布局与确认状态未改变。" : "已返回布局编辑；参考图透明度与草图布局已恢复。";
    updateButtons();
  }

  for (const preset of PREVIEW_DEVICES) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    deviceSelect.append(option);
  }
  deviceSelect.value = "sketch";
  orientationSelect.value = "portrait";
  orientationSelect.disabled = true;
  deviceSelect.addEventListener("change", onDeviceChange);
  orientationSelect.addEventListener("change", resizeSurface);
  fullscreenButton.addEventListener("click", onToggleFullscreen);
  document.addEventListener("fullscreenchange", onFullscreenChange);
  onFullscreenChange();
  openButton.addEventListener("click", onOpenSketch);
  previewButton.addEventListener("click", onTogglePreview);
  saveButton.addEventListener("click", () => { void onSaveDraft(); });
  resetButton.addEventListener("click", onResetSketch);
  confirmButton.addEventListener("click", () => { void onConfirmSketch(); });
  window.addEventListener("resize", resizeSurface, { passive: true });
  window.addEventListener("pagehide", () => {
    resizeObserver?.disconnect();
    clearCurrentPreview();
  }, { once: true });
  updateButtons();
  return { clearCurrentPreview };
}
