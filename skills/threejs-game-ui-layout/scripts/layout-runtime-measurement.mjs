/** 将旧几何测量绑定到同批组件读数，防止两份互相矛盾的实际矩形分别通过。 */
export function validateMeasuredLayoutBounds(snapshot, bounds, errors = [], label = "runtime_measurement") {
  if (snapshot?.active !== true) {
    errors.push(`${label} 必须绑定同批活动组件快照`);
    return errors;
  }
  const actual = snapshot.layout_bounds;
  const fields = ["x", "y", "width", "height"];
  if (!actual || !bounds || !fields.every((field) => Number.isFinite(actual[field]) && Number.isFinite(bounds[field]) && Math.abs(actual[field] - bounds[field]) <= 1e-6)) {
    errors.push(`${label} 必须逐字段等于同批组件快照 layout_bounds`);
  }
  return errors;
}
