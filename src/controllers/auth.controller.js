// src/controllers/auth.controller.js
// Replace the login function with this fixed version

import User from "../models/user.model.js";
import {
  signAccess,
  signRefresh,
  verifyRefresh,
  genRefreshId,
} from "../utils/token.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import crypto from "crypto";

const COOKIE_NAME = "jid";
const HARD_CODED_OTP = "123456";

const cryptoHash = (rid) =>
  crypto.createHash("sha256").update(rid).digest("hex");

/* ==============================
   LOGIN (MOBILE + OTP) - FIXED
   ============================== */
const login = async (req, res) => {
  const { mobile, otp, role, deviceInfo } = req.body;
  console.log("🔐 Login request:", mobile);

  if (!mobile || !otp) {
    return res.status(400).json({
      error: "Mobile number and OTP are required",
    });
  }

  try {
    // ✅ OTP check
    if (otp !== HARD_CODED_OTP) {
      console.log("❌ Invalid OTP for:", mobile);
      return res.status(401).json({
        error: "Invalid OTP",
      });
    }

    // ✅ Find user and populate workerProfile
    let user = await User.findOne({ mobile }).populate("workerProfile");

    if (!user) {
      console.log("👤 Creating new user for mobile:", mobile);
      user = new User({
        mobile,
        role: role || "worker",
        registerDate: new Date(),
      });
      await user.save();
      console.log("✅ New user created:", user._id);
    } else {
      console.log("✅ Existing user found:", user._id);
    }

    // ✅ Create tokens
    const access = signAccess({ sub: user._id, role: user.role });
    const rid = genRefreshId();
    const refresh = signRefresh({ sub: user._id, rid });

    const hashed = cryptoHash(rid);
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);

    user.sessions.push({
      deviceInfo: deviceInfo || req.get("User-Agent") || "Unknown device",
      refreshTokenHash: hashed,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      expiresAt,
    });

    if (user.sessions.length > 5) {
      user.sessions = user.sessions.slice(-5);
    }

    user.lastLogin = new Date();
    await user.save();

    // ✅ Set refresh cookie
    res.cookie(COOKIE_NAME, refresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
      maxAge: 30 * 24 * 3600 * 1000,
    });

    console.log("✅ Login success:", user.mobile, "Role:", user.role);
    console.log("✅ Worker Profile ID:", user.workerProfile?._id || "None");

    // ✅ Return response with workerProfile info
    res.json({
      success: true,
      access,
      user: {
        id: user._id,
        mobile: user.mobile,
        email: user.email || null,
        role: user.role,
        workerProfile: user.workerProfile?._id || null,
        hasProfile: !!user.workerProfile,
      },
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    console.error("Error stack:", err.stack);
    res.status(500).json({
      error: "Login failed",
      details: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
};

/* ==============================
   REGISTER (EMAIL + PASSWORD)
   ============================== */
const register = async (req, res) => {
  console.log("📝 Register request:", req.body);

  const { email, password, role, fullName, profession } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: "Email and password are required",
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: "Password must be at least 8 characters long",
    });
  }

  try {
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        error: "User already exists with this email",
      });
    }

    const passwordHash = await hashPassword(password);
    const user = new User({
      email: email.toLowerCase(),
      passwordHash,
      role: role || "customer",
      registerDate: new Date(),
    });

    await user.save();
    console.log("✅ Registered:", user.email, "Role:", user.role);

    const access = signAccess({ sub: user._id, role: user.role });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      access,
      user: {
        id: user._id,
        email: user.email,
        mobile: user.mobile || null,
        role: user.role,
        registerDate: user.registerDate,
        workerProfile: null,
        hasProfile: false,
      },
    });
  } catch (err) {
    console.error("❌ Registration error:", err);
    console.error("Error stack:", err.stack);
    res.status(500).json({
      error: "Registration failed",
      details: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
};

/* ==============================
   EMAIL LOGIN (EMAIL + PASSWORD)
   ============================== */
const emailLogin = async (req, res) => {
  const { email, password, deviceInfo } = req.body;
  console.log("🔐 Email login request:", email);

  if (!email || !password) {
    return res.status(400).json({
      error: "Email and password are required",
    });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() }).populate(
      "workerProfile"
    );

    if (!user) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    if (!user.passwordHash) {
      return res.status(401).json({
        error: "This account uses mobile login",
      });
    }

    const isValid = await verifyPassword(user.passwordHash, password);
    if (!isValid) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    // Create tokens
    const access = signAccess({ sub: user._id, role: user.role });
    const rid = genRefreshId();
    const refresh = signRefresh({ sub: user._id, rid });

    const hashed = cryptoHash(rid);
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);

    user.sessions.push({
      deviceInfo: deviceInfo || req.get("User-Agent") || "Unknown device",
      refreshTokenHash: hashed,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      expiresAt,
    });

    if (user.sessions.length > 5) {
      user.sessions = user.sessions.slice(-5);
    }

    user.lastLogin = new Date();
    await user.save();

    res.cookie(COOKIE_NAME, refresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
      maxAge: 30 * 24 * 3600 * 1000,
    });

    console.log("✅ Email login success:", user.email, "Role:", user.role);

    res.json({
      success: true,
      access,
      user: {
        id: user._id,
        email: user.email,
        mobile: user.mobile || null,
        role: user.role,
        workerProfile: user.workerProfile?._id || null,
        hasProfile: !!user.workerProfile,
      },
    });
  } catch (err) {
    console.error("❌ Email login error:", err);
    console.error("Error stack:", err.stack);
    res.status(500).json({
      error: "Login failed",
      details: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
};

/* ==============================
   ME / GET USER INFO
   ============================== */
const me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-passwordHash -sessions")
      .populate("workerProfile");

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      user: {
        id: user._id,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        workerProfile: user.workerProfile?._id || null,
        hasProfile: !!user.workerProfile,
        registerDate: user.registerDate,
        lastLogin: user.lastLogin,
      },
    });
  } catch (err) {
    console.error("❌ Fetch user error:", err);
    res.status(500).json({
      error: "Failed to fetch user info",
      details: err.message,
    });
  }
};

// Export all functions
export {
  register,
  login,
  emailLogin,
  me,
  // ... other exports (refresh, logout, sessions, revokeSession)
};
