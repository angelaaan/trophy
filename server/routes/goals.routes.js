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
                    is_completed: totalReq > 0 ? count >= totalReq : false,
                  });
                }

                const enriched = accomplishments.map((a) => {
                  const tlist = byAcc[a.accomplishment_id] || [];
                  const completedTasks = tlist.filter((t) => t.is_completed).length;

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

  router.post("/api/goals/:goal_id/complete", requireAuth, (req, res) => {
    const goalId = Number(req.params.goal_id);
    const username = req.session.user.username;

    if (!goalId) return res.status(400).json({ error: "bad goal_id" });

    // ensure ownership
    db.get(
      "SELECT goal_id FROM goals WHERE goal_id = ? AND username = ?",
      [goalId, username],
      (err, goal) => {
        if (err) return res.status(500).json({ error: "database error" });
        if (!goal) return res.status(404).json({ error: "Goal not found" });

        // block completion unless all accomplishments are complete
        db.get(
          `
          WITH per_task AS (
            SELECT
              a.accomplishment_id,
              t.task_id,
              t.total_required,
              IFNULL(c.cnt, 0) AS completion_count
            FROM accomplishments a
            LEFT JOIN tasks t ON t.accomplishment_id = a.accomplishment_id
            LEFT JOIN (
              SELECT task_id, COUNT(*) AS cnt
              FROM task_completions
              GROUP BY task_id
            ) c ON c.task_id = t.task_id
            WHERE a.goal_id = ?
          ),
          per_acc AS (
            SELECT
              accomplishment_id,
              -- count real tasks (task_id null means no tasks)
              SUM(CASE WHEN task_id IS NULL THEN 0 ELSE 1 END) AS task_total,
              SUM(CASE
                    WHEN task_id IS NOT NULL
                    AND completion_count >= COALESCE(NULLIF(total_required, 0), 1)
                    THEN 1 ELSE 0 END) AS task_done
            FROM per_task
            GROUP BY accomplishment_id
          )
          SELECT
            SUM(CASE WHEN task_total < 1 OR task_done < task_total THEN 1 ELSE 0 END) AS active_accomplishments
          FROM per_acc
          `,
          [goalId],
          (err2, row) => {
            if (err2) return res.status(500).json({ error: "database error" });

            const active = Number(row?.active_accomplishments || 0);
            if (active > 0) {
              return res
                .status(400)
                .json({ error: "Finish all accomplishments before completing the goal." });
            }

            db.run(
              `
              UPDATE goals
              SET is_completed = 1,
                  completed_at = COALESCE(completed_at, datetime('now'))
              WHERE goal_id = ?
              `,
              [goalId],
              (err3) => {
                if (err3) return res.status(500).json({ error: "database error" });
                res.json({ ok: true });
              }
            );
          }
        );
      }
    );
  });

  router.get("/api/goals/shelf", requireAuth, (req, res) => {
    const username = req.session.user.username;

    db.all(
      `
      SELECT goal_id, title, description, created_at, completed_at
      FROM goals
      WHERE username = ?
        AND is_completed = 1
      ORDER BY completed_at DESC, goal_id DESC
      `,
      [username],
      (err, rows) => {
        if (err) return res.status(500).json({ error: "database error" });
        res.json(rows);
      }
    );
  });

  return router;
};
