import { isAbsolute, relative, resolve } from "node:path";

/** 校验项目内资源路径，避免 URL 或模块说明借路径语法指向项目外。 */
function normalizeProjectFile(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error(`${label} 必须是非空项目相对路径`);
  }
  if (value.includes("\\") || value.includes("%") || value.includes("?") || value.includes("#")
    || value.includes(":") || /[\u0000-\u001f\u007f]/u.test(value)
    || value.startsWith("/") || /^[A-Za-z]:/u.test(value)) {
    throw new Error(`${label} 不得包含绝对路径、反斜线、URL 语法或危险编码`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`${label} 不得包含空段或目录跳转段`);
  }
  return segments.join("/");
}

/** 从 importer 的目录解析静态 ?url 导入，并拒绝项目根以外的解析结果。 */
function resolveModuleSpecifier(importer, specifier) {
  if (typeof specifier !== "string" || specifier.length === 0 || specifier.trim() !== specifier
    || specifier.includes("\\") || specifier.includes("%") || specifier.includes("#")
    || /[\u0000-\u001f\u007f]/u.test(specifier)) {
    throw new Error("runtime_binding.specifier 必须是无编码的静态相对导入路径");
  }
  const queryIndex = specifier.indexOf("?");
  const importPath = queryIndex < 0 ? specifier : specifier.slice(0, queryIndex);
  const query = queryIndex < 0 ? "" : specifier.slice(queryIndex);
  if (query !== "?url" || !(importPath.startsWith("./") || importPath.startsWith("../"))) {
    throw new Error("runtime_binding.specifier 必须使用相对静态导入并以 ?url 结尾");
  }
  const importSegments = importPath.split("/");
  if (importSegments.some((segment) => segment === "")) {
    throw new Error("runtime_binding.specifier 不得包含重复斜线");
  }
  const resolved = importer.split("/").slice(0, -1);
  for (const segment of importSegments) {
    if (segment === ".") continue;
    if (segment === "..") {
      if (resolved.length <= 1) throw new Error("runtime_binding.specifier 不得逃出 src 目录");
      resolved.pop();
      continue;
    }
    if (segment.includes(":") || segment.includes("?") || segment.includes("#")) {
      throw new Error("runtime_binding.specifier 含无效路径段");
    }
    resolved.push(segment);
  }
  const file = resolved.join("/");
  if (!file.startsWith("src/")) {
    throw new Error("runtime_binding.specifier 必须解析到 src 内的资源");
  }
  return file;
}

/** 规范部署前缀；只接受根路径或以斜线收尾的站点内目录。 */
function normalizeDeploymentBase(value) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value
    || value.includes("\\") || value.includes("%") || value.includes("?") || value.includes("#")
    || /\s|[\u0000-\u001f\u007f]/u.test(value) || !value.startsWith("/") || !value.endsWith("/")) {
    throw new Error("runtime_binding.deployment_base 必须是 / 或以斜线收尾的站点内路径");
  }
  if (value === "/") return value;
  const segments = value.slice(1, -1).split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error("runtime_binding.deployment_base 不得包含重复斜线或目录跳转段");
  }
  return `/${segments.join("/")}/`;
}

/** 将站点路径分段编码，保证空格和 Unicode 文件名不会改变 URL 结构。 */
function encodeSitePath(value) {
  return value.split("/").map((segment) => encodeURIComponent(segment)
    .replace(/[!'()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)).join("/");
}

/** 将图集输出绝对路径安全地投影为项目相对文件路径。 */
export function projectRelativeResourceFile(projectRoot, outputFile) {
  if (typeof projectRoot !== "string" || projectRoot.trim() === ""
    || typeof outputFile !== "string" || outputFile.trim() === "") {
    throw new Error("runtime_binding 需要 projectRoot 和 outputSheet 才能绑定实际文件");
  }
  const root = resolve(projectRoot);
  const output = resolve(outputFile);
  const relativeFile = relative(root, output);
  if (!relativeFile || isAbsolute(relativeFile) || relativeFile === ".."
    || relativeFile.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error("outputSheet 必须位于 projectRoot 内");
  }
  return normalizeProjectFile(relativeFile.replaceAll("\\", "/"), "outputSheet");
}

/** 解析并校验输出图集的运行时绑定，返回唯一 URL 或静态模块表达式。 */
export function resolveRuntimeResourceBinding(value, { expectedFile, file } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("runtime_binding 必须是对象");
  }
  const expectedPath = expectedFile ?? file;
  const boundFile = normalizeProjectFile(value.file ?? expectedPath, "runtime_binding.file");
  if (expectedPath !== undefined && boundFile !== normalizeProjectFile(expectedPath, "outputSheet")) {
    throw new Error("runtime_binding.file 必须严格等于 projectRoot 内的 outputSheet 路径");
  }

  if (value.kind === "public") {
    if (Object.keys(value).some((key) => !["kind", "file", "deployment_base"].includes(key))) {
      throw new Error("public runtime_binding 只允许 kind、file、deployment_base 字段");
    }
    if (!/^public\/assets\/[^/]+\/.+$/u.test(boundFile)) {
      throw new Error("public 资源必须位于 public/assets/<owner>/ 下");
    }
    const deploymentBase = normalizeDeploymentBase(value.deployment_base);
    const publicRelativePath = boundFile.slice("public/".length);
    const runtimeUrl = encodeSitePath(`${deploymentBase}${publicRelativePath}`);
    return {
      runtime_binding: { kind: "public", file: boundFile, deployment_base: deploymentBase },
      runtime_url: runtimeUrl,
      url_expression: runtimeUrl,
      import_statement: null,
    };
  }

  if (value.kind === "module-import") {
    if (Object.keys(value).some((key) => !["kind", "file", "importer", "specifier"].includes(key))) {
      throw new Error("module-import runtime_binding 只允许 kind、file、importer、specifier 字段");
    }
    if (!boundFile.startsWith("src/")) {
      throw new Error("module-import 资源必须位于 src 内");
    }
    const importer = normalizeProjectFile(value.importer, "runtime_binding.importer");
    if (!importer.startsWith("src/") || !/\.(?:[cm]?[jt]sx?)$/iu.test(importer)) {
      throw new Error("runtime_binding.importer 必须是 src 内的 JavaScript 或 TypeScript 模块");
    }
    if (resolveModuleSpecifier(importer, value.specifier) !== boundFile) {
      throw new Error("runtime_binding.specifier 解析结果必须严格等于 runtime_binding.file");
    }
    return {
      runtime_binding: { kind: "module-import", file: boundFile, importer, specifier: value.specifier },
      runtime_url: null,
      url_expression: "atlasUrl",
      import_statement: `import atlasUrl from ${JSON.stringify(value.specifier)};`,
    };
  }

  throw new Error("runtime_binding.kind 必须是 public 或 module-import");
}
