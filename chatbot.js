// ==================== CONFIG ====================
const API_URL = ""; // Set your backend API base URL
let TOKEN = ""; // Set after login

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

// ==================== PROFILE ====================
async function loadProfileFromServer() {
  try {
    const res = await fetch(`${API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    if (!res.ok) throw new Error("Profile not found");
    studentProfile = await res.json();
    profileSection.style.display = "none";
    chatSection.style.display = "flex";
    statusMsg.textContent = "";
    displayStudentInfo();
  } catch {
    profileSection.style.display = "flex";
    chatSection.style.display = "none";
    statusMsg.textContent = "Please fill your profile first!";
  }
}

profileBtn?.addEventListener("click", async () => {
  const name = document.getElementById("studentName").value.trim();
  const roll = document.getElementById("studentRoll").value.trim();
  const dept = document.getElementById("studentDept").value;
  const cls = document.getElementById("studentClass").value;

  if (!name || !roll || !dept || !cls) return alert("All fields are required!");

  const profile = { name, roll, dept, cls };
  await fetch(`${API_URL}/api/me`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(profile)
  });
  studentProfile = profile;
  profileSection.style.display = "none";
  chatSection.style.display = "flex";
  statusMsg.textContent = "";
  displayStudentInfo();
});

// ==================== DISPLAY INFO ====================
function displayStudentInfo() {
  if (!studentProfile || !studentInfoDiv) return;
  studentInfoDiv.innerHTML = `
    <strong>${studentProfile.name}</strong> | Roll: ${studentProfile.roll} | Dept: ${studentProfile.dept} | Class: ${studentProfile.cls}
  `;
}

// ==================== CHAT ====================
sendBtn?.addEventListener("click", async () => {
  const message = chatInput.value.trim();
  if (!message) return;

  if (chatLock || await checkSpecificLockFromServer()) {
    return alert("⚠️ Chat is currently locked!");
  }

  await addMessage("user", message);
  chatInput.value = "";

  if (!isValidSyllabusQuery(message)) {
    await registerWarning();
    await addMessage("bot", "⚠️ You are only allowed to ask syllabus-related questions.");
    return;
  }

  const response = await askGemini(message);
  await addMessage("bot", response);
});

async function addMessage(sender, text, time = null) {
  time = time || new Date().toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' });
  const div = document.createElement("div");
  div.className = "message " + (sender === "user" ? "userMsg" : "botMsg");
  div.innerHTML = `<strong>[${sender === "user" ? "You" : "Bot"} - ${time}]</strong>: ${text}`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;

  await fetch(`${API_URL}/api/chat/history`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ sender, text, time })
  });
}

async function loadChatHistoryFromServer() {
  const res = await fetch(`${API_URL}/api/chat/history`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) return;
  const history = await res.json();
  history.forEach(m => addMessage(m.sender, m.text, m.time));
}

// ==================== SYLLABUS CHECK ====================
function isValidSyllabusQuery(text) {
  const allowedKeywords = ["course", "syllabus"]; // default or fetch from server
  return allowedKeywords.some(k => text.toLowerCase().includes(k));
}

// ==================== WARNINGS ====================
async function fetchWarnings() {
  const res = await fetch(`${API_URL}/api/warnings`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) return;
  const data = await res.json();
  warningsCount = data.count || 0;
  chatLock = data.locked || false;
  displayWarningsCount();
}

async function registerWarning() {
  const res = await fetch(`${API_URL}/api/warnings`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) return;
  const data = await res.json();
  warningsCount = data.count || 0;
  chatLock = data.locked || false;
  displayWarningsCount();
}

function displayWarningsCount() {
  statusMsg.textContent = warningsCount ? `⚠️ Warnings: ${warningsCount}` : "";
}

// ==================== LOCK ====================
async function checkSpecificLockFromServer() {
  const res = await fetch(`${API_URL}/api/locks`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) return false;
  const data = await res.json();
  return data.locked || false;
}

// ==================== GEMINI ====================
async function askGemini(prompt) {
  try {
    const res = await fetch(`${API_URL}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    return data.answer || "No response from chatbot.";
  } catch {
    return "Error connecting to chatbot server.";
  }
}

// ==================== BACKGROUND ====================
async function applyBackgroundColorFromServer() {
  const res = await fetch(`${API_URL}/api/me/settings`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) return;
  const settings = await res.json();
  const bgColor = settings.bgColor || "linear-gradient(135deg, #0077ff, #00d4ff)";
  document.body.style.background = bgColor;
}

bgColorInput?.addEventListener("change", async (e) => {
  const bgColor = e.target.value;
  await fetch(`${API_URL}/api/me/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ bgColor })
  });
  document.body.style.background = bgColor;
});

// ==================== RESET / CLEAR ====================
resetProfileBtn?.addEventListener("click", async () => {
  await fetch(`${API_URL}/api/me/reset`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` } });
  location.reload();
});

clearChatBtn?.addEventListener("click", async () => {
  await fetch(`${API_URL}/api/chat/history`, { method: "DELETE", headers: { Authorization: `Bearer ${TOKEN}` } });
  chatBox.innerHTML = "";
});
