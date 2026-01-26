(() => {
  // ----------------------------
  // Helpers
  // ----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

  function toast(msg, ms = 2000) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => t.classList.add("hidden"), ms);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  // yyyy-mm-dd (local) string for today
  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  }

  function daysBetweenInclusive(start, end) {
    // both "yyyy-mm-dd"
    const s = new Date(start + "T00:00:00");
    const e = new Date(end + "T00:00:00");
    const diff = Math.round((e - s) / 86400000);
    return diff + 1; // inclusive
  }

  function startOfWeekStr(date = new Date()) {
    // Monday-based week start
    const d = new Date(date);
    const day = d.getDay(); // 0 Sun..6 Sat
    const delta = (day === 0 ? -6 : 1) - day; // move to Monday
    d.setDate(d.getDate() + delta);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  }

  function computeRepeatTotal(task) {
    // Returns how many "expected completions" exist in the timeframe
    // For non-repeat: 1
    // For amount: amount
    // For daily/weekly: from created_at (or today if missing) to until_date inclusive
    if (!task.repeat || task.repeat.type === "none") return 1;

    const type = task.repeat.type;
    if (type === "amount") {
      const amt = Number(task.repeat.amount || 1);
      return Math.max(1, amt);
    }

    // daily/weekly
    const until = task.repeat.until_date;
    if (!until) return 1;

    const created = task.created_at || todayStr();

    if (type === "daily") {
      return Math.max(1, daysBetweenInclusive(created, until));
    }

    if (type === "weekly") {
      // count weeks inclusive from created week to until week
      const s = new Date(created + "T00:00:00");
      const e = new Date(until + "T00:00:00");
      // Normalize to week starts
      const sW = new Date(startOfWeekStr(s) + "T00:00:00");
      const eW = new Date(startOfWeekStr(e) + "T00:00:00");
      const diffWeeks = Math.round((eW - sW) / (86400000 * 7));
      return Math.max(1, diffWeeks + 1);
    }

    return 1;
  }

  function computeRepeatDoneCount(task) {
    // For non-repeat: 1 if completed else 0
    // For amount: completions.length capped at amount
    // For daily/weekly: count unique period keys in completions
    if (!task.repeat || task.repeat.type === "none") return task.completed ? 1 : 0;

    const type = task.repeat.type;
    const comps = Array.isArray(task.completions) ? task.completions : [];

    if (type === "amount") {
      const total = computeRepeatTotal(task);
      return clamp(comps.length, 0, total);
    }

    // daily/weekly: completions stored as {periodKey, at}
    const unique = new Set(comps.map((c) => c.periodKey));
    return unique.size;
  }

  function currentPeriodKey(task) {
    const type = task.repeat?.type;
    if (type === "daily") return todayStr();
    if (type === "weekly") return startOfWeekStr(new Date());
    return null;
  }

  function canCompleteTaskNow(task) {
    // If non-repeat:
    // - can complete if not already completed
    // If repeat:
    // - can complete if current periodKey not already in completions
    if (!task.repeat || task.repeat.type === "none") return !task.completed;

    const type = task.repeat.type;
    const total = computeRepeatTotal(task);
    const done = computeRepeatDoneCount(task);

    // if already finished all expected repetitions, no more checks allowed
    if (done >= total) return false;

    const key = currentPeriodKey(task);
    if (!key) return false;

    const comps = Array.isArray(task.completions) ? task.completions : [];
    return !comps.some((c) => c.periodKey === key);
  }

  function isTaskFullyDone(task) {
    if (!task.repeat || task.repeat.type === "none") return !!task.completed;
    return computeRepeatDoneCount(task) >= computeRepeatTotal(task);
  }

  function computeAccomplishmentProgress(acc) {
    const tasks = acc.tasks || [];
    if (tasks.length === 0) return { done: 0, total: 0, pct: 0 };

    let doneUnits = 0;
    let totalUnits = 0;

    for (const t of tasks) {
      const total = computeRepeatTotal(t);
      const done = computeRepeatDoneCount(t);
      totalUnits += total;
      doneUnits += clamp(done, 0, total);
    }

    const pct = totalUnits === 0 ? 0 : Math.round((doneUnits / totalUnits) * 100);
    return { done: doneUnits, total: totalUnits, pct };
  }

  function allTasksFullyDone(acc) {
    const tasks = acc.tasks || [];
    if (tasks.length === 0) return false;
    return tasks.every(isTaskFullyDone);
  }

  // ----------------------------
  // Temporary Storage Layer (localStorage)
  // ----------------------------
  const Storage = {
    key: "trophy_goals_v1",

    _loadAll() {
      const raw = localStorage.getItem(this.key);
      if (!raw) return { goals: {} };
      try {
        return JSON.parse(raw);
      } catch {
        return { goals: {} };
      }
    },

    _saveAll(data) {
      localStorage.setItem(this.key, JSON.stringify(data));
    },

    getGoal(goalId) {
      const data = this._loadAll();
      return data.goals[goalId] || null;
    },

    upsertGoal(goal) {
      const data = this._loadAll();
      data.goals[goal.id] = goal;
      this._saveAll(data);
      return goal;
    },

    ensureGoal(goalId) {
      // Creates a fake goal if nothing exists, so the page works instantly.
      // Later, backend will populate this.
      let goal = this.getGoal(goalId);
      if (!goal) {
        goal = {
          id: goalId,
          title: "hit 55kg",
          description: "",
          accomplishments: [],
          completed: []
        };
        this.upsertGoal(goal);
      }
      return goal;
    }
  };

  // ----------------------------
  // State
  // ----------------------------
  const state = {
    goalId: null,
    goal: null,
    // per accomplishment: whether we are showing completed tasks (eye toggle)
    showCompletedTasksByAcc: new Map()
  };

  // ----------------------------
  // Rendering
  // ----------------------------
  function render() {
    const goal = state.goal;
    if (!goal) return;

    // header
    $("#goalTitle").textContent = goal.title || "Untitled Goal";
    $("#goalDesc").textContent = goal.description || "";

    const active = (goal.accomplishments || []).filter((a) => !a.completed_at);
    const completed = goal.completed || [];

    const activeList = $("#activeList");
    const completedList = $("#completedList");
    activeList.innerHTML = "";
    completedList.innerHTML = "";

    // empty states
    $("#emptyActive").classList.toggle("hidden", active.length !== 0);
    $("#emptyCompleted").classList.toggle("hidden", completed.length !== 0);

    // active cards
    for (const acc of active) {
      activeList.appendChild(renderAccomplishmentCard(acc));
    }

    // completed cards
    for (const acc of completed) {
      completedList.appendChild(renderCompletedCard(acc));
    }
  }

  function renderAccomplishmentCard(acc) {
    const progress = computeAccomplishmentProgress(acc);

    const card = document.createElement("div");
    card.className = "acc-card";
    card.dataset.accId = acc.id;

    const bar = document.createElement("div");
    bar.className = "acc-bar";
    bar.style.width = `${clamp(progress.pct, 0, 100)}%`;
    card.appendChild(bar);

    const top = document.createElement("div");
    top.className = "acc-top";

    const title = document.createElement("h3");
    title.className = "acc-title";
    title.textContent = acc.title || "NEW ACCOMPLISHMENT";
    top.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "acc-meta";

    const prog = document.createElement("div");
    prog.className = "acc-progress";
    prog.textContent = `${progress.done}/${progress.total}`;
    meta.appendChild(prog);

    const icons = document.createElement("div");
    icons.className = "acc-icons";

    // eye = toggle showing completed tasks in expanded view
    const eyeBtn = iconButton("eye", () => {
      const current = state.showCompletedTasksByAcc.get(acc.id) || false;
      state.showCompletedTasksByAcc.set(acc.id, !current);
      // keep expanded state and re-render just this card by full refresh (simple)
      persist();
      render();
      // reopen if it was expanded
      const newCard = findAccCard(acc.id);
      if (card.classList.contains("expanded") && newCard) newCard.classList.add("expanded");
    });
    icons.appendChild(eyeBtn);

    // edit = rename or delete
    const editBtn = iconButton("edit", () => {
      openEditAccomplishment(acc.id);
    });
    icons.appendChild(editBtn);

    meta.appendChild(icons);

    // completion button (only enabled when all tasks fully done)
    const completeBtn = document.createElement("button");
    completeBtn.className = "acc-complete";
    completeBtn.title = "complete accomplishment (cannot undo)";
    completeBtn.disabled = !allTasksFullyDone(acc);
    completeBtn.innerHTML = "✓";
    completeBtn.addEventListener("click", () => {
      if (!allTasksFullyDone(acc)) {
        toast("finish all tasks first.");
        return;
      }
      completeAccomplishment(acc.id);
    });

    meta.appendChild(completeBtn);
    top.appendChild(meta);

    card.appendChild(top);

    // body (expanded details)
    const body = document.createElement("div");
    body.className = "acc-body";

    // Add task button row (still present before completion)
    const actionsRow = document.createElement("div");
    actionsRow.className = "acc-actions-row";

    const addTaskBtn = document.createElement("button");
    addTaskBtn.className = "btn primary";
    addTaskBtn.innerHTML = `<span class="btn-icon">＋</span>task`;
    addTaskBtn.addEventListener("click", () => {
      addTask(acc.id);
      // ensure stays expanded
      card.classList.add("expanded");
    });

    actionsRow.appendChild(addTaskBtn);

    const hint = document.createElement("div");
    hint.className = "small";
    hint.textContent = "click a task name to edit • repeat rules live here";
    actionsRow.appendChild(hint);

    body.appendChild(actionsRow);

    const sep = document.createElement("hr");
    sep.className = "sep";
    body.appendChild(sep);

    const taskList = document.createElement("div");
    taskList.className = "task-list";

    const showCompleted = state.showCompletedTasksByAcc.get(acc.id) || false;
    const tasks = acc.tasks || [];

    const filtered = showCompleted ? tasks : tasks.filter((t) => !isTaskFullyDone(t));
    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "small";
      empty.textContent = showCompleted
        ? "no tasks yet."
        : "no incomplete tasks (toggle 👁 to see completed).";
      taskList.appendChild(empty);
    } else {
      for (const t of filtered) {
        taskList.appendChild(renderTaskRow(acc.id, t));
      }
    }

    body.appendChild(taskList);
    card.appendChild(body);

    // Expand/collapse on click (but NOT when clicking buttons/inputs)
    card.addEventListener("click", (e) => {
      const tag = e.target.tagName.toLowerCase();
      const isInteractive =
        e.target.closest("button") ||
        e.target.closest("input") ||
        tag === "input" ||
        tag === "button";
      if (isInteractive) return;

      card.classList.toggle("expanded");
    });

    // Auto-expand if this is the "new" one
    if (acc._expand) {
      card.classList.add("expanded");
      delete acc._expand;
      persist();
    }

    return card;
  }

  function renderTaskRow(accId, task) {
    const row = document.createElement("div");
    row.className = "task-row";
    row.dataset.taskId = task.id;

    const check = document.createElement("button");
    check.className = "task-check";

    // Determine if can check right now
    const canCheck = canCompleteTaskNow(task);
    check.disabled = !canCheck;

    // Visual checkmark if done for non-repeat, or if current period already checked
    let showCheck = false;
    if (!task.repeat || task.repeat.type === "none") {
      showCheck = !!task.completed;
    } else {
      const key = currentPeriodKey(task);
      if (key) {
        const comps = Array.isArray(task.completions) ? task.completions : [];
        showCheck = comps.some((c) => c.periodKey === key);
      }
    }
    check.textContent = showCheck ? "✓" : "";

    check.addEventListener("click", () => {
      const acc = findAcc(accId);
      if (!acc) return;

      const t = findTask(acc, task.id);
      if (!t) return;

      if (!canCompleteTaskNow(t)) {
        toast("you’ve already completed this task for now!");
        return;
      }

      completeTask(accId, t.id);
    });

    row.appendChild(check);

    const title = document.createElement("input");
    title.className = "task-title";
    title.value = task.title || "";
    title.placeholder = "task name…";
    title.addEventListener("click", (e) => e.stopPropagation());

    title.addEventListener("change", () => {
      renameTask(accId, task.id, title.value);
    });

    row.appendChild(title);

    const right = document.createElement("div");
    right.className = "task-right";

    // show progress count for repeating tasks
    const count = document.createElement("div");
    count.className = "task-count";
    const done = computeRepeatDoneCount(task);
    const total = computeRepeatTotal(task);
    count.textContent = `${done}/${total}`;
    right.appendChild(count);

    // repeat toggle/config button
    const repBtn = document.createElement("button");
    repBtn.className = "task-mini-btn";
    repBtn.textContent = "repeat";
    repBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleRepeatBox(row);
    });
    right.appendChild(repBtn);

    // delete task
    const delBtn = document.createElement("button");
    delBtn.className = "task-mini-btn";
    delBtn.textContent = "del";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteTask(accId, task.id);
    });
    right.appendChild(delBtn);

    row.appendChild(right);

    // Repeat config box (hidden by default)
    const repeatBox = document.createElement("div");
    repeatBox.className = "repeat-box hidden";
    repeatBox.innerHTML = buildRepeatBoxHTML(task);
    row.appendChild(repeatBox);

    wireRepeatBox(repeatBox, accId, task.id);

    return row;
  }

  function renderCompletedCard(acc) {
    const card = document.createElement("div");
    card.className = "completed-card";

    const title = document.createElement("h3");
    title.className = "completed-title";
    title.textContent = acc.title || "ACCOMPLISHMENT";
    card.appendChild(title);

    const stars = document.createElement("div");
    stars.className = "stars";
    // 2 stars like your mock, you can change later to something meaningful
    stars.textContent = "⭐ ⭐";
    card.appendChild(stars);

    return card;
  }

  function iconButton(kind, onClick) {
    const btn = document.createElement("button");
    btn.className = "icon-btn";
    btn.type = "button";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });

    // Inline SVGs so no dependencies
    if (kind === "eye") {
      btn.title = "view completed tasks";
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>`;
    } else if (kind === "edit") {
      btn.title = "edit accomplishment";
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
        </svg>`;
    }
    return btn;
  }

  function toggleRepeatBox(taskRow) {
    const box = $(".repeat-box", taskRow);
    if (!box) return;
    box.classList.toggle("hidden");
  }

  function buildRepeatBoxHTML(task) {
    const type = task.repeat?.type || "none";
    const until = task.repeat?.until_date || "";
    const amount = task.repeat?.amount || "";

    return `
      <div class="small"><b>repeat</b> (choose one)</div>
      <div class="repeat-grid">
        <label class="repeat-row">
          <input type="radio" name="repeatType" value="none" ${type === "none" ? "checked" : ""}/>
          none
        </label>
        <label class="repeat-row">
          <input type="radio" name="repeatType" value="daily" ${type === "daily" ? "checked" : ""}/>
          daily
        </label>
        <label class="repeat-row">
          <input type="radio" name="repeatType" value="weekly" ${type === "weekly" ? "checked" : ""}/>
          weekly
        </label>
        <label class="repeat-row">
          <input type="radio" name="repeatType" value="amount" ${type === "amount" ? "checked" : ""}/>
          amount
        </label>
      </div>

      <div class="repeat-config">
        <div>
          <label>until date (daily/weekly)</label>
          <input type="date" data-field="until_date" value="${until}" />
        </div>
        <div>
          <label>amount (for amount)</label>
          <input type="number" min="1" step="1" data-field="amount" value="${amount}" placeholder="e.g. 7"/>
        </div>
      </div>

      <div class="small" style="margin-top:8px;">
        daily/weekly = calendar end date • amount = number of check-offs
      </div>
    `;
  }

  function wireRepeatBox(box, accId, taskId) {
    const radios = $$('input[type="radio"][name="repeatType"]', box);
    const untilInput = $('input[data-field="until_date"]', box);
    const amountInput = $('input[data-field="amount"]', box);

    function saveRepeat() {
      const chosen = radios.find((r) => r.checked)?.value || "none";
      const until = untilInput?.value || "";
      const amt = amountInput?.value || "";

      // Basic validation
      if ((chosen === "daily" || chosen === "weekly") && !until) {
        toast("pick an end date for daily/weekly.");
        return;
      }
      if (chosen === "amount" && (!amt || Number(amt) < 1)) {
        toast("amount needs to be 1+");
        return;
      }

      setTaskRepeat(accId, taskId, chosen, until, amt);
    }

    radios.forEach((r) => r.addEventListener("change", saveRepeat));
    if (untilInput) untilInput.addEventListener("change", saveRepeat);
    if (amountInput) amountInput.addEventListener("change", saveRepeat);
  }

  // ----------------------------
  // Actions (mutations)
  // ----------------------------
  function persist() {
    Storage.upsertGoal(state.goal);
  }

  function addAccomplishment() {
    const goal = state.goal;
    const acc = {
      id: uid(),
      title: "NEW ACCOMPLISHMENT",
      created_at: todayStr(),
      tasks: [],
      completed_at: null,
      _expand: true // expand on first render
    };
    goal.accomplishments.push(acc);

    persist();
    render();
  }

  function openEditAccomplishment(accId) {
    const acc = findAcc(accId);
    if (!acc) return;

    const newName = prompt("Rename accomplishment:", acc.title || "");
    if (newName === null) return;

    const trimmed = newName.trim();
    if (!trimmed) {
      const sure = confirm("Empty name. Delete accomplishment instead?");
      if (sure) deleteAccomplishment(accId);
      return;
    }

    acc.title = trimmed;
    persist();
    render();
  }

  function deleteAccomplishment(accId) {
    const goal = state.goal;
    const ok = confirm("Delete this accomplishment? (tasks included)");
    if (!ok) return;

    goal.accomplishments = (goal.accomplishments || []).filter((a) => a.id !== accId);
    persist();
    render();
  }

  function completeAccomplishment(accId) {
    const goal = state.goal;
    const idx = (goal.accomplishments || []).findIndex((a) => a.id === accId);
    if (idx === -1) return;

    const acc = goal.accomplishments[idx];

    if (!allTasksFullyDone(acc)) {
      toast("finish all tasks first.");
      return;
    }

    const ok = confirm("Complete this accomplishment? This cannot be undone.");
    if (!ok) return;

    acc.completed_at = new Date().toISOString();

    // move to completed list
    goal.accomplishments.splice(idx, 1);
    goal.completed = goal.completed || [];
    goal.completed.unshift({
      id: acc.id,
      title: acc.title,
      completed_at: acc.completed_at
    });

    persist();
    render();
  }

  function addTask(accId) {
    const acc = findAcc(accId);
    if (!acc) return;

    const task = {
      id: uid(),
      title: "GYM",
      created_at: todayStr(),
      completed: false,
      repeat: { type: "none" },
      completions: [] // for repeat tracking
    };

    acc.tasks = acc.tasks || [];
    acc.tasks.push(task);

    persist();
    render();
    toast("task added. rename it.");
  }

  function renameTask(accId, taskId, newTitle) {
    const acc = findAcc(accId);
    if (!acc) return;
    const t = findTask(acc, taskId);
    if (!t) return;

    t.title = (newTitle || "").trim();
    persist();
    render();
  }

  function deleteTask(accId, taskId) {
    const acc = findAcc(accId);
    if (!acc) return;

    const ok = confirm("Delete this task?");
    if (!ok) return;

    acc.tasks = (acc.tasks || []).filter((t) => t.id !== taskId);
    persist();
    render();
  }

  function setTaskRepeat(accId, taskId, type, until, amount) {
    const acc = findAcc(accId);
    if (!acc) return;
    const t = findTask(acc, taskId);
    if (!t) return;

    if (!t.repeat) t.repeat = { type: "none" };

    t.repeat.type = type;

    if (type === "daily" || type === "weekly") {
      t.repeat.until_date = until;
      delete t.repeat.amount;
    } else if (type === "amount") {
      t.repeat.amount = Number(amount);
      delete t.repeat.until_date;
    } else {
      delete t.repeat.until_date;
      delete t.repeat.amount;
    }

    // Reset completion state when changing repeat rules
    t.completed = false;
    t.completions = [];

    persist();
    render();
    toast("repeat updated.");
  }

  function completeTask(accId, taskId) {
    const acc = findAcc(accId);
    if (!acc) return;
    const t = findTask(acc, taskId);
    if (!t) return;

    if (!canCompleteTaskNow(t)) {
      toast("you’ve already completed this task for now!");
      return;
    }

    // Non-repeat: mark completed
    if (!t.repeat || t.repeat.type === "none") {
      t.completed = true;
      persist();
      render();
      return;
    }

    // Repeat: add completion for current period
    const key = currentPeriodKey(t);
    if (!key) return;

    t.completions = Array.isArray(t.completions) ? t.completions : [];
    t.completions.push({ periodKey: key, at: new Date().toISOString() });

    // If repeat fully satisfied, keep showing it as done (it will disappear from incomplete list)
    if (isTaskFullyDone(t)) {
      // nothing else needed
    }

    persist();
    render();
  }

  // ----------------------------
  // Finders
  // ----------------------------
  function findAcc(accId) {
    return (state.goal?.accomplishments || []).find((a) => a.id === accId) || null;
  }

  function findTask(acc, taskId) {
    return (acc.tasks || []).find((t) => t.id === taskId) || null;
  }

  function findAccCard(accId) {
    return document.querySelector(`.acc-card[data-acc-id="${accId}"]`);
  }

  // ----------------------------
  // Boot
  // ----------------------------
  function init() {
    // Goal ID from URL, default "demo"
    const url = new URL(window.location.href);
    state.goalId = url.searchParams.get("goalId") || "demo";
    state.goal = Storage.ensureGoal(state.goalId);

    // Wire buttons
    $("#addAccomplishmentBtn")?.addEventListener("click", addAccomplishment);

    $("#logoutBtn")?.addEventListener("click", () => {
      // Frontend-only: just bounce to login/landing if you want.
      // Later: call backend /logout.
      toast("logout (frontend stub)");
    });

    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
