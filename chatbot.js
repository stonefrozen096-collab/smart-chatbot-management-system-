// ==================== CONFIG ====================
const API_URL = ""; // Set your Render Gemini API environment variable here

// ==================== DOM ELEMENTS ====================
const profileSection = document.getElementById("profileSection");
const chatSection = document.getElementById("chatSection");
const chatBox = document.getElementById("chatBox");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const profileBtn = document.getElementById("profileBtn");
const statusMsg = document.getElementById("statusMsg");

// Optional: student controls
const bgColorInput = document.getElementById("bgColorInput");
const resetProfileBtn = document.getElementById("resetProfileBtn");
const clearChatBtn = document.getElementById("clearChatBtn");
const studentInfoDiv = document.getElementById("studentInfo");

// ==================== INITIAL CHECK ====================
let studentProfile = JSON.parse(localStorage.getItem("studentProfile")) || null;
let chatLock = false; // global lock
let warnings = JSON.parse(localStorage.getItem("warnings")) || {};

// Show profile form if not filled
if (!studentProfile) {
  profileSection.style.display = "flex";
  chatSection.style.display = "none";
  statusMsg.textContent = "Please fill your profile first!";
} else {
  profileSection.style.display = "none";
  chatSection.style.display = "flex";
  statusMsg.textContent = "";
  displayStudentInfo();
  applyBackgroundColor();
  displayWarningsCount();
  loadChatHistory();
}

// ==================== LOAD PROFILE ====================
function loadProfile() {
  if (!studentProfile) return;
  document.getElementById("studentName").value = studentProfile.name;
  document.getElementById("studentRoll").value = studentProfile.roll;
  document.getElementById("studentDept").value = studentProfile.dept;
  document.getElementById("studentClass").value = studentProfile.cls;
}

// ==================== PROFILE SAVE ====================
profileBtn.addEventListener("click", () => {
  const name = document.getElementById("studentName").value.trim();
  const roll = document.getElementById("studentRoll").value.trim();
  const dept = document.getElementById("studentDept").value;
  const cls = document.getElementById("studentClass").value;

  if (!name || !roll || !dept || !cls) {
    alert("All fields are required!");
    return;
  }

  studentProfile = { name, roll, dept, cls };
  localStorage.setItem("studentProfile", JSON.stringify(studentProfile));

  profileSection.style.display = "none";
  chatSection.style.display = "flex";
  statusMsg.textContent = "";
  displayStudentInfo();
  displayWarningsCount();
  loadChatHistory();
});

// ==================== DISPLAY STUDENT INFO ====================
function displayStudentInfo() {
  if (!studentInfoDiv || !studentProfile) return;
  studentInfoDiv.innerHTML = `
    <strong>${studentProfile.name}</strong> | Roll: ${studentProfile.roll} | Dept: ${studentProfile.dept} | Class: ${studentProfile.cls}
  `;
}

// ==================== CHAT SEND ====================
sendBtn.addEventListener("click", async () => {
  const message = chatInput.value.trim();
  if (!message) return;

  if (chatLock || checkSpecificLock()) {
    alert("⚠️ Chat is currently locked!");
    return;
  }

  addMessage("user", message);
  chatInput.value = "";

  if (!isValidSyllabusQuery(message)) {
    registerWarning();
    addMessage("bot", "⚠️ You are only allowed to ask syllabus-related questions.");
    displayWarningsCount();
    return;
  }

  const response = await askGemini(message);
  addMessage("bot", response);
});

// ==================== ADD MESSAGE ====================
function addMessage(sender, text) {
  const div = document.createElement("div");
  div.className = "message " + (sender === "user" ? "userMsg" : "botMsg");
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' });
  div.innerHTML = `<strong>[${sender === "user" ? "You" : "Bot"} - ${time}]</strong>: ${text}`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;

  // Save chat history
  let history = JSON.parse(localStorage.getItem("chatHistory") || "[]");
  history.push({ sender, text, time });
  localStorage.setItem("chatHistory", JSON.stringify(history));
}

// ==================== SYLLABUS CHECK ====================
function isValidSyllabusQuery(text) {
  const allowedKeywords = JSON.parse(localStorage.getItem("syllabusKeywords") || '["course","syllabus"]');
  return allowedKeywords.some(k => text.toLowerCase().includes(k));
}

// ==================== WARNINGS / AUTO-LOCK ====================
function registerWarning() {
  const key = studentProfile.roll;
  warnings[key] = (warnings[key] || 0) + 1;
  localStorage.setItem("warnings", JSON.stringify(warnings));

  // Auto-lock after 3 violations (or admin setting)
  const autoLockSetting = localStorage.getItem("autoLock") || "After 3 violations";
  const threshold = autoLockSetting.includes("5") ? 5 : 3;

  if (warnings[key] >= threshold) {
    chatLock = true;
    alert("⚠️ You have been auto-locked due to repeated violations.");
  }
}

function displayWarningsCount() {
  if (!studentProfile) return;
  const key = studentProfile.roll;
  const count = warnings[key] || 0;
  statusMsg.textContent = count ? `⚠️ Warnings: ${count}` : "";
}

// ==================== GLOBAL & SPECIFIC LOCK ====================
function checkSpecificLock() {
  const lock = JSON.parse(localStorage.getItem("specificLock") || "{}");
  if (!lock.department) return false;
  if (lock.student === studentProfile.roll) return true;
  if (lock.class === studentProfile.cls && lock.department === studentProfile.dept) return true;
  return false;
}

function setGlobalLock(state) {
  chatLock = state;
}

// ==================== GEMINI API ====================
async function askGemini(prompt) {
  try {
    const res = await fetch(`${API_URL}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    return data.answer || "No response from chatbot.";
  } catch (err) {
    return "Error connecting to chatbot server.";
  }
}

// ==================== BACKGROUND COLOR ====================
function applyBackgroundColor() {
  const bgColor = localStorage.getItem("chatBGColor") || "linear-gradient(135deg, #0077ff, #00d4ff)";
  document.body.style.background = bgColor;
}

bgColorInput?.addEventListener("change", (e) => {
  localStorage.setItem("chatBGColor", e.target.value);
  applyBackgroundColor();
});

// ==================== CHAT HISTORY ====================
function loadChatHistory() {
  const history = JSON.parse(localStorage.getItem("chatHistory") || "[]");
  history.forEach(m => addMessage(m.sender, m.text));
}

// ==================== RESET PROFILE / CLEAR CHAT ====================
resetProfileBtn?.addEventListener("click", () => {
  localStorage.removeItem("studentProfile");
  localStorage.removeItem("chatHistory");
  location.reload();
});

clearChatBtn?.addEventListener("click", () => {
  localStorage.removeItem("chatHistory");
  chatBox.innerHTML = "";
});

// ==================== INIT ====================
window.onload = () => {
  loadProfile();
  applyBackgroundColor();
  loadChatHistory();
  displayWarningsCount();
  displayStudentInfo();
};
