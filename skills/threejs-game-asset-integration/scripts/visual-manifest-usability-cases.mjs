import assert from "node:assert/strict";
import test from "node:test";

/** 在真实清单入口验证默认可用性与显式精确模式，复用领域夹具避免维护两份合同。 */
export function registerVisualManifestUsabilityCases({ validManifest, validateManifest, options }) {
  test("manifest 模式：有效精确清单通过", () => {
    assert.deepEqual(validateManifest(validManifest(), options), []);
  });

  test("manifest 模式：默认接受布局微调且不要求精确差异附件", () => {
    const manifest = validManifest();
    delete manifest.visual_validation;
    const fidelity = manifest.fidelity_cases[0];
    const hero = fidelity.layout_node_results.find((node) => node.layout_node_id === "hero-component-layout-node");
    hero.candidate_bounds.x += 8;
    hero.delta.x = 8;
    const region = fidelity.per_region_results.find((item) => item.region_id === "region-hero");
    region.candidate_measurement.bounds.x += 8;
    region.delta = 8;
    // 这些附件只服务精确像素比对；完整候选画面、确认与生产审计仍保留。
    for (const key of ["side_by_side_evidence", "overlay_evidence", "difference_evidence", "normalization_equivalence", "tolerance_set"]) delete fidelity[key];
    assert.deepEqual(validateManifest(manifest, { ...options, stage: "V5" }), []);
  });

  test("manifest 模式：显式 exact 拒绝超出已声明容差的相同微调", () => {
    const manifest = validManifest();
    const hero = manifest.fidelity_cases[0].layout_node_results.find((node) => node.layout_node_id === "hero-component-layout-node");
    hero.candidate_bounds.x += 8;
    hero.delta.x = 8;
    assert.ok(validateManifest(manifest, { ...options, stage: "V5" }).some((error) => /tolerance|容差/.test(error)));
  });

  test("V5 正式运行门缺少资源消费证据时失败", () => {
    const manifest = validManifest();
    delete manifest.visual_production_gate.runtime_consumption;
    assert(validateManifest(manifest).some((item) => item.includes("runtime_consumption")), "总门必须要求正式 runtime 消费证据");

    const missingAuditConsumption = validManifest();
    delete missingAuditConsumption.production_contract_audit.units[0].runtime_consumption;
    assert(validateManifest(missingAuditConsumption).some((item) => item.includes("runtime_consumption")), "V5 生产审计必须绑定逐区域 runtime 消费身份");
  });
}
