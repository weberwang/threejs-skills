import assert from "node:assert/strict";
import test from "node:test";
import {
  projectRelativeResourceFile,
  resolveRuntimeResourceBinding,
} from "./runtime-resource-binding.mjs";

/** 验证 public 资源从真实深层文件路径和部署前缀唯一推导 URL。 */
test("public 绑定支持深层 assets 路径与非根部署前缀", () => {
  const result = resolveRuntimeResourceBinding({
    kind: "public",
    file: "public/assets/hero/attack/red-atlas.png",
    deployment_base: "/game/",
  }, { expectedFile: "public/assets/hero/attack/red-atlas.png" });
  assert.deepEqual(result, {
    runtime_binding: {
      kind: "public",
      file: "public/assets/hero/attack/red-atlas.png",
      deployment_base: "/game/",
    },
    runtime_url: "/game/assets/hero/attack/red-atlas.png",
    url_expression: "/game/assets/hero/attack/red-atlas.png",
    import_statement: null,
  });
});

/** 确认输出绝对路径只会按明确 projectRoot 转为项目相对路径。 */
test("输出绑定路径必须位于 projectRoot 内", () => {
  assert.equal(projectRelativeResourceFile("E:/game", "E:/game/public/assets/hero/run.png"), "public/assets/hero/run.png");
  assert.throws(() => projectRelativeResourceFile("E:/game", "E:/other/run.png"), /必须位于 projectRoot 内/u);
});

/** 拒绝 public 文件和部署前缀中的穿越、绝对路径及危险编码。 */
test("public 绑定拒绝非法文件路径和部署前缀", () => {
  for (const file of [
    "Public/assets/hero/atlas.png",
    "public/ASSETS/hero/atlas.png",
    "public/assets/hero/../atlas.png",
    "public/assets/hero/%2e%2e/atlas.png",
    "public//assets/hero/atlas.png",
    "/public/assets/hero/atlas.png",
    "public\\assets\\hero\\atlas.png",
  ]) {
    assert.throws(() => resolveRuntimeResourceBinding({ kind: "public", file, deployment_base: "/" }));
  }
  for (const deployment_base of ["/game", "game/", "/game//", "/../", "/%2e%2e/"]) {
    assert.throws(() => resolveRuntimeResourceBinding({
      kind: "public", file: "public/assets/hero/atlas.png", deployment_base,
    }));
  }
  assert.throws(() => resolveRuntimeResourceBinding({
    kind: "public", file: "public/assets/hero/atlas.png", deployment_base: "/",
  }, { expectedFile: "public/assets/hero/other.png" }), /严格等于/u);
});

/** 验证模块导入运行时表达式并不伪造浏览器 URL。 */
test("module-import 绑定解析相对 ?url 导入并返回表达式", () => {
  const result = resolveRuntimeResourceBinding({
    kind: "module-import",
    file: "src/assets/hero/run.png",
    importer: "src/animations/hero.ts",
    specifier: "../assets/hero/run.png?url",
  }, { expectedFile: "src/assets/hero/run.png" });
  assert.deepEqual(result, {
    runtime_binding: {
      kind: "module-import",
      file: "src/assets/hero/run.png",
      importer: "src/animations/hero.ts",
      specifier: "../assets/hero/run.png?url",
    },
    runtime_url: null,
    url_expression: "atlasUrl",
    import_statement: 'import atlasUrl from "../assets/hero/run.png?url";',
  });
});

/** 拒绝错误的导入解析目标、绝对地址及缺失的绑定字段。 */
test("module-import 绑定拒绝错误 specifier 和缺失绑定", () => {
  const base = {
    kind: "module-import",
    file: "src/assets/hero/run.png",
    importer: "src/animations/hero.ts",
  };
  for (const specifier of [
    "../assets/other.png?url",
    "https://example.invalid/run.png?url",
    "../assets/run.png?raw",
    "../../../../outside.png?url",
    "../assets/%2e%2e/run.png?url",
    "../assets//run.png?url",
  ]) {
    assert.throws(() => resolveRuntimeResourceBinding({ ...base, specifier }));
  }
  assert.throws(() => resolveRuntimeResourceBinding(undefined), /必须是对象/u);
  assert.throws(() => resolveRuntimeResourceBinding({ ...base, specifier: "../assets/hero/run.png?url" }, {
    expectedFile: "src/assets/hero/other.png",
  }), /严格等于/u);
});
