// server/routes/accomplishments.routes.js
const express = require("express");
const router = express.Router();

const { ensureGoalOwner, ensureAccomplishmentOwner } = require("../utils/ownership");

module.exports = function accomplishmentsRoutes({ db, requireAuth }) {
  router.post("/api/goals/:goal_id/accomplishments", requireAuth, (req, res) => {
    const goal_id = Number(req.params.goal_id);
    const { title } = req.body || {};
    if (!goal_id) return res.status(400).json({ error: "bad goal_id" });
    if (!title || !String(title).trim()) return res.status(400).json({ error: "title required" });

    ensureGoalOwner(db, req, res, goal_id, () => {
      db.run(
        `INSERT INTO accomplishments (goal_id, title) VALUES (?, ?)`,
        [goal_id, String(title).trim()],
        function (err) {
          if (err) return res.status(500).json({ error: "database error" });
          res.status(201).json({ ok: true, accomplishment_id: this.lastID });
        }
      );
    });
  });

  router.put("/api/accomplishments/:accomplishment_id", requireAuth, (req, res) => {
    const accomplishment_id = Number(req.params.accomplishment_id);
    const { title } = req.body || {};
    if (!accomplishment_id) return res.status(400).json({ error: "bad accomplishment_id" });
    if (!title || !String(title).trim()) return res.status(400).json({ error: "title required" });

    ensureAccomplishmentOwner(db, req, res, accomplishment_id, (acc) => {
      if (acc.is_completed) return res.status(409).json({ error: "accomplishment already completed (locked)" });

      db.run(
        `UPDATE accomplishments SET title = ? WHERE accomplishment_id = ?`,
        [String(title).trim(), accomplishment_id],
        function (err) {
          if (err) return res.status(500).json({ error: "database error" });
          res.json({ ok: true });
        }
      );
    });
  });

  router.delete("/api/accomplishments/:accomplishment_id", requireAuth, (req, res) => {
    const accomplishment_id = Number(req.params.accomplishment_id);
    if (!accomplishment_id) return res.status(400).json({ error: "bad accomplishment_id" });

    ensureAccomplishmentOwner(db, req, res, accomplishment_id, (acc) => {
      if (acc.is_completed) return res.status(409).json({ error: "accomplishment already completed (locked)" });

      db.run(`DELETE FROM accomplishments WHERE accomplishment_id = ?`, [accomplishment_id], function (err) {
        if (err) return res.status(500).json({ error: "database error" });
        res.json({ ok: true });
      });
    });
  });

  router.post("/api/accomplishments/:accomplishment_id/complete", requireAuth, (req, res) => {
    const accomplishment_id = Number(req.params.accomplishment_id);
    if (!accomplishment_id) return res.status(400).json({ error: "bad accomplishment_id" });

    ensureAccomplishmentOwner(db, req, res, accomplishment_id, (acc) => {
      if (acc.is_completed) return res.status(409).json({ error: "already completed" });

      db.all(
        `SELECT t.task_id, t.total_required, IFNULL(c.cnt, 0) as completion_count
         FROM tasks t
         LEFT JOIN (
           SELECT task_id, COUNT(*) as cnt
           FROM task_completions
           GROUP BY task_id
         ) c ON c.task_id = t.task_id
         WHERE t.accomplishment_id = ?`,
        [accomplishment_id],
        (err, rows) => {
          if (err) return res.status(500).json({ error: "database error" });
          if (!rows || rows.length === 0) return res.status(409).json({ error: "needs at least 1 task" });

          const allDone = rows.every(r => Number(r.completion_count) >= Number(r.total_required));
          if (!allDone) return res.status(409).json({ error: "not all tasks completed yet" });

          db.run(
            `UPDATE accomplishments
             SET is_completed = 1, completed_at = datetime('now')
             WHERE accomplishment_id = ?`,
            [accomplishment_id],
            function (err2) {
              if (err2) return res.status(500).json({ error: "database error" });
              res.json({ ok: true });
            }
          );
        }
      );
    });
  });

  return router;
};
