import assert from "node:assert/strict";
import test from "node:test";
import { deriveLayoutExecutionPlans, POSITION_DRIVERS, SIZE_DRIVERS, validateLayoutDriverDeclaration, validateLayoutExecutionNodes } from "./layout-execution.mjs";

/** 构造最小业务布局节点，保留真实父级与职责字段。 */
function node(id, options = {}) {
  return {
    layout_node_id: id,
    parent_layout_node_id: options.parent ?? "viewport",
    element_type: options.element_type ?? "component",
    role: options.role ?? "icon",
    ...(options.render_kind !== undefined ? { render_kind: options.render_kind } : {}),
    ...(options.owner_type !== undefined ? { owner_type: options.owner_type } : {}),
    ...(options.nine_slice !== undefined ? { nine_slice: structuredClone(options.nine_slice) } : {}),
    ...(options.center_alignment !== undefined ? { center_alignment: structuredClone(options.center_alignment) } : {}),
    ...(options.axis_alignment !== undefined ? { axis_alignment: options.axis_alignment } : {}),
    ...(options.target_bounds !== undefined ? { target_bounds: options.target_bounds } : {}),
    ...(options.reference_id !== undefined ? { reference_id: options.reference_id } : {}),
    ui_layout: {
      grouping_basis: ["POSITION"],
      layout_owner: options.layout_owner ?? "PARENT",
      size_policy: options.size_policy ?? "FIXED",
      overflow_policy: options.overflow_policy ?? "KEEP_VISIBLE",
      ...(options.position_reference_id !== undefined ? { position_reference_id: options.position_reference_id } : {}),
      ...(options.position_driver !== undefined ? { position_driver: options.position_driver } : {}),
      ...(options.size_driver !== undefined ? { size_driver: options.size_driver } : {}),
    },
  };
}

const nineSlice = {
  mode: "stretch",
  reason: "底板边缘保持原尺寸",
  source_size: { width: 96, height: 64 },
  borders: { left: 12, right: 12, top: 10, bottom: 10 },
};

test("驱动枚举固定，缺省计划派生为共享位置及策略对应尺寸", () => {
  assert.deepEqual(POSITION_DRIVERS, ["DOM_LAYOUT", "SHARED", "STATIC", "ANIMATION"]);
  assert.deepEqual(SIZE_DRIVERS, ["FIXED", "CONTENT", "DOM_LAYOUT", "SHARED"]);
  const input = [
    node("fixed"),
    node("text", { size_policy: "CONTENT" }),
    node("stretch", { size_policy: "STRETCH" }),
    node("flex", { size_policy: "FLEX" }),
  ];
  const planned = deriveLayoutExecutionPlans(input);
  assert.deepEqual(planned.map((item) => item.layout_execution), [
    { position_driver: "SHARED", size_driver: "FIXED", reference_id: "viewport", image_mode: "NONE" },
    { position_driver: "SHARED", size_driver: "CONTENT", reference_id: "viewport", image_mode: "NONE" },
    { position_driver: "SHARED", size_driver: "SHARED", reference_id: "viewport", image_mode: "NONE" },
    { position_driver: "SHARED", size_driver: "SHARED", reference_id: "viewport", image_mode: "NONE" },
  ]);
  planned[0].ui_layout.grouping_basis.push("STATE");
  assert.deepEqual(input[0].ui_layout.grouping_basis, ["POSITION"], "计划生成应深拷贝节点输入");
});

test("DOM_LAYOUT、STATIC、ANIMATION 和明确尺寸驱动满足控制权约束", () => {
  const parent = node("panel", { element_type: "container", role: "container" });
  const dom = node("dom-child", { parent: "panel", position_driver: "DOM_LAYOUT", size_policy: "FLEX", size_driver: "DOM_LAYOUT" });
  const stat = node("static-child", { position_driver: "STATIC", layout_owner: "SELF" });
  const animation = node("animated-child", { position_driver: "ANIMATION", layout_owner: "EXTERNAL" });
  const plans = deriveLayoutExecutionPlans([parent, dom, stat, animation]);
  assert.equal(plans[1].layout_execution.position_driver, "DOM_LAYOUT");
  assert.equal(plans[1].layout_execution.size_driver, "DOM_LAYOUT");
  assert.equal(plans[2].layout_execution.position_driver, "STATIC");
  assert.equal(plans[3].layout_execution.position_driver, "ANIMATION");

  const declarationErrors = [];
  validateLayoutDriverDeclaration({ position_driver: "STATIC", layout_owner: "PARENT", size_policy: "FIXED", size_driver: "SHARED" }, declarationErrors);
  assert(declarationErrors.some((message) => message.includes("STATIC 要求 layout_owner=SELF")));
  assert(declarationErrors.some((message) => message.includes("size_driver=SHARED 与 size_policy=FIXED")));
});

test("派生和节点校验都会拒绝位置与尺寸驱动的非法所有权组合", () => {
  const invalidDeclarations = [
    {
      candidate: node("static-parent", { position_driver: "STATIC", layout_owner: "PARENT" }),
      message: "STATIC 要求 layout_owner=SELF",
    },
    {
      candidate: node("fixed-content-driver", { size_policy: "FIXED", size_driver: "CONTENT" }),
      message: "size_driver=CONTENT 与 size_policy=FIXED 不匹配",
    },
  ];

  for (const { candidate, message } of invalidDeclarations) {
    assert.throws(() => deriveLayoutExecutionPlans([candidate]), new RegExp(message));
    const errors = [];
    validateLayoutExecutionNodes([candidate], errors);
    assert(errors.some((error) => error.includes(message)), errors.join(" | "));
  }
});

test("DOM_LAYOUT 限制真实父级、非重排滚动和非居中组成员", () => {
  const panel = node("panel", { element_type: "container", role: "container" });
  const independentReference = node("child", { parent: "panel", position_reference_id: "viewport", position_driver: "DOM_LAYOUT" });
  assert.throws(() => deriveLayoutExecutionPlans([panel, independentReference]), /只能使用真实父级/);

  for (const overflow_policy of ["REFLOW", "SCROLL"]) {
    assert.throws(() => deriveLayoutExecutionPlans([node("child", { position_driver: "DOM_LAYOUT", overflow_policy })]), /不能与 REFLOW\/SCROLL/);
  }
  const grouped = node("icon", { position_driver: "DOM_LAYOUT", center_alignment: { member_ids: ["icon", "label"] }, axis_alignment: { horizontal: "center", vertical: "top" } });
  const label = node("label", { reference_id: "icon", position_reference_id: "icon" });
  assert.throws(() => deriveLayoutExecutionPlans([grouped, label]), /position_driver 必须为 SHARED/);
});

test("图文整体居中组的每个成员都必须使用 SHARED 位置驱动", () => {
  const group = (targetMemberId, driver) => {
    const owner = driver === "STATIC" ? "SELF" : driver === "ANIMATION" ? "EXTERNAL" : "PARENT";
    const driverOptions = { position_driver: driver, layout_owner: owner };
    return [
      node("icon", {
        center_alignment: { member_ids: ["icon", "label"] },
        axis_alignment: { horizontal: "center", vertical: "top" },
        ...(targetMemberId === "icon" ? driverOptions : {}),
      }),
      node("label", {
        reference_id: "icon",
        position_reference_id: "icon",
        ...(targetMemberId === "label" ? driverOptions : {}),
      }),
    ];
  };

  const sharedPlans = deriveLayoutExecutionPlans(group("icon", "SHARED"));
  assert.deepEqual(sharedPlans.map((item) => item.layout_execution.position_driver), ["SHARED", "SHARED"]);
  assert.deepEqual(validateLayoutExecutionNodes(sharedPlans, []), []);

  for (const memberId of ["icon", "label"]) {
    for (const driver of ["DOM_LAYOUT", "STATIC", "ANIMATION"]) {
      const members = group(memberId, driver);
      assert.throws(() => deriveLayoutExecutionPlans(members), /position_driver 必须为 SHARED/);
      const errors = [];
      validateLayoutExecutionNodes(members, errors);
      assert(errors.some((message) => message.includes("position_driver 必须为 SHARED")), errors.join(" | "));
    }
  }
});

test("图像保留比例，冻结九宫格允许后续运行态拉伸，纯结构容器拒绝切片", () => {
  const image = node("portrait", { render_kind: "sprite", owner_type: "fixed-production-visual" });
  const panel = node("panel", { element_type: "container", role: "panel-frame", render_kind: "sprite", owner_type: "fixed-production-visual", nine_slice: nineSlice, target_bounds: { x: 0, y: 0, width: 120, height: 80 } });
  const plans = deriveLayoutExecutionPlans([image, panel]);
  assert.equal(plans[0].layout_execution.image_mode, "PRESERVE_ASPECT");
  assert.equal(plans[1].layout_execution.image_mode, "NINE_SLICE");
  assert.throws(() => deriveLayoutExecutionPlans([node("empty", { element_type: "container", role: "container", nine_slice: nineSlice })]), /纯结构容器/);
  assert.throws(() => deriveLayoutExecutionPlans([node("missing", { owner_type: "fixed-production-visual", role: "button-skin" })]), /必须沿用已确认的九宫格决策/);
});

test("根快照只跳过自身计划，业务伪根和根标记不能绕开校验", () => {
  const viewport = { layout_node_id: "viewport", is_root_container: true, parent_layout_node_id: null };
  const business = node("child");
  const result = deriveLayoutExecutionPlans([viewport, business]);
  assert.equal(result[0].layout_execution, undefined);
  assert.ok(result[1].layout_execution);
  assert.throws(() => deriveLayoutExecutionPlans([{ ...node("child"), layout_node_id: "viewport" }]), /业务节点不能占用/);
  assert.throws(() => deriveLayoutExecutionPlans([{ ...node("bad-root"), is_root_container: true }]), /合成根 ID 只允许/);
  assert.throws(() => deriveLayoutExecutionPlans([{ ...node("fake"), is_root_container: true, layout_node_id: "viewport", parent_layout_node_id: "panel" }]), /合成根必须为 null/);
  const errors = [];
  validateLayoutExecutionNodes([node("valid", { size_driver: "CONTENT" })], errors, "nodes", { requirePlan: true });
  assert(errors.some((message) => message.includes("layout_execution 缺少派生执行计划")));
});

test("计划字段缺失、篡改或超额字段均会被拒绝", () => {
  const planned = deriveLayoutExecutionPlans([node("item")]);
  const errors = [];
  validateLayoutExecutionNodes(planned, errors, "nodes", { requirePlan: true });
  assert.deepEqual(errors, []);
  planned[0].layout_execution.position_driver = "ANIMATION";
  validateLayoutExecutionNodes(planned, errors, "nodes", { requirePlan: true });
  assert(errors.some((message) => message.includes("派生结果不一致")));
  planned[0].layout_execution.extra = true;
  validateLayoutExecutionNodes(planned, errors, "nodes", { requirePlan: true });
  assert(errors.some((message) => message.includes("只能包含")));
});
