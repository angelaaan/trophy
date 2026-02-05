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
    card.textContent = g.title;

    // later: click card → go to goal.html?goal_id=...
    card.addEventListener("click", () => {
      window.location.href = `./goal.html?goal_id=${g.goal_id}`;
    });

    grid.appendChild(card);
  });
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