(() => {
  // ----------------------------
  // Helpers
  // ----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

  async function api(url, options = {}) {
    const res = await fetch(url, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...options,
    });

    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }

    if (!res.ok) {
      const msg = data?.error || text || res.statusText;
      throw new Error(`[${res.status}] ${msg}`);
    }
    return data ?? {};
  }

  async function loadGoalFromDB(goalId) {
    // expects server route: GET /api/goals/:goalId/full
    return api(`/api/goals/${goalId}/full`);
  }

  async function reloadGoalAndRender() {
    const g = await loadGoalFromDB(state.goalId);
    state.goal = (typeof normalizeGoal === "function") ? normalizeGoal(g) : g;
    render();
  }


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
    // DB: total_required is the "how many completions needed"
    const n = Number(task.total_required || 1);
    return Math.max(1, n);
  }

  function computeRepeatDoneCount(task) {
    const total = computeRepeatTotal(task);
    const done = Number(task.completion_count || 0);
    return clamp(done, 0, total);
  }

  function currentPeriodKey(task) {
    const type = task.repeat?.type;
    if (type === "daily") return todayStr();
    if (type === "weekly") return startOfWeekStr(new Date());
    return null;
  }

  function canCompleteTaskNow(task) {
    // Let backend enforce daily/weekly limits; we only block if fully complete
    return !isTaskFullyDone(task);
  }

  function isTaskFullyDone(task) {
    return !!(task.is_complete ?? task.is_completed);
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
      doneUnits += done;
    }

    const pct = totalUnits === 0 ? 0 : Math.round((doneUnits / totalUnits) * 100);
    return { done: doneUnits, total: totalUnits, pct };
  }

  function allTasksFullyDone(acc) {
    const tasks = acc.tasks || [];
    if (tasks.length === 0) return false;
    return tasks.every(t => isTaskFullyDone(t));
  }

  async function maybeAutoComplete(accId) {
    // reload fresh DB state first (so counts are real)
    state.goal = normalizeGoal(await loadGoalFromDB(state.goalId));

    const acc = (state.goal.accomplishments || []).find(a =>
      (a.accomplishment_id ?? a.id) === accId
    );
    if (!acc) return;

    const tasks = acc.tasks || [];
    if (tasks.length < 1) return;

    const allDone = tasks.every(t => isTaskFullyDone(t));
    if (!allDone) return;

    // call your backend “complete accomplishment” endpoint
    await api(`/api/accomplishments/${acc.accomplishment_id ?? accId}/complete`, {method: "POST",});

    // reload + re-render so it moves + shows ⭐
    state.goal = normalizeGoal(await loadGoalFromDB(state.goalId));
    render();
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
  };

  // ----------------------------
  // State
  // ----------------------------
  const state = {
    goalId: null,
    goal: null,
    showCompletedTasksByAcc: new Map(),
    expandedAccIds: new Set(),
    editingAccId: null,
    editingTaskId: null
  };

  function normalizeGoal(goal) {
    return {
      ...goal,
      accomplishments: (goal.accomplishments || []).map(acc => ({
        ...acc,
        id: acc.accomplishment_id,
        tasks: (acc.tasks || []).map(t => ({
          ...t,
          id: t.task_id
        }))
      }))
    };
  }


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
    const completed = (goal.accomplishments || []).filter(a => a.completed_at);

    // newest → oldest (by accomplishment_id; higher = newer)
    active.sort((a, b) => (Number(b.id ?? b.accomplishment_id) - Number(a.id ?? a.accomplishment_id)));
    completed.sort((a, b) => (Number(b.id ?? b.accomplishment_id) - Number(a.id ?? a.accomplishment_id)));

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
    card.setAttribute("data-acc-id", acc.id);

    if (state.expandedAccIds.has(acc.id)) {
      card.classList.add("expanded");
    }

    const bar = document.createElement("div");
    bar.className = "acc-bar";
    bar.style.width = `${clamp(progress.pct, 0, 100)}%`;
    card.appendChild(bar);

    const top = document.createElement("div");
    top.className = "acc-top";

    const title = document.createElement("h3");
    title.className = "acc-title";
    title.textContent = acc.title || "NEW ACCOMPLISHMENT";

    // if this one is being edited, make it editable + auto-focus
    if (state.editingAccId === acc.id) {
      title.contentEditable = "true";
      title.classList.add("editing");

      // focus + highlight text after it mounts
      setTimeout(() => {
        title.focus();
        const range = document.createRange();
        range.selectNodeContents(title);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }, 0);
    }

    // prevent card toggling when clicking the title
    title.addEventListener("click", (e) => e.stopPropagation());

    title.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        title.blur(); // triggers save in blur handler
      }
      if (e.key === "Escape") {
        e.preventDefault();
        state.editingAccId = null;
        await reloadGoalAndRender();
      }
    });

    title.addEventListener("blur", async () => {
      if (state.editingAccId !== acc.id) return;

      const newTitle = title.textContent.trim();
      if (!newTitle) {
        toast("title can't be empty");
        // refocus
        setTimeout(() => title.focus(), 0);
        return;
      }

      try {
        await api(`/api/accomplishments/${acc.id}`, {
          method: "PUT",
          body: JSON.stringify({ title: newTitle }),
        });
        state.editingAccId = null;
        await reloadGoalAndRender();
      } catch (err) {
        console.error(err);
        toast("couldn't save title");
      }
    });

    top.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "acc-meta";

    const prog = document.createElement("div");
    prog.className = "acc-progress";
    prog.textContent = `${progress.done}/${progress.total}`;
    meta.appendChild(prog);

    const icons = document.createElement("div");
    icons.className = "acc-icons";

    // edit = rename or delete
    const editBtn = iconButton("edit", () => {
      openEditAccomplishment(acc.id);
    });
    icons.appendChild(editBtn);

    // delete accomplishment button
    const deleteBtn = iconButton("x", () => {
      deleteAccomplishment(acc.id);
    });
    deleteBtn.classList.add("icon-x");
    deleteBtn.title = "delete accomplishment";
    icons.appendChild(deleteBtn);

    meta.appendChild(icons);
    top.appendChild(meta);

    card.appendChild(top);

    // body (expanded details)
    const body = document.createElement("div");
    body.className = "acc-body";

    // Add task button row (still present before completion)
    const actionsRow = document.createElement("div");
    actionsRow.className = "acc-actions-row";

    const tasks = acc.tasks || [];
    const hasCompletedTask = tasks.some(t => isTaskFullyDone(t));

    if (hasCompletedTask) {
      const eyeBtn = iconButton("eye", () => {
        const current = state.showCompletedTasksByAcc.get(acc.id) || false;
        state.showCompletedTasksByAcc.set(acc.id, !current);
        render();
      });
      icons.appendChild(eyeBtn);
    }

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
// Expand/collapse on click (but NOT when clicking buttons/inputs)
    card.addEventListener("click", (e) => {
      const tag = e.target.tagName.toLowerCase();
      const isInteractive =
        e.target.closest("button") ||
        e.target.closest("input") ||
        e.target.closest("label") ||
        e.target.closest(".repeat-box") ||
        e.target.isContentEditable ||
        tag === "input" ||
        tag === "button";
      if (isInteractive) return;

      const willExpand = !card.classList.contains("expanded");
      card.classList.toggle("expanded");

      if (willExpand) state.expandedAccIds.add(acc.id);
      else state.expandedAccIds.delete(acc.id);
    });

    // Auto-expand if this is the "new" one
    if (acc._expand) {
      card.classList.add("expanded");
      delete acc._expand;
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

    // Visual checkmark to show "show completed tasks" button
    check.textContent = isTaskFullyDone(task) ? "✓" : "";

    check.addEventListener("click", () => {
      // use the freshest state at click time
      const acc = findAcc(accId);
      if (!acc) return;

      const t = findTask(acc, task.id);
      if (!t) return;

      if (isTaskFullyDone(t)) {
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
    if (state.editingTaskId === task.id) {
      row.classList.add("task-editing");
      title.classList.add("editing");

      setTimeout(() => {
        title.focus();
        title.select();
      }, 0);

      // once it's mounted, clear the flag so it won't refocus forever
      setTimeout(() => {
        if (state.editingTaskId === task.id) state.editingTaskId = null;
      }, 0);
    }

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
    repBtn.dataset.mode = "closed"; // closed | open

    repBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      const box = $(".repeat-box", row);
      if (!box) return;

      const isHidden = box.classList.contains("hidden");

      if (isHidden) {
        // opening
        box.classList.remove("hidden");
        repBtn.textContent = "✓";
        repBtn.dataset.mode = "open";
      } else {
        // already open -> SAVE
        const chosen = box.querySelector('input[type="radio"]:checked')?.value || "none";
        const until = box.querySelector('input[data-field="until_date"]')?.value || "";
        const amt = box.querySelector('input[data-field="amount"]')?.value || "";

        // validation (same rules you already had)
        if ((chosen === "daily" || chosen === "weekly") && !until) {
          toast("pick an end date for daily/weekly.");
          return;
        }
        if (chosen === "amount" && (!amt || Number(amt) < 1)) {
          toast("amount needs to be 1+");
          return;
        }

        // save to DB
        setTaskRepeat(accId, task.id, chosen, until, amt);

        // close after saving
        box.classList.add("hidden");
        repBtn.textContent = "repeat";
        repBtn.dataset.mode = "closed";
      }
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
    stars.textContent = "⭐";
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
    // DB fields: repeat_type: "none" | "daily" | "weekly" | "amount" (or "x")
    const typeRaw = (task.repeat_type || "none").toLowerCase();
    const type = (typeRaw === "x") ? "amount" : typeRaw;

    const until = task.end_date || "";
    const amount = (type === "amount") ? String(task.total_required || "") : "";

    // IMPORTANT: unique radio group per task (prevents cross-task radio conflicts)
    const group = `repeatType_${task.id}`;

    return `
      <div class="small"><b>repeat</b> (choose one)</div>

      <div class="repeat-grid">
        <label class="repeat-row">
          <input type="radio" name="${group}" value="none" ${type === "none" ? "checked" : ""}/>
          none
        </label>
        <label class="repeat-row">
          <input type="radio" name="${group}" value="daily" ${type === "daily" ? "checked" : ""}/>
          daily
        </label>
        <label class="repeat-row">
          <input type="radio" name="${group}" value="weekly" ${type === "weekly" ? "checked" : ""}/>
          weekly
        </label>
        <label class="repeat-row">
          <input type="radio" name="${group}" value="amount" ${type === "amount" ? "checked" : ""}/>
          amount
        </label>
      </div>

      <div class="repeat-config">
        <div class="repeat-field" data-show-for="daily weekly">
          <label>until date</label>
          <input type="date" data-field="until_date" value="${until}" />
        </div>

        <div class="repeat-field" data-show-for="amount">
          <label>amount</label>
          <input type="number" min="1" step="1" data-field="amount" value="${amount}" placeholder="e.g. 7"/>
        </div>
      </div>
    `;
  }

  function wireRepeatBox(box, accId, taskId) {
    // radios are now unique per task, so just grab all radios in THIS box
    const radios = $$('input[type="radio"]', box);
    const untilInput = $('input[data-field="until_date"]', box);
    const amountInput = $('input[data-field="amount"]', box);
    const untilWrap = untilInput?.closest(".repeat-field");
    const amountWrap = amountInput?.closest(".repeat-field");

    function chosenValue() {
      return radios.find(r => r.checked)?.value || "none";
    }

    function setVisible(el, visible) {
      if (!el) return;
      el.classList.toggle("hidden", !visible);
    }

    function refreshEnabledFields() {
      const chosen = chosenValue();

      const showUntil = (chosen === "daily" || chosen === "weekly");
      const showAmount = (chosen === "amount");

      // show/hide
      setVisible(untilWrap, showUntil);
      setVisible(amountWrap, showAmount);

      // also keep disabled logic (good UX + prevents accidental reads)
      if (untilInput) untilInput.disabled = !showUntil;
      if (amountInput) amountInput.disabled = !showAmount;
    }

    radios.forEach(r => r.addEventListener("change", refreshEnabledFields));
    refreshEnabledFields();
  }

  // ----------------------------
  // Actions (mutations)
  // ----------------------------

  async function addAccomplishment() {
    try {
      const title = "NEW ACCOMPLISHMENT";

      const res = await api(`/api/goals/${state.goalId}/accomplishments`, {
        method: "POST",
        body: JSON.stringify({ title }),
      });

      await reloadGoalAndRender();

      // auto expand the newly created accomplishment (optional)
      const newId = res.accomplishment_id;
      // keep it open + start inline edit
      state.expandedAccIds.add(newId);
      state.editingAccId = newId;

      await reloadGoalAndRender();

      const acc = (state.goal.accomplishments || []).find(a =>
        (a.accomplishment_id ?? a.id) === newId || a.id === newId
      );
      if (acc) {
        acc._expand = true;
        render();
      }
    } catch (e) {
      console.error(e);
      toast("couldn't add accomplishment");
    }
  }

  async function openEditAccomplishment(accId) {
    // keep it open and start inline editing
    state.editingAccId = accId;
    state.expandedAccIds.add(accId);
    render();
  }

  async function deleteAccomplishment(accId) {
    if (!confirm("Delete this accomplishment? This cannot be undone.")) return;

    try {
      await api(`/api/accomplishments/${accId}`, {
        method: "DELETE",
      });

      state.expandedAccIds.delete(accId);
      state.editingAccId = null;

      await reloadGoalAndRender();
      toast("accomplishment deleted");
    } catch (e) {
      console.error(e);
      toast("couldn't delete accomplishment");
    }
  }

  async function addTask(accId) {
    try {
      state.expandedAccIds.add(accId);

      const res = await api(`/api/accomplishments/${accId}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title: "new task",
          repeat_type: "none",
          target_count: 1,
        }),
      });

      const newTaskId = res.task_id;

      state.editingTaskId = newTaskId;
      state.expandedAccIds.add(accId);

      await reloadGoalAndRender();

      toast("task added. rename it.");
    } catch (e) {
      console.error(e);
      toast("couldn't add task");
    }
  }

  async function renameTask(accId, taskId, newTitle) {
    const title = (newTitle || "").trim();

    try {
      await api(`/api/tasks/${taskId}`, {
        method: "PUT",
        body: JSON.stringify({ title }),
      });

      await reloadGoalAndRender();
    } catch (e) {
      console.error(e);
      toast("couldn't rename task");
    }
  }

  async function deleteTask(accId, taskId) {
    const ok = confirm("Delete this task?");
    if (!ok) return;

    try {
      await api(`/api/tasks/${taskId}`, { method: "DELETE" });
      await reloadGoalAndRender();
    } catch (e) {
      console.error(e);
      toast("couldn't delete task");
    }
  }

  async function setTaskRepeat(accId, taskId, type, until, amount) {
    try {
      const chosen = String(type || "none").toLowerCase();

      // Build payload for PUT /api/tasks/:task_id
      // We let backend compute total_required for daily/weekly based on start/end dates.
      const payload = { repeat_type: chosen };

      if (chosen === "daily" || chosen === "weekly") {
        payload.end_date = until;      // DB field
        payload.target_count = 1;      // weekly per-week target (you can upgrade UI later)
        // don't send total_required; backend will compute
      } else if (chosen === "amount") {
        const n = Math.max(1, Number(amount || 1));
        payload.repeat_type = "amount"; // backend supports amount/x
        payload.total_required = n;
        payload.target_count = n;
        payload.end_date = null;
      } else {
        payload.repeat_type = "none";
        payload.end_date = null;
        payload.target_count = 1;
        payload.total_required = 1;
      }

      await api(`/api/tasks/${taskId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      await reloadGoalAndRender();
      toast("repeat updated.");
    } catch (e) {
      console.error(e);
      toast("couldn't update repeat");
    }
  }

  async function completeTask(accId, taskId) {
    try {
      state.expandedAccIds.add(accId);

      // 1) tell backend “I checked this task”
      await api(`/api/tasks/${taskId}/check`, { method: "POST" });

      // 2) refresh goal from DB 
      state.goal = normalizeGoal(await loadGoalFromDB(state.goalId));

      // 3) now see if accomplishment should auto-complete
      await maybeAutoComplete(accId);

      // 4) final render
      render();
    } catch (e) {
      console.error(e);
      const msg = (e && e.message) ? e.message : "";
      toast(
        msg.includes("you've already completed")
          ? "you’ve already completed this task for now!"
          : "couldn't complete task"
      );
    }
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
  async function init() {
    // Goal ID from URL, default "demo"
    const url = new URL(window.location.href);
    state.goalId = url.searchParams.get("goal_id");
    if(!state.goalId){
      alert("missing goalID in url !!!");
      return;
    }

    try{
      state.goal = normalizeGoal(await loadGoalFromDB(state.goalId));
      render();
    } catch (e) {
      console.error(e);
      alert(String(e.message || e));
      return;
    }

    // Wire buttons
    $("#addAccomplishmentBtn")?.addEventListener("click", addAccomplishment);

    const completeGoalBtn = document.querySelector("#complete-goal");
    if (completeGoalBtn) {
      completeGoalBtn.addEventListener("click", async () => {
        if (!confirm("Mark this goal as completed?")) return;

        try {
          await api(`/api/goals/${state.goalId}/complete`, { method: "POST" });
          await reloadGoalAndRender();
          toast("goal completed ⭐");
        } catch (e) {
          console.error(e);
          toast("couldn't complete goal");
        }
      });
    }

    document.getElementById("logoutBtn")?.addEventListener("click", async () => {
      const ok = confirm("Log out?");
      if (!ok) return;

      await fetch("/api/logout", { method: "POST", credentials: "include" });
      window.location.replace("/login.html");
    });

  }

  document.addEventListener("DOMContentLoaded", init);
})();
