import { deriveLayoutExecutionPlans } from "./layout-execution.mjs";

/** 为校验器单测构造合成快照；严禁把本夹具用于正式场景采集或验收。 */
export function layoutRuntimeFixture(nodes, {
  scene_id = "main", state_id = "default", candidate_id = "candidate-1",
  viewport_bounds, safe_area_bounds = viewport_bounds, batch_id = "test-layout-batch", viewport_revision = 1,
} = {}) {
  const planned = deriveLayoutExecutionPlans(nodes);
  const byId = new Map(planned.map((node) => [node.layout_node_id ?? node.layoutNodeId, node]));
  const rootBounds = new Map([["viewport", viewport_bounds], ["safe-area", safe_area_bounds]]);
  /** 读取既有测试入口使用的布局矩形字段。 */
  const boundsOf = (node) => node?.target_bounds ?? node?.targetBounds ?? node?.bounds;
  return {
    runtime_batch: {
      schema: "threejs-layout-runtime/1", batch_id, viewport_revision,
      scene_id, state_id, candidate_id, coordinate_space: "layout-logical-px",
      viewport_bounds: structuredClone(viewport_bounds), safe_area_bounds: structuredClone(safe_area_bounds),
    },
    component_snapshots: planned.filter((node) => node.is_root_container !== true).map((node) => {
      const id = node.layout_node_id ?? node.layoutNodeId;
      const bounds = boundsOf(node);
      const localSize = { width: bounds.width, height: bounds.height };
      const plan = node.layout_execution;
      const referenceBounds = rootBounds.get(plan.reference_id) ?? boundsOf(byId.get(plan.reference_id));
      return {
        layout_node_id: id,
        component_snapshot: {
          batch_id, viewport_revision, renderer: "DOM", active: true,
          parent_layout_node_id: node.parent_layout_node_id ?? node.parentLayoutNodeId,
          reference_id: plan.reference_id,
          position_writers: [plan.position_driver], size_writers: [plan.size_driver],
          layout_bounds: structuredClone(bounds), reference_bounds: structuredClone(referenceBounds),
          local_size: localSize,
          image: plan.image_mode === "NONE" ? null : {
            source_size: structuredClone(node.image_source_size ?? node.nine_slice?.source_size ?? localSize),
            display_size: { ...localSize },
          },
        },
      };
    }),
  };
}
