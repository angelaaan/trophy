// server/routes/goals.routes.js
const express = require("express");
const router = express.Router();

const { ensureGoalOwner } = require("../utils/ownership");

module.exports = function goalsRoutes({ db, requireAuth }) {
  // GET: everything the goal page needs
  router.get("/api/goals/:goal_id/full", requireAuth, (req, res) => {
    const goal_id = Number(req.params.goal_id);
    if (!goal_id) return res.status(400).json({ error: "bad goal_id" });

    ensureGoalOwner(db, req, res, goal_id, (goalRow) => {
      db.all(
        `SELECT accomplishment_id, goal_id, title, created_at, is_completed, completed_at
         FROM accomplishments
         WHERE goal_id = ?
         ORDER BY created_at DESC`,
        [goal_id],
        (err, accomplishments) => {
          if (err) return res.status(500).json({ error: "database error" });

          const accIds = accomplishments.map(a => a.accomplishment_id);
          if (accIds.length === 0) {
            return res.json({ goal: goalRow, active: [], completed: [] });
          }

          const placeholders = accIds.map(() => "?").join(",");

          db.all(
            `SELECT t.task_id, t.accomplishment_id, t.title, t.repeat_type, t.target_count,
                    t.total_required, t.start_date, t.end_date
             FROM tasks t
             WHERE t.accomplishment_id IN (${placeholders})
             ORDER BY t.task_id ASC`,
            accIds,
            (err2, tasks) => {
              if (err2) return res.status(500).json({ error: "database error" });

              const taskIds = tasks.map(t => t.task_id);
              if (taskIds.length === 0) {
                const shaped = accomplishments.map(a => ({
                  ...a,
                  tasks: [],
                  completion_summary: { done: 0, total: 0 },
                }));
                return res.json({
                  goal: goalRow,
                  active: shaped.filter(a => !a.is_completed),
                  completed: shaped.filter(a => !!a.is_completed),
                });
              }

              const tph = taskIds.map(() => "?").join(",");

              db.all(
                `SELECT task_id, COUNT(*) as completion_count
                 FROM task_completions
                 WHERE task_id IN (${tph})
                 GROUP BY task_id`,
                taskIds,
                (err3, counts) => {
                  if (err3) return res.status(500).json({ error: "database error" });

                  const countMap = new Map();
                  for (const c of counts) countMap.set(c.task_id, Number(c.completion_count || 0));

                  const tasksByAcc = new Map();
                  for (const t of tasks) {
                    const cc = countMap.get(t.task_id) || 0;
                    const total = Number(t.total_required || 0);
                    const isComplete = total > 0 && cc >= total;

                    const enriched = { ...t, completion_count: cc, is_complete: isComplete };

                    if (!tasksByAcc.has(t.accomplishment_id)) tasksByAcc.set(t.accomplishment_id, []);
                    tasksByAcc.get(t.accomplishment_id).push(enriched);
                  }

                  const shaped = accomplishments.map(a => {
                    const ts = tasksByAcc.get(a.accomplishment_id) || [];
                    const done = ts.reduce((acc, t) => acc + Math.min(t.completion_count, t.total_required), 0);
                    const total = ts.reduce((acc, t) => acc + Number(t.total_required || 0), 0);

                    return { ...a, tasks: ts, completion_summary: { done, total } };
                  });

                  res.json({
                    goal: goalRow,
                    active: shaped.filter(a => !a.is_completed),
                    completed: shaped.filter(a => !!a.is_completed),
                  });
                }
              );
            }
          );
        }
      );
    });
  });

  return router;
};
