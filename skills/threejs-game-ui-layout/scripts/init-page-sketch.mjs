#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGE_SKETCH_RESOURCE_MAP_SCHEMA, PAGE_SKETCH_SCHEMA, validatePageSketchDocument, validateProjectRelativePath } from "./page-sketch-contract.mjs";
import { validatePageSketchResourceBindings } from "./page-sketch-resource-bindings.mjs";
import { validateVisualLayoutDocument } from "./visual-layout-editor.mjs";

const ACCEPTED_STATES = new Set(["accepted", "pass", "passed", "complete", "completed", "valid"]);

/** 对输入文件字节计算合同统一使用的 SHA-256 身份。 */
function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/** 检查路径留在项目目录内；资源 URL 以项目根为基准解析。 */
async function resolveProjectFile(projectRoot, projectPath, label, { allowMissing = false } = {}) {
  const normalized = validateProjectRelativePath(projectPath, label);
  const absolutePath = resolve(projectRoot, normalized);
  const fromRoot = relative(projectRoot, absolutePath);
  if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(fromRoot)) {
    throw new TypeError(`${label} 必须指向项目内文件`);
  }
  const rootReal = await realpath(projectRoot);
  let targetReal;
  if (!allowMissing) targetReal = await realpath(absolutePath);
  else {
    let ancestor = absolutePath;
    const tail = [];
    while (true) {
      try { targetReal = resolve(await realpath(ancestor), ...tail.reverse()); break; }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        const parent = dirname(ancestor);
        if (parent === ancestor) throw error;
        tail.push(ancestor.slice(parent.length + (parent.endsWith("\\") ? 0 : 1)));
        ancestor = parent;
      }
    }
  }
  const realRelative = relative(rootReal, targetReal);
  if (!realRelative || realRelative === ".." || realRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(realRelative)) {
    throw new TypeError(`${label} 解析后的真实路径越出项目根目录`);
  }
  return absolutePath;
}

/** 读取相对项目根的 JSON 文件，并返回精确字节供身份计算。 */
async function readProjectJson(projectRoot, file, label) {
  const absolutePath = await resolveProjectFile(projectRoot, file, label);
  const bytes = await readFile(absolutePath);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch (error) { throw new Error(`${label} 不是合法 JSON：${error.message}`); }
  return { value, bytes, absolutePath };
}

/** 检查 V3 的不可变正式资源 PASS 回执与本次 manifest 及 candidate 身份绑定。 */
function validateV3Acceptance(evidence, manifest, manifestFile, manifestSha, nodesDocument) {
  if (!evidence || evidence.evidenceType !== "v3-formal-acceptance" || evidence.status !== "PASS") {
    throw new Error("V3 正式验收证据必须为 v3-formal-acceptance PASS");
  }
  if (typeof evidence.acceptanceId !== "string" || evidence.acceptanceId.trim() === "") throw new Error("V3 正式验收证据缺少 acceptanceId");
  if (evidence.workItemId !== manifest.workItemId) throw new Error("V3 正式验收证据 Work Item 与资源清单不一致");
  if (evidence.candidateVersion !== manifest.candidateVersion) throw new Error("V3 PASS evidence candidateVersion 与资源清单不一致");
  if (evidence.targetSha256 !== nodesDocument.target_sha256 || evidence.targetSha256 !== manifest.reference_target?.target_sha256) throw new Error("V3 PASS evidence、V2 nodes 与 manifest 冻结目标 SHA 不一致");
  if (validateProjectRelativePath(evidence.visualManifestFile, "V3 evidence visualManifestFile") !== validateProjectRelativePath(manifestFile, "v3_manifest_file") || evidence.visualManifestSha256 !== manifestSha) throw new Error("V3 PASS 证据必须绑定本次输入的 visual-assets.json 路径和真实 SHA");
  const candidate = evidence.candidateIdentity;
  if (!candidate || !/^sha256:[0-9a-f]{64}$/.test(candidate.sha256 ?? "") || typeof candidate.diffFingerprint !== "string" || candidate.diffFingerprint.trim() === "") {
    throw new Error("V3 正式验收证据缺少有效 candidateIdentity");
  }
  if (evidence.contentHash !== candidate.sha256) {
    throw new Error("V3 evidence contentHash 与 candidateIdentity 不一致");
  }
  if (typeof evidence.diffFingerprint !== "string" || evidence.diffFingerprint !== candidate.diffFingerprint) throw new Error("V3 evidence.diffFingerprint 与 candidateIdentity 不一致");
  const manifestCandidate = manifest.candidate_identity;
  if (!manifestCandidate || manifestCandidate.sha256 !== candidate.sha256 || manifestCandidate.diff_fingerprint !== candidate.diffFingerprint) {
    throw new Error("V3 PASS evidence candidateIdentity 与 visual-assets.json candidate_identity 不一致");
  }
  for (const [field, collection] of [["formalAssets", evidence.formalAssets], ["components", evidence.components]]) {
    if (!Array.isArray(collection) || collection.length === 0 || collection.some((item) => !item || !ACCEPTED_STATES.has(String(item.status).toLowerCase()))) {
      throw new Error(`V3 PASS evidence ${field} 必须是非空 accepted 状态集合`);
    }
  }
}

/** 先以共享纯合同校验 component/state/placement，再核验每份 accepted 运行文件字节。 */
async function buildAcceptedAssets(projectRoot, resourceMap, manifest, nodes, identity) {
  if (!Array.isArray(resourceMap.assets)) throw new Error("资源映射 assets 必须是数组");
  const mappings = validatePageSketchResourceBindings({
    nodes,
    sceneId: identity.scene_id,
    stateId: identity.state_id,
    assets: manifest.assets ?? [],
    regions: manifest.coverage_audit?.regions ?? [],
    mappings: resourceMap.assets,
    nodePresentations: resourceMap.node_presentations,
  });
  const manifestAssets = new Map((manifest.assets ?? []).map((asset) => [asset.id, asset]));
  const result = [];
  for (const [index, mapping] of mappings.entries()) {
    const label = `resources.assets[${index}]`;
    const assetId = mapping.asset_id;
    const file = validateProjectRelativePath(mapping.file, `${label}.file`);
    const declared = manifestAssets.get(assetId);
    if (typeof declared.sha256 !== "string" || !/^sha256:[0-9a-f]{64}$/.test(declared.sha256)) throw new Error(`${label} accepted 资源缺少有效 SHA-256`);
    const bytes = await readFile(await resolveProjectFile(projectRoot, file, `${label}.file`));
    const digest = sha256(bytes);
    if (declared.sha256 !== digest) throw new Error(`${label} 实际文件 SHA 与 accepted 资源 sha256 不一致`);
    result.push({ asset_id: assetId, file, sha256: digest, layout_node_id: mapping.layout_node_id, kind: "image" });
  }
  return result;
}

/** 基于 V2 几何、V3 PASS 资源和开发期展示配方生成未确认 V4 草图。 */
export async function buildPageSketchDocument({ projectRoot, nodesDocument, nodesBytes, nodesFile, v3Manifest, manifestBytes, manifestFile, v3Evidence, evidenceBytes, evidenceFile, resourceMap, referenceBytes }) {
  if (nodesDocument?.schema !== "threejs-layout-nodes/1.0" || !Array.isArray(nodesDocument.layout_nodes) || nodesDocument.layout_nodes.length === 0) throw new Error("输入必须是有效且包含节点的 V2 layout-nodes/1.0 文档");
  if (!v3Manifest || v3Manifest.schema_version !== "1.5" || typeof v3Manifest.workItemId !== "string" || typeof v3Manifest.candidateVersion !== "string") {
    throw new Error("V3 visual-assets.json 必须是当前 Work Item 的 schema 1.5 清单");
  }
  if (resourceMap?.schema !== PAGE_SKETCH_RESOURCE_MAP_SCHEMA || typeof resourceMap.node_presentations !== "object" || resourceMap.node_presentations === null) {
    throw new Error(`资源映射 schema 必须为 ${PAGE_SKETCH_RESOURCE_MAP_SCHEMA} 并包含 node_presentations`);
  }
  validateV3Acceptance(v3Evidence, v3Manifest, manifestFile, sha256(manifestBytes), nodesDocument);

  const targetSha = nodesDocument.target_sha256;
  if (!/^sha256:[0-9a-f]{64}$/.test(targetSha ?? "")) throw new Error("V2 节点快照缺少有效 target_sha256");
  const referenceFile = validateProjectRelativePath(v3Manifest.reference_target?.original_file, "reference_target.original_file");
  const actualReferenceSha = sha256(referenceBytes);
  if (actualReferenceSha !== targetSha || (v3Manifest.reference_target?.target_sha256 && v3Manifest.reference_target.target_sha256 !== targetSha)) {
    throw new Error("冻结效果图真实 SHA 与 V2 target_sha256/V3 target identity 不一致");
  }
  const viewport = nodesDocument.viewport;
  if (nodesDocument.target_sha256 !== v3Manifest.reference_target?.target_sha256) throw new Error("V2 节点 target_sha256 与 V3 冻结目标不一致");
  if (!v3Manifest.reference_target?.scene_ids?.includes(nodesDocument.scene_id) || !v3Manifest.reference_target?.state_ids?.includes(nodesDocument.state_id)) throw new Error("V2 Scene/State 不在 V3 冻结目标范围内");
  const canvas = v3Manifest.coverage_audit?.canvases?.find((item) => item.scene_id === nodesDocument.scene_id && item.state_id === nodesDocument.state_id);
  if (!canvas || canvas.width !== viewport?.width || canvas.height !== viewport?.height) throw new Error("V2 viewport 与 V3 当前 Scene/State coverage canvas 不一致");
  const nodes = structuredClone(nodesDocument.layout_nodes);
  const v3Assets = await buildAcceptedAssets(projectRoot, resourceMap, v3Manifest, nodes, { scene_id: nodesDocument.scene_id, state_id: nodesDocument.state_id });
  const assetIds = new Set(v3Assets.map((asset) => asset.asset_id));
  const nodeIds = new Set(nodes.map((node) => node.layout_node_id));
  for (const nodeId of nodeIds) {
    const presentation = resourceMap.node_presentations[nodeId];
    if (!presentation) throw new Error(`V2 节点 ${nodeId} 缺少可预览的 V3 presentation`);
    if (presentation.kind === "image" && (!Array.isArray(presentation.asset_ids) || presentation.asset_ids.some((assetId) => !assetIds.has(assetId)))) {
      throw new Error(`图像节点 ${nodeId} 的 asset_ids 必须全部映射为 V3 accepted 资源`);
    }
    if (presentation.kind === "runtime-program") {
      const moduleFile = validateProjectRelativePath(presentation.module_file, `node_presentations.${nodeId}.module_file`);
      const moduleBytes = await readFile(await resolveProjectFile(projectRoot, moduleFile, `node_presentations.${nodeId}.module_file`));
      if (sha256(moduleBytes) !== presentation.module_sha256) throw new Error(`runtime-program 节点 ${nodeId} 的预览模块 SHA 不匹配`);
    }
  }
  for (const nodeId of Object.keys(resourceMap.node_presentations)) if (!nodeIds.has(nodeId)) throw new Error(`资源映射包含不在 V2 快照中的节点：${nodeId}`);
  for (const asset of v3Assets) {
    const presentation = resourceMap.node_presentations[asset.layout_node_id];
    if (presentation.kind !== "image" || !presentation.asset_ids.includes(asset.asset_id)) throw new Error(`正式资源 ${asset.asset_id} 没有在节点 presentation 中展示`);
  }

  const layout = validateVisualLayoutDocument({ schema: "threejs-visual-layout/1.0", target_sha256: targetSha, scene_id: nodesDocument.scene_id, state_id: nodesDocument.state_id, offsets: {} }, nodes);
  const document = {
    schema: PAGE_SKETCH_SCHEMA,
    target_sha256: targetSha,
    scene_id: nodesDocument.scene_id,
    state_id: nodesDocument.state_id,
    work_item_id: v3Manifest.workItemId,
    candidate_version: v3Manifest.candidateVersion,
    viewport,
    reference_file: referenceFile,
    v2_nodes_file: validateProjectRelativePath(nodesFile, "v2_nodes_file"),
    v2_nodes_sha256: sha256(nodesBytes),
    v3_manifest_file: validateProjectRelativePath(manifestFile, "v3_manifest_file"),
    v3_manifest_sha256: sha256(manifestBytes),
    v3_evidence_file: validateProjectRelativePath(evidenceFile, "v3_evidence_file"),
    v3_evidence_sha256: sha256(evidenceBytes),
    v3_assets: v3Assets,
    nodes,
    node_presentations: structuredClone(resourceMap.node_presentations),
    layout,
    confirmation: null,
  };
  return validatePageSketchDocument(document);
}

/** 只解析显式命名参数，拒绝忽略拼错的输入以免生成不完整证据。 */
function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    if (!["--project-root", "--nodes", "--v3-manifest", "--v3-evidence", "--resources", "--output"].includes(name) || !argv[index + 1]) throw new Error(`未知或缺失的参数：${name}`);
    args[name] = argv[index + 1];
  }
  for (const name of ["--project-root", "--nodes", "--v3-manifest", "--v3-evidence", "--resources", "--output"]) if (!args[name]) throw new Error(`缺少必需参数 ${name}`);
  return args;
}

/** 用输入源文件原始字节建立 V4 草图 JSON，输出使用 wx 保证不会覆盖。 */
export async function initPageSketch(args) {
  const projectRoot = resolve(args["--project-root"]);
  const nodesInput = await readProjectJson(projectRoot, args["--nodes"], "V2 nodes");
  const manifestInput = await readProjectJson(projectRoot, args["--v3-manifest"], "V3 manifest");
  const evidenceInput = await readProjectJson(projectRoot, args["--v3-evidence"], "V3 evidence");
  const resourceInput = await readProjectJson(projectRoot, args["--resources"], "V3 resource map");
  const referenceFile = manifestInput.value?.reference_target?.original_file;
  if (!referenceFile) throw new Error("V3 清单缺少冻结 reference_target.original_file");
  const referenceBytes = await readFile(await resolveProjectFile(projectRoot, referenceFile, "reference_target.original_file"));
  const sketch = await buildPageSketchDocument({
    projectRoot,
    nodesDocument: nodesInput.value,
    nodesBytes: nodesInput.bytes,
    nodesFile: args["--nodes"],
    v3Manifest: manifestInput.value,
    manifestBytes: manifestInput.bytes,
    manifestFile: args["--v3-manifest"],
    v3Evidence: evidenceInput.value,
    evidenceBytes: evidenceInput.bytes,
    evidenceFile: args["--v3-evidence"],
    resourceMap: resourceInput.value,
    referenceBytes,
  });
  const outputPath = validateProjectRelativePath(args["--output"], "output");
  const absoluteOutput = await resolveProjectFile(projectRoot, outputPath, "output", { allowMissing: true });
  await mkdir(dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, `${JSON.stringify(sketch, null, 2)}\n`, { flag: "wx" });
  return sketch;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await initPageSketch(parseArgs(process.argv.slice(2)));
    process.stdout.write("V4 页面草图已生成，confirmation=null；请在草图编辑页完成预览和确认。\n");
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
