// server/routes/tasks.routes.js
const express = require("express");
const router = express.Router();

const { isoDate } = require("../utils/date");
const { computeTotalRequired } = require("../utils/repeat");
const { ensureAccomplishmentOwner, ensureTaskOwner } = require("../utils/ownership");

module.exports = function tasksRoutes({ db, requireAuth }) {
  router.post("/api/accomplishments/:accomplishment_id/tasks", requireAuth, (req, res) => {
    const accomplishment_id = Number(req.params.accomplishment_id);
    const body = req.body || {};
    if (!accomplishment_id) return res.status(400).json({ error: "bad accomplishment_id" });
    if (!body.title || !String(body.title).trim()) return res.status(400).json({ error: "title required" });

    ensureAccomplishmentOwner(db, req, res, accomplishment_id, (acc) => {
      if (acc.is_completed) return res.status(409).json({ error: "accomplishment already completed (locked)" });

      const start_date = body.start_date ? String(body.start_date) : isoDate();
      const repeat_type = String(body.repeat_type || "none").toLowerCase();
      const target_count = Number(body.target_count || 1);
      const end_date = body.end_date ? String(body.end_date) : null;

      let total_required;
      try {
        total_required = computeTotalRequired({
          repeat_type,
          start_date,
          end_date,
          target_count,
          total_required: body.total_required
        });
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }

      db.run(
        `INSERT INTO tasks (accomplishment_id, title, repeat_type, target_count, total_required, start_date, end_date)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [accomplishment_id, String(body.title).trim(), repeat_type, target_count, total_required, start_date, end_date],
        function (err) {
          if (err) return res.status(500).json({ error: "database error" });
          res.status(201).json({ ok: true, task_id: this.lastID });
        }
      );
    });
  });

  router.put("/api/tasks/:task_id", requireAuth, (req, res) => {
    const task_id = Number(req.params.task_id);
    const body = req.body || {};
    if (!task_id) return res.status(400).json({ error: "bad task_id" });

    ensureTaskOwner(db, req, res, task_id, (task) => {
      if (task.acc_completed) return res.status(409).json({ error: "accomplishment already completed (locked)" });

      const title = body.title != null ? String(body.title).trim() : task.title;
      const repeat_type = body.repeat_type != null ? String(body.repeat_type).toLowerCase() : task.repeat_type;
      const target_count = body.target_count != null ? Number(body.target_count) : Number(task.target_count || 1);
      const start_date = body.start_date != null ? String(body.start_date) : task.start_date;
      const end_date = body.end_date != null ? String(body.end_date) : task.end_date;

      let total_required;
      try {
        total_required = computeTotalRequired({
          repeat_type,
          start_date,
          end_date,
          target_count,
          total_required: body.total_required != null ? body.total_required : task.total_required
        });
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }

      db.run(
        `UPDATE tasks
         SET title = ?, repeat_type = ?, target_count = ?, total_required = ?, start_date = ?, end_date = ?
         WHERE task_id = ?`,
        [title, repeat_type, target_count, total_required, start_date, end_date, task_id],
        function (err) {
          if (err) return res.status(500).json({ error: "database error" });
          res.json({ ok: true });
        }
      );
    });
  });

  router.delete("/api/tasks/:task_id", requireAuth, (req, res) => {
    const task_id = Number(req.params.task_id);
    if (!task_id) return res.status(400).json({ error: "bad task_id" });

    ensureTaskOwner(db, req, res, task_id, (task) => {
      if (task.acc_completed) return res.status(409).json({ error: "accomplishment already completed (locked)" });

      db.run(`DELETE FROM tasks WHERE task_id = ?`, [task_id], function (err) {
        if (err) return res.status(500).json({ error: "database error" });
        res.json({ ok: true });
      });
    });
  });

  // Checkoff endpoint
  router.post("/api/tasks/:task_id/check", requireAuth, (req, res) => {
    const task_id = Number(req.params.task_id);
    if (!task_id) return res.status(400).json({ error: "bad task_id" });

    ensureTaskOwner(db, req, res, task_id, (task) => {
      if (task.acc_completed) return res.status(409).json({ error: "accomplishment already completed (locked)" });

      db.get(`SELECT COUNT(*) as cnt FROM task_completions WHERE task_id = ?`, [task_id], (err, row) => {
        if (err) return res.status(500).json({ error: "database error" });

        const completionCount = Number(row?.cnt || 0);
        const totalRequired = Number(task.total_required || 0);

        if (totalRequired > 0 && completionCount >= totalRequired) {
          return res.status(409).json({ error: "task already complete" });
        }

        const repeat = String(task.repeat_type || "none").toLowerCase();

        const insertCompletion = () =>
          db.run(
            `INSERT INTO task_completions (task_id, completed_date) VALUES (?, date('now'))`,
            [task_id],
            (err2) => {
              if (err2) return res.status(500).json({ error: "database error" });

              // return updated progress
              db.get(
                `SELECT COUNT(*) as cnt FROM task_completions WHERE task_id = ?`,
                [task_id],
                (err3, r3) => {
                  if (err3) return res.status(500).json({ error: "database error" });
                  const newCount = Number(r3?.cnt || 0);
                  res.json({
                    ok: true,
                    completion_count: newCount,
                    total_required: totalRequired,
                    is_complete: totalRequired > 0 ? newCount >= totalRequired : false,
                  });
                }
              );
            }
          );

        if (repeat === "none") {
          if (completionCount >= 1) return res.status(409).json({ error: "you already completed this task" });
          return insertCompletion();
        }

        if (repeat === "daily") {
          return db.get(
            `SELECT COUNT(*) as cnt
             FROM task_completions
             WHERE task_id = ? AND completed_date = date('now')`,
            [task_id],
            (err2, r2) => {
              if (err2) return res.status(500).json({ error: "database error" });
              if (Number(r2?.cnt || 0) >= 1) return res.status(409).json({ error: "you've already completed this task for now!" });
              insertCompletion();
            }
          );
        }

        if (repeat === "weekly") {
          const target = Number(task.target_count || 1);
          return db.get(
            `SELECT COUNT(*) as cnt
             FROM task_completions
             WHERE task_id = ?
               AND strftime('%Y-%W', completed_date) = strftime('%Y-%W', date('now'))`,
            [task_id],
            (err2, r2) => {
              if (err2) return res.status(500).json({ error: "database error" });
              if (Number(r2?.cnt || 0) >= target) return res.status(409).json({ error: "you've already completed this task for now!" });
              insertCompletion();
            }
          );
        }

        if (repeat === "x" || repeat === "amount") {
          return insertCompletion();
        }

        return res.status(400).json({ error: "invalid repeat_type" });
      });
    });
  });

  return router;
};
