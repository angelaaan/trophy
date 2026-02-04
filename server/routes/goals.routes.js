// server/routes/goals.routes.js
const express = require("express");
const router = express.Router();

const { ensureGoalOwner } = require("../utils/ownership");

module.exports = function goalsRoutes({ db, requireAuth }) {
  router.get("/api/goals/:goal_id/full", requireAuth, (req, res) => {
    const goal_id = Number(req.params.goal_id);
    if (!goal_id) return res.status(400).json({ error: "bad goal_id" });

    ensureGoalOwner(db, req, res, goal_id, () => {
      db.get(`SELECT * FROM goals WHERE goal_id = ?`, [goal_id], (err, goal) => {
        if (err) return res.status(500).json({ error: "database error" });
        if (!goal) return res.status(404).json({ error: "goal not found" });

        db.all(
          `SELECT * FROM accomplishments WHERE goal_id = ? ORDER BY accomplishment_id ASC`,
          [goal_id],
          (err2, accomplishments) => {
            if (err2) return res.status(500).json({ error: "database error" });

            const accIds = accomplishments.map((a) => a.accomplishment_id);
            if (accIds.length === 0) {
              return res.json({ ...goal, accomplishments: [] });
            }

            const placeholders = accIds.map(() => "?").join(",");

            // Pull tasks + completion counts (based on task_completions)
            db.all(
              `
              SELECT
                t.*,
                IFNULL(c.cnt, 0) as completion_count
              FROM tasks t
              LEFT JOIN (
                SELECT task_id, COUNT(*) as cnt
                FROM task_completions
                GROUP BY task_id
              ) c ON c.task_id = t.task_id
              WHERE t.accomplishment_id IN (${placeholders})
              ORDER BY t.accomplishment_id ASC, t.task_id ASC
              `,
              accIds,
              (err3, tasks) => {
                if (err3) return res.status(500).json({ error: "database error" });

                // group tasks by accomplishment
                const byAcc = {};
                for (const t of tasks) {
                  const aid = t.accomplishment_id;
                  if (!byAcc[aid]) byAcc[aid] = [];

                  const totalReq = Number(t.total_required || 0);
                  const count = Number(t.completion_count || 0);

                  byAcc[aid].push({
                    ...t,
                    completion_count: count,
                    is_complete: totalReq > 0 ? count >= totalReq : false,
                  });
                }

                const enriched = accomplishments.map((a) => {
                  const tlist = byAcc[a.accomplishment_id] || [];
                  const completedTasks = tlist.filter((t) => t.is_complete).length;

                  return {
                    ...a,
                    tasks: tlist,
                    totalTasks: tlist.length,
                    completedTasks,
                  };
                });

                res.json({ ...goal, accomplishments: enriched });
              }
            );
          }
        );
      });
    });
  });

  router.post("/api/goals/:goal_id/complete", requireAuth, async (req, res) => {
    try {
      const goalId = Number(req.params.goal_id);
      const username = req.session.user.username;

      // ensure ownership
      const goal = await db.get(
        "SELECT goal_id FROM goals WHERE goal_id = ? AND username = ?",
        [goalId, username]
      );
      if (!goal) return res.status(404).json({ error: "Goal not found" });

      // mark completed
      await db.run(
        "UPDATE goals SET completed_at = COALESCE(completed_at, datetime('now')) WHERE goal_id = ?",
        [goalId]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to complete goal" });
    }
  });


  return router;
};
