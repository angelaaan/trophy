async function api(url, options = {}) {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function renderShelf(goals) {
  const wrap = document.getElementById("shelfWrap");
  wrap.innerHTML = "";

  if (!goals.length) {
    const empty = document.createElement("div");
    empty.className = "shelf-empty";
    empty.textContent = "no trophies yet :(";
    wrap.appendChild(empty);
    return;
  }

  const rows = chunk(goals, 4);

  rows.forEach((rowGoals) => {
    const row = document.createElement("section");
    row.className = "shelf-row";

    const grid = document.createElement("div");
    grid.className = "shelf-grid";

    rowGoals.forEach((g) => {
      const item = document.createElement("div");
      item.className = "trophy-item";
      item.title = g.title;

      // update the src to match where you store your trophy png
      item.innerHTML = `
        <img class="trophy-img" src="./assets/trophy.png" alt="trophy" />
        <div class="trophy-label">${escapeHtml(g.title)}</div>
      `;

      grid.appendChild(item);
    });

    row.appendChild(grid);
    wrap.appendChild(row);
  });
}

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function init() {
  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    // if you have a real logout endpoint, call it here
    window.location.href = "index.html";
  });

  const goals = await api("/api/goals/shelf");
  renderShelf(goals);
}

init().catch((e) => {
  console.error(e);
  alert("couldn't load shelf");
});