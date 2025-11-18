// ==================== CONFIG ====================
const API_URL = "https://smart-chatbot-backend-w5tq.onrender.com";
let TOKEN = "";     // Should be set by login.html after successful login

// Block execution if TOKEN is missing (hard security)
function ensureToken() {
  if (!TOKEN) {
    alert("Security Error: No access token found. Please log in again.");
    window.location.href = "index.html";
    throw new Error("TOKEN missing");
  }
}
ensureToken();

// ==================== DOM ELEMENTS ====================
const profileSection = document.getElementById("profileSection");
const chatSection = document.getElementById("chatSection");
const chatBox = document.getElementById("chatBox");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const profileBtn = document.getElementById("profileBtn");
const statusMsg = document.getElementById("statusMsg");

const bgColorInput = document.getElementById("bgColorInput");
const resetProfileBtn = document.getElementById("resetProfileBtn");
const clearChatBtn = document.getElementById("clearChatBtn");
const studentInfoDiv = document.getElementById("studentInfo");

// ==================== STATE ====================
let studentProfile = null;
let chatLock = false;
let warningsCount = 0;

// ==================== INIT ====================
window.onload = async () => {
  await loadProfileFromServer();
  await applyBackgroundColorFromServer();
  await loadChatHistoryFromServer();
  await fetchWarnings();
};
// ==================== SECURE API WRAPPER ====================
async function secureFetch(url, options = {}) {
  ensureToken();

  // Make sure CSRF token is fetched
  if (!csrfToken) {
    const r = await fetch(`${API_URL}/api/csrf-token`, {
      method: "GET",
      credentials: "include"
    });
    const d = await r.json();
    csrfToken = d.csrfToken;
  }

  const opts = {
    ...options,
    credentials: "include",
    headers: {
      ...(options.headers || {}),
      "Authorization": `Bearer ${TOKEN}`,
      "x-csrf-token": csrfToken
    }
  };

  const res = await fetch(url, opts);

  if (res.status === 401) {
    alert("Session expired. Please login again.");
    window.location.href = "index.html";
    return;
  }

  return res;
}

// ==================== PROFILE ====================
async function loadProfileFromServer() {
  try {
    const res = await secureFetch(`${API_URL}/api/me`);
    if (!res.ok) throw new Error("Missing profile");
    studentProfile = await res.json();

    profileSection.style.display = "none";
    chatSection.style.display = "flex";
    statusMsg.textContent = "";

    displayStudentInfo();
  } catch {
    profileSection.style.display = "flex";
    chatSection.style.display = "none";
    statusMsg.textContent = "Please complete your profile!";
  }
}

profileBtn?.addEventListener("click", async () => {
  const name = document.getElementById("studentName").value.trim();
  const roll = document.getElementById("studentRoll").value.trim();
  const dept = document.getElementById("studentDept").value;
  const cls = document.getElementById("studentClass").value;

  if (!name || !roll || !dept || !cls) return alert("All fields required!");

  const profile = { name, roll, dept, cls };

  await secureFetch(`${API_URL}/api/me`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile)
  });

  studentProfile = profile;
  profileSection.style.display = "none";
  chatSection.style.display = "flex";
  displayStudentInfo();
});

// ==================== DISPLAY INFO ====================
function displayStudentInfo() {
  if (!studentProfile) return;

  studentInfoDiv.innerHTML = `
    <strong>${studentProfile.name}</strong> |
    Roll: ${studentProfile.roll} |
    Dept: ${studentProfile.dept} |
    Class: ${studentProfile.cls}
  `;
}

// ==================== CHAT ====================
sendBtn?.addEventListener("click", async () => {
  const message = chatInput.value.trim();
  if (!message) return;

  if (chatLock || await checkSpecificLockFromServer()) {
    return alert("⚠️ Chat is locked due to repeated violations.");
  }

  await addMessage("user", message);
  chatInput.value = "";

  // Enforce syllabus-only rule
  if (!isValidSyllabusQuery(message)) {
    await registerWarning();
    await addMessage("bot", "⚠️ Only syllabus-related questions are allowed.");
    return;
  }

  const response = await askGemini(message);
  await addMessage("bot", response);
});

// Store message + Display it
async function addMessage(sender, text, time = null) {
  time = time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const div = document.createElement("div");
  div.className = `message ${sender === "user" ? "userMsg" : "botMsg"}`;
  div.innerHTML = `<strong>[${sender === "user" ? "You" : "Bot"} - ${time}]</strong>: ${text}`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;

  await secureFetch(`${API_URL}/api/chat/history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender, text, time })
  });
}

async function loadChatHistoryFromServer() {
  const res = await secureFetch(`${API_URL}/api/chat/history`);
  if (!res.ok) return;

  const history = await res.json();
  history.forEach(m => addMessage(m.sender, m.text, m.time));
}

// ==================== SYLLABUS CHECK ====================
function isValidSyllabusQuery(text) {
  const allowed = ["course", "syllabus", "unit", "module", "subject"];
  text = text.toLowerCase();
  return allowed.some(k => text.includes(k));
}

// ==================== WARNINGS ====================
async function fetchWarnings() {
  const res = await secureFetch(`${API_URL}/api/warnings`);
  if (!res.ok) return;

  const data = await res.json();
  warningsCount = data.count || 0;
  chatLock = data.locked || false;

  displayWarningsCount();
}

async function registerWarning() {
  const res = await secureFetch(`${API_URL}/api/warnings`, { method: "POST" });
  if (!res.ok) return;

  const data = await res.json();
  warningsCount = data.count;
  chatLock = data.locked;

  displayWarningsCount();
}

function displayWarningsCount() {
  statusMsg.textContent = warningsCount ? `⚠️ Warnings: ${warningsCount}` : "";
}

// ==================== LOCK STATUS ====================
async function checkSpecificLockFromServer() {
  const res = await secureFetch(`${API_URL}/api/locks`);
  if (!res.ok) return false;

  const data = await res.json();
  return data.locked;
}
// ==================== CHATBOT REQUEST ====================
async function askGemini(prompt) {
  try {
    const res = await secureFetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roll: studentProfile.roll,
        sender: "user",
        message: prompt
      })
    });

    const data = await res.json();
    return data.answer || "No response from AI.";
  } catch {
    return "Error contacting chatbot server.";
  }
}

// ==================== BACKGROUND SETTINGS ====================
async function applyBackgroundColorFromServer() {
  const res = await secureFetch(`${API_URL}/api/me/settings`);
  if (!res.ok) return;

  const settings = await res.json();
  const bg = settings.bgColor || "linear-gradient(135deg, #0077ff, #00d4ff)";
  document.body.style.background = bg;
}

bgColorInput?.addEventListener("change", async (e) => {
  const bg = e.target.value;

  await secureFetch(`${API_URL}/api/me/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bgColor: bg })
  });

  document.body.style.background = bg;
});

// ==================== RESET / CLEAR ====================
resetProfileBtn?.addEventListener("click", async () => {
  await secureFetch(`${API_URL}/api/me/reset`, { method: "POST" });
  location.reload();
});

clearChatBtn?.addEventListener("click", async () => {
  await secureFetch(`${API_URL}/api/chat/history`, { method: "DELETE" });
  chatBox.innerHTML = "";
});
