
// server.js — Full Student Chatbot Backend (final merged + enhancements)
// ES module style
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import fetch from "node-fetch";
import helmet from "helmet";
import bcrypt from "bcryptjs";
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

let redis;

if (process.env.REDIS_URL) {
  if (!global.redis) { // Check if Redis is already initialized globally
    global.redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
    global.redis.on("connect", () => console.log("✅ Redis connected"));
    global.redis.on("error", (err) => console.error("❌ Redis error:", err));
  }
  redis = global.redis;
} else {
  console.warn("⚠️ REDIS_URL not set — Redis-backed features disabled.");
}

export { redis };

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
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
if (NODE_ENV !== "production") app.use(morgan("dev"));

// Serve static files (HTML, CSS, JS)
app.use(express.static(".", { extensions: ["html"] }));

// ---------------------- Utility helpers ----------------------
function generateTokenId() {
  return crypto.randomBytes(16).toString("hex");
}
function generateCsrfToken() {
  return crypto.randomBytes(32).toString("hex");
}

const isProd = NODE_ENV === "production";
const csrfCookieOptions = {
  httpOnly: false,
  sameSite: isProd ? "none" : "lax",
  secure: isProd,
  maxAge: 24 * 3600 * 1000,
};

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
    email: { type: String, default: "" },
    passwordHash: { type: String, default: null },
    role: { type: String, enum: ["student", "admin"], default: "student" },
    avatarUrl: { type: String, default: "" },
    bgColor: { type: String, default: "linear-gradient(135deg,#0077ff,#00d4ff)" },
    warningsCount: { type: Number, default: 0 },
    locked: { type: Boolean, default: false },
    lockedUntil: { type: Date, default: null },
    chatbotLocked: { type: Boolean, default: false },
    chatbotLockedUntil: { type: Date, default: null },
    chatbotLockReason: { type: String, default: "" },
    verified: { type: Boolean, default: false },
    verifiedBadge: {
      isActive: { type: Boolean, default: false },
      grantedAt: Date,
      grantedBy: String,
    },
    settings: {
      type: {
        theme: { type: String, enum: ["light", "dark"], default: "light" },
        notifications: { type: Boolean, default: true },
        safeMode: { type: Boolean, default: true },
        fontSize: { type: String, enum: ["small", "medium", "large"], default: "medium" },
        cosmetics: {
          type: {
            avatarBorder: { type: String, default: "" },
            nameStyle: { type: String, default: "" },
            chatBubbleColor: { type: String, default: "" },
            chatColor: { type: String, default: "" },
            backgroundUrl: { type: String, default: "" },
            badges: { type: [String], default: [] },
            animatedNameEffect: { type: String, default: "" },
            animatedBorder: { type: String, default: "" },
            titleEffect: { type: String, default: "" },
          },
          default: () => ({
            avatarBorder: "",
            nameStyle: "",
            chatBubbleColor: "",
            chatColor: "",
            backgroundUrl: "",
            badges: [],
            animatedNameEffect: "",
            animatedBorder: "",
            titleEffect: "",
          }),
        },
        unlocked: {
          type: {
            avatarBorders: { type: [String], default: [] },
            nameStyles: { type: [String], default: [] },
            chatColors: { type: [String], default: [] },
            backgrounds: { type: [String], default: [] },
            badges: { type: [String], default: [] },
            animatedNameEffects: { type: [String], default: [] },
            animatedBorders: { type: [String], default: [] },
            titleEffects: { type: [String], default: [] },
          },
          default: () => ({
            avatarBorders: [],
            nameStyles: [],
            chatColors: [],
            backgrounds: [],
            badges: [],
            animatedNameEffects: [],
            animatedBorders: [],
            titleEffects: [],
          }),
        },
      },
      default: () => ({
        theme: "light",
        notifications: true,
        safeMode: true,
        fontSize: "medium",
        cosmetics: {
          avatarBorder: "",
          nameStyle: "",
          chatBubbleColor: "",
          chatColor: "",
          backgroundUrl: "",
          badges: [],
          animatedNameEffect: "",
          animatedBorder: "",
          titleEffect: "",
        },
        unlocked: {
          avatarBorders: [],
          nameStyles: [],
          chatColors: [],
          backgrounds: [],
          badges: [],
          animatedNameEffects: [],
          animatedBorders: [],
          titleEffects: [],
        },
      }),
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

// Pre-save hook to ensure settings are properly initialized
studentSchema.pre('save', function(next) {
  if (!this.settings) {
    this.settings = {};
  }
  if (!this.settings.cosmetics) {
    this.settings.cosmetics = {
      avatarBorder: "",
      nameStyle: "",
      chatBubbleColor: "",
      chatColor: "",
      backgroundUrl: "",
      badges: [],
      animatedNameEffect: "",
      animatedBorder: "",
      titleEffect: "",
    };
  }
  if (!this.settings.unlocked) {
    this.settings.unlocked = {
      avatarBorders: [],
      nameStyles: [],
      chatColors: [],
      backgrounds: [],
      badges: [],
      animatedNameEffects: [],
      animatedBorders: [],
      titleEffects: [],
    };
  }
  next();
});

studentSchema.methods.verifyPassword = async function (plain) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plain, this.passwordHash);
};
const Student = mongoose.model("Student", studentSchema);

const coursePlanSchema = new Schema({ 
  name: String, 
  content: { type: String, default: '' }, // Base64 encoded PDF or text content
  uploadedAt: { type: Date, default: Date.now } 
});
const CoursePlan = mongoose.model("CoursePlan", coursePlanSchema);

const appConfigSchema = new Schema({
  key: { type: String, unique: true },
  coursePlanDisabled: { type: Boolean, default: false },
  promptTopics: { type: String, default: "" },
});
const AppConfig = mongoose.model("AppConfig", appConfigSchema);

async function getAppConfig() {
  let cfg = await AppConfig.findOne({ key: "global" });
  if (!cfg) {
    cfg = new AppConfig({ key: "global" });
    await cfg.save();
  }
  return cfg;
}

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

// Notices model
const noticeSchema = new Schema(
  {
    title: String,
    body: String,
    createdBy: String,
    urgent: { type: Boolean, default: false },
  },
  { timestamps: true }
);
const Notice = mongoose.model("Notice", noticeSchema);

// Appeals model
const appealSchema = new Schema(
  {
    roll: { type: String, index: true },
    lockId: { type: Schema.Types.ObjectId, ref: "Lock", default: null },
    message: String,
    status: { type: String, enum: ["open", "in-review", "closed"], default: "open" },
    adminResponse: { type: String, default: "" },
  },
  { timestamps: true }
);
const Appeal = mongoose.model("Appeal", appealSchema);

// SystemMessage model for automated messages
const systemMessageSchema = new Schema(
  {
    recipientRoll: { type: String, index: true },
    title: String,
    content: String,
    type: { type: String, enum: ["info", "warning", "alert", "system", "broadcast"], default: "info" },
    isRead: { type: Boolean, default: false },
    scheduledFor: { type: Date, default: null },
    trigger: { type: String, enum: ["manual", "locked", "warned", "auto-scheduled"], default: "manual" },
    sentAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);
const SystemMessage = mongoose.model("SystemMessage", systemMessageSchema);

// MessageTemplate model for predefined messages
const messageTemplateSchema = new Schema(
  {
    name: String,
    title: String,
    content: String,
    type: { type: String, enum: ["info", "warning", "alert"], default: "info" },
    category: { type: String, enum: ["system", "academic", "conduct", "custom"], default: "custom" },
  },
  { timestamps: true }
);
const MessageTemplate = mongoose.model("MessageTemplate", messageTemplateSchema);

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
  email: Joi.string().email().optional().allow(""),
  role: Joi.string().valid("student", "admin").default("student"),
  password: Joi.string().min(8).max(128).required(),
}).unknown(false);
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
  res.cookie("csrf_token", token, csrfCookieOptions);
  res.json({ csrfToken: token });
});

// ---------------------- Health & Auth ----------------------
app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Root route
app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "." });
});

// Auth: register
app.post("/api/auth/register", csrfProtect, async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const { roll, name, dept, cls, email, password, role = "student" } = value;
    const existing = await Student.findOne({ roll });
    if (existing) return res.status(409).json({ error: "Roll already registered" });

    const passwordHash = await bcrypt.hash(password, 12);
    const student = new Student({ roll, name, dept, cls, role, email: email || "", passwordHash });
    await student.save();

    // Use an atomic update to add refresh token (avoid VersionError)
    const tokenId = generateTokenId();
    await Student.updateOne(
      { _id: student._id },
      {
        $push: {
          refreshTokens: {
            tokenId,
            expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000)
          }
        }
      }
    );

    const accessToken = signAccessToken(student);
    const refreshToken = signRefreshToken(student, tokenId);

    // create and set csrf token cookie (double-submit)
    const csrfToken = generateCsrfToken();
    res.cookie("csrf_token", csrfToken, csrfCookieOptions);

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
app.post("/api/auth/login", async (req, res) => {
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

    // Password check
    const ok = await student.verifyPassword(password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    // ===== FIX 1: SAFE refresh token update (atomic) =====
    const tokenId = generateTokenId();
    await Student.updateOne(
      { _id: student._id },
      {
        $push: {
          refreshTokens: {
            tokenId,
            expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000)
          }
        }
      }
    );

    // Tokens
    const accessToken = signAccessToken(student);
    const refreshToken = signRefreshToken(student, tokenId);

    // ===== FIX 2: Add missing csrfToken variable =====
    const csrfToken = generateCsrfToken();

    // Set CSRF cookie
    res.cookie("csrf_token", csrfToken, csrfCookieOptions);

    // Final response
    res.json({
      accessToken,
      refreshToken,
      csrfToken,
      student: {
        roll: student.roll,
        name: student.name,
        dept: student.dept,
        cls: student.cls,
        role: student.role
      }
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
    res.cookie("csrf_token", csrfToken, csrfCookieOptions);

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

// Current user
app.get("/api/me", authenticate, csrfProtect, async (req, res) => {
  try {
    const student = await Student.findOne({ roll: req.student.roll }).select("-passwordHash -refreshTokens");
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json(student);
  } catch (err) {
    console.error("get me error:", err);
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
      fontSize: Joi.string().valid("small", "medium", "large").optional(),
      cosmetics: Joi.object({
        avatarBorder: Joi.string().allow("", null).optional(),
        nameStyle: Joi.string().allow("", null).optional(),
        chatBubbleColor: Joi.string().allow("", null).optional(),
        chatColor: Joi.string().allow("", null).optional(), // alias for UI
        backgroundUrl: Joi.string().uri().allow("", null).optional(),
        badges: Joi.array().items(Joi.string()).optional(),
        animatedNameEffect: Joi.string().allow("", null).optional(),
        animatedBorder: Joi.string().allow("", null).optional(),
        titleEffect: Joi.string().allow("", null).optional(),
      }).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const student = await Student.findOne({ roll: req.student.roll });
    if (!student) return res.status(404).json({ error: "Student not found" });

    student.settings = student.settings || {};
    student.settings.cosmetics = student.settings.cosmetics || {};
    student.settings.unlocked = student.settings.unlocked || {};

    // normalize chat color alias
    if (value.cosmetics) {
      if (value.cosmetics.chatColor && !value.cosmetics.chatBubbleColor) {
        value.cosmetics.chatBubbleColor = value.cosmetics.chatColor;
      }
    }

    student.settings = { ...student.settings, ...value };
    await student.save();
    res.json(student);
  } catch (err) {
    console.error("settings update error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Grant cosmetic rewards to a student
app.post("/api/admin/reward/cosmetic", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const schema = Joi.object({
      roll: Joi.string().required(),
      type: Joi.string().valid(
        "avatarBorder",
        "nameStyle",
        "chatBubbleColor",
        "chatColor",
        "backgroundUrl",
        "badge",
        "animatedNameEffect",
        "animatedBorder",
        "titleEffect"
      ).required(),
      value: Joi.string().required(),
      applyNow: Joi.boolean().default(true),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const student = await Student.findOne({ roll: value.roll });
    if (!student) return res.status(404).json({ error: `Student '${value.roll}' not found. Ensure they have signed up first.` });

    student.settings = student.settings || {};
    student.settings.unlocked = student.settings.unlocked || {};
    student.settings.cosmetics = student.settings.cosmetics || {};

    // Ensure all unlocked arrays exist
    if (!student.settings.unlocked.avatarBorders) student.settings.unlocked.avatarBorders = [];
    if (!student.settings.unlocked.nameStyles) student.settings.unlocked.nameStyles = [];
    if (!student.settings.unlocked.chatColors) student.settings.unlocked.chatColors = [];
    if (!student.settings.unlocked.backgrounds) student.settings.unlocked.backgrounds = [];
    if (!student.settings.unlocked.badges) student.settings.unlocked.badges = [];
    if (!student.settings.unlocked.animatedNameEffects) student.settings.unlocked.animatedNameEffects = [];
    if (!student.settings.unlocked.animatedBorders) student.settings.unlocked.animatedBorders = [];
    if (!student.settings.unlocked.titleEffects) student.settings.unlocked.titleEffects = [];

    let unlocked = false;
    switch (value.type) {
      case "avatarBorder":
        if (!student.settings.unlocked.avatarBorders.includes(value.value)) {
          student.settings.unlocked.avatarBorders.push(value.value);
          unlocked = true;
        }
        if (value.applyNow) student.settings.cosmetics.avatarBorder = value.value;
        break;
      case "nameStyle":
        if (!student.settings.unlocked.nameStyles.includes(value.value)) {
          student.settings.unlocked.nameStyles.push(value.value);
          unlocked = true;
        }
        if (value.applyNow) student.settings.cosmetics.nameStyle = value.value;
        break;
      case "chatBubbleColor":
      case "chatColor":
        if (!student.settings.unlocked.chatColors.includes(value.value)) {
          student.settings.unlocked.chatColors.push(value.value);
          unlocked = true;
        }
        if (value.applyNow) {
          student.settings.cosmetics.chatBubbleColor = value.value;
          student.settings.cosmetics.chatColor = value.value;
        }
        break;
      case "backgroundUrl":
        if (!student.settings.unlocked.backgrounds.includes(value.value)) {
          student.settings.unlocked.backgrounds.push(value.value);
          unlocked = true;
        }
        if (value.applyNow) student.settings.cosmetics.backgroundUrl = value.value;
        break;
      case "badge":
        if (!student.settings.unlocked.badges.includes(value.value)) {
          student.settings.unlocked.badges.push(value.value);
          unlocked = true;
        }
        if (value.applyNow) {
          const badges = new Set([...(student.settings.cosmetics.badges || []), value.value]);
          student.settings.cosmetics.badges = Array.from(badges);
        }
        break;
      case "animatedNameEffect":
        if (!student.settings.unlocked.animatedNameEffects.includes(value.value)) {
          student.settings.unlocked.animatedNameEffects.push(value.value);
          unlocked = true;
        }
        if (value.applyNow) student.settings.cosmetics.animatedNameEffect = value.value;
        break;
      case "animatedBorder":
        if (!student.settings.unlocked.animatedBorders.includes(value.value)) {
          student.settings.unlocked.animatedBorders.push(value.value);
          unlocked = true;
        }
        if (value.applyNow) student.settings.cosmetics.animatedBorder = value.value;
        break;
      case "titleEffect":
        if (!student.settings.unlocked.titleEffects.includes(value.value)) {
          student.settings.unlocked.titleEffects.push(value.value);
          unlocked = true;
        }
        if (value.applyNow) student.settings.cosmetics.titleEffect = value.value;
        break;
    }

    // Mark the nested path as modified so Mongoose saves it
    student.markModified('settings');
    student.markModified('settings.unlocked');
    student.markModified('settings.cosmetics');
    const saved = await student.save();
    
    console.log(`✅ Cosmetic ${unlocked ? 'UNLOCKED' : 'already unlocked'}: ${value.type} = ${value.value} for ${value.roll}`);
    console.log(`📝 Saved student document, current unlocked:`, saved.settings.unlocked);
    
    io.emit("cosmetic:updated", { 
      roll: student.roll, 
      cosmetics: student.settings.cosmetics,
      unlocked: student.settings.unlocked 
    });
    res.json({ 
      ok: true, 
      message: `Unlocked ${value.type}: ${value.value}`,
      unlocked: student.settings.unlocked,
      cosmetics: student.settings.cosmetics
    });
  } catch (err) {
    console.error("❌ reward cosmetic error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// ==================== MIGRATION ENDPOINT ====================
// Run this once to initialize settings for all existing students in MongoDB
app.post("/api/admin/migrate-settings", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const students = await Student.find({});
    let updated = 0;
    
    for (const student of students) {
      let needsUpdate = false;
      
      if (!student.settings) {
        student.settings = {};
        needsUpdate = true;
      }
      
      if (!student.settings.cosmetics) {
        student.settings.cosmetics = {
          avatarBorder: "",
          nameStyle: "",
          chatBubbleColor: "",
          chatColor: "",
          backgroundUrl: "",
          badges: [],
          animatedNameEffect: "",
          animatedBorder: "",
          titleEffect: "",
        };
        needsUpdate = true;
      }
      
      if (!student.settings.unlocked) {
        student.settings.unlocked = {
          avatarBorders: [],
          nameStyles: [],
          chatColors: [],
          backgrounds: [],
          badges: [],
          animatedNameEffects: [],
          animatedBorders: [],
          titleEffects: [],
        };
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        student.markModified('settings');
        await student.save();
        updated++;
      }
    }
    
    console.log(`✅ Migration complete: ${updated} students updated`);
    res.json({ ok: true, message: `Initialized settings for ${updated} students`, total: students.length });
  } catch (err) {
    console.error("Migration error:", err);
    res.status(500).json({ error: "Migration failed: " + err.message });
  }
});

// ---------------------- VERIFIED BADGE ----------------------
app.post("/api/admin/reward/verified", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const schema = Joi.object({
      roll: Joi.string().required(),
      grantVerified: Joi.boolean().required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const student = await Student.findOne({ roll: value.roll });
    if (!student) return res.status(404).json({ error: "Student not found" });

    if (value.grantVerified) {
      student.verified = true;
      student.verifiedBadge = {
        isActive: true,
        grantedAt: new Date(),
        grantedBy: req.user?.roll || "admin",
      };
    } else {
      student.verified = false;
      student.verifiedBadge = { isActive: false };
    }

    await student.save();
    io.emit("verified:updated", { roll: student.roll, verified: student.verified, badge: student.verifiedBadge });
    res.json({ ok: true, verified: student.verified });
  } catch (err) {
    console.error("verified badge error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------------- Course Plans ----------------------
// Setup multer for course plan uploads
let planUpload = null;
try {
  const multerMod = (await import("multer")).default;
  planUpload = multerMod({ storage: multerMod.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB
} catch (e) {
  console.warn("Multer not available for course plan uploads");
}

app.get("/api/admin/course-source-config", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const cfg = await getAppConfig();
    res.json({ coursePlanDisabled: cfg.coursePlanDisabled, promptTopics: cfg.promptTopics || "" });
  } catch (err) {
    console.error("config fetch error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/admin/course-source-config", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const schema = Joi.object({
      coursePlanDisabled: Joi.boolean().optional(),
      promptTopics: Joi.string().allow("", null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const cfg = await getAppConfig();
    if (typeof value.coursePlanDisabled === "boolean") cfg.coursePlanDisabled = value.coursePlanDisabled;
    if (typeof value.promptTopics === "string") cfg.promptTopics = value.promptTopics;
    await cfg.save();
    res.json({ ok: true, coursePlanDisabled: cfg.coursePlanDisabled, promptTopics: cfg.promptTopics || "" });
  } catch (err) {
    console.error("config update error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/course-plan", authenticate, requireAdmin, planUpload ? planUpload.single("file") : (req, res, next) => next(), csrfProtect, async (req, res) => {
  try {
    const cfg = await getAppConfig();
    if (cfg.coursePlanDisabled) return res.status(403).json({ error: "Course plan upload disabled" });

    let name = req.body?.name || '';
    let content = '';
    
    if (req.file) {
      // File upload via FormData
      name = name || req.file.originalname;
      // Try to parse PDF into text for strict course QA
      try {
        const pdfParse = (await import('pdf-parse')).default;
        const parsed = await pdfParse(req.file.buffer);
        content = (parsed?.text || '').trim();
      } catch (e) {
        console.warn('PDF parse failed; storing empty content', e?.message || e);
        content = '';
      }
    }
    
    if (!name) return res.status(400).json({ error: "File name required" });

    const plan = new CoursePlan({ name, content: content || '' });
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
    const plans = await CoursePlan.find().sort({ uploadedAt: -1 }).limit(200).select('-content'); // exclude large content
    res.json(plans);
  } catch (err) {
    console.error("course plan list error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/course-plan/:id", authenticate, csrfProtect, async (req, res) => {
  try {
    const plan = await CoursePlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ error: "Course plan not found" });
    res.json(plan);
  } catch (err) {
    console.error("get course plan error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/api/course-plan/:id", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const plan = await CoursePlan.findByIdAndDelete(req.params.id);
    if (!plan) return res.status(404).json({ error: "Course plan not found" });
    io.emit("coursePlan:deleted", { id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    console.error("delete course plan error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------------- Admin Debug: Student Settings ----------------------
app.get("/api/admin/debug/student/:roll", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const student = await Student.findOne({ roll: req.params.roll });
    if (!student) return res.status(404).json({ error: `Student '${req.params.roll}' not found in database` });
    res.json({
      roll: student.roll,
      name: student.name,
      hasSettings: !!student.settings,
      settingsKeys: student.settings ? Object.keys(student.settings) : [],
      unlocked: student.settings?.unlocked || {},
      cosmetics: student.settings?.cosmetics || {},
      lockedUntil: student.lockedUntil || null,
      chatbotLockedUntil: student.chatbotLockedUntil || null,
      updatedAt: student.updatedAt,
      createdAt: student.createdAt,
    });
  } catch (err) {
    console.error("admin debug student error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

app.get("/api/admin/debug/students-count", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const total = await Student.countDocuments({});
    const withUnlocked = await Student.countDocuments({ "settings.unlocked": { $exists: true } });
    const withCosmetics = await Student.countDocuments({ "settings.cosmetics": { $exists: true } });
    res.json({ 
      totalStudents: total,
      studentsWithUnlocked: withUnlocked,
      studentsWithCosmetics: withCosmetics
    });
  } catch (err) {
    console.error("students count error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// Initialize or fetch student (creates if missing with proper schema)
app.post("/api/admin/ensure-student", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const { roll, name } = req.body;
    if (!roll) return res.status(400).json({ error: "roll required" });

    let student = await Student.findOne({ roll });
    if (!student) {
      student = new Student({ 
        roll, 
        name: name || `Student ${roll}`,
        dept: 'TEST',
        cls: 'TEST',
        role: 'student',
        settings: {
          theme: 'light',
          notifications: true,
          safeMode: true,
          fontSize: 'medium',
          cosmetics: {
            avatarBorder: '',
            nameStyle: '',
            chatBubbleColor: '',
            chatColor: '',
            backgroundUrl: '',
            badges: [],
            animatedNameEffect: '',
            animatedBorder: '',
            titleEffect: '',
          },
          unlocked: {
            avatarBorders: [],
            nameStyles: [],
            chatColors: [],
            backgrounds: [],
            badges: [],
            animatedNameEffects: [],
            animatedBorders: [],
            titleEffects: [],
          }
        }
      });
      await student.save();
      console.log(`✅ Created student ${roll} with initialized schema`);
    }
    res.json({ ok: true, message: `Student ${roll} ready`, student: { roll: student.roll, name: student.name } });
  } catch (err) {
    console.error("ensure student error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
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
      strictCourse: Joi.boolean().optional(),
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

    // Check chatbot-specific lock (separate from account lock)
    if (student.chatbotLockedUntil && new Date(student.chatbotLockedUntil) > new Date()) {
      return res.status(403).json({ 
        error: "Chatbot access locked due to violation", 
        chatbotLockedUntil: student.chatbotLockedUntil,
        reason: student.chatbotLockReason || "Policy violation"
      });
    }

    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const chat = new ChatHistory({ roll: value.roll, sender: value.sender, message: value.message, time });
    await chat.save();
    io.emit("chat:new", chat);

    // Strict course answer: reply only from course plan text or from prompt topics if PDF is disabled
    if (value.strictCourse) {
      try {
        const cfg = await getAppConfig();
        console.log(`📚 Strict course mode - coursePlanDisabled: ${cfg.coursePlanDisabled}, useGemini: ${value.useGemini}`);

        // When PDFs are disabled, use admin-provided prompt topics instead
        if (cfg.coursePlanDisabled) {
          const text = (cfg.promptTopics || '').trim();
          if (!text) return res.status(403).json({ error: "Course topics not configured" });

          console.log(`🎯 Using prompt topics mode with ${text.length} chars of topics`);

          // Use Gemini to generate answer based on prompt topics context
          if (value.useGemini) {
            try {
              const context = `You are a helpful educational assistant. Answer the student's question based on these topics: ${text}`;
              console.log(`🤖 Calling Gemini with context...`);
              const reply = await callGemini(value.message, { userRoll: value.roll, context });
              console.log(`✅ Gemini response received: ${reply.slice(0, 100)}...`);
              const assistant = new ChatHistory({
                roll: value.roll,
                sender: "assistant",
                message: reply,
                time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              });
              await assistant.save();
              io.emit("chat:new", assistant);
              return res.json({ assistantReply: reply, chat });
            } catch (e) {
              console.warn('⚠️ Gemini error, falling back to topic definitions:', e.message);
              // Continue to fallback below instead of returning error
            }
          }

          // Improved fallback: generate helpful answers for common topics
          const q = (value.message || '').trim().toLowerCase();
          const topicsLower = text.toLowerCase();
          const knownDefs = {
            'data visualization': 'Data visualization is the practice of representing data in graphical forms (charts, plots, maps) to help people see patterns, trends, and outliers quickly. Effective visualization combines clear encoding (position, size, color), appropriate chart selection (bar, line, scatter, heatmap), and concise storytelling so insights are easy to understand and act on.',
            'inclusion-exclusion principle': 'The inclusion–exclusion principle is a counting technique in combinatorics for finding the size of the union of overlapping sets. It alternates adding and subtracting intersections to avoid double-counting: |A ∪ B| = |A| + |B| − |A ∩ B|, and generalizes to more sets.',
            'universe': 'In set theory, the “universe” often refers to the universal set under consideration that contains all objects of interest. In cosmology, the universe is the totality of space, time, matter, and energy.',
            'mathematics': 'Mathematics is the study of quantity, structure, space, and change. It provides precise language and tools for modeling, analyzing, and solving problems across science, engineering, and everyday life.',
            'physics': 'Physics is the natural science that studies matter, energy, motion, and the fundamental forces of nature. Core areas include mechanics, thermodynamics, electromagnetism, optics, and quantum physics.'
          };

          let reply;
          for (const key of Object.keys(knownDefs)) {
            if (q.includes(key) && topicsLower.includes(key)) {
              reply = knownDefs[key];
              break;
            }
          }

          if (!reply) {
            reply = `Based on your configured topics, here's what we cover: ${text.replace(/\n+/g, ' ').trim()}. Please ask a specific question about any of these topics for a detailed answer.`;
          }

          const assistant = new ChatHistory({
            roll: value.roll,
            sender: "assistant",
            message: reply,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          });
          await assistant.save();
          io.emit("chat:new", assistant);
          return res.json({ assistantReply: reply, chat, strict: true });
        }

        // Otherwise use uploaded course plans
        const plans = await CoursePlan.find().sort({ uploadedAt: -1 }).limit(5);
        const plan = plans[0];
        let text = (plan?.content || '').trim();
        
        // Filter out non-readable/encoded content (base64, binary, etc.)
        const isPrintableText = (str) => {
          if (!str || str.length === 0) return false;
          const printableChars = str.split('').filter(c => {
            const code = c.charCodeAt(0);
            return (code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9;
          }).length;
          const ratio = printableChars / str.length;
          return ratio > 0.7;
        };
        
        if (!text || !isPrintableText(text)) {
          return res.status(403).json({ error: "No readable course content available. Please re-upload course plan as PDF." });
        }
        
        const q = (value.message || '').trim();
        const tokens = q.toLowerCase().split(/\W+/).filter(Boolean);
        let bestIdx = -1;
        for (const t of tokens) {
          if (t.length < 3) continue;
          const idx = text.toLowerCase().indexOf(t);
          if (idx >= 0) { bestIdx = idx; break; }
        }
        if (bestIdx < 0) {
          return res.status(403).json({ error: "course related clarification only allowed" });
        }
        const start = Math.max(0, bestIdx - 300);
        const end = Math.min(text.length, bestIdx + 500);
        const snippet = text.slice(start, end).replace(/\s{2,}/g, ' ').trim();
        const reply = `From course plan (${plan?.name || 'plan'}): ${snippet}`;
        const assistant = new ChatHistory({
          roll: value.roll,
          sender: "assistant",
          message: reply,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
        await assistant.save();
        io.emit("chat:new", assistant);
        return res.json({ assistantReply: reply, chat, strict: true });
      } catch (e) {
        console.error('strictCourse error:', e);
        return res.status(403).json({ error: "course related clarification only allowed" });
      }
    }

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
        // graceful fallback below
      }
    }

    // Fallback assistant reply (simple rule-based helper)
    try {
      const plans = await CoursePlan.find().sort({ uploadedAt: -1 }).limit(5).select("name");
      const planNames = plans.map((p) => p.name).join(", ") || "no plans uploaded yet";

      const lower = (value.message || "").toLowerCase();
      let reply = `I'm here to help. I currently see ${planNames}. `;
      if (/(first|1st).*experiment|lab\s*1|exp\s*1/.test(lower)) {
        reply += "For the first experiment details, please refer to the latest lab manual/course plan. If the manual is a PDF, ensure text is extracted when uploading so I can answer precisely.";
      } else if (/deadline|submission|date/.test(lower)) {
        reply += "For deadlines, check the notices and course plan sections. If you provide the specific course/plan name, I can narrow it down.";
      } else if (/syllabus|units?|topics?/.test(lower)) {
        reply += "Syllabus/topics are usually inside the course plan. Please mention the course to get a focused summary.";
      } else {
        reply += "Ask about a specific course plan or experiment to get targeted guidance.";
      }

      const assistant = new ChatHistory({
        roll: value.roll,
        sender: "assistant",
        message: reply,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
      await assistant.save();
      io.emit("chat:new", assistant);
      return res.json({ assistantReply: reply, chat, fallback: true });
    } catch (e) {
      console.error("fallback reply error:", e);
      return res.status(201).json(chat);
    }
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

    // Immediate chatbot lock on high violation
    if (value.level === "high") {
      const durationMs = 12 * 3600 * 1000; // 12 hours
      student.chatbotLockedUntil = new Date(Date.now() + durationMs);
      student.chatbotLockReason = value.reason || "High violation";
    }

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

// Remove a specific warning (violation) and adjust student's warningsCount
app.delete("/api/warning/:id", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const warn = await Warning.findById(req.params.id);
    if (!warn) return res.status(404).json({ error: "Warning not found" });

    await Warning.findByIdAndDelete(req.params.id);

    const stu = await Student.findOne({ roll: warn.roll });
    if (stu) {
      const current = Number(stu.warningsCount || 0);
      const next = Math.max(0, current - 1);
      stu.warningsCount = next;
      await stu.save();
    }

    io.emit("warning:updated", { roll: warn.roll });
    res.json({ ok: true });
  } catch (err) {
    console.error("delete warning error:", err);
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

// ---------------------- Notices & Appeals ----------------------
// List public notices (students)
app.get("/api/notices", authenticate, csrfProtect, async (req, res) => {
  try {
    const notices = await Notice.find().sort({ createdAt: -1 }).limit(50);
    res.json(notices);
  } catch (err) {
    console.error("get notices error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: create notice
app.post("/api/admin/notice", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const schema = Joi.object({ title: Joi.string().required(), body: Joi.string().required(), urgent: Joi.boolean().optional() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const n = new Notice({ title: value.title, body: value.body, createdBy: req.student.roll || "admin", urgent: !!value.urgent });
    await n.save();
    io.emit("notice:new", n);
    res.json({ ok: true, notice: n });
  } catch (err) {
    console.error("create notice error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Student: submit appeal for lock
app.post("/api/user/appeal", authenticate, csrfProtect, async (req, res) => {
  try {
    const schema = Joi.object({ lockId: Joi.string().optional().allow(null), message: Joi.string().max(2000).required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    // rate limit appeals per user via Redis to prevent spam
    if (redis) {
      const key = `appeal-rate:${req.student.roll}`;
      const { count } = await redisRateLimitKeyIncrement(key, 60 * 60); // 1 hour window
      if (count > 5) return res.status(429).json({ error: "Too many appeals, try later" });
    }

    const appeal = new Appeal({ roll: req.student.roll, lockId: value.lockId || null, message: value.message });
    await appeal.save();
    io.emit("appeal:new", { roll: req.student.roll, id: appeal._id, message: appeal.message });
    res.status(201).json({ ok: true, appealId: appeal._id });
  } catch (err) {
    console.error("appeal error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: list appeals
app.get("/api/admin/appeals", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const appeals = await Appeal.find().sort({ createdAt: -1 }).limit(500);
    res.json(appeals);
  } catch (err) {
    console.error("list appeals error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: respond to appeal & optionally unlock
app.post("/api/admin/appeals/:id/respond", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const schema = Joi.object({ action: Joi.string().valid("close", "review", "unlock").required(), response: Joi.string().optional().allow("") });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const appeal = await Appeal.findById(req.params.id);
    if (!appeal) return res.status(404).json({ error: "Appeal not found" });

    if (value.action === "unlock") {
      // unlock the account referenced by appeal.roll
      await Student.updateOne({ roll: appeal.roll }, { $set: { lockedUntil: null, warningsCount: 0 } });
      if (redis) await clearAccountLockRedis(appeal.roll);
      io.emit("student:unlocked", { roll: appeal.roll, by: req.student.roll });
    }

    appeal.status = value.action === "close" ? "closed" : value.action === "review" ? "in-review" : appeal.status;
    appeal.adminResponse = value.response || "";
    await appeal.save();
    res.json({ ok: true, appeal });
  } catch (err) {
    console.error("respond appeal error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------------- Avatar upload (optional: multer) ----------------------
// Implement avatar upload endpoint. Use multer if available; fallback to base64 field.
let multer;
try {
  multer = (await import("multer")).default;
} catch (e) {
  multer = null;
  console.warn("Multer not installed — avatar upload endpoint will accept base64 in body only. Install multer for multipart uploads.");
}

if (multer) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }); // 2MB limit
  app.post("/api/student/avatar", authenticate, csrfProtect, upload.single("avatar"), async (req, res) => {
    try {
      if (!req.file || !req.student) return res.status(400).json({ error: "No file uploaded" });
      // Save as data URL in DB (simple). You can optionally upload to Cloudinary instead.
      const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
      await Student.updateOne({ roll: req.student.roll }, { $set: { avatarUrl: base64 } });
      res.json({ ok: true, avatarUrl: base64 });
    } catch (err) {
      console.error("avatar upload error:", err);
      res.status(500).json({ error: "Server error" });
    }
  });
} else {
  // fallback endpoint: accept JSON { avatarBase64: "data:..." }
  app.post("/api/student/avatar", authenticate, csrfProtect, async (req, res) => {
    try {
      const { avatarBase64 } = req.body;
      if (!avatarBase64) return res.status(400).json({ error: "Missing avatarBase64" });
      await Student.updateOne({ roll: req.student.roll }, { $set: { avatarUrl: avatarBase64 } });
      res.json({ ok: true, avatarUrl: avatarBase64 });
    } catch (err) {
      console.error("avatar upload fallback error:", err);
      res.status(500).json({ error: "Server error" });
    }
  });
}

// ---------------------- Gemini integration ----------------------
async function callGemini(prompt, opts = {}) {
  // Build the full prompt with context if provided
  let fullPrompt = prompt;
  if (opts.context) {
    fullPrompt = `${opts.context}\n\nUser Question: ${prompt}`;
  }

  // Try Google Gemini API if configured
  if (GEMINI_API_KEY && GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;
      const body = {
        contents: [{
          parts: [{ text: fullPrompt }]
        }]
      };
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (r.ok) {
        const json = await r.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      }
    } catch (e) {
      console.error('Google Gemini API failed:', e.message);
    }
  }

  // Fallback: Simple AI response based on context
  if (opts.context) {
    return `Based on the available topics and your question "${prompt}", here's what I can help with: ${opts.context.slice(0, 300)}... Please ask more specific questions about these topics for detailed answers.`;
  }

  // Last resort: Generic response
  return `I'm an educational assistant. To provide better answers, please configure the course topics in the admin panel or upload course materials.`;
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

// ---------------------- Dashboard status endpoint ----------------------
app.get("/api/dashboard/status", authenticate, csrfProtect, async (req, res) => {
  try {
    const roll = req.student.roll;

    const student = await Student.findOne({ roll }).select("-passwordHash -refreshTokens").lean();
    if (!student) return res.status(404).json({ error: "Student not found" });

    const warnings = await Warning.find({ roll }).sort({ createdAt: -1 }).limit(50).lean();
    const locks = await Lock.find({ roll }).sort({ createdAt: -1 }).limit(10).lean();

    let activeLock = null;
    // prefer latest non-expired lock
    for (const l of locks) {
      if (!l.expiresAt || new Date(l.expiresAt) > new Date()) {
        activeLock = l;
        break;
      }
    }

    // check redis lock
    const redisLock = await getAccountLockRedis(roll);
    if (!activeLock && redisLock) {
      activeLock = { reason: redisLock, source: "redis", expiresAt: null };
    }

    const totalChats = await ChatHistory.countDocuments({ roll });
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const weeklyChats = await ChatHistory.countDocuments({ roll, createdAt: { $gte: weekAgo } });
    const lastChat = await ChatHistory.findOne({ roll }).sort({ createdAt: -1 }).lean();
    const notices = await Notice.find().sort({ createdAt: -1 }).limit(20).lean();
    
    // Include system messages for this student
    const systemMessages = await SystemMessage.find({ 
      recipientRoll: roll, 
      expiresAt: { $gt: new Date() } 
    }).sort({ createdAt: -1 }).limit(10).lean();

    res.json({
      profile: student,
      warnings,
      activeLock,
      usage: { totalChats, weeklyChats, lastChat: lastChat ? lastChat.createdAt : null },
      notices,
      systemMessages,
    });
  } catch (err) {
    console.error("dashboard status error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------------- Automated Messaging System ----------------------

// Get system messages for student
app.get("/api/student/messages", authenticate, csrfProtect, async (req, res) => {
  try {
    const messages = await SystemMessage.find({ 
      recipientRoll: req.student.roll,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 }).limit(50).lean();
    
    res.json({ messages });
  } catch(err) {
    console.error("get messages error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Mark message as read
app.post("/api/student/messages/:id/read", authenticate, csrfProtect, async (req, res) => {
  try {
    await SystemMessage.updateOne(
      { _id: req.params.id, recipientRoll: req.student.roll },
      { $set: { isRead: true } }
    );
    res.json({ ok: true });
  } catch(err) {
    console.error("mark read error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: Send system message to student(s)
app.post("/api/admin/send-message", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const { recipients, title, content, type, scheduledFor } = req.body;
    
    if (!recipients || !title || !content) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const messages = recipients.map(roll => ({
      recipientRoll: roll,
      title,
      content,
      type: type || "info",
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      trigger: "manual",
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000), // 30 days expiry
    }));

    const inserted = await SystemMessage.insertMany(messages);
    
    // Broadcast via Socket.IO if not scheduled
    if (!scheduledFor) {
      recipients.forEach(roll => {
        io.emit(`message:${roll}`, { 
          title, 
          content, 
          type, 
          sentAt: new Date() 
        });
      });
    }

    res.status(201).json({ 
      ok: true, 
      sentTo: recipients.length, 
      scheduled: scheduledFor ? true : false 
    });
  } catch(err) {
    console.error("send message error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: Send broadcast message to all/filtered students
app.post("/api/admin/broadcast-message", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const { title, content, type, filter } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Build filter query
    let query = {};
    if (filter?.dept) query.dept = filter.dept;
    if (filter?.cls) query.cls = filter.cls;
    if (filter?.locked) query.locked = filter.locked;

    const students = await Student.find(query).select("roll").lean();
    const rolls = students.map(s => s.roll);

    const messages = rolls.map(roll => ({
      recipientRoll: roll,
      title,
      content,
      type: type || "info",
      trigger: "manual",
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    }));

    await SystemMessage.insertMany(messages);

    // Broadcast via Socket.IO
    rolls.forEach(roll => {
      io.emit(`message:${roll}`, { title, content, type, sentAt: new Date() });
    });

    res.status(201).json({ ok: true, sentTo: rolls.length });
  } catch(err) {
    console.error("broadcast message error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: Get message templates
app.get("/api/admin/message-templates", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const templates = await MessageTemplate.find().lean();
    res.json({ templates });
  } catch(err) {
    console.error("get templates error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: Create message template
app.post("/api/admin/message-templates", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const { name, title, content, type, category } = req.body;
    
    const template = new MessageTemplate({ name, title, content, type, category });
    await template.save();
    
    res.status(201).json({ ok: true, template });
  } catch(err) {
    console.error("create template error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: Send message using template
app.post("/api/admin/send-template-message", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const { templateId, recipients } = req.body;
    
    const template = await MessageTemplate.findById(templateId);
    if (!template) return res.status(404).json({ error: "Template not found" });

    const messages = recipients.map(roll => ({
      recipientRoll: roll,
      title: template.title,
      content: template.content,
      type: template.type,
      trigger: "manual",
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    }));

    await SystemMessage.insertMany(messages);

    recipients.forEach(roll => {
      io.emit(`message:${roll}`, { 
        title: template.title, 
        content: template.content, 
        type: template.type,
        sentAt: new Date() 
      });
    });

    res.status(201).json({ ok: true, sentTo: recipients.length });
  } catch(err) {
    console.error("template message error:", err);
    res.status(500).json({ error: "Server error" });
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

   
