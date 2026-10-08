import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { auditSkeleton } from "./spine_skeleton.mjs";
import { ReskinError } from "./spine_atlas.mjs";

/** 判断路径是否位于指定目录内，防止升级日志通过相对路径逃出候选目录。 */
function isWithin(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(`.${process.platform === "win32" ? "\\" : "/"}`));
}

/** 创建 Skeleton 审计完整性检查器，集中维护源投影和外部 Runtime 证据硬门。 */
export function createSkeletonAuditIntegrity({ isFile, sha256 }) {
  /** 重新计算源/升级候选投影，防止直接手改清单绕过生产硬门。 */
  return async function assertSkeletonAuditIntegrity(document) {
    const atlas = { cells: document.cells, pages: document.atlas.pages };
    const source = await auditSkeleton(document.skeletons[0].path, atlas, document.target_runtime);
    const auditFields = (value) => JSON.stringify({ structure_sha256: value.structure_sha256, runtime_compatible: value.runtime_compatible, requires_upgrade: value.requires_upgrade, stats: value.stats, atlas_region_mapping: value.atlas_region_mapping, missing_atlas_regions: value.missing_atlas_regions, unused_atlas_regions: value.unused_atlas_regions, duplicate_atlas_regions: value.duplicate_atlas_regions });
    if (auditFields(source) !== auditFields(document.skeleton_audit) || document.source_audit && auditFields(source) !== auditFields(document.source_audit)) throw new ReskinError("Skeleton 审计投影、Runtime 兼容性或 Atlas 映射 SHA-256 漂移，禁止继续生产");
    if (document.skeleton_upgrade?.status !== "PASSED") return;
    const candidatePath = resolve(document.skeleton_upgrade.candidate_path);
    if (!await isFile(candidatePath) || await sha256(candidatePath) !== document.skeleton_upgrade.candidate_sha256) throw new ReskinError("升级后 Skeleton 候选缺失或 SHA-256 漂移");
    const candidate = await auditSkeleton(candidatePath, atlas, document.target_runtime);
    if (candidate.structure_sha256 !== document.skeleton_upgrade.after_sha256 || candidate.runtime_compatible !== true || candidate.missing_atlas_regions.length || candidate.unused_atlas_regions.length || candidate.duplicate_atlas_regions.length) throw new ReskinError("升级后 Skeleton 审计投影、Atlas 映射或目标 Runtime 证据漂移");
    const evidenceValue = document.skeleton_upgrade.runtime_parse_evidence_path;
    const evidenceRoot = resolve(document.candidate_dir ?? dirname(candidatePath));
    const evidencePath = evidenceValue ? resolve(evidenceRoot, evidenceValue) : null;
    if (!evidencePath || !await isFile(evidencePath) || document.skeleton_upgrade.runtime_parse_evidence_sha256 !== await sha256(evidencePath)) throw new ReskinError("目标 Runtime 解析证据缺失或 SHA-256 漂移");
    let evidence;
    try { evidence = JSON.parse(await readFile(evidencePath, "utf8")); } catch (error) { throw new ReskinError(`目标 Runtime 解析证据不是 JSON：${error.message}`); }
    const logPath = evidence?.log_path ? resolve(evidenceRoot, evidence.log_path) : null;
    const producerValid = typeof evidence?.producer === "string" && evidence.producer.trim();
    const packageValid = typeof evidence?.runtime_package === "string" && evidence.runtime_package.trim();
    const invocationValid = typeof (evidence?.command ?? evidence?.url) === "string" && (evidence.command ?? evidence.url).trim();
    if (evidence?.report_version !== "spine-runtime-parse/1.0" || !producerValid || !packageValid || evidence.runtime_version !== document.target_runtime || !invocationValid || evidence.target_runtime !== document.target_runtime || evidence.parsed !== true || evidence.candidate_skeleton_sha256 !== document.skeleton_upgrade.candidate_sha256 || !logPath || !isWithin(evidenceRoot, logPath) || !await isFile(logPath) || evidence.log_sha256 !== await sha256(logPath) || document.skeleton_upgrade.runtime_parse_evidence_log_sha256 !== evidence.log_sha256) throw new ReskinError("目标 Runtime 解析证据字段、实际日志或升级候选绑定不匹配");
  };
}
