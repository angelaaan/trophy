const goalsRoutes = require("./routes/goals.routes");
const accomplishmentsRoutes = require("./routes/accomplishments.routes");
const tasksRoutes = require("./routes/tasks.routes");

const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);

const db = require("./db");

const app = express();
const PORT = 3000;

// middleware
app.use(cors()); // TODO : lock this down
app.use(express.json());

app.use(express.static(path.join(__dirname, "..", "public")));
console.log("STATIC DIR =", path.join(__dirname, "..", "public"));
console.log("Expect home.js at =", path.join(__dirname, "..", "public", "js", "home.js"));

app.get("/", (req, res) => {
  res.redirect("/home.html");
});

// ensure foreign keys are actually enforced in SQLite
db.run("PRAGMA foreign_keys = ON");

// setting sessions after valid login
app.use(
  session({
    store: new SQLiteStore({
      db: "sessions.db",
      dir: __dirname, // backend/
    }),
    secret: "replace_this_with_a_long_random_string",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // true only when deploying with HTTPS
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

// requires authentication to start a session (security)
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in" });
  }
  next();
}

// -------- AUTH ROUTES --------

// Signup: create user
app.post("/api/signup", (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({error: "i think your forgot smth.."});
  }

  // basic length check
  if (password.length < 6) {
    return res.status(400).json({error: "weak security :/ passwrd must be at least 6 characters"});
  }

  // hash it for protection
  const password_hash = bcrypt.hashSync(password, 10);

  // store into database
  const sql = `INSERT INTO users (username, password_hash) VALUES (?, ?)`;
  db.run(sql, [username, password_hash], function (err) {
    if (err) {
      // SQLite unique constraint -> username already exists
      if (err.message.includes("UNIQUE") || err.message.includes("PRIMARY KEY")) {
        return res.status(409).json({ error: "oof .. this username alr exists" });
      }
      return res.status(500).json({ error: "awkwardddd theres a database error" });
    }

    //auto start a session
    req.session.user = { username };
    return res.status(201).json({ ok: true });

  });
});

// Login: verify user
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "Missing username or password" });
  }

  db.get(`SELECT username, password_hash FROM users WHERE username = ?`, [username], (err, row) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!row) return res.status(401).json({ error: "Invalid username or password" });

    const ok = bcrypt.compareSync(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid username or password" });

    // start session
    req.session.user = { username: row.username };
    return res.json({ ok: true });

  });
});

//authorization check
app.get("/api/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "not logged in" });
  res.json({ ok: true, user: req.session.user });
});

// logout endpoints
app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`Try opening http://localhost:${PORT}/index.html`);
});

// -------- GOAL ROUTES --------

//creating goals
app.post("/api/goals", requireAuth, (req, res) => {
  const { title, description } = req.body;
  const username = req.session.user.username;

  if (!title) {
    return res.status(400).json({ error: "a title is required" });
  }

  db.run(
    `INSERT INTO goals (username, title, description)
     VALUES (?, ?, ?)`,
    [username, title, description || ""],
    function (err) {
      if (err) {
        return res.status(500).json({ error: "oh no there was a database error" });
      }
      res.status(201).json({
        ok: true,
        goal_id: this.lastID,
      });
    }
  );
});

// get goals as list for cards
app.get("/api/goals", requireAuth, (req, res) => {
  const username = req.session.user.username;

  db.all(
    `SELECT goal_id, title, description, created_at
     FROM goals
     WHERE username = ?
     ORDER BY created_at DESC`,
    [username],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: "oh no there was a database error" });
      }
      res.json(rows);
    }
  );
});
