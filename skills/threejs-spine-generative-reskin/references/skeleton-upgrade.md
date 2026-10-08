# Skeleton 审计与升级

`inspect` 和 `init` 必须从 JSON/Atlas 配置读取正式结构，不依靠截图测量。审计输出至少包含：

- Spine 原版本与目标 Runtime 版本；
- Bone、Slot、Skin、Attachment、Region Attachment、Mesh、Animation 统计；
- 完整动画名称；
- attachment path 到 Atlas Region 的映射、缺失和未使用 Region；
- 每个 Mesh 的 `vertices`、`triangles`、`uvs` 稳定 SHA-256。

当原版本低于目标 Runtime 时，工具只保存外部/官方 Spine 工具生成的候选，不自行实现 3.x→4.x 转换。`upgrade-check` 对升级前后做规范化结构投影比较：Bone 的 parent/length/Transform/inherit、Slot 的 bone/color/dark/default attachment/blend、IK/transform/path/physics 约束、Skin/Attachment 的 region/mesh/linkedmesh 锚点/尺寸/path/parent/deform/sequence，以及动画关键帧时间、值和插值语义变化都属于未知变更并阻断；只允许记录 Runtime 格式字段迁移。

`--runtime-evidence` 必须来自目标项目的真实 Runtime 诊断页或官方解析工具，而不是本 CLI 自己把版本号改成目标版本。证据 JSON 需要绑定候选 Skeleton SHA、目标 Runtime、`producer`、runtime package/version、command 或 URL、`parsed=true`，并引用候选目录内的原始日志及其 SHA-256。CLI 只校验证据的绑定性和结构投影，不能宣称自己完成了官方 Runtime 解析；缺少或漂移时 `plan-batches` 仍会失败。

升级候选和原 Skeleton 都记录 SHA-256；`pack` 将实际使用的升级后 Skeleton 一并输出并记录 `build.skeleton_sha256`。最终报告必须同时展示升级前后统计、允许变更、未知变更、解析证据和哈希。
