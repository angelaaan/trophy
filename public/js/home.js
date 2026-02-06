console.log("✅✅✅✅✅✅ home.js LOADED");

async function fetchGoals() {
  const res = await fetch("/api/goals");
  if (!res.ok) return [];
  return await res.json();
}

function renderGoals(goals) {
  const grid = document.getElementById("goalsGrid");
  grid.innerHTML = "";

  if (!goals || goals.length === 0) {
    // optional empty state (you can style later)
    const empty = document.createElement("div");
    empty.textContent = "you have... no goals right now :(";
    empty.style.fontFamily = "system-ui, sans-serif";
    empty.style.fontWeight = "700";
    empty.style.gridColumn = "1 / -1";
    empty.style.textAlign = "center";
    grid.appendChild(empty);
    return;
  }

  goals.forEach(g => {
    const card = document.createElement("div");
    card.className = "goal-card";
    card.dataset.goalId = g.goal_id;

    // header row inside the card
    const header = document.createElement("div");
    header.className = "goal-card-header";

    const title = document.createElement("div");
    title.className = "goal-title";
    title.textContent = g.title;

    const menuBtn = document.createElement("button");
    menuBtn.className = "goal-menu-btn";
    menuBtn.type = "button";
    menuBtn.textContent = "⋯";
    menuBtn.setAttribute("aria-label", "goal menu");

    // clicking the dots opens menu (and MUST NOT navigate)
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openGoalMenu(menuBtn, g, card, title);
    });

    header.appendChild(menuBtn);
    card.appendChild(header);
    card.appendChild(title);

    // click card → go to goal page
    card.addEventListener("click", () => {
      window.location.href = `./goal.html?goal_id=${g.goal_id}`;
    });

    grid.appendChild(card);
  });
}

function closeGoalMenu() {
  document.querySelector(".goal-menu")?.remove();
}

function openGoalMenu(btn, goal, cardEl, titleEl) {
  closeGoalMenu();

  const rect = btn.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "goal-menu";

  // position near the dots
  menu.style.top = rect.bottom + window.scrollY + 6 + "px";
  menu.style.left = rect.right + window.scrollX - 160 + "px";

  menu.innerHTML = `
    <button data-action="rename">Rename</button>
    <button data-action="delete" class="danger">Delete</button>
  `;

  menu.addEventListener("click", async (e) => {
    const action = e.target.closest("button")?.dataset.action;
    if (!action) return;

    if (action === "delete") {
      const ok = confirm("Delete this goal? This cannot be undone.");
      if (!ok) return;

      await deleteGoal(goal.goal_id);
      cardEl.remove();
      closeGoalMenu();
      return;
    }

    if (action === "rename") {
      const newName = prompt("New goal name:", titleEl.textContent || "");
      if (!newName) return;

      await renameGoal(goal.goal_id, newName.trim());
      titleEl.textContent = newName.trim();
      closeGoalMenu();
      return;
    }
  });

  document.body.appendChild(menu);

  // close on outside click / escape / scroll
  setTimeout(() => {
    document.addEventListener("click", closeGoalMenu, { once: true });
    document.addEventListener("scroll", closeGoalMenu, { once: true });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") closeGoalMenu();
    }, { once: true });
  }, 0);
}

async function deleteGoal(goalId) {
  const res = await fetch(`/api/goals/${goalId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("failed to delete goal");
}

async function renameGoal(goalId, title) {
  const res = await fetch(`/api/goals/${goalId}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error("failed to rename goal");
}


function openModal() {
  const overlay = document.getElementById("modalOverlay");
  overlay.classList.add("show");
  overlay.setAttribute("aria-hidden", "false");

  document.getElementById("modalError").textContent = "";
  document.getElementById("goalTitle").value = "";
  document.getElementById("goalDesc").value = "";
  document.getElementById("goalTitle").focus();
}

function closeModal() {
  const overlay = document.getElementById("modalOverlay");
  overlay.classList.remove("show");
  overlay.setAttribute("aria-hidden", "true");
}

async function createGoalFromModal() {
  const title = document.getElementById("goalTitle").value.trim();
  const description = document.getElementById("goalDesc").value.trim();
  const errEl = document.getElementById("modalError");

  if (!title) {
    errEl.textContent = "title is required bestie 😭";
    return;
  }

  const res = await fetch("/api/goals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description }),
  });

  if (!res.ok) {
    errEl.textContent = "couldn’t create goal (try again)";
    return;
  }

  closeModal();
  const goals = await fetchGoals();
  renderGoals(goals);
}

document.addEventListener("DOMContentLoaded", async () => {
  // button wiring
  document.getElementById("openCreateGoal").addEventListener("click", openModal);
  document.getElementById("cancelGoal").addEventListener("click", closeModal);
  document.getElementById("createGoal").addEventListener("click", createGoalFromModal);

  // click outside modal closes
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") closeModal();
  });

  document.getElementById("shelfBtn")?.addEventListener("click", () => {
    window.location.href = "shelf.html";
  });

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    const ok = confirm("Log out?");
    if (!ok) return;

    await fetch("/api/logout", { method: "POST", credentials: "include" });

    // hard redirect (prevents back button weirdness)
    window.location.replace("/login.html");
  }); 

  // ESC closes
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
    if (e.key === "Enter" && document.getElementById("modalOverlay").classList.contains("show")) {
      // Enter submits when modal open
      createGoalFromModal();
    }
  });

  // load goals
  const goals = await fetchGoals();
  renderGoals(goals);
});