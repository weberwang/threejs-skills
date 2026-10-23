# 布局运行快照证据

运行快照确认的是当前已挂载场景中每个业务布局节点的真实矩形、实际参照和属性写入者。批次使用 `schema=threejs-layout-runtime/1` 与 `coordinate_space=layout-logical-px`；同一批次必须绑定 `batch_id`、`viewport_revision`、`scene_id`、`state_id`、`candidate_id`、`viewport_bounds` 和实际 `safe_area_bounds`。视口变化会提升 `viewport_revision`，不能把变化前后的组件读数混成一批。

## 采集边界

```js
const evidence = collectLayoutRuntimeSnapshots(bindings, () => readCurrentRuntimeBatch());
const errors = validateLayoutRuntimeSnapshots(layoutNodes, evidence, [], "layout_geometry", {
  scene_id: currentSceneId,
  state_id: currentStateId,
  candidate_id: currentCandidateId,
  viewport_bounds: currentLogicalViewportBounds,
});
```

`readContext` 必须同步读取运行中的批次上下文，并在组件读数前后各读取一次。`bindings` 只包含 `{ layout_node_id, readSnapshot }`；每个回调从实际 DOM/HUD 对象读取状态，不接收冻结 layout nodes 或 `layout_execution` 来构造证据。采集期间批次、revision、场景身份或视口变化时整批拒绝。

组件快照包括 `renderer`、`active`、实际父级和定位参照、`position_writers`、`size_writers`、`layout_bounds`、`reference_bounds`、`local_size` 和 `image`。活动节点的每种属性必须恰好有一个 writer，且与派生计划一致；非活动节点的 writer 数组必须为空。每个业务 ID 仍要有且仅有一条结构记录。真正卸载的节点可以把实际父级、参照和几何记为 `null`，不能伪造计划父级；任何活动后代都不能挂在非活动业务父级或引用非活动业务节点。

采集器会根据同批快照重建 `reference_bounds`：业务参照取同批实测节点矩形，稳定根取批次内的 viewport/safe-area 矩形。手填、旧批次或与实际参照不一致的矩形会被拒绝。`validateLayoutRuntimeSnapshots` 会比较实际父级、参照、writer、严格/补偿居中和图文成员联合框。居中验证使用最多 `0.5 logical-px` 的量化余量；布局计划本身仍以零补偿为严格中心，只有带理由的 `center_alignment` 才允许偏移。校验只覆盖结构完整性和声明的不变量，不要求所有运行矩形都等于冻结目标 bounds。

## DOM 和 HUD 适配

DOM 可以用 `createDomLayoutBinding(element, options)` 建立读取适配器。必须提供真实项目回调 `readParentLayoutNodeId()`、`readReferenceId()`、`readPositionWriters()`、`readSizeWriters()`，并显式提供 `cssToLayout(rect)`；浏览器 `getBoundingClientRect()` 的 CSS 像素不能直接冒充逻辑像素。适配器从实际挂载状态、元素和祖先的 computed style 读取 `active`，以当前 `getBoundingClientRect()` 读取布局 AABB，以 `offsetWidth/offsetHeight` 读取未变换的 `local_size`。默认 IMG 读取器会合并元素及祖先的二维 `transform` 矩阵，只有累计基向量正交且等长时才采集；平移、旋转和等比缩放会计入 `image.display_size`，旋转后的 AABB 不用于推断图片内容比例。非等比缩放、剪切、`matrix3d`、perspective 或独立 CSS `translate`/`rotate`/`scale` 无法由默认读取器证明比例时会拒绝采集。此时项目必须提供 `readImage(element)`，返回真实 `source_size` 和包含实际元素/祖先变换的 CSS `display_size`（cover 裁切前）；复杂 CSS 图片、canvas 或纹理也使用该回调。

HUD 由项目侧实现同样形状的 `readSnapshot()`，从实际 `Object3D`、Camera 和 HUD 布局映射中读取节点屏幕矩形、局部尺寸、父级、参照与当前 writer；不得将透视世界坐标直接当 HUD 的逻辑像素。引用矩形应由采集器从同批节点或根快照解析。

`image.source_size` 是实际纹理/图片内容尺寸；`image.display_size` 是包含元素及祖先等比变换缩放的图片内容尺寸（cover 裁切前），`local_size` 是节点自身未变换布局尺寸，`layout_bounds` 是屏幕布局矩形，可能已经包含 transform 造成的 AABB 变化。普通图检查内容比例；只有冻结九宫格允许内容非比例扩展，并继续校验源像素尺寸。背景 frame 的 viewport 尺寸不能当作素材源尺寸；背景 cover、UV 与裁切沿用[满幅背景合同](../../threejs-game-asset-integration/references/full-bleed-background.md)。

静态 JSON fixture、目标图和自动生成的合成节点只能用于单元测试，不能冒充正式运行证据。正式 V4 结果必须来自实际候选场景的同步读取，并绑定本次 scene/state/candidate 与 viewport revision。

已有 `node_measurements.actual_bounds` 和关键对齐 `runtime_measurement` 必须逐字段等于对应活动节点的同批 `component_snapshot.layout_bounds`，不能维护两套互相矛盾的实际读数。该绑定只检查原有测量覆盖范围；`usability` 不因此变成全部节点的精确几何比较。
