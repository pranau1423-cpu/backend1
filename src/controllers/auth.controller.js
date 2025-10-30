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
   REGISTER (EMAIL + PASSWORD)
   ============================== */
const register = async (req, res) => {
  console.log("📝 Register request:", req.body.email);

  const { email, password, role } = req.body;

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
      role: role || "user",
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
        mobile: user.mobile,
        role: user.role,
        registerDate: user.registerDate,
        workerProfile: null,
        hasProfile: false,
      },
    });
  } catch (err) {
    console.error("❌ Registration error:", err);
    res.status(500).json({
      error: "Registration failed",
      details: err.message,
    });
  }
};

/* ==============================
   LOGIN (MOBILE + OTP)
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

    // ✅ Find or create user
    let user = await User.findOne({ mobile }).populate("workerProfile");

    if (!user) {
      console.log("👤 Creating new user for mobile:", mobile);
      user = new User({
        mobile,
        role: role || "worker",
        registerDate: new Date(),
      });
      await user.save();
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

    res.json({
      success: true,
      access,
      user: {
        id: user._id,
        mobile: user.mobile,
        role: user.role,
        workerProfile: user.workerProfile?._id || null,
        hasProfile: !!user.workerProfile,
      },
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({
      error: "Login failed",
      details: err.message,
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
        mobile: user.mobile,
        role: user.role,
        workerProfile: user.workerProfile?._id || null,
        hasProfile: !!user.workerProfile,
      },
    });
  } catch (err) {
    console.error("❌ Email login error:", err);
    res.status(500).json({
      error: "Login failed",
      details: err.message,
    });
  }
};

/* ==============================
   REFRESH TOKEN
   ============================== */
const refresh = async (req, res) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({
      error: "No refresh token provided",
      code: "NO_REFRESH_TOKEN",
    });
  }

  let payload;
  try {
    payload = verifyRefresh(token);
  } catch (err) {
    res.clearCookie(COOKIE_NAME, { path: "/" });
    return res.status(401).json({
      error: "Invalid or expired refresh token",
      code: "INVALID_REFRESH_TOKEN",
    });
  }

  try {
    const user = await User.findById(payload.sub);
    if (!user) {
      res.clearCookie(COOKIE_NAME, { path: "/" });
      return res.status(401).json({ error: "User not found" });
    }

    const hashed = cryptoHash(payload.rid);
    const session = user.sessions.find((s) => s.refreshTokenHash === hashed);

    if (!session) {
      res.clearCookie(COOKIE_NAME, { path: "/" });
      return res.status(401).json({ error: "Session not found" });
    }

    if (session.expiresAt < new Date()) {
      user.sessions = user.sessions.filter(
        (s) => s.refreshTokenHash !== hashed
      );
      await user.save();
      res.clearCookie(COOKIE_NAME, { path: "/" });
      return res.status(401).json({ error: "Session expired" });
    }

    const newRid = genRefreshId();
    const newRefresh = signRefresh({ sub: user._id, rid: newRid });
    session.refreshTokenHash = cryptoHash(newRid);
    session.lastUsedAt = new Date();
    await user.save();

    const newAccess = signAccess({ sub: user._id, role: user.role });

    res.cookie(COOKIE_NAME, newRefresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
      maxAge: 30 * 24 * 3600 * 1000,
    });

    res.json({ success: true, access: newAccess });
  } catch (err) {
    console.error("❌ Refresh error:", err);
    res.status(500).json({
      error: "Token refresh failed",
      details: err.message,
    });
  }
};

/* ==============================
   LOGOUT
   ============================== */
const logout = async (req, res) => {
  const token = req.cookies[COOKIE_NAME];

  if (token) {
    try {
      const payload = verifyRefresh(token);
      const user = await User.findById(payload.sub);

      if (user) {
        const hashed = cryptoHash(payload.rid);
        user.sessions = user.sessions.filter(
          (s) => s.refreshTokenHash !== hashed
        );
        await user.save();
      }
    } catch (e) {
      console.error("Logout error:", e.message);
    }
  }

  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ success: true, message: "Logged out successfully" });
};

/* ==============================
   ME / SESSIONS / REVOKE
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
        profileData: user.workerProfile || null,
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

const sessions = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("sessions");
    if (!user) return res.status(404).json({ error: "User not found" });

    const sanitizedSessions = user.sessions.map((s) => ({
      deviceInfo: s.deviceInfo,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      expiresAt: s.expiresAt,
      _id: s._id,
    }));

    res.json({ sessions: sanitizedSessions });
  } catch (err) {
    console.error("❌ Fetch sessions error:", err);
    res.status(500).json({
      error: "Failed to fetch sessions",
      details: err.message,
    });
  }
};

const revokeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const before = user.sessions.length;
    user.sessions = user.sessions.filter((s) => s._id.toString() !== sessionId);

    if (user.sessions.length === before)
      return res.status(404).json({ error: "Session not found" });

    await user.save();
    res.json({ success: true, message: "Session revoked successfully" });
  } catch (err) {
    console.error("❌ Revoke session error:", err);
    res.status(500).json({
      error: "Failed to revoke session",
      details: err.message,
    });
  }
};

export {
  register,
  login,
  emailLogin,
  refresh,
  logout,
  me,
  sessions,
  revokeSession,
};

/* ==============================
   FRONTEND SignIn.jsx FIX
   ============================== */

// Replace the handleVerifyOtp function in SignIn.jsx with this:

const handleVerifyOtp = async (e) => {
  e.preventDefault();
  setError("");
  setIsLoading(true);

  try {
    if (otp !== HARD_CODED_OTP) throw new Error("Invalid OTP. Try again.");

    const response = await fetch("http://localhost:8080/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ mobile, otp, role: userType }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Login failed");

    // Store auth data
    localStorage.setItem("token", data.access);
    localStorage.setItem("user", JSON.stringify(data.user));

    console.log("Login successful:", data.user);

    // Navigate based on whether worker has profile
    if (userType === "worker") {
      if (data.user.hasProfile) {
        // Worker has profile, go to their profile page
        navigate(`/worker-profile/${data.user.workerProfile}`);
      } else {
        // Worker needs to create profile
        navigate("/worker-home");
      }
    } else {
      // Customer goes to customer home
      navigate("/customer-home");
    }
  } catch (err) {
    setError(err.message);
  } finally {
    setIsLoading(false);
  }
};
