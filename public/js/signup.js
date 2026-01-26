document.getElementById("signupForm").addEventListener("submit", async (e) => {
  //stops browsers from reloading and lets JS take over
  e.preventDefault();

  const username = document.getElementById("signupUsername").value.trim();
  const password = document.getElementById("signupPassword").value;

  const msg = document.getElementById("signupMsg");
  msg.textContent = "";

  try {
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.error || "signup failed sowwy come back later";
      return;
    }
    if (data.ok) {
        window.location.href = "./home.html";
    }


    msg.textContent = "SIGNUP SUCESSFULL YAY !! Redirecting to login...";
    setTimeout(() => (window.location.href = "./login.html"), 700);
    } catch (err) {
        msg.textContent = "sorry there was a network error";
    }
});
