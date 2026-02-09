# ˗ˏˋ ★ TROPHY ˎˊ˗

A desktop-first goal tracking app where your goals become trophies !!
This project heavily emphasizes progress over perfection and the incentive was to make goal setting less intimidating! Goals are completed only when all underlying accomplishments and tasks are done, encouraging structured and sustainable goal completion.

---

## Features
### Authentication
- User signup and login
- Password hashing with bcrypt
- Session-based authentication using SQLite
- Protected routes (unauthenticated users are redirected to login)
- Ownership checks on all goal, accomplishment, and task operations

---

### Goals
- Create, rename, and delete goals
- View active goals on the home dashboard
- Mark goals as completed **only when all accomplishments are finished**
- Completed goals are archived and displayed on the Trophy Shelf

---

### Accomplishments & Tasks
- Break goals into accomplishments
- Add tasks under each accomplishment
- Inline editing for accomplishment and task titles
- Automatic locking of completed accomplishments
- Visual progress tracking (counts + progress bars)

**Completion rules**
- An accomplishment can only be completed if **all of its tasks are complete**
- A goal can only be completed if **all accomplishments are complete**
- Backend strictly enforces these constraints

---

### Repeat Logic (Backend-Driven)
Tasks can be configured as:
- **One-time**
- **Daily**
- **Weekly**
- **Fixed amount** (e.g. complete 10 times)

Repeat rules are enforced server-side:
- Daily tasks can only be completed once per day
- Weekly tasks respect per-week completion limits
- Fixed-amount tasks track total completions
- Completion counts are stored in a dedicated `task_completions` table
- Total required completions are computed dynamically based on repeat configuration

---

### Trophy Shelf
- Completed goals appear on a visual shelf
- Trophy grid layout (4 per row)
- Serves as both an archive and a reward system

---

## Tech Stack

### Frontend
- HTML5
- CSS3 (custom styling, no framework)
- Vanilla JavaScript
- Fetch API
- Session-aware navigation with route guards

### Backend
- Node.js
- Express.js
- SQLite (file-based database)
- express-session + connect-sqlite3
- bcrypt for password hashing

---

## Project Structure
```
trophy/
├── public/
│ ├── assets/ # Images (trophies, backgrounds)
│ ├── css/
│ │ ├── styles.css
│ │ └── goals.css
│ ├── js/
│ │ ├── authGuard.js
│ │ ├── home.js
│ │ ├── goals.js
│ │ ├── shelf.js
│ │ ├── login.js
│ │ └── signup.js
│ ├── index.html
│ ├── login.html
│ ├── signup.html
│ ├── home.html
│ ├── goal.html
│ └── shelf.html
│
├── server/
│ ├── middleware/
│ │ └── requireAuth.js
│ ├── routes/
│ │ ├── goals.routes.js
│ │ ├── accomplishments.routes.js
│ │ └── tasks.routes.js
│ ├── utils/
│ │ ├── date.js # Date & interval helpers
│ │ ├── repeat.js # Repeat logic + completion math
│ │ └── ownership.js # Authorization & ownership checks
│ ├── app.js # Express app + routing
│ ├── db.js # SQLite schema + connection
│ ├── trophy.db
│ └── sessions.db
│
├── package.json
├── package-lock.json
└── README.md
```

---

## Getting Started
### 1. Clone the repository
`bash
git clone https://github.com/your-username/trophy.git
cd trophy`

### 2. Install dependencies
`npm install`

### 3. Start the server
`node server/app.js`
Or, if you have nodemon:
`nodemon server/app.js`

### 4. Open in your browser
`http://localhost:3000`

---

## Authentication & Security Notes
Sessions are stored in SQLite using connect-sqlite3
Passwords are hashed using bcrypt
All API routes require authentication
Ownership is enforced server-side for:
Goals
Accomplishments
Tasks
Users cannot access or modify data they do not own
### Protected pages:
/home.html
/goal.html
/shelf.html
Unauthenticated users are automatically redirected to /login.html.

---

## Design Decisions
### No frontend framework
Built with vanilla JavaScript to deeply understand state management, async flows, and DOM control.
### Backend-enforced logic
All completion, repeat, and ownership rules are enforced server-side to prevent client manipulation.
### SQLite
Lightweight, portable, and ideal for a self-contained project without external services.
### Progress-driven completion model
Goals cannot be “checked off” prematurely — completion reflects actual work done.

---

## Future Improvements
- Password reset & email verification
- Goal categories / tags
- Animations for trophy unlock
- Mobile responsiveness
- Analytics & progress insights
- Deployment + environment configuration

---

## Author
Built by Hoang Thuy Anh Angela Nguyen
A full-stack learning project focused on authentication, relational data modeling, and constraint-driven UI logic.
