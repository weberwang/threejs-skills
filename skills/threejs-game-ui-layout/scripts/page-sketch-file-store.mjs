import { hashPageSketchContent, validatePageSketchDocument } from "./page-sketch-contract.mjs";
import { validateVisualLayoutDocument } from "./visual-layout-editor.mjs";

/** 比较两个合同对象的字段顺序无关 JSON 语义。 */
function sameJson(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && sameJson(left[key], right[key]));
}

/** 读取草图文件并保留原始字节快照，用于阻止覆盖外部修改。 */
async function readCurrent(handle) {
  const file = await handle.getFile();
  const source = await file.text();
  let parsed;
  try { parsed = JSON.parse(source); } catch (error) { throw new Error(`草图文件不是合法 JSON：${error.message}`); }
  return { source, document: validatePageSketchDocument(parsed) };
}

/** 持有真实用户文件句柄，提供草图保存、回读确认和外部冲突保护。 */
export async function createPageSketchFileStore(handle) {
  if (!handle || typeof handle.getFile !== "function" || typeof handle.createWritable !== "function") throw new TypeError("需要可读写的 page-sketch.json 文件句柄");
  const initial = await readCurrent(handle);
  const identity = Object.fromEntries(["target_sha256", "scene_id", "state_id", "work_item_id", "candidate_version"].map((key) => [key, initial.document[key]]));
  let document = initial.document;
  let snapshot = initial.source;
  let saving = false;
  let operationInFlight = false;

  /** 限制单一草图存储实例一次仅有一个确认、保存或重载过程。 */
  function beginOperation(label) {
    if (operationInFlight) throw new Error(`草图${label}期间不能并发执行其他文件操作`);
    operationInFlight = true;
  }

  /** 每次写入都先比对当前文件快照，写后重新读取并校验完整草图。 */
  async function writeAndReadBack(nextDocument) {
    if (saving) throw new Error("草图文件写入仍在进行中");
    saving = true;
    let writable;
    try {
      // 排他流先于读快照取得跨页面锁，避免两个 editor 都读到旧内容后互相覆盖。
      writable = await handle.createWritable({ mode: "exclusive" });
      const current = await readCurrent(handle);
      if (current.source !== snapshot) throw new Error("草图文件已被外部修改，请重新打开当前文件后再继续");
      const contents = `${JSON.stringify(validatePageSketchDocument(nextDocument, { expectedIdentity: identity }), null, 2)}\n`;
      await writable.write(contents);
      await writable.close();
      writable = null;
      const verified = await readCurrent(handle);
      if (verified.source !== contents || !sameJson(verified.document, JSON.parse(contents))) throw new Error("草图文件写入后读回校验失败");
      snapshot = verified.source;
      document = verified.document;
      return structuredClone(document);
    } catch (error) {
      if (writable && typeof writable.abort === "function") await writable.abort().catch(() => {});
      throw error;
    } finally {
      saving = false;
    }
  }

  return {
    /** 返回当前磁盘快照，调用者不能直接修改内部持有的文档对象。 */
    getDocument() {
      return structuredClone(document);
    },
    /** 保存布局草稿；任何实际修改都立刻清除旧的 accepted 回执。 */
    async saveDraft(layout) {
      beginOperation("保存");
      try {
        const normalizedLayout = validateVisualLayoutDocument(layout, document.nodes);
        for (const field of ["target_sha256", "scene_id", "state_id"]) if (normalizedLayout[field] !== document[field]) throw new Error(`布局 ${field} 与草图身份不一致`);
        return await writeAndReadBack({ ...document, layout: normalizedLayout, confirmation: null });
      } finally { operationInFlight = false; }
    },
    /** 只有当前内容已保存且真实预览健康时，才能写入绑定内容 hash 的人工确认。 */
    async confirm({ previewReady, layout } = {}) {
      beginOperation("确认");
      try {
        if (previewReady !== true) throw new Error("资源或场景预览未通过，不能确认草图");
        const normalizedLayout = validateVisualLayoutDocument(layout, document.nodes);
        if (!sameJson(normalizedLayout, document.layout)) throw new Error("当前布局还有未保存修改，请先保存草图再确认");
        const contentSnapshot = structuredClone(document);
        const contentHash = await hashPageSketchContent(contentSnapshot);
        if (!sameJson(document, contentSnapshot)) throw new Error("计算确认哈希期间草图发生变化，请重新确认最新草图");
        const confirmation = {
          status: "accepted",
          confirmed_at: new Date().toISOString(),
          content_sha256: contentHash,
        };
        return await writeAndReadBack({ ...contentSnapshot, confirmation });
      } finally { operationInFlight = false; }
    },
    /** 重新读取磁盘前先检查原快照，外部改动要求关闭重开以重建预览身份。 */
    async reload() {
      beginOperation("重载");
      try {
        if (saving) throw new Error("正在写入草图，暂不能重载");
        const current = await readCurrent(handle);
        for (const [field, value] of Object.entries(identity)) if (current.document[field] !== value) throw new Error(`外部草图已更换 ${field}，请重新选择文件`);
        snapshot = current.source;
        document = current.document;
        return structuredClone(document);
      } finally { operationInFlight = false; }
    },
  };
}

/** 在用户手势中打开已有草图文件；取消和不支持的浏览器均明确失败。 */
export async function pickPageSketchFileStore(picker = globalThis.showOpenFilePicker) {
  if (typeof picker !== "function") throw new Error("此开发浏览器不支持本地文件读取写入 API");
  const handles = await picker({ multiple: false, types: [{ description: "V4 页面还原草图", accept: { "application/json": [".json"] } }] });
  if (!Array.isArray(handles) || handles.length !== 1) throw new Error("请选择一个 page-sketch.json 文件");
  return createPageSketchFileStore(handles[0]);
}
