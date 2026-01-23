document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;

  const msg = document.getElementById("loginMsg");
  msg.textContent = "";

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.error || "Login failed";
      return;
    }

    if (data.ok) {
      window.location.href = "./home.html";
    }


    msg.textContent = "Login successful! Redirecting...";
    setTimeout(() => (window.location.href = "./index.html"), 500);
  } catch (err) {
    msg.textContent = "Network error";
  }
});