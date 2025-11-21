// ==================== CONFIG ====================
const API_URL = "https://smart-chatbot-backend-w5tq.onrender.com";
let TOKEN = "";
let socket = null;

// ==================== TOKEN LOAD ====================
TOKEN = localStorage.getItem("token");
if (!TOKEN) {
  alert("No login token found. Please login again.");
  window.location.href = "index.html";
  throw new Error("TOKEN missing");
}

// ==================== SECURE FETCH ====================
async function secureFetch(url, options = {}) {
  const opts = {
    ...options,
    credentials: "include",
    headers: {
      ...(options.headers || {}),
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json"
    }
  };

  const res = await fetch(url, opts);

  if (res.status === 401 || res.status === 403) {
    alert("Session expired or unauthorized. Login again.");
    window.location.href = "index.html";
    return;
  }

  return res;
}

// ==================== DOM ELEMENTS ====================
const profileSection = document.getElementById("profileSection");
const chatSection = document.getElementById("chatSection");
const chatBox = document.getElementById("chatBox");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const profileBtn = document.getElementById("profileBtn");
const statusMsg = document.getElementById("statusMsg");
const bgColorInput = document.getElementById("bgColorInput");
const studentInfoDiv = document.getElementById("studentInfo");

// ==================== STATE ====================
let studentProfile = null;
let chatLock = false;
let warningsCount = 0;

// ==================== INITIAL LOAD ====================
window.addEventListener("DOMContentLoaded", async () => {
  await loadProfile();
  await applyBackgroundColor();
  await loadChatHistory();
  await fetchWarningsAndLock();

  initSocket();
  setInterval(fetchWarningsAndLock, 12000); // fallback
});

// ==================== PROFILE ====================
async function loadProfile() {
  try {
    const roll = localStorage.getItem("studentRoll");
    if (!roll) throw new Error("No roll");

    const res = await secureFetch(`${API_URL}/api/student/${roll}`);
    if (!res.ok) throw new Error("Not found");

    studentProfile = await res.json();

    profileSection.style.display = "none";
    chatSection.style.display = "flex";

    displayStudentInfo();
  } catch {
    // no profile → show profile page
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

  if (!name || !roll || !dept || !cls) return alert("All fields are required!");

  const profile = { name, roll, dept, cls };

  await secureFetch(`${API_URL}/api/student/${roll}`, {
    method: "POST",
    body: JSON.stringify(profile)
  });

  studentProfile = profile;
  localStorage.setItem("studentRoll", roll);

  profileSection.style.display = "none";
  chatSection.style.display = "flex";

  displayStudentInfo();
});

// ==================== DISPLAY INFO ====================
function displayStudentInfo() {
  studentInfoDiv.innerHTML = `
    👤 <strong>${studentProfile.name}</strong> |
    🎓 ${studentProfile.roll} |
    ${studentProfile.dept} - ${studentProfile.cls}
  `;
}

// ==================== CHAT ====================
sendBtn?.addEventListener("click", async () => {
  const message = chatInput.value.trim();
  if (!message) return;
  if (chatLock) return alert("⚠️ Chat is locked.");

  await addMessage("user", message);
  chatInput.value = "";

  if (!isValidSyllabusQuery(message)) {
    await registerWarning();
    await addMessage("bot", "⚠️ Only syllabus-related questions allowed.");
    return;
  }

  const reply = await askGemini(message);
  await addMessage("bot", reply);
});

async function addMessage(sender, text, time = null) {
  time = time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const div = document.createElement("div");
  div.className = `message ${sender === "user" ? "userMsg" : "botMsg"}`;
  div.innerHTML = `<strong>[${sender === "user" ? "You" : "Bot"} - ${time}]</strong>: ${text}`;

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;

  if (sender === "user") {
    // save only user messages
    await secureFetch(`${API_URL}/api/chat`, {
      method: "POST",
      body: JSON.stringify({
        roll: studentProfile.roll,
        sender: "user",
        message: text,
        useGemini: true
      })
    });
  }
}

// ==================== CHAT HISTORY ====================
async function loadChatHistory() {
  const res = await secureFetch(`${API_URL}/api/chat/${studentProfile.roll}`);
  if (!res.ok) return;

  const history = await res.json();

  history.forEach(m => {
    addMessage(m.sender, m.message, m.time);
  });
}

// ==================== SYLLABUS KEYWORDS ====================
function isValidSyllabusQuery(text) {
  const allowed = ["course", "syllabus", "unit", "module", "subject"];
  text = text.toLowerCase();
  return allowed.some(k => text.includes(k));
}

// ==================== WARNINGS ====================
async function fetchWarningsAndLock() {
  const res = await secureFetch(`${API_URL}/api/dashboard/status`);
  if (!res.ok) return;

  const data = await res.json();

  warningsCount = data.warnings?.length || 0;
  chatLock = !!data.activeLock;

  statusMsg.textContent = warningsCount ? `⚠️ Warnings: ${warningsCount}` : "";
}

async function registerWarning() {
  const res = await secureFetch(`${API_URL}/api/warning`, {
    method: "POST",
    body: JSON.stringify({
      roll: studentProfile.roll,
      reason: "Syllabus violation"
    })
  });

  if (!res.ok) return;

  const data = await res.json();

  warningsCount = data.warning?.length || warningsCount + 1;
  chatLock = data.warning?.locked || false;

  statusMsg.textContent = warningsCount ? `⚠️ Warnings: ${warningsCount}` : "";
}

// ==================== AI REQUEST ====================
async function askGemini(prompt) {
  const res = await secureFetch(`${API_URL}/api/chat`, {
    method: "POST",
    body: JSON.stringify({
      roll: studentProfile.roll,
      sender: "user",
      message: prompt,
      useGemini: true
    })
  });

  if (!res.ok) {
    const err = await res.json();
    return err.error || "Server error";
  }

  const data = await res.json();
  return data.assistantReply || data.answer || "No response from AI.";
}

// ==================== BACKGROUND ====================
async function applyBackgroundColor() {
  const res = await secureFetch(`${API_URL}/api/student/${studentProfile.roll}`);
  if (!res.ok) return;

  const profile = await res.json();
  document.body.style.background = profile.bgColor || "linear-gradient(135deg, #0077ff, #00d4ff)";
}

bgColorInput?.addEventListener("change", async (e) => {
  const bg = e.target.value;

  await secureFetch(`${API_URL}/api/bgcolor`, {
    method: "POST",
    body: JSON.stringify({ roll: studentProfile.roll, bgColor: bg })
  });

  document.body.style.background = bg;
});

// ==================== SOCKET.IO ====================
function initSocket() {
  if (!studentProfile?.roll) return;

  try {
    socket = io(API_URL, { auth: { token: TOKEN } });

    socket.on("connect", () => console.log("Socket connected"));

    socket.on("warning:updated", (d) => {
      if (d.roll === studentProfile.roll) {
        fetchWarningsAndLock();
        addMessage("bot", "⚠️ A new warning has been issued.");
      }
    });

    socket.on("student:locked", (d) => {
      if (d.roll === studentProfile.roll) {
        chatLock = true;
        addMessage("bot", "⚠️ Chat has been locked.");
      }
    });

    socket.on("student:unlocked", (d) => {
      if (d.roll === studentProfile.roll) {
        chatLock = false;
        addMessage("bot", "✅ Chat has been unlocked.");
      }
    });

    socket.on("chat:new", (chat) => {
      if (chat.roll === studentProfile.roll && chat.sender === "bot") {
        addMessage("bot", chat.message);
      }
    });

  } catch (err) {
    console.warn("Socket not available:", err);
  }
}
