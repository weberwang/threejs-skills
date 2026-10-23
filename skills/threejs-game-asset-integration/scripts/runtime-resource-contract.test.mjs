import assert from "node:assert/strict";
import test from "node:test";
import { validateAssetRuntimeBindings } from "./runtime-resource-contract.mjs";
import { collectManifestFileEvidenceEntries } from "./global-visual-file-gate.mjs";
import { validateManifest } from "./validate_visual_manifest.mjs";
import { STRUCTURAL_FILE_GATE_OPTIONS, validManifest } from "./visual-manifest-test-fixtures.mjs";

/** 创建带显式公共资源绑定的独立合同。 */
function asset() {
  return {
    runtime_outputs: ["public/assets/scenes/main/decor.png"],
    runtime_bindings: [{ runtime_binding: { kind: "public", file: "public/assets/scenes/main/decor.png", deployment_base: "/game/" }, runtime_url: "/game/assets/scenes/main/decor.png" }],
  };
}

test("普通资源按部署前缀和完整目录校验地址，不取 basename", () => {
  assert.deepEqual(validateAssetRuntimeBindings(asset()), []);
  const wrong = asset(); wrong.runtime_bindings[0].runtime_url = "/decor.png";
  assert(validateAssetRuntimeBindings(wrong).some((item) => item.includes("runtime_url")));
});

test("声明绑定必须属于运行产物并保持唯一", () => {
  const missing = asset(); missing.runtime_outputs = [];
  assert(validateAssetRuntimeBindings(missing).some((item) => item.includes("runtime_outputs")));
  const repeated = asset(); repeated.runtime_bindings.push(structuredClone(repeated.runtime_bindings[0]));
  assert(validateAssetRuntimeBindings(repeated).some((item) => item.includes("重复")));
  assert(validateAssetRuntimeBindings({ runtime_bindings: null }).length > 0);
});

test("模块导入声明保留构建器表达式并把消费者纳入文件门", () => {
  const value = { runtime_outputs: ["src/scenes/main/decor.png"], runtime_bindings: [{ runtime_binding: { kind: "module-import", file: "src/scenes/main/decor.png", importer: "src/scenes/main/view.ts", specifier: "./decor.png?url" }, runtime_url: null, url_expression: "atlasUrl" }] };
  assert.deepEqual(validateAssetRuntimeBindings(value), []);
  assert(collectManifestFileEvidenceEntries({ assets: [value] }).some((entry) => entry[1] === "src/scenes/main/view.ts"));
  value.runtime_bindings[0].runtime_url = "src/scenes/main/decor.png";
  assert(validateAssetRuntimeBindings(value).length > 0);
});

test("视觉清单正式入口消费普通资源绑定诊断", () => {
  const document = validManifest();
  const file = "public/assets/scenes/main/decor.png";
  document.assets[0].runtime_outputs.push(file);
  document.assets[0].runtime_bindings = [{ runtime_binding: { kind: "public", file, deployment_base: "/game/" }, runtime_url: "/game/assets/scenes/main/decor.png" }];
  assert.deepEqual(validateManifest(document, STRUCTURAL_FILE_GATE_OPTIONS), []);
  document.assets[0].runtime_bindings[0].runtime_url = "/wrong.png";
  const errors = validateManifest(document, STRUCTURAL_FILE_GATE_OPTIONS);
  assert(errors.some((item) => item.includes("runtime_bindings[0]")), errors.join("\n"));
});
