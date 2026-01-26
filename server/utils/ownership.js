// server/utils/ownership.js
function ensureGoalOwner(db, req, res, goal_id, cb) {
  const username = req.session.user.username;
  db.get(
    `SELECT goal_id, title, description, created_at
     FROM goals
     WHERE goal_id = ? AND username = ?`,
    [goal_id, username],
    (err, row) => {
      if (err) return res.status(500).json({ error: "database error" });
      if (!row) return res.status(404).json({ error: "goal not found" });
      cb(row);
    }
  );
}

function ensureAccomplishmentOwner(db, req, res, accomplishment_id, cb) {
  const username = req.session.user.username;
  db.get(
    `SELECT a.accomplishment_id, a.goal_id, a.title, a.is_completed, a.completed_at
     FROM accomplishments a
     JOIN goals g ON g.goal_id = a.goal_id
     WHERE a.accomplishment_id = ? AND g.username = ?`,
    [accomplishment_id, username],
    (err, row) => {
      if (err) return res.status(500).json({ error: "database error" });
      if (!row) return res.status(404).json({ error: "accomplishment not found" });
      cb(row);
    }
  );
}

function ensureTaskOwner(db, req, res, task_id, cb) {
  const username = req.session.user.username;
  db.get(
    `SELECT t.task_id, t.accomplishment_id, t.title, t.repeat_type, t.target_count,
            t.total_required, t.start_date, t.end_date,
            a.goal_id, a.is_completed as acc_completed
     FROM tasks t
     JOIN accomplishments a ON a.accomplishment_id = t.accomplishment_id
     JOIN goals g ON g.goal_id = a.goal_id
     WHERE t.task_id = ? AND g.username = ?`,
    [task_id, username],
    (err, row) => {
      if (err) return res.status(500).json({ error: "database error" });
      if (!row) return res.status(404).json({ error: "task not found" });
      cb(row);
    }
  );
}

module.exports = { ensureGoalOwner, ensureAccomplishmentOwner, ensureTaskOwner };