# three.js HUD 节点组织

本参考定义屏幕 HUD/DOM Overlay 的节点职责、父子关系和阶段检查。固定设计画布、二维尺寸与停靠合同仅适用于 HUD；透视 3D 世界需用独立 world contract 描述关卡单位、对象位置、Camera 与交互。本文补充[功能语义分组约束](functional-semantic-grouping.md)：语义分组说明元素共同表达什么，`ui_layout` 说明节点为何依赖其直接父级以及布局、溢出、安全区和输入由谁控制。两类信息必须分别记录，不能互相推导。

## 节点树与父容器职责

每个父容器都必须至少承担一种可说明的职责：

| 职责 | 适用情况 | three.js/DOM 中的组织方式 |
| --- | --- | --- |
| `POSITION` | 子节点位置、偏移或缩放依赖父节点参照 | Canvas HUD 使用 `THREE.Group`/`Object3D` 统一局部变换，DOM Overlay 使用语义化元素和 CSS 布局；仍须按确认的父级记录，不能按 bounds 自动挑选。 |
| `LAYOUT` | 父级决定子项尺寸、顺序、间距或重排 | 由一个布局所有者计算子节点，避免布局计算与手写位置互相覆盖。 |
| `INTERACTION` | 父级是一个完整命中目标并处理子项输入 | 将输入绑定到组件根；纯视觉子节点不重复接收同一次操作。 |
| `STATE` | 子项共享显隐、动画状态或生命周期 | 将共同状态的拥有者与受控子项放在同一组件根下。 |
| `CLIP` | 父级定义需要裁切的边界 | 只将需裁切的内容放入裁切区；须保持完整的文字、预览和提示作为同级内容。 |
| `REUSE` | 子树作为整体重复实例化或复用 | 将稳定的可复用 UI 单元封装为组件；仅仅使用相同资源不构成复用关系。 |

同组且没有相互位置依赖的元素应作为同级子项，不可为了“看起来更整齐”把一个视觉元素设成另一个的父级。父级必须来自人工确认的位置依赖或组件职责，几何包含、视觉距离和元素类型只能帮助检查，不能决定归属。一个节点可以有多个真实职责；不能用笼统的“分组”代替职责说明。

空容器只有在占位用途明确时才能保留，例如确认过的动态列表槽位、后续状态内容的装配边界或具有布局/裁切职责的空内容框。标注其用途、预期内容或空置条件及负责人；单纯留白、图层整理或猜测未来需求都不足以建立容器。布局标注中的 `empty_container` 必须与拆解确认中的空容器状态一致。

## 推荐根节点

以下是屏幕 UI 的职责示意，不是要求创建同名 Three.js 类。DOM Overlay 用 DOM 节点；Canvas HUD 用 `THREE.Group` 根并由 OrthographicCamera 绘制。实际结构可按职责裁剪，不得为了匹配示意图而增加无职责层：

```text
UIRoot
├── BackgroundRoot       # 可全屏延伸，装饰边缘可裁切
├── SafeAreaRoot         # 关键操作和信息的安全区参照
│   ├── HUDRoot          # 场景常驻信息和操作
│   └── PageRoot         # 当前页面内容；空间不足时重排或滚动
└── DisplayLayerRoot     # 宿主规划槽位，不代表把瞬态 UI 并入 HUD
```

`BackgroundRoot` 可超出安全区以覆盖可见 viewport；按钮、关键文字和玩法信息应遵循运行时 `safe_area_policy`。常驻 HUD 与当前页面分别归属明确 DOM 或 `Group` 根节点。`DisplayLayerRoot` 表示宿主场景预留的显示层位置；modal、popup、drawer、toast 等瞬态层仍按现有独立 `DISPLAY_LAYER` Work Item 规则建立，并记录宿主、生命周期、输入阻断和关闭后的恢复。Canvas 尺寸、OrthographicCamera、DOM Overlay 和射线输入细节按[适配器参考](threejs-adapter.md)确定。

上述节点树表达 UI 父子职责，不代替整个场景的绘制前后顺序。背景、世界主体/特效、常驻 HUD 与瞬态层分别建立有名根层，按[显示层分层合同](display-object-layering.md#显示层与实际合成)声明深度测试、Camera/DOM 合成和输入顺序；局部 `z_index`/`z_order` 只是合同意图，不会自动成为 three.js 属性。布局停靠点与模型局部原点分开记录。

## V2 组织事实

V2 继续严格按现有串行确认顺序执行：先生成人工可修改的拆解图与技术 JSON，人工确认最终 `decomposition_elements`；再由已确认元素生成显式布局决策与布局产物，人工独立确认布局图。未确认的拆解不得进入布局生成，父级不得由几何关系反推，空容器必须出现在确认拆解和布局标注中。

每个屏幕 UI 节点在确认的 `decomposition_elements` 中使用 snake_case 的 `ui_layout` 字段，至少记录：

| 字段 | 记录内容 |
| --- | --- |
| `grouping_basis` | 直接父子关系的职责数组，只使用 `POSITION`、`LAYOUT`、`INTERACTION`、`STATE`、`CLIP`、`REUSE`；同级性由多个节点共享同一父节点表达，不能把兄弟节点互相设为父级。只有直接挂在 `viewport`/`safe-area` 且无额外依赖时才用 `[]`；其余父子关系至少说明一项真实职责。 |
| `layout_owner` | 谁计算该节点的位置与尺寸：`PARENT`、`SELF` 或 `EXTERNAL`。 |
| `size_policy` | 尺寸意图：`FIXED`、`STRETCH`、`CONTENT` 或 `FLEX`；布局节点原有尺寸字段仍须填写并与它一致。 |
| `overflow_policy` | 空间不足时处理：`KEEP_VISIBLE`、`CLIP_DECORATION`、`REFLOW` 或 `SCROLL`。 |
| `safe_area_policy` | `FULL_BLEED` 或 `INSIDE_SAFE_AREA`。 |
| `interaction_policy` | `HIT_TARGET`、`DELEGATE_TO_PARENT` 或 `NONE`。 |
| `minimum_size` | 可选的最小可读/可点击尺寸，宽高须为正数逻辑像素；声明后任何视口下都不得低于该值。 |

`semantic_grouping.kind/rationale` 继续描述 `region`、`component`、`part` 或 `standalone` 的语义归属与理由；`ui_layout.grouping_basis` 描述实际父级承担的职责。独立文字、图标和同一组件内其他互不依赖的内容继续列为同级，不按“同为文字”等类型合并。父子节点的几何字段、裁切字段和现有 `layout_nodes.size_policy` 等机器合同字段也必须按现有合同填写；`ui_layout` 不能替代它们。

`DELEGATE_TO_PARENT` 必须沿父链找到唯一的 `HIT_TARGET`，命中目标不得嵌套另一命中目标。`SCROLL` 只能由承担 `LAYOUT` 职责的容器管理。`minimum_size` 在 V2 校验声明值，在 V5 以真实视口测量确认可读和可点击尺寸。

示例字段与当前 `ui_layout` 合同使用 snake_case，枚举值使用大写：

```yaml
semantic_grouping:
  kind: part
  rationale: "该图标是购买按钮的视觉内容，与文字共同表达购买操作"
ui_layout:
  grouping_basis: [INTERACTION, POSITION]
  layout_owner: PARENT
  size_policy: FIXED
  overflow_policy: KEEP_VISIBLE
  safe_area_policy: INSIDE_SAFE_AREA
  interaction_policy: DELEGATE_TO_PARENT
  minimum_size: {width: 48, height: 48}
```

这些字段作为 V2 人工确认事实，必须在拆解、生成布局节点及离线审阅资料中保持一致。布局节点原有几何、裁切和响应式字段仍按机器合同独立填写，`ui_layout` 不能替代它们。

## ThreeJS 组件例子

### 按钮

```text
PurchaseButton             # 一个 INTERACTION 命中目标
├── VisualRoot             # 可单独播放按压反馈
│   ├── Background
│   ├── Icon
│   └── Label
└── DisabledOverlay        # 随按钮状态显隐，不接收输入
```

`PurchaseButton` 管理命中、状态与生命周期。`Icon` 和 `Label` 同属购买信息并保持同级；`VisualRoot` 只在视觉内容确实需要一起动画时存在。子视觉节点标记 `DELEGATE_TO_PARENT` 或 `NONE`，避免多个重叠目标竞争点击。

### 背包格

```text
InventoryGrid              # LAYOUT：列数、间距、滚动内容
└── InventorySlot           # INTERACTION、REUSE：固定点击单位
    ├── ItemIcon
    ├── CountBadge           # POSITION：依赖格子角落定位
    │   └── CountText
    └── SelectionOutline    # STATE：随选中状态显隐
```

网格控制格子的尺寸与顺序，格子是单一命中目标和复用单元。角标依赖格子定位，数量文字属于角标；图标和选中框保持格子下的同级节点。内容超出可见高度时由网格/滚动视口处理，不把单格标成可溢出。

### 血条

```text
HealthBar
├── Track
│   └── FillClip             # CLIP：只裁切填充表现
│       └── Fill
├── DamagePreview            # 与 FillClip 同级，完整显示
└── ValueText                # 与填充宽度解耦
```

`FillClip` 的边界由血条内轨道确定，只有 `Fill` 需要裁切。受伤预览和数值文字保持在裁切区外，防止血量变化时被一并裁掉或挤压。需要展示的父子关系必须由拆解确认，不可仅以视觉覆盖或矩形相交决定。

## V1–V5 阶段接入

| 阶段 | 节点组织工作 | 确认与证据边界 |
| --- | --- | --- |
| V1 | 定义 `UIRoot`、背景/安全区/HUD/页面/显示层职责，声明 CSS 坐标空间、安全区、视口和响应式计划。 | 若项目选择固定 HUD 设计分辨率，竖屏/横屏基准及适配轴只用于该 HUD；否则直接使用 CSS 逻辑尺寸和断点。另为透视关卡声明独立 world contract。 |
| V2 | 先确认语义分组、直接父级和职责，再完成布局决策、节点几何和独立布局图确认。 | 拆解确认与布局确认仍是两个串行人工门；节点职责或父级变更需更新上游确认和受影响下游身份。 |
| V3 | 生产并验收节点所需正式资源。 | 绑定资源身份、来源和状态，不要求先实施正式 Scene。 |
| V4 | 草图页面按冻结节点树读取正式资源，显示节点树并调整坐标。 | 父节点移动带动子孙；保存与确认分别执行，确认绑定内容 SHA，修改使确认失效。 |
| V5 | 在代表性逻辑视口、安全区、resize 和状态下运行 UI。 | 记录真实可见性、滚动/重排、裁切和命中结果；静态布局图不能代替运行证据。 |

V2 中只改变停靠或偏移、未改变父级与职责时，沿现有布局确认规则重新生成并确认布局产物；改变节点、父子归属、语义分组或容器职责时，必须回到拆解确认。V3/V5 的失败按[布局阶段门](workflow-gates.md)处理，不新建第二套状态机。

## three.js 适配边界

迁移的是父子职责、同级分组、空槽标注、安全区和组合验收规则。Three.js 不提供通用二维 UI 布局组件；DOM Overlay 使用浏览器 CSS，Canvas 内 HUD 使用 `Group`、OrthographicCamera 和项目自己的布局计算。不得把透视世界节点用 HUD 固定设计像素定位。


## 背景与布局参照分离

背景是视口中的独立显示层，只负责自身的铺底、缩放与覆盖。背景图片不得成为其他元素的父容器、锚点或相对测量参照；前景节点显式使用 `viewport`、`safe-area` 或有功能职责的容器。背景节点独立归属 `viewport`，不放入可移动的功能容器；绘制顺序使用层级与 z-order 表达，不用背景父子关系表达。

V2 拆解即校验这项规则，V4 草图生成、预览与正式阶段的资源绑定再次复核。已有冻结节点错误绑定背景时，回到 V2 修正并重新确认节点来源，不在 V4 编辑器中偷偷改写冻结显示树。
