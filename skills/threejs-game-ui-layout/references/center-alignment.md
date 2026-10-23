# UI 中心对齐合同

本合同用于 V2 屏幕 UI 的派生布局。拆解 proposal 中的 bounds 是原图测量事实；布局决策允许移动节点，但不得改写这些测量值或节点宽高。只对派生 `target_bounds`/`bounds` 写入最终位置。

## 单节点中心策略

`axis_alignment.horizontal` 或 `.vertical` 为 `center` 时，决策可选声明同名 `center_alignment` 策略。省略该轴策略等同 `strict`，表示节点几何中心必须落在定位参照对应轴的中心线上。只有因视觉设计需要偏离中心时，才声明 `mode: reference`，并同时提供有限数值 `offset` 和非空 `reason`：

```json
{
  "horizontal_alignment": "center",
  "vertical_alignment": "top",
  "center_alignment": {
    "horizontal": { "mode": "reference", "offset": 8, "reason": "标题视觉重心略偏右" }
  }
}
```

偏移相对定位参照中心计算，保持节点原有宽高。未选择 center 的轴不得声明中心策略。完整字段与边界由布局决策校验器执行。

## 成组居中

图文组合需要整体居中时，在组 leader 的 `center_alignment.member_ids` 中列出完整组成员并包含 leader 自身。算法按所有成员的联合 bounds 一次计算平移，再将同一位移应用到成员，从而保持组内间距。角标、飘字等不属于整体视觉主体的成员应排除，并继续以真实父级/定位参照表达自己的依赖。

组成员必须共享真实父级、scene/state 和坐标空间；不允许同时加入多个组或在组 leader 之外再次声明 `member_ids`。组内定位关系也必须无环。

## 父级、参照与边界

`parent_element_id` 始终表示真实的结构/功能父级。可选 `ui_layout.position_reference_id` 独立表示停靠计算所用的对象，允许指向同级、祖先、`viewport` 或 `safe-area`。不同定位参照必须在 `grouping_basis` 声明 `POSITION`；父级边与参照边合并后必须无环。

使用 `safe-area` 时，布局决策必须携带实际安全区矩形；同批所有父级或定位参照快照必须一致并位于 viewport 内。未使用安全区时不创建虚构安全区根。普通节点即使声明 `visual_overflow.reason` 允许越出父框，也仍须留在 viewport/safe-area 等稳定根的安全边界内。

自动生成仅在派生布局副本上移动节点；重新布局时沿父级与定位参照依赖传播位移，成员组只移动一次。纹理 `source_size` 保留源像素尺寸，逻辑 `target_bounds` 保留显示尺寸，两者不能互相替代或自动缩放。
