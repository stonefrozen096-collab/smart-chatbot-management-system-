// ==================== CONFIG ====================
const API_URL = ""; // Render environment variable for Gemini API can be used here

// ==================== DOM ELEMENTS ====================
const profileSection = document.getElementById("profileSection");
const chatSection = document.getElementById("chatSection");
const chatBox = document.getElementById("chatBox");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const profileBtn = document.getElementById("profileBtn");
const statusMsg = document.getElementById("statusMsg");

// ==================== INITIAL CHECK ====================
let studentProfile = JSON.parse(localStorage.getItem("studentProfile")) || null;
let chatLock = false; // global lock
let warnings = JSON.parse(localStorage.getItem("warnings")) || {};

if (!studentProfile) {
  profileSection.style.display = "flex";
  chatSection.style.display = "none";
  statusMsg.textContent = "Please fill your profile first!";
} else {
  profileSection.style.display = "none";
  chatSection.style.display = "flex";
  statusMsg.textContent = "";
  applyBackgroundColor();
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
});

// ==================== CHAT SEND ====================
sendBtn.addEventListener("click", async () => {
  const message = chatInput.value.trim();
  if (!message) return;

  if (chatLock) {
    alert("⚠️ Chat is currently locked!");
    return;
  }

  addMessage("user", message);
  chatInput.value = "";

  // Check for syllabus-only questions (dummy logic)
  if (!isValidSyllabusQuery(message)) {
    registerWarning();
    addMessage("bot", "⚠️ You are only allowed to ask syllabus-related questions.");
    return;
  }

  // Call Gemini API
  const response = await askGemini(message);
  addMessage("bot", response);
});

// ==================== MESSAGE FUNCTIONS ====================
function addMessage(sender, text) {
  const div = document.createElement("div");
  div.className = "message " + (sender === "user" ? "userMsg" : "botMsg");
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ==================== SYLLABUS CHECK ====================
function isValidSyllabusQuery(text) {
  // Example dummy check: only allow "course" or "syllabus" keyword
  text = text.toLowerCase();
  return text.includes("course") || text.includes("syllabus");
}

// ==================== WARNINGS / AUTO-LOCK ====================
function registerWarning() {
  const key = studentProfile.roll;
  warnings[key] = (warnings[key] || 0) + 1;
  localStorage.setItem("warnings", JSON.stringify(warnings));

  // Auto-lock after 3 violations
  if (warnings[key] >= 3) {
    chatLock = true;
    alert("⚠️ You have been auto-locked due to repeated violations.");
  }
}

// ==================== GEMINI API CALL ====================
async function askGemini(prompt) {
  try {
    const res = await fetch(`${API_URL}/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Authorization: `Bearer ${API_KEY}` // Set API key in Render
      },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    return data.answer || "No response from chatbot.";
  } catch (err) {
    return "Error connecting to chatbot server.";
  }
}

// ==================== BACKGROUND COLOR ====================
function applyBackgroundColor() {
  // Load color from admin-set localStorage or default
  const bgColor = localStorage.getItem("chatBGColor") || "linear-gradient(135deg, #0077ff, #00d4ff)";
  document.body.style.background = bgColor;
}

// ==================== ADMIN FUNCTIONS (for testing) ====================
// You can call these from admin.js later
function setGlobalLock(state) {
  chatLock = state;
}

function setChatBGColor(color) {
  localStorage.setItem("chatBGColor", color);
  applyBackgroundColor();
}
