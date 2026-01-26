// server/utils/repeat.js
const { daysBetweenInclusive, weeksBetweenInclusive } = require("./date");

function computeTotalRequired({ repeat_type, start_date, end_date, target_count, total_required }) {
  const t = (repeat_type || "none").toLowerCase();
  const target = Number(target_count || 1);

  if (t === "none") return 1;

  if (t === "daily") {
    if (!end_date) throw new Error("end_date required for daily repeat");
    const days = daysBetweenInclusive(start_date, end_date);
    return Math.max(1, days * target);
  }

  if (t === "weekly") {
    if (!end_date) throw new Error("end_date required for weekly repeat");
    const weeks = weeksBetweenInclusive(start_date, end_date);
    return Math.max(1, weeks * target);
  }

  if (t === "x" || t === "amount") {
    const tr = Number(total_required);
    if (!tr || tr < 1) throw new Error("total_required required for x/amount");
    return tr;
  }

  throw new Error("invalid repeat_type");
}

module.exports = { computeTotalRequired };
