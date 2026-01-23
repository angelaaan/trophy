const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// create/open database file
const dbPath = path.join(__dirname, "trophy.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Database failed to open", err);
  } else {
    console.log("Connected to SQLite database");
  }
});

module.exports = db;

// create the database by running sql to create the entities
db.serialize(() => {
    // users
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL
    )
  `);
  // goals
  db.run(`
    CREATE TABLE IF NOT EXISTS goals (
      goal_id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (username) REFERENCES users(username)
        ON DELETE CASCADE
    )
  `);
  // accomplishments
  db.run(`
    CREATE TABLE IF NOT EXISTS accomplishments (
      accomplishment_id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      is_completed INTEGER DEFAULT 0,
      completed_at TEXT,
      FOREIGN KEY (goal_id) REFERENCES goals(goal_id)
        ON DELETE CASCADE
    )
  `);
  // tasks
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      task_id INTEGER PRIMARY KEY AUTOINCREMENT,
      accomplishment_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      repeat_type TEXT NOT NULL,
      target_count INTEGER DEFAULT 1,
      total_required INTEGER NOT NULL,
      start_date TEXT DEFAULT (date('now')),
      end_date TEXT,
      FOREIGN KEY (accomplishment_id) REFERENCES accomplishments(accomplishment_id)
        ON DELETE CASCADE
    )
  `);
  // task completions for repeating tasks
  db.run(`
    CREATE TABLE IF NOT EXISTS task_completions (
      completion_id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      completed_date TEXT DEFAULT (date('now')),
      completed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(task_id)
        ON DELETE CASCADE
    )
  `);
});