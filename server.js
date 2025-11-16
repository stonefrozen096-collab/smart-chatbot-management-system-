// server.js — Full Student Chatbot Backend (complete)
// ES module style
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import helmet from "helmet";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Joi from "joi";
import morgan from "morgan";
import crypto from "crypto";
import cookieParser from "cookie-parser";
import Redis from "ioredis";

dotenv.config();

/**
 * Required env vars:
 * - MONGO_URI
 * - JWT_ACCESS_SECRET
 * - JWT_REFRESH_SECRET
 * - GEMINI_API_URL (optional)
 * - GEMINI_API_KEY (optional)
 * - REDIS_URL (optional but recommended)
 * - ADMIN_API_KEY (server-only secret recommended)
 * - PORT (optional)
 * - NODE_ENV
 */

const {
  MONGO_URI,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  GEMINI_API_URL,
  GEMINI_API_KEY,
  REDIS_URL,
  ADMIN_API_KEY,
  PORT = 5000,
  NODE_ENV = "development",
} = process.env;

if (!MONGO_URI) {
  console.error("Missing MONGO_URI");
  process.exit(1);
}
if (!JWT_ACCESS_SECRET || !JWT_REFRESH_SECRET) {
  console.error("Missing JWT secrets");
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// ---------------------- Redis (ioredis) ----------------------
let redis = null;
if (REDIS_URL) {
  redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });
  redis.on("connect", () => console.log("✅ Redis connected"));
  redis.on("error", (err) => console.error("Redis error:", err));
} else {
  console.warn("⚠️ REDIS_URL not set — Redis-backed features disabled (use for cross-instance safety).");
}

// ---------------------- Middleware ----------------------
app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => {
      // permissive for development; restrict in production
      cb(null, true);
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(bodyParser.json({ limit: "1mb" }));
app.use(bodyParser.urlencoded({ extended: true }));
if (NODE_ENV !== "production") app.use(morgan("dev"));

// ---------------------- Utility helpers ----------------------
function generateTokenId() {
  return crypto.randomBytes(16).toString("hex");
}
function generateCsrfToken() {
  return crypto.randomBytes(32).toString("hex");
}

// ---------------------- MongoDB ----------------------
await mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// ---------------------- Schemas & Models ----------------------
const { Schema } = mongoose;

const studentSchema = new Schema(
  {
    roll: { type: String, unique: true, required: true, index: true },
    name: String,
    dept: String,
    cls: String,
    passwordHash: { type: String, default: null },
    role: { type: String, enum: ["student", "admin"], default: "student" },
    avatarUrl: { type: String, default: "" },
    bgColor: { type: String, default: "linear-gradient(135deg,#0077ff,#00d4ff)" },
    warningsCount: { type: Number, default: 0 },
    locked: { type: Boolean, default: false },
    lockedUntil: { type: Date, default: null },
    settings: {
      theme: { type: String, enum: ["light", "dark"], default: "light" },
      notifications: { type: Boolean, default: true },
      safeMode: { type: Boolean, default: true },
    },
    refreshTokens: [
      {
        tokenId: String,
        expiresAt: Date,
      },
    ],
  },
  { timestamps: true }
);
studentSchema.methods.verifyPassword = async function (plain) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plain, this.passwordHash);
};
const Student = mongoose.model("Student", studentSchema);

const coursePlanSchema = new Schema({ name: String, uploadedAt: { type: Date, default: Date.now } });
const CoursePlan = mongoose.model("CoursePlan", coursePlanSchema);

const chatHistorySchema = new Schema(
  {
    roll: { type: String, index: true },
    sender: String, // student | assistant | system
    message: String,
    time: String,
    meta: Schema.Types.Mixed,
  },
  { timestamps: true }
);
const ChatHistory = mongoose.model("ChatHistory", chatHistorySchema);

const warningSchema = new Schema(
  {
    roll: { type: String, index: true },
    issuerRoll: String,
    reason: String,
    level: { type: String, enum: ["low", "medium", "high"], default: "low" },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);
const Warning = mongoose.model("Warning", warningSchema);

const lockSchema = new Schema(
  {
    roll: { type: String, index: true },
    reason: String,
    lockedBy: String,
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);
const Lock = mongoose.model("Lock", lockSchema);

// ---------------------- JWT helpers ----------------------
function signAccessToken(student) {
  const payload = { sub: student.roll, role: student.role };
  return jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: "15m" });
}
function signRefreshToken(student, tokenId) {
  const payload = { sub: student.roll, tid: tokenId };
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: "30d" });
}

// ---------------------- Redis-backed rate limiting helpers ----------------------
async function redisRateLimitKeyIncrement(key, windowSec) {
  if (!redis) return { ok: true, count: 0 }; // no redis -> skip enforcement (fallback)
  const now = Date.now();
  const windowKey = `rate:${key}:${Math.floor(now / (windowSec * 1000))}`;
  const count = await redis.incr(windowKey);
  if (count === 1) {
    await redis.expire(windowKey, windowSec);
  }
  return { ok: true, count };
}
function rateLimitRedis({ keyFn, limit, windowSec }) {
  return async (req, res, next) => {
    try {
      const key = keyFn(req);
      if (!key) return next();
      const { count } = await redisRateLimitKeyIncrement(key, windowSec);
      if (redis && count > limit) {
        return res.status(429).json({ error: "Too many requests (rate limited)" });
      }
      next();
    } catch (e) {
      console.error("rateLimitRedis error:", e);
      // if redis fails, allow request (fail-open) but log
      next();
    }
  };
}

// ---------------------- Redis distributed lock helpers ----------------------
async function acquireLock(key, ttlMs = 5000) {
  if (!redis) return null;
  const token = crypto.randomBytes(16).toString("hex");
  const ok = await redis.set(key, token, "PX", ttlMs, "NX");
  if (ok === "OK") return token;
  return null;
}
async function releaseLock(key, token) {
  if (!redis) return false;
  const lua = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  const res = await redis.eval(lua, 1, key, token);
  return res === 1;
}
async function setAccountLockRedis(roll, seconds, reason) {
  if (!redis) return false;
  const key = `account-lock:${roll}`;
  await redis.set(key, reason || "locked", "EX", seconds);
  return true;
}
async function getAccountLockRedis(roll) {
  if (!redis) return null;
  return await redis.get(`account-lock:${roll}`);
}
async function clearAccountLockRedis(roll) {
  if (!redis) return null;
  return await redis.del(`account-lock:${roll}`);
}

// ---------------------- Admin API Key middleware ----------------------
function requireAdminApiKey(req, res, next) {
  // Accept either x-admin-key header or Authorization: Bearer <key>
  const headerKey = req.headers["x-admin-key"];
  const authHeader = req.headers["authorization"];
  let key = headerKey;
  if (!key && authHeader?.startsWith("Bearer ")) {
    key = authHeader.substring(7);
  }
  if (!ADMIN_API_KEY) {
    return res.status(500).json({ error: "ADMIN_API_KEY not configured on server" });
  }
  if (!key || key !== ADMIN_API_KEY) {
    return res.status(403).json({ error: "Invalid Admin API Key" });
  }
  req.admin = { id: "api-key", role: "admin" };
  next();
}

// ---------------------- Authentication middleware ----------------------
async function authenticate(req, res, next) {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing Authorization" });
  const token = auth.substring(7);
  try {
    const payload = jwt.verify(token, JWT_ACCESS_SECRET);
    const student = await Student.findOne({ roll: payload.sub }).select("-passwordHash -refreshTokens").lean();
    if (!student) return res.status(401).json({ error: "User not found" });

    // check DB lock
    if (student.lockedUntil && new Date(student.lockedUntil) > new Date()) {
      return res.status(403).json({ error: "Account locked", lockedUntil: student.lockedUntil });
    }

    // check Redis account lock (cross-instance)
    const redisLock = await getAccountLockRedis(student.roll);
    if (redisLock) {
      return res.status(403).json({ error: "Account locked", reason: redisLock });
    }

    req.student = student;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.student) return res.status(401).json({ error: "Not authenticated" });
  if (req.student.role !== "admin") return res.status(403).json({ error: "Admin only" });
  next();
}

// ---------------------- Socket auth ----------------------
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(); // allow anonymous sockets
    const payload = jwt.verify(token, JWT_ACCESS_SECRET);
    const student = await Student.findOne({ roll: payload.sub }).lean();
    if (!student) return next(new Error("Socket auth failed"));
    socket.__student = { roll: student.roll, role: student.role };
    next();
  } catch (e) {
    next();
  }
});

io.on("connection", (socket) => {
  console.log("🟢 Socket connected:", socket.id, socket.__student?.roll ?? "anonymous");

  socket.on("disconnect", () => console.log("🔴 Socket disconnected:", socket.id));

  socket.on("chat:globalLock", async () => {
    if (socket.__student?.role !== "admin") return socket.emit("error", "Unauthorized");
    // set DB locks and Redis
    await Student.updateMany({}, { $set: { lockedUntil: new Date(Date.now() + 365 * 24 * 3600 * 1000) } });
    if (redis) {
      // set a long central lock so chat endpoints fail faster
      await redis.set("global:locked", "1", "EX", 365 * 24 * 3600);
    }
    io.emit("chat:locked");
  });

  socket.on("chat:globalUnlock", async () => {
    if (socket.__student?.role !== "admin") return socket.emit("error", "Unauthorized");
    await Student.updateMany({}, { $set: { lockedUntil: null } });
    if (redis) {
      await redis.del("global:locked");
    }
    io.emit("chat:unlocked");
  });
});

// ---------------------- Validation schemas ----------------------
const registerSchema = Joi.object({
  roll: Joi.string().required(),
  name: Joi.string().required(),
  dept: Joi.string().required(),
  cls: Joi.string().required(),
  password: Joi.string().min(8).max(128).required(),
});
const loginSchema = Joi.object({ roll: Joi.string().required(), password: Joi.string().required() });

// ---------------------- CSRF (double-submit cookie) ----------------------
function csrfProtect(req, res, next) {
  // Only enforce for "unsafe" methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const cookieToken = req.cookies["csrf_token"];
  const headerToken = req.headers["x-csrf-token"];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }
  next();
}
// Endpoint to get CSRF token (frontend should call this after login or page load)
app.get("/api/csrf-token", (req, res) => {
  const token = generateCsrfToken();
  // double-submit pattern: cookie readable by JS (not httpOnly), you may choose secure/httpOnly flags in prod
  res.cookie("csrf_token", token, {
    httpOnly: false, // must be readable by JS for double-submit
    sameSite: "lax",
    secure: NODE_ENV === "production",
    maxAge: 24 * 3600 * 1000,
  });
  res.json({ csrfToken: token });
});

// ---------------------- Routes ----------------------

// Health
app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Auth: register (CSRF optional for register; we allow because frontend can get token first)
app.post("/api/auth/register", csrfProtect, async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const { roll, name, dept, cls, password } = value;
    const existing = await Student.findOne({ roll });
    if (existing) return res.status(409).json({ error: "Roll already registered" });

    const passwordHash = await bcrypt.hash(password, 12);
    const student = new Student({ roll, name, dept, cls, passwordHash });
    const tokenId = generateTokenId();
    student.refreshTokens.push({ tokenId, expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000) });
    await student.save();

    const accessToken = signAccessToken(student);
    const refreshToken = signRefreshToken(student, tokenId);

    // Set CSRF token cookie (double-submit) after registration as convenience
    const csrfToken = generateCsrfToken();
    res.cookie("csrf_token", csrfToken, {
      httpOnly: false,
      sameSite: "lax",
      secure: NODE_ENV === "production",
    });

    res.status(201).json({
      accessToken,
      refreshToken,
      csrfToken,
      student: { roll: student.roll, name: student.name, dept: student.dept, cls: student.cls },
    });
  } catch (err) {
    console.error("register error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Auth: login
app.post("/api/auth/login", csrfProtect, async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const { roll, password } = value;
    const student = await Student.findOne({ roll });
    if (!student) return res.status(401).json({ error: "Invalid credentials" });

    // DB lock
    if (student.lockedUntil && new Date(student.lockedUntil) > new Date()) {
      return res.status(403).json({ error: "Account is locked", lockedUntil: student.lockedUntil });
    }
    // Redis lock
    const redisLock = await getAccountLockRedis(roll);
    if (redisLock) return res.status(403).json({ error: "Account locked", reason: redisLock });

    const ok = await student.verifyPassword(password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    // rotate refresh token
    const tokenId = generateTokenId();
    student.refreshTokens.push({ tokenId, expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000) });
    if (student.refreshTokens.length > 10) student.refreshTokens = student.refreshTokens.slice(-10);
    await student.save();

    const accessToken = signAccessToken(student);
    const refreshToken = signRefreshToken(student, tokenId);

    // set CSRF double-submit cookie (frontend should also store token)
    const csrfToken = generateCsrfToken();
    res.cookie("csrf_token", csrfToken, {
      httpOnly: false,
      sameSite: "lax",
      secure: NODE_ENV === "production",
    });

    res.json({
      accessToken,
      refreshToken,
      csrfToken,
      student: { roll: student.roll, name: student.name, dept: student.dept, cls: student.cls, role: student.role },
    });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Auth refresh
app.post("/api/auth/refresh", csrfProtect, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: "Missing refresh token" });

    let payload;
    try {
      payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const student = await Student.findOne({ roll: payload.sub });
    if (!student) return res.status(401).json({ error: "User not found" });

    const tokenRecord = student.refreshTokens.find((t) => t.tokenId === payload.tid);
    if (!tokenRecord || new Date(tokenRecord.expiresAt) < new Date()) {
      return res.status(401).json({ error: "Refresh token revoked or expired" });
    }

    // rotate refresh token
    student.refreshTokens = student.refreshTokens.filter((t) => t.tokenId !== payload.tid);
    const newTokenId = generateTokenId();
    student.refreshTokens.push({ tokenId: newTokenId, expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000) });
    await student.save();

    const newAccess = signAccessToken(student);
    const newRefresh = signRefreshToken(student, newTokenId);

    // refresh CSRF cookie
    const csrfToken = generateCsrfToken();
    res.cookie("csrf_token", csrfToken, {
      httpOnly: false,
      sameSite: "lax",
      secure: NODE_ENV === "production",
    });

    res.json({ accessToken: newAccess, refreshToken: newRefresh, csrfToken });
  } catch (err) {
    console.error("refresh error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Auth logout
app.post("/api/auth/logout", authenticate, csrfProtect, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: "Missing refresh token" });

    let payload;
    try {
      payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (err) {
      return res.json({ ok: true });
    }

    await Student.updateOne({ roll: payload.sub }, { $pull: { refreshTokens: { tokenId: payload.tid } } });
    // clear csrf cookie for safety
    res.clearCookie("csrf_token");
    res.json({ ok: true });
  } catch (err) {
    console.error("logout error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------------- Student profile endpoints ----------------------
app.post("/api/student", authenticate, csrfProtect, async (req, res) => {
  try {
    const { roll, name, dept, cls } = req.body;
    if (!roll || !name || !dept || !cls) return res.status(400).json({ error: "Missing fields" });

    if (req.student.role !== "admin" && req.student.roll !== roll) {
      return res.status(403).json({ error: "Forbidden" });
    }

    let student = await Student.findOne({ roll });
    if (student) {
      student.name = name;
      student.dept = dept;
      student.cls = cls;
      await student.save();
    } else {
      const studentObj = new Student({ roll, name, dept, cls });
      await studentObj.save();
      student = studentObj;
    }

    res.json({
      roll: student.roll,
      name: student.name,
      dept: student.dept,
      cls: student.cls,
      settings: student.settings,
      bgColor: student.bgColor,
    });
  } catch (err) {
    console.error("student create/update error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/student/:roll", authenticate, csrfProtect, async (req, res) => {
  try {
    const requested = req.params.roll;
    if (req.student.role !== "admin" && req.student.roll !== requested) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const student = await Student.findOne({ roll: requested }).select("-passwordHash -refreshTokens");
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json(student);
  } catch (err) {
    console.error("get student error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/bgcolor", authenticate, csrfProtect, async (req, res) => {
  try {
    const { roll, bgColor } = req.body;
    if (!roll || !bgColor) return res.status(400).json({ error: "Missing fields" });

    if (req.student.role !== "admin" && req.student.roll !== roll) return res.status(403).json({ error: "Forbidden" });

    const student = await Student.findOne({ roll });
    if (!student) return res.status(404).json({ error: "Student not found" });
    student.bgColor = bgColor;
    await student.save();
    res.json(student);
  } catch (err) {
    console.error("bgcolor error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/me/settings", authenticate, csrfProtect, async (req, res) => {
  try {
    const schema = Joi.object({
      theme: Joi.string().valid("light", "dark").optional(),
      notifications: Joi.boolean().optional(),
      safeMode: Joi.boolean().optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const student = await Student.findOne({ roll: req.student.roll });
    if (!student) return res.status(404).json({ error: "Student not found" });

    student.settings = { ...student.settings, ...value };
    await student.save();
    res.json(student);
  } catch (err) {
    console.error("settings update error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------------- Course Plans ----------------------
app.post("/api/course-plan", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "File name required" });

    const plan = new CoursePlan({ name });
    await plan.save();
    io.emit("coursePlan:updated", plan);
    res.json(plan);
  } catch (err) {
    console.error("course plan error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/course-plan", authenticate, csrfProtect, async (req, res) => {
  try {
    const plans = await CoursePlan.find().sort({ uploadedAt: -1 }).limit(200);
    res.json(plans);
  } catch (err) {
    console.error("course plan list error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------------- Chat (Redis-backed limiter) ----------------------
const chatLimiter = rateLimitRedis({
  keyFn: (req) => {
    // prefer user roll for per-user limit if available; otherwise IP
    try {
      const bodyRoll = req.body?.roll;
      return bodyRoll || req.ip;
    } catch {
      return req.ip;
    }
  },
  limit: 20,
  windowSec: 20,
});

app.post("/api/chat", authenticate, csrfProtect, chatLimiter, async (req, res) => {
  try {
    const schema = Joi.object({
      roll: Joi.string().required(),
      sender: Joi.string().required(),
      message: Joi.string().max(4000).required(),
      useGemini: Joi.boolean().optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    if (req.student.role !== "admin" && req.student.roll !== value.roll) return res.status(403).json({ error: "Forbidden" });

    const student = await Student.findOne({ roll: value.roll });
    if (!student) return res.status(404).json({ error: "Student not found" });

    // Check Redis account lock (stronger/faster)
    const rLock = await getAccountLockRedis(value.roll);
    if (rLock) return res.status(403).json({ error: "Account locked", reason: rLock });

    if (student.lockedUntil && new Date(student.lockedUntil) > new Date()) {
      return res.status(403).json({ error: "Account locked", lockedUntil: student.lockedUntil });
    }

    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const chat = new ChatHistory({ roll: value.roll, sender: value.sender, message: value.message, time });
    await chat.save();
    io.emit("chat:new", chat);

    if (value.useGemini) {
      try {
        const reply = await callGemini(value.message, { userRoll: value.roll });
        const assistant = new ChatHistory({
          roll: value.roll,
          sender: "assistant",
          message: reply,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
        await assistant.save();
        io.emit("chat:new", assistant);
        return res.json({ assistantReply: reply, chat });
      } catch (err) {
        console.error("Gemini call failed:", err);
        return res.status(502).json({ error: "Upstream AI error" });
      }
    }

    res.status(201).json(chat);
  } catch (err) {
    console.error("chat post error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/chat/:roll", authenticate, csrfProtect, async (req, res) => {
  try {
    const target = req.params.roll;
    if (req.student.role !== "admin" && req.student.roll !== target) return res.status(403).json({ error: "Forbidden" });

    const history = await ChatHistory.find({ roll: target }).sort({ createdAt: -1 }).limit(500);
    res.json(history);
  } catch (err) {
    console.error("get chat error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------------- Warnings & Locks (admin) ----------------------
app.post("/api/warning", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const schema = Joi.object({
      roll: Joi.string().required(),
      reason: Joi.string().required(),
      level: Joi.string().valid("low", "medium", "high").default("low"),
      expiresAt: Joi.date().optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const student = await Student.findOne({ roll: value.roll });
    if (!student) return res.status(404).json({ error: "Student not found" });

    student.warningsCount += 1;
    const warning = new Warning({ roll: value.roll, issuerRoll: req.student.roll, reason: value.reason, level: value.level, expiresAt: value.expiresAt });
    await warning.save();

    if (student.warningsCount >= 3) {
      student.lockedUntil = new Date(Date.now() + 24 * 3600 * 1000);
      student.warningsCount = 0;
      const lockRecord = new Lock({ roll: student.roll, reason: "auto-lock after warnings", lockedBy: req.student.roll, expiresAt: student.lockedUntil });
      await lockRecord.save();
      // Also set Redis lock (24h)
      if (redis) await setAccountLockRedis(student.roll, 24 * 3600, "auto-lock after warnings");
    }

    await student.save();
    io.emit("warning:updated", { roll: student.roll, warnings: student.warningsCount, lockedUntil: student.lockedUntil });
    res.status(201).json({ ok: true, warning });
  } catch (err) {
    console.error("warning error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/admin/warnings/:roll", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const warnings = await Warning.find({ roll: req.params.roll }).sort({ createdAt: -1 }).limit(200);
    res.json(warnings);
  } catch (err) {
    console.error("list warnings error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// explicit lock/unlock endpoints
app.post("/api/admin/lock", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const schema = Joi.object({
      roll: Joi.string().required(),
      reason: Joi.string().required(),
      seconds: Joi.number().integer().min(1).max(60 * 60 * 24 * 365).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const student = await Student.findOne({ roll: value.roll });
    if (!student) return res.status(404).json({ error: "Student not found" });

    const expiresAt = new Date(Date.now() + value.seconds * 1000);
    student.lockedUntil = expiresAt;
    await student.save();

    const lock = new Lock({ roll: value.roll, reason: value.reason, lockedBy: req.student.roll, expiresAt });
    await lock.save();

    // set redis lock
    if (redis) await setAccountLockRedis(value.roll, value.seconds, value.reason);

    io.emit("student:locked", { roll: value.roll, expiresAt });
    res.json({ ok: true, lock });
  } catch (err) {
    console.error("admin lock error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/admin/unlock", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const schema = Joi.object({ roll: Joi.string().required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    await Student.updateOne({ roll: value.roll }, { $set: { lockedUntil: null, warningsCount: 0 } });
    const unlockRecord = new Lock({ roll: value.roll, reason: "manual-unlock", lockedBy: req.student.roll, expiresAt: new Date() });
    await unlockRecord.save();
    if (redis) await clearAccountLockRedis(value.roll);

    io.emit("student:unlocked", { roll: value.roll });
    res.json({ ok: true });
  } catch (err) {
    console.error("admin unlock error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: list students
app.get("/api/admin/students", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const perPage = Math.min(200, parseInt(req.query.perPage || "50", 10));
    const students = await Student.find().skip((page - 1) * perPage).limit(perPage).select("-passwordHash -refreshTokens");
    res.json(students);
  } catch (err) {
    console.error("admin students error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin ops via API key (server-to-server)
app.post("/api/ops/global-lock", requireAdminApiKey, async (req, res) => {
  try {
    await Student.updateMany({}, { $set: { lockedUntil: new Date(Date.now() + 365 * 24 * 3600 * 1000) } });
    if (redis) await redis.set("global:locked", "1", "EX", 365 * 24 * 3600);
    io.emit("chat:locked");
    res.json({ ok: true });
  } catch (err) {
    console.error("global lock error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------------- Gemini integration ----------------------
async function callGemini(prompt, opts = {}) {
  if (!GEMINI_API_URL) throw new Error("Gemini API URL not configured");
  const url = `${GEMINI_API_URL.replace(/\/$/, "")}/ask`;
  const body = { prompt, user: opts.userRoll || "anonymous" };
  const headers = { "Content-Type": "application/json" };
  if (GEMINI_API_KEY) headers["Authorization"] = `Bearer ${GEMINI_API_KEY}`;

  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Gemini API error: ${r.status} ${t}`);
  }
  const json = await r.json();
  if (typeof json.answer === "string") return json.answer;
  if (json.output) return json.output;
  if (json.choices?.[0]?.text) return json.choices[0].text;
  return JSON.stringify(json);
}

app.post("/api/gemini", authenticate, csrfProtect, async (req, res) => {
  try {
    const schema = Joi.object({ prompt: Joi.string().required(), maxTokens: Joi.number().optional() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const student = await Student.findOne({ roll: req.student.roll });
    if (!student) return res.status(404).json({ error: "Student not found" });

    // Optional: enforce safeMode or additional throttling here

    const reply = await callGemini(value.prompt, { userRoll: student.roll });
    const assistantChat = new ChatHistory({
      roll: student.roll,
      sender: "assistant",
      message: reply,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
    await assistantChat.save();
    io.emit("chat:new", assistantChat);
    res.json({ answer: reply });
  } catch (err) {
    console.error("gemini route error:", err);
    res.status(502).json({ error: "Failed to fetch from Gemini AI" });
  }
});

// ---------------------- Error handling ----------------------
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (err && err.code === "EBADCSRFTOKEN") {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }
  res.status(500).json({ error: "Internal server error" });
});

// ---------------------- Start server ----------------------
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  if (!ADMIN_API_KEY) console.warn("⚠️ ADMIN_API_KEY not set — admin-key routes disabled.");
  if (!REDIS_URL) console.warn("⚠️ REDIS_URL not set — Redis-backed features disabled.");
});
