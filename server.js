// server.js — Full Student Chatbot Backend with Gemini AI
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import bodyParser from "body-parser";
import fetch from "node-fetch";

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// ================== MIDDLEWARE ==================
app.use(cors());
app.use(bodyParser.json());

// ================== MONGO ==================
const DB_URI = process.env.MONGO_URI || "mongodb://localhost:27017/student_chatbot";
mongoose
  .connect(DB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err.message));

// ================== SCHEMAS ==================
const studentSchema = new mongoose.Schema({
  roll: { type: String, unique: true },
  name: String,
  dept: String,
  cls: String,
  warnings: { type: Number, default: 0 },
  locked: { type: Boolean, default: false },
  bgColor: { type: String, default: "linear-gradient(135deg, #0077ff, #00d4ff)" },
});

const coursePlanSchema = new mongoose.Schema({
  name: String,
  uploadedAt: { type: Date, default: Date.now },
});

const chatHistorySchema = new mongoose.Schema({
  roll: String,
  sender: String,
  message: String,
  time: String,
});

const Student = mongoose.model("Student", studentSchema);
const CoursePlan = mongoose.model("CoursePlan", coursePlanSchema);
const ChatHistory = mongoose.model("ChatHistory", chatHistorySchema);

// ================== SOCKET.IO ==================
io.on("connection", (socket) => {
  console.log("🟢 Socket connected:", socket.id);

  socket.on("disconnect", () => console.log("🔴 Socket disconnected:", socket.id));

  // Admin can send global lock/unlock
  socket.on("chat:globalLock", async () => {
    await Student.updateMany({}, { locked: true });
    io.emit("chat:locked");
  });

  socket.on("chat:globalUnlock", async () => {
    await Student.updateMany({}, { locked: false });
    io.emit("chat:unlocked");
  });
});

// ================== ROUTES ==================

// --- Health ---
app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// --- Student Profile ---
app.post("/api/student", async (req, res) => {
  const { roll, name, dept, cls } = req.body;
  if (!roll || !name || !dept || !cls) return res.status(400).json({ error: "Missing fields" });

  let student = await Student.findOne({ roll });
  if (student) {
    student.name = name;
    student.dept = dept;
    student.cls = cls;
    await student.save();
  } else {
    student = new Student({ roll, name, dept, cls });
    await student.save();
  }

  res.json(student);
});

app.get("/api/student/:roll", async (req, res) => {
  const student = await Student.findOne({ roll: req.params.roll });
  if (!student) return res.status(404).json({ error: "Student not found" });
  res.json(student);
});

// --- Background Color ---
app.post("/api/bgcolor", async (req, res) => {
  const { roll, bgColor } = req.body;
  const student = await Student.findOne({ roll });
  if (!student) return res.status(404).json({ error: "Student not found" });
  student.bgColor = bgColor;
  await student.save();
  res.json(student);
});

// --- Course Plans ---
app.post("/api/course-plan", async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "File name required" });
  const plan = new CoursePlan({ name });
  await plan.save();
  io.emit("coursePlan:updated", plan);
  res.json(plan);
});

app.get("/api/course-plan", async (req, res) => {
  const plans = await CoursePlan.find();
  res.json(plans);
});

// --- Chat History ---
app.post("/api/chat", async (req, res) => {
  const { roll, sender, message } = req.body;
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const chat = new ChatHistory({ roll, sender, message, time });
  await chat.save();
  io.emit("chat:new", chat);
  res.json(chat);
});

app.get("/api/chat/:roll", async (req, res) => {
  const history = await ChatHistory.find({ roll });
  res.json(history);
});

// --- Warnings & Auto-lock ---
app.post("/api/warning", async (req, res) => {
  const { roll } = req.body;
  const student = await Student.findOne({ roll });
  if (!student) return res.status(404).json({ error: "Student not found" });

  student.warnings += 1;
  if (student.warnings >= 3) student.locked = true;
  await student.save();

  io.emit("warning:updated", { roll, warnings: student.warnings, locked: student.locked });
  res.json(student);
});

// --- Gemini AI Endpoint ---
app.post("/api/gemini", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt required" });

  try {
    const API_URL = process.env.GEMINI_API_URL || "";
    if (!API_URL) return res.status(500).json({ error: "Gemini API not configured" });

    const response = await fetch(`${API_URL}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    const data = await response.json();
    res.json({ answer: data.answer || "No response from Gemini AI" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch from Gemini AI" });
  }
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
