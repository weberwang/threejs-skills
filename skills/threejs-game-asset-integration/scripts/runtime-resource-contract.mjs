import { resolveRuntimeResourceBinding } from "./runtime-resource-binding.mjs";

/** 校验显式声明的普通资源加载绑定，未声明时由项目现有资源消费证据负责验收。 */
export function validateAssetRuntimeBindings(asset, errors = [], label = "asset") {
  if (asset?.runtime_bindings === undefined) return errors;
  const bindings = asset.runtime_bindings;
  if (!Array.isArray(bindings) || bindings.length === 0) {
    errors.push(`${label}.runtime_bindings 必须是非空数组`);
    return errors;
  }
  const outputs = new Set(Array.isArray(asset.runtime_outputs) ? asset.runtime_outputs : []);
  const seen = new Set();
  for (const [index, entry] of bindings.entries()) {
    const itemLabel = `${label}.runtime_bindings[${index}]`;
    try {
      const resolved = resolveRuntimeResourceBinding(entry?.runtime_binding);
      const file = resolved.runtime_binding.file;
      if (!outputs.has(file)) errors.push(`${itemLabel}.runtime_binding.file 必须列入 runtime_outputs`);
      if (seen.has(file)) errors.push(`${itemLabel} 不得重复绑定同一运行文件`);
      seen.add(file);
      if (entry.runtime_url !== resolved.runtime_url) errors.push(`${itemLabel}.runtime_url 与文件及部署绑定不一致`);
      if ((resolved.runtime_url === null || entry.url_expression !== undefined) && entry.url_expression !== resolved.url_expression) {
        errors.push(`${itemLabel}.url_expression 与模块导入绑定不一致`);
      }
    } catch (error) {
      errors.push(`${itemLabel}：${error.message}`);
    }
  }
  return errors;
}
