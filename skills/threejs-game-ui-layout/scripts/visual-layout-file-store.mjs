import { validateVisualLayoutDocument } from "./visual-layout-editor.mjs";

/** 核对编辑文件始终绑定同一个已冻结目标和场景状态。 */
function assertIdentity(layout, identity) {
  for (const field of ["target_sha256", "scene_id", "state_id"]) {
    if (layout[field] !== identity[field]) throw new Error(`布局文件 ${field} 与当前编辑目标不一致`);
  }
}

/** 读取浏览器文件句柄，并保持对外部修改的原始字节快照。 */
async function readSnapshot(handle, nodes, identity) {
  const file = await handle.getFile();
  const source = await file.text();
  let parsed;
  try { parsed = JSON.parse(source); } catch (error) { throw new Error(`布局文件不是合法 JSON：${error.message}`); }
  const layout = validateVisualLayoutDocument(parsed, nodes);
  assertIdentity(layout, identity);
  return { source, layout };
}

/** 为开发预览建立可直接写回本地文件的存储器。 */
export async function createVisualLayoutFileStore(handle, nodes) {
  if (!handle || typeof handle.getFile !== "function" || typeof handle.createWritable !== "function") throw new Error("需要可读写的布局文件句柄");
  const initialFile = await handle.getFile();
  const initialText = await initialFile.text();
  let initial;
  try { initial = validateVisualLayoutDocument(JSON.parse(initialText), nodes); } catch (error) { throw new Error(`布局文件无效：${error.message}`); }
  const identity = { target_sha256: initial.target_sha256, scene_id: initial.scene_id, state_id: initial.state_id };
  let snapshot = initialText;
  let saving = false;

  return {
    layout: initial,
    /** 重新读取持久化结果，供刷新或显式复核使用。 */
    async load() {
      if (saving) throw new Error("正在保存布局，暂不能重载");
      const current = await readSnapshot(handle, nodes, identity);
      snapshot = current.source;
      return current.layout;
    },
    /** 拖拽结束写回文件；检测外部编辑，避免覆盖另一位作者的改动。 */
    async save(nextLayout) {
      if (saving) throw new Error("布局保存仍在进行中");
      saving = true;
      let writable;
      try {
        const normalized = validateVisualLayoutDocument(nextLayout, nodes);
        assertIdentity(normalized, identity);
        const current = await readSnapshot(handle, nodes, identity);
        if (current.source !== snapshot) throw new Error("布局文件已被外部修改，请重载后再保存");
        const contents = `${JSON.stringify(normalized, null, 2)}\n`;
        writable = await handle.createWritable();
        await writable.write(contents);
        await writable.close();
        writable = null;
        // 文件系统写入失败或写后内容漂移时不更新快照，下一次保存会继续阻断。
        const verified = await readSnapshot(handle, nodes, identity);
        if (verified.source !== contents) throw new Error("布局文件写入后校验失败");
        snapshot = verified.source;
        return verified.layout;
      } catch (error) {
        if (writable && typeof writable.abort === "function") await writable.abort().catch(() => {});
        throw error;
      } finally {
        saving = false;
      }
    },
  };
}

/** 在用户点击操作中选择已有布局文件；浏览器授权后可连续自动保存。 */
export async function pickVisualLayoutFileStore(nodes, picker = globalThis.showOpenFilePicker) {
  if (typeof picker !== "function") throw new Error("当前浏览器不支持本地文件写入，请为编辑器提供项目开发服务的 save 回调");
  const handles = await picker({ multiple: false, types: [{ description: "布局实现配置", accept: { "application/json": [".json"] } }] });
  if (!Array.isArray(handles) || handles.length !== 1) throw new Error("请选择一个布局 JSON 文件");
  return createVisualLayoutFileStore(handles[0], nodes);
}
