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
  sameSite: "none", // allow cross-site frontends (Render)
  secure: true,
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
    role: { type: String, enum: ["student", "admin", "super_admin", "moderator", "teacher"], default: "student" },
    avatarUrl: { type: String, default: "" },
    bgColor: { type: String, default: "linear-gradient(135deg,#0077ff,#00d4ff)" },
    warningsCount: { type: Number, default: 0 },
    locked: { type: Boolean, default: false },
    lockedUntil: { type: Date, default: null },
    chatbotLocked: { type: Boolean, default: false },
    chatbotLockedUntil: { type: Date, default: null },
    chatbotLockReason: { type: String, default: "" },
    hc: { type: Number, default: 0 }, // HC currency for shop purchases
    loginStreak: { type: Number, default: 0 }, // Current day in 1-7 streak
    lastLoginDate: { type: Date, default: null }, // Last login date
    claimedRewardToday: { type: Boolean, default: false }, // Has claimed today's reward
    passwordResetOTP: { type: String, default: null }, // OTP for password reset
    otpExpiresAt: { type: Date, default: null }, // OTP expiry
    otpVerified: { type: Boolean, default: false }, // OTP verification status
    messages: [{
      _id: mongoose.Schema.Types.ObjectId,
      type: { type: String, enum: ['appeal', 'violation-question', 'lock-appeal'], default: 'appeal' },
      subject: String,
      message: String,
      status: { type: String, enum: ['pending', 'read', 'responded', 'resolved', 'closed'], default: 'pending' },
      labels: [String],
      adminReply: String,
      createdAt: { type: Date, default: Date.now },
      respondedAt: Date
    }],
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

// RedeemCode model for reward codes
const redeemCodeSchema = new Schema(
  {
    code: { type: String, unique: true, required: true, index: true },
    reward: {
      type: { type: String, enum: ['hc', 'cosmetic', 'badge'], required: true },
      value: String,
      amount: Number
    },
    isPermanent: { type: Boolean, default: false },
    expiresAt: { type: Date, default: null },
    usedBy: [{ roll: String, usedAt: Date }],
    maxUses: { type: Number, default: null },
    createdBy: String,
    description: String
  },
  { timestamps: true }
);
const RedeemCode = mongoose.model("RedeemCode", redeemCodeSchema);

// SystemConfig model for feature toggles
const systemConfigSchema = new Schema(
  {
    key: { type: String, unique: true, required: true },
    value: Schema.Types.Mixed,
    description: String,
  },
  { timestamps: true }
);
const SystemConfig = mongoose.model("SystemConfig", systemConfigSchema);

// Report model for moderation
const reportSchema = new Schema(
  {
    reportedBy: String,
    targetStudent: String,
    reportReason: String,
    description: String,
    status: { type: String, enum: ['pending', 'reviewed', 'resolved'], default: 'pending' },
    reviewedBy: String,
    reviewNotes: String,
  },
  { timestamps: true }
);
const Report = mongoose.model("Report", reportSchema);

// AuditLog model for super admin
const auditLogSchema = new Schema(
  {
    admin: String,
    action: String,
    details: String,
    timestamp: { type: Date, default: Date.now },
  }
);
const AuditLog = mongoose.model("AuditLog", auditLogSchema);

// Helper function to log audit actions
async function logAudit(admin, action, details) {
  try {
    const log = new AuditLog({ admin, action, details, timestamp: new Date() });
    await log.save();
    console.log(`[AUDIT] ${admin} - ${action}: ${details}`);
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

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
  // Accept header token; if cookie present it must match, otherwise header alone is accepted
  if (!headerToken) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }
  if (cookieToken && cookieToken !== headerToken) {
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

// ==================== STUDENT MESSAGES/APPEALS ====================
// Submit student message/appeal
app.post("/api/student/messages/submit", authenticate, csrfProtect, async (req, res) => {
  try {
    const schema = Joi.object({
      type: Joi.string().valid('appeal', 'violation-question', 'lock-appeal').required(),
      subject: Joi.string().required(),
      message: Joi.string().required()
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const student = await Student.findOne({ roll: req.student.roll });
    if (!student) return res.status(404).json({ error: "Student not found" });

    const msg = {
      _id: new mongoose.Types.ObjectId(),
      type: value.type,
      subject: value.subject,
      message: value.message,
      status: 'pending',
      createdAt: new Date()
    };

    student.messages = student.messages || [];
    student.messages.push(msg);
    student.markModified('messages');
    await student.save();

    io.emit("student:message-submitted", { roll: student.roll, type: value.type });

    res.json({ ok: true, message: "Message submitted successfully" });
  } catch (err) {
    console.error("submit message error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// Get student's own messages
app.get("/api/student/messages", authenticate, csrfProtect, async (req, res) => {
  try {
    const student = await Student.findOne({ roll: req.student.roll });
    if (!student) return res.status(404).json({ error: "Student not found" });

    const messages = student.messages || [];
    res.json(messages);
  } catch (err) {
    console.error("get messages error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: Get all student messages
app.get("/api/admin/student-messages", authenticate, csrfProtect, async (req, res) => {
  try {
    if (req.student.role !== 'admin') return res.status(403).json({ error: "Forbidden" });

    const students = await Student.find({ messages: { $exists: true, $ne: [] } });
    const all = [];
    students.forEach(s => {
      s.messages.forEach(msg => {
        all.push({
          _id: msg._id,
          roll: s.roll,
          name: s.name,
          type: msg.type,
          subject: msg.subject,
          message: msg.message,
          status: msg.status,
          labels: msg.labels || [],
          adminReply: msg.adminReply,
          createdAt: msg.createdAt
        });
      });
    });
    res.json(all.sort((a, b) => b.createdAt - a.createdAt));
  } catch (err) {
    console.error("get student messages error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: Reply to student message
app.post("/api/admin/student-messages/:msgId/reply", authenticate, csrfProtect, async (req, res) => {
  try {
    if (req.student.role !== 'admin') return res.status(403).json({ error: "Forbidden" });

    const { reply, status } = req.body;
    if (!reply) return res.status(400).json({ error: "Reply required" });
    const allowed = ["pending","read","responded","resolved","closed"]; const newStatus = allowed.includes(status) ? status : 'resolved';

    const result = await Student.findOneAndUpdate(
      { "messages._id": new mongoose.Types.ObjectId(req.params.msgId) },
      {
        $set: {
          "messages.$.adminReply": reply,
          "messages.$.status": newStatus,
          "messages.$.respondedAt": new Date()
        }
      },
      { new: true }
    );

    if (!result) return res.status(404).json({ error: "Message not found" });

    const msg = (result.messages || []).find(m => String(m._id) === String(req.params.msgId));
    io.emit("student:message-replied", { roll: result.roll, messageId: req.params.msgId, status: newStatus, subject: msg?.subject });

    res.json({ ok: true, message: "Reply sent", status: newStatus });
  } catch (err) {
    console.error("reply to message error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// Admin: Close student message/appeal
app.post("/api/admin/student-messages/:msgId/close", authenticate, csrfProtect, async (req, res) => {
  try {
    if (req.student.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const { reason } = req.body;
    const result = await Student.findOneAndUpdate(
      { "messages._id": new mongoose.Types.ObjectId(req.params.msgId) },
      { $set: { "messages.$.status": 'closed', "messages.$.respondedAt": new Date(), ...(reason ? { "messages.$.adminReply": reason } : {}) } },
      { new: true }
    );
    if (!result) return res.status(404).json({ error: "Message not found" });

    const msg = (result.messages || []).find(m => String(m._id) === String(req.params.msgId));
    await SystemMessage.create({
      recipientRoll: result.roll,
      title: "Appeal Closed",
      content: `Your appeal${msg?.subject ? ` (${msg.subject})` : ''} has been closed${reason ? `: ${reason}` : ''}.`,
      type: "system",
      trigger: "manual",
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000)
    });

    io.emit("student:message-closed", { roll: result.roll, messageId: req.params.msgId, reason });
    res.json({ ok: true, message: "Appeal closed" });
  } catch (err) {
    console.error("close message error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// Admin: Add/remove labels to student message
app.post("/api/admin/student-messages/:msgId/labels", authenticate, csrfProtect, async (req, res) => {
  try {
    if (req.student.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const { labels } = req.body;
    if (!Array.isArray(labels)) return res.status(400).json({ error: "Labels must be an array" });
    
    const result = await Student.findOneAndUpdate(
      { "messages._id": new mongoose.Types.ObjectId(req.params.msgId) },
      { $set: { "messages.$.labels": labels } },
      { new: true }
    );
    if (!result) return res.status(404).json({ error: "Message not found" });
    res.json({ ok: true, message: "Labels updated" });
  } catch (err) {
    console.error("labels update error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// ==================== REDEEM CODES ====================
// Admin: Generate redeem code
app.post("/api/admin/redeem-codes/generate", authenticate, csrfProtect, async (req, res) => {
  try {
    if (req.student.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    
    const schema = Joi.object({
      reward: Joi.object({
        type: Joi.string().valid('hc', 'cosmetic', 'badge').required(),
        value: Joi.string().optional(),
        amount: Joi.number().optional()
      }).required(),
      isPermanent: Joi.boolean().default(false),
      expiresInMinutes: Joi.number().optional(),
      expiresInDays: Joi.number().optional(),
      maxUses: Joi.number().optional(),
      description: Joi.string().optional()
    });
    
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });
    
    // Generate unique code
    const code = crypto.randomBytes(6).toString('hex').toUpperCase();
    
    let expiresAt = null;
    if (!value.isPermanent) {
      if (value.expiresInMinutes) {
        expiresAt = new Date(Date.now() + value.expiresInMinutes * 60 * 1000);
      } else if (value.expiresInDays) {
        expiresAt = new Date(Date.now() + value.expiresInDays * 24 * 60 * 60 * 1000);
      }
    }
    
    const redeemCode = await RedeemCode.create({
      code,
      reward: value.reward,
      isPermanent: value.isPermanent,
      expiresAt,
      maxUses: value.maxUses || null,
      createdBy: req.student.roll,
      description: value.description || ''
    });
    
    res.json({ ok: true, code: redeemCode.code, redeemCode });
  } catch (err) {
    console.error("generate code error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// Student: Redeem code
app.post("/api/student/redeem-code", authenticate, csrfProtect, async (req, res) => {
  try {
    // Check if redeem codes feature is enabled
    const config = await SystemConfig.findOne({ key: 'studentFeatures' });
    const defaultFeatures = { redeemCodes: true };
    const features = config ? { ...defaultFeatures, ...config.value } : defaultFeatures;
    
    if (!features.redeemCodes) {
      return res.status(403).json({ error: "Redeem Codes feature is disabled by admin" });
    }
    
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Code required" });
    
    const redeemCode = await RedeemCode.findOne({ code: code.toUpperCase() });
    if (!redeemCode) return res.status(404).json({ error: "Invalid code" });
    
    // Check expiry
    if (!redeemCode.isPermanent && redeemCode.expiresAt && new Date() > redeemCode.expiresAt) {
      return res.status(400).json({ error: "Code expired" });
    }
    
    // Check if already used
    const alreadyUsed = redeemCode.usedBy.some(u => u.roll === req.student.roll);
    if (alreadyUsed) return res.status(400).json({ error: "Code already redeemed" });
    
    // Check max uses
    if (redeemCode.maxUses && redeemCode.usedBy.length >= redeemCode.maxUses) {
      return res.status(400).json({ error: "Code usage limit reached" });
    }
    
    // Grant reward
    const student = await Student.findOne({ roll: req.student.roll });
    if (!student) return res.status(404).json({ error: "Student not found" });
    
    let rewardMessage = '';
    if (redeemCode.reward.type === 'hc') {
      student.hc = (student.hc || 0) + (redeemCode.reward.amount || 0);
      rewardMessage = `${redeemCode.reward.amount} HC granted`;
    } else if (redeemCode.reward.type === 'cosmetic') {
      student.settings = student.settings || {};
      student.settings.unlocked = student.settings.unlocked || {};
      const category = redeemCode.reward.value.split(':')[0] || 'titleEffects';
      const value = redeemCode.reward.value.split(':')[1] || redeemCode.reward.value;
      student.settings.unlocked[category] = student.settings.unlocked[category] || [];
      if (!student.settings.unlocked[category].includes(value)) {
        student.settings.unlocked[category].push(value);
      }
      rewardMessage = `Cosmetic ${value} unlocked`;
    } else if (redeemCode.reward.type === 'badge') {
      student.settings = student.settings || {};
      student.settings.unlocked = student.settings.unlocked || {};
      student.settings.unlocked.badges = student.settings.unlocked.badges || [];
      if (!student.settings.unlocked.badges.includes(redeemCode.reward.value)) {
        student.settings.unlocked.badges.push(redeemCode.reward.value);
      }
      rewardMessage = `Badge ${redeemCode.reward.value} unlocked`;
    }
    
    await student.save();
    
    // Mark as used
    redeemCode.usedBy.push({ roll: req.student.roll, usedAt: new Date() });
    await redeemCode.save();
    
    io.emit("student:code-redeemed", { roll: req.student.roll, reward: redeemCode.reward });
    
    res.json({ ok: true, message: rewardMessage, reward: redeemCode.reward });
  } catch (err) {
    console.error("redeem code error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// Admin: List all redeem codes
app.get("/api/admin/redeem-codes", authenticate, async (req, res) => {
  try {
    if (req.student.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const codes = await RedeemCode.find().sort({ createdAt: -1 });
    res.json(codes);
  } catch (err) {
    console.error("list codes error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: Delete redeem code
app.delete("/api/admin/redeem-codes/:codeId", authenticate, csrfProtect, async (req, res) => {
  try {
    if (req.student.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    await RedeemCode.findByIdAndDelete(req.params.codeId);
    res.json({ ok: true, message: "Code deleted" });
  } catch (err) {
    console.error("delete code error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ==================== FEATURE CONTROL ====================
// Get all feature states
app.get("/api/admin/features", authenticate, async (req, res) => {
  try {
    if (req.student.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    
    const defaultFeatures = {
      shop: true,
      cosmetics: true,
      redeemCodes: true,
      appeals: true,
      dailyRewards: true,
      chat: true,
      petDisplay: true,
      achievements: true
    };
    
    const config = await SystemConfig.findOne({ key: 'studentFeatures' });
    const features = config ? { ...defaultFeatures, ...config.value } : defaultFeatures;
    
    res.json(features);
  } catch (err) {
    console.error("get features error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Toggle feature on/off
app.post("/api/admin/features/toggle", authenticate, csrfProtect, async (req, res) => {
  try {
    if (req.student.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    
    const { featureName, enabled } = req.body;
    if (!featureName) return res.status(400).json({ error: "Feature name required" });
    
    let config = await SystemConfig.findOne({ key: 'studentFeatures' });
    if (!config) {
      config = new SystemConfig({ key: 'studentFeatures', value: {} });
    }
    
    config.value = config.value || {};
    config.value[featureName] = enabled;
    config.markModified('value');
    await config.save();
    
    // Send system message to all students
    const students = await Student.find({});
    const status = enabled ? 'enabled' : 'disabled';
    const featureLabel = featureName.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    
    await SystemMessage.create({
      recipientRoll: 'all',
      title: `Feature ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      content: `The ${featureLabel} feature has been ${status} by the admin.`,
      type: 'system',
      trigger: 'manual',
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000)
    });
    
    io.emit("feature:toggled", { feature: featureName, enabled });
    
    await logAudit(req.student.roll, 'FEATURE_TOGGLE', `${featureName} ${status}`);
    
    res.json({ ok: true, message: `Feature ${featureName} ${status}`, features: config.value });
  } catch (err) {
    console.error("toggle feature error:", err);
    res.status(500).json({ error: "Server error" });
  }
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

    // Log the login
    await logAudit(student.roll, 'LOGIN', `User logged in successfully`);

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

// Password reset: request OTP
app.post("/api/auth/password-reset/request", async (req, res) => {
  try {
    const { roll } = req.body;
    if (!roll) return res.status(400).json({ error: "Roll number required" });
    
    const student = await Student.findOne({ roll });
    if (!student) return res.status(404).json({ error: "Student not found" });
    
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    student.passwordResetOTP = otp;
    student.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    student.otpVerified = false;
    await student.save();
    
    await logAudit(roll, 'PASSWORD_RESET_REQUEST', `OTP generated for password reset`);
    
    res.json({ message: "OTP generated successfully", otpGenerated: true });
  } catch (err) {
    console.error("password reset request error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Password reset: verify identity and show OTP
app.post("/api/auth/password-reset/verify-identity", async (req, res) => {
  try {
    const { roll, currentPassword } = req.body;
    if (!roll) return res.status(400).json({ error: "Roll number required" });
    
    const student = await Student.findOne({ roll });
    if (!student) return res.status(404).json({ error: "Student not found" });
    
    // Verify current password
    const isValid = await student.verifyPassword(currentPassword);
    if (!isValid) return res.status(401).json({ error: "Invalid password" });
    
    // Check if OTP exists and not expired
    if (!student.passwordResetOTP || !student.otpExpiresAt) {
      return res.status(400).json({ error: "No OTP request found. Please request OTP first." });
    }
    
    if (new Date() > student.otpExpiresAt) {
      return res.status(400).json({ error: "OTP expired. Please request a new one." });
    }
    
    await logAudit(roll, 'PASSWORD_RESET_IDENTITY_VERIFIED', `Identity verified for password reset`);
    
    // Return OTP to display in-app
    res.json({ 
      message: "Identity verified", 
      otp: student.passwordResetOTP,
      expiresAt: student.otpExpiresAt 
    });
  } catch (err) {
    console.error("verify identity error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Password reset: verify OTP and set new password
app.post("/api/auth/password-reset/complete", async (req, res) => {
  try {
    const { roll, otp, newPassword } = req.body;
    if (!roll || !otp || !newPassword) {
      return res.status(400).json({ error: "All fields required" });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    
    const student = await Student.findOne({ roll });
    if (!student) return res.status(404).json({ error: "Student not found" });
    
    // Verify OTP
    if (!student.passwordResetOTP || student.passwordResetOTP !== otp) {
      return res.status(401).json({ error: "Invalid OTP" });
    }
    
    // Check expiry
    if (!student.otpExpiresAt || new Date() > student.otpExpiresAt) {
      return res.status(400).json({ error: "OTP expired" });
    }
    
    // Update password
    student.passwordHash = await bcrypt.hash(newPassword, 12);
    student.passwordResetOTP = null;
    student.otpExpiresAt = null;
    student.otpVerified = false;
    
    // Revoke all refresh tokens for security
    student.refreshTokens = [];
    
    await student.save();
    
    await logAudit(roll, 'PASSWORD_RESET_COMPLETE', `Password reset completed successfully`);
    
    res.json({ message: "Password reset successful. Please login with your new password." });
  } catch (err) {
    console.error("password reset complete error:", err);
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
    await logAudit(payload.sub, 'LOGOUT', `User logged out`);
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
    const data = student.toObject();
    data.hc = student.hc || 0;
    
    // Include feature states
    const defaultFeatures = {
      shop: true,
      cosmetics: true,
      redeemCodes: true,
      appeals: true,
      dailyRewards: true,
      chat: true,
      petDisplay: true,
      achievements: true
    };
    const config = await SystemConfig.findOne({ key: 'studentFeatures' });
    data.features = config ? { ...defaultFeatures, ...config.value } : defaultFeatures;
    
    res.json(data);
  } catch (err) {
    console.error("get me error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get pet greeting (time-aware)
app.get("/api/pet/greeting", authenticate, csrfProtect, async (req, res) => {
  try {
    const hour = new Date().getHours();
    let greeting = "Hello!";
    let mood = "neutral";

    if (hour >= 6 && hour < 12) {
      greeting = "Good morning! ☀️";
      mood = "energetic";
    } else if (hour >= 12 && hour < 17) {
      greeting = "Good afternoon! 🌤️";
      mood = "cheerful";
    } else if (hour >= 17 && hour < 21) {
      greeting = "Good evening! 🌅";
      mood = "calm";
    } else {
      greeting = "Good night! 🌙";
      mood = "sleepy";
    }

    res.json({ greeting, mood, hour });
  } catch (err) {
    console.error("get greeting error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Daily Login Rewards
app.get("/api/daily-rewards/status", authenticate, csrfProtect, async (req, res) => {
  try {
    const student = await Student.findOne({ roll: req.student.roll });
    if (!student) return res.status(404).json({ error: "Student not found" });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastLogin = student.lastLoginDate ? new Date(student.lastLoginDate) : null;
    const lastLoginToday = lastLogin && lastLogin.getTime() === today.getTime();

    // Reset streak if missed a day
    if (lastLogin) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (lastLogin.getTime() < yesterday.getTime()) {
        student.loginStreak = 0;
      }
    }

    // Advance streak on new day
    if (!lastLoginToday) {
      student.loginStreak = (student.loginStreak || 0) + 1;
      if (student.loginStreak > 7) student.loginStreak = 1;
      student.lastLoginDate = today;
      student.claimedRewardToday = false;
      await student.save();
    }

    res.json({
      currentDay: student.loginStreak || 1,
      claimedToday: student.claimedRewardToday || false
    });
  } catch (err) {
    console.error("daily-rewards status error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/daily-rewards/claim", authenticate, csrfProtect, async (req, res) => {
  try {
    const student = await Student.findOne({ roll: req.student.roll });
    if (!student) return res.status(404).json({ error: "Student not found" });

    if (student.claimedRewardToday) {
      return res.status(400).json({ error: "Already claimed today's reward" });
    }

    const day = student.loginStreak || 1;
    const REWARDS = [
      { day: 1, hc: Math.floor(Math.random() * 500 + 100) },  // 100-600
      { day: 2, hc: Math.floor(Math.random() * 600 + 200) },  // 200-800
      { day: 3, hc: Math.floor(Math.random() * 700 + 300) },  // 300-1000
      { day: 4, hc: Math.floor(Math.random() * 800 + 400) },  // 400-1200
      { day: 5, hc: Math.floor(Math.random() * 900 + 500) },  // 500-1400
      { day: 6, hc: Math.floor(Math.random() * 1000 + 600) }, // 600-1600
      { day: 7, hc: 2000, cosmetic: 'starlight-veil' }        // 2000 + rare cosmetic
    ];

    const reward = REWARDS.find(r => r.day === day) || REWARDS[0];
    student.hc = (student.hc || 0) + reward.hc;

    // Grant cosmetic on day 7
    if (reward.cosmetic) {
      student.settings = student.settings || {};
      student.settings.unlocked = student.settings.unlocked || {};
      student.settings.unlocked.avatarBorders = student.settings.unlocked.avatarBorders || [];
      if (!student.settings.unlocked.avatarBorders.includes(reward.cosmetic)) {
        student.settings.unlocked.avatarBorders.push(reward.cosmetic);
      }
    }

    student.claimedRewardToday = true;
    student.markModified('settings');
    await student.save();

    io.emit("daily-reward-claimed", {
      roll: student.roll,
      day,
      hc: reward.hc,
      cosmetic: reward.cosmetic || null
    });

    res.json({
      ok: true,
      message: `Claimed Day ${day} reward: ${reward.hc} ⚡${reward.cosmetic ? ' + rare cosmetic!' : ''}`,
      reward
    });
  } catch (err) {
    console.error("daily-rewards claim error:", err);
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
        virtualPet: Joi.string().allow("", null).optional(),
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
        "titleEffect",
        "virtualPets"
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
    if (!student.settings.unlocked.virtualPets) student.settings.unlocked.virtualPets = [];
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

// ==================== HC CURRENCY SYSTEM ====================
// Grant HC currency to student
app.post("/api/admin/grant-hc", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const schema = Joi.object({
      roll: Joi.string().required(),
      amount: Joi.number().min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const student = await Student.findOne({ roll: value.roll });
    if (!student) return res.status(404).json({ error: `Student '${value.roll}' not found.` });

    student.hc = (student.hc || 0) + value.amount;
    await student.save();

    await logAudit(req.student.roll, 'GRANT_HC', `Granted ${value.amount} HC to ${value.roll} (New balance: ${student.hc})`);

    io.emit("hc:updated", { roll: student.roll, hc: student.hc });
    res.json({ ok: true, message: `Granted ${value.amount} HC to ${value.roll}`, hc: student.hc });
  } catch (err) {
    console.error("❌ grant HC error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// Broadcast HC to all students
app.post("/api/admin/broadcast-hc", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const schema = Joi.object({
      amount: Joi.number().min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const result = await Student.updateMany({}, { $inc: { hc: value.amount } });
    
    await logAudit(req.student.roll, 'BROADCAST_HC', `Broadcast ${value.amount} HC to all students (${result.modifiedCount} students updated)`);
    
    io.emit("hc:broadcast", { amount: value.amount });
    res.json({ ok: true, message: `Broadcast ${value.amount} HC to all ${result.modifiedCount} students`, updated: result.modifiedCount });
  } catch (err) {
    console.error("❌ broadcast HC error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// ==================== COSMETIC SHOP ====================
// Purchase cosmetic from shop
app.post("/api/shop/buy", authenticate, csrfProtect, async (req, res) => {
  try {
    // Check if shop feature is enabled
    const config = await SystemConfig.findOne({ key: 'studentFeatures' });
    const defaultFeatures = { shop: true };
    const features = config ? { ...defaultFeatures, ...config.value } : defaultFeatures;
    
    if (!features.shop) {
      return res.status(403).json({ error: "Shop feature is disabled by admin" });
    }
    
    const roll = req.student.roll;
    const schema = Joi.object({
      type: Joi.string().required(),
      value: Joi.string().required(),
      price: Joi.number().min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const student = await Student.findOne({ roll });
    if (!student) return res.status(404).json({ error: "Student not found" });

    // Check if student has enough HC
    if ((student.hc || 0) < value.price) {
      return res.status(400).json({ error: `Not enough HC. You have ${student.hc || 0}, need ${value.price}` });
    }

    // Initialize cosmetics storage
    student.settings = student.settings || {};
    student.settings.unlocked = student.settings.unlocked || {};
    
    // Ensure unlocked arrays exist for all types
    if (!student.settings.unlocked[value.type]) {
      student.settings.unlocked[value.type] = [];
    }

    // Check if already unlocked
    if (Array.isArray(student.settings.unlocked[value.type]) && student.settings.unlocked[value.type].includes(value.value)) {
      return res.status(400).json({ error: "Already unlocked. Go to cosmetics modal to equip." });
    }

    // Deduct HC and add to unlocked
    student.hc -= value.price;
    student.settings.unlocked[value.type].push(value.value);

    // Auto-equip virtual pet after purchase
    if (value.type === 'virtualPets') {
      student.settings.cosmetics = student.settings.cosmetics || {};
      student.settings.cosmetics.virtualPet = value.value;
      student.markModified('settings.cosmetics');
    }

    // ASCENDED achievement unlock: if buying an ASCENDED virtual pet, grant exclusive title effect
    const ASCENDED_PETS = new Set([
      'godling-pet', 'leviathan-pet', 'sentinel-pet', 'chimera-pet', 'reaper-pet'
    ]);
    if (value.type === 'virtualPets' && ASCENDED_PETS.has(value.value)) {
      student.settings.unlocked.titleEffects = student.settings.unlocked.titleEffects || [];
      if (!student.settings.unlocked.titleEffects.includes('absolute-sovereign')) {
        student.settings.unlocked.titleEffects.push('absolute-sovereign');
      }
    }

    student.markModified('settings');
    student.markModified('settings.unlocked');

    await student.save();

    io.emit("cosmetic:updated", { 
      roll: student.roll, 
      cosmetics: student.settings.cosmetics,
      unlocked: student.settings.unlocked,
      hc: student.hc
    });

    res.json({ 
      ok: true, 
      message: `Purchased ${value.value}! HC remaining: ${student.hc}`,
      hc: student.hc,
      unlocked: student.settings.unlocked
    });
  } catch (err) {
    console.error("❌ shop purchase error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// ==================== COSMETIC REMOVAL ====================
// Remove/unequip cosmetic (student)
app.post("/api/me/cosmetic/remove", authenticate, csrfProtect, async (req, res) => {
  try {
    const student = await Student.findOne({ roll: req.student.roll });
    if (!student) return res.status(404).json({ error: "Student not found" });

    const schema = Joi.object({
      type: Joi.string().required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    student.settings = student.settings || {};
    student.settings.cosmetics = student.settings.cosmetics || {};

    // Clear the cosmetic
    if (value.type === 'avatarBorders') student.settings.cosmetics.avatarBorder = '';
    else if (value.type === 'nameStyles') student.settings.cosmetics.nameStyle = '';
    else if (value.type === 'animatedNameEffects') student.settings.cosmetics.animatedNameEffect = '';
    else if (value.type === 'animatedBorders') student.settings.cosmetics.animatedBorder = '';
    else if (value.type === 'titleEffects') student.settings.cosmetics.titleEffect = '';
    else if (value.type === 'chatColors') {
      student.settings.cosmetics.chatColor = '';
      student.settings.cosmetics.chatBubbleColor = '';
    }
    else if (value.type === 'backgrounds') student.settings.cosmetics.backgroundUrl = '';

    student.markModified('settings');
    await student.save();

    io.emit("cosmetic:updated", { roll: student.roll, cosmetics: student.settings.cosmetics });

    res.json({ ok: true, message: `Removed ${value.type}`, cosmetics: student.settings.cosmetics });
  } catch (err) {
    console.error("❌ remove cosmetic error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// Admin: Force remove cosmetic from student
app.post("/api/admin/cosmetic/remove", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const schema = Joi.object({
      roll: Joi.string().required(),
      type: Joi.string().required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const student = await Student.findOne({ roll: value.roll });
    if (!student) return res.status(404).json({ error: "Student not found" });

    student.settings = student.settings || {};
    student.settings.cosmetics = student.settings.cosmetics || {};

    // Clear the cosmetic
    if (value.type === 'avatarBorders') student.settings.cosmetics.avatarBorder = '';
    else if (value.type === 'nameStyles') student.settings.cosmetics.nameStyle = '';
    else if (value.type === 'animatedNameEffects') student.settings.cosmetics.animatedNameEffect = '';
    else if (value.type === 'animatedBorders') student.settings.cosmetics.animatedBorder = '';
    else if (value.type === 'titleEffects') student.settings.cosmetics.titleEffect = '';
    else if (value.type === 'chatColors') {
      student.settings.cosmetics.chatColor = '';
      student.settings.cosmetics.chatBubbleColor = '';
    }
    else if (value.type === 'backgrounds') student.settings.cosmetics.backgroundUrl = '';

    student.markModified('settings');
    await student.save();

    io.emit("cosmetic:updated", { roll: student.roll, cosmetics: student.settings.cosmetics });

    res.json({ ok: true, message: `Removed ${value.type} from ${value.roll}`, cosmetics: student.settings.cosmetics });
  } catch (err) {
    console.error("❌ admin remove cosmetic error:", err);
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

      // Auto-remove premium cosmetics on high violation
      student.settings = student.settings || {};
      student.settings.cosmetics = student.settings.cosmetics || {};

      const removedCosmetics = [];
      if (student.settings.cosmetics.animatedNameEffect) {
        removedCosmetics.push(`Animated Name: ${student.settings.cosmetics.animatedNameEffect}`);
        student.settings.cosmetics.animatedNameEffect = '';
      }
      if (student.settings.cosmetics.animatedBorder) {
        removedCosmetics.push(`Animated Border: ${student.settings.cosmetics.animatedBorder}`);
        student.settings.cosmetics.animatedBorder = '';
      }
      if (student.settings.cosmetics.titleEffect) {
        removedCosmetics.push(`Title Effect: ${student.settings.cosmetics.titleEffect}`);
        student.settings.cosmetics.titleEffect = '';
      }
      if (student.settings.cosmetics.chatColor) {
        removedCosmetics.push('Chat Color');
        student.settings.cosmetics.chatColor = '';
        student.settings.cosmetics.chatBubbleColor = '';
      }
      
      if (removedCosmetics.length > 0) {
        student.markModified('settings.cosmetics');
        io.emit("cosmetic:removed-violation", { 
          roll: student.roll, 
          cosmetics: student.settings.cosmetics,
          removed: removedCosmetics,
          reason: "High violation issued"
        });
      }
    }

    if (student.warningsCount >= 3) {
      student.lockedUntil = new Date(Date.now() + 24 * 3600 * 1000);
      student.warningsCount = 0;
      const lockRecord = new Lock({ roll: student.roll, reason: "auto-lock after warnings", lockedBy: req.student.roll, expiresAt: student.lockedUntil });
      await lockRecord.save();
      // Also set Redis lock (24h)
      if (redis) await setAccountLockRedis(student.roll, 24 * 3600, "auto-lock after warnings");
      await logAudit(req.student.roll, 'AUTO_LOCK', `${value.roll} auto-locked after 3 warnings`);
    }

    await logAudit(req.student.roll, 'WARNING', `${value.roll} warned (${value.level}) - ${value.reason}`);
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

    await logAudit(req.student.roll, 'WARNING_REMOVED', `Removed warning from ${warn.roll} (${warn.reason})`);
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

    await logAudit(req.student.roll, 'LOCK_STUDENT', `Locked ${value.roll} for ${value.seconds}s - Reason: ${value.reason}`);

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

    await logAudit(req.student.roll, 'UNLOCK_STUDENT', `Unlocked ${value.roll}`);

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

// Admin: delete notice
app.delete("/api/admin/notice/:id", authenticate, requireAdmin, csrfProtect, async (req, res) => {
  try {
    const notice = await Notice.findByIdAndDelete(req.params.id);
    if (!notice) return res.status(404).json({ error: "Notice not found" });
    
    io.emit("notice:deleted", { id: req.params.id });
    res.json({ ok: true, message: "Notice deleted" });
  } catch (err) {
    console.error("delete notice error:", err);
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

// Get system messages for student (distinct from appeals)
app.get("/api/student/system-messages", authenticate, csrfProtect, async (req, res) => {
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

// Mark system message as read
app.post("/api/student/system-messages/:id/read", authenticate, csrfProtect, async (req, res) => {
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

// ==================== SUPER ADMIN ROUTES ====================
function requireSuperAdmin(req, res, next) {
  if (req.student?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
}

// List all admins
app.get("/api/super-admin/admins", authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const admins = await Student.find({ role: { $in: ['admin', 'super_admin'] } }).select('roll name email dept');
    res.json(admins);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Promote to admin
app.post("/api/super-admin/promote-admin", authenticate, requireSuperAdmin, csrfProtect, async (req, res) => {
  try {
    const { roll } = req.body;
    if (!roll) return res.status(400).json({ error: 'Roll required' });
    
    await Student.updateOne({ roll }, { role: 'admin' });
    await logAudit(req.student.roll, 'PROMOTE', `${roll} promoted to admin`);
    res.json({ ok: true, message: 'User promoted to admin' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Revoke admin privileges
app.post("/api/super-admin/revoke-admin", authenticate, requireSuperAdmin, csrfProtect, async (req, res) => {
  try {
    const { roll } = req.body;
    if (!roll) return res.status(400).json({ error: 'Roll required' });
    
    await Student.updateOne({ roll }, { role: 'student' });
    await logAudit(req.student.roll, 'REVOKE', `Admin privileges revoked from ${roll}`);
    res.json({ ok: true, message: 'Admin privileges revoked' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// List moderators
app.get("/api/super-admin/moderators", authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const mods = await Student.find({ role: 'moderator' }).select('roll name email');
    res.json(mods);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Appoint moderator
app.post("/api/super-admin/appoint-moderator", authenticate, requireSuperAdmin, csrfProtect, async (req, res) => {
  try {
    const { roll, reason } = req.body;
    if (!roll) return res.status(400).json({ error: 'Roll required' });
    
    await Student.updateOne({ roll }, { role: 'moderator', appointmentReason: reason });
    res.json({ ok: true, message: 'User appointed as moderator' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// List teachers
app.get("/api/super-admin/teachers", authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const teachers = await Student.find({ role: 'teacher' }).select('roll name email subject class');
    res.json(teachers);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Assign teacher
app.post("/api/super-admin/assign-teacher", authenticate, requireSuperAdmin, csrfProtect, async (req, res) => {
  try {
    const { roll, subject, class: cls } = req.body;
    if (!roll || !subject || !cls) return res.status(400).json({ error: 'All fields required' });
    
    await Student.updateOne({ roll }, { role: 'teacher', subject, class: cls });
    res.json({ ok: true, message: 'User assigned as teacher' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Maintenance mode
app.post("/api/super-admin/maintenance", authenticate, requireSuperAdmin, csrfProtect, async (req, res) => {
  try {
    const { enabled, message } = req.body;
    let config = await SystemConfig.findOne({ key: 'maintenance' });
    if (!config) {
      config = new SystemConfig({ key: 'maintenance', value: {} });
    }
    config.value = { enabled, message };
    config.markModified('value');
    await config.save();
    
    io.emit('system:maintenance', { enabled, message });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Audit logs
app.get("/api/super-admin/audit-logs", authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const limit = Math.min(500, parseInt(req.query.limit || "100", 10));
    const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(limit);
    res.json(logs || []);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Audit logs for admin (limited to recent actions)
app.get("/api/admin/audit-logs", authenticate, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(200, parseInt(req.query.limit || "50", 10));
    const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(limit);
    res.json(logs || []);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== MODERATOR ROUTES ====================
function requireModerator(req, res, next) {
  if (!['moderator', 'admin', 'super_admin'].includes(req.student?.role)) {
    return res.status(403).json({ error: 'Moderator access required' });
  }
  next();
}

// Get reports
app.get("/api/moderator/reports", authenticate, requireModerator, async (req, res) => {
  try {
    const { status } = req.query;
    let query = {};
    if (status) query.status = status;
    
    const reports = await Report.find(query).sort({ createdAt: -1 }).limit(50);
    res.json(reports || []);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Warn student
app.post("/api/moderator/warn-student", authenticate, requireModerator, csrfProtect, async (req, res) => {
  try {
    const { roll, reason, details } = req.body;
    if (!roll || !reason) return res.status(400).json({ error: 'Roll and reason required' });
    
    const student = await Student.findOne({ roll });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    
    student.warningsCount = (student.warningsCount || 0) + 1;
    await student.save();
    
    await SystemMessage.create({
      recipientRoll: roll,
      title: 'Moderation Warning',
      content: `You have received a warning: ${reason}. ${details || ''}`,
      type: 'warning'
    });
    
    res.json({ ok: true, message: 'Warning issued' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Suspend student
app.post("/api/moderator/suspend-student", authenticate, requireModerator, csrfProtect, async (req, res) => {
  try {
    const { roll, reason, suspensionHours } = req.body;
    if (!roll || !suspensionHours) return res.status(400).json({ error: 'Roll and duration required' });
    
    const suspensionUntil = new Date(Date.now() + suspensionHours * 3600 * 1000);
    await Student.updateOne({ roll }, { 
      chatbotLocked: true,
      chatbotLockedUntil: suspensionUntil,
      chatbotLockReason: reason || 'Moderation suspension'
    });
    
    await SystemMessage.create({
      recipientRoll: roll,
      title: 'Suspension Notice',
      content: `Your account has been suspended for ${suspensionHours} hours. Reason: ${reason || 'Policy violation'}`,
      type: 'alert'
    });
    
    res.json({ ok: true, message: 'Student suspended' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Daily report
app.get("/api/moderator/report/daily", authenticate, requireModerator, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    res.json({
      date: today,
      reports: 0,
      warnings: 0,
      suspensions: 0,
      resolved: 0
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== TEACHER ROUTES ====================
function requireTeacher(req, res, next) {
  if (!['teacher', 'admin', 'super_admin'].includes(req.student?.role)) {
    return res.status(403).json({ error: 'Teacher access required' });
  }
  next();
}

// Create assignment
app.post("/api/teacher/create-assignment", authenticate, requireTeacher, csrfProtect, async (req, res) => {
  try {
    const { title, description, dueDate, type } = req.body;
    if (!title || !description) return res.status(400).json({ error: 'Title and description required' });
    
    res.json({ ok: true, message: 'Assignment created', assignmentId: Math.random().toString(36) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Post announcement
app.post("/api/teacher/post-announcement", authenticate, requireTeacher, csrfProtect, async (req, res) => {
  try {
    const { title, content, type } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
    
    await SystemMessage.create({
      recipientRoll: 'all',
      title: `[Announcement] ${title}`,
      content,
      type: 'info',
      trigger: 'manual'
    });
    
    res.json({ ok: true, message: 'Announcement posted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Submit grade
app.post("/api/teacher/submit-grade", authenticate, requireTeacher, csrfProtect, async (req, res) => {
  try {
    const { roll, assignment, score } = req.body;
    if (!roll || !assignment || score === undefined) return res.status(400).json({ error: 'All fields required' });
    
    res.json({ ok: true, message: 'Grade submitted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
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

   
