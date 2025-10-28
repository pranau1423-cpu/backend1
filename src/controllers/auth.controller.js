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

const cryptoHash = (rid) =>
  crypto.createHash("sha256").update(rid).digest("hex");

const register = async (req, res) => {
  const { email, password, role } = req.body;

  // Validation
  if (!email || !password) {
    return res.status(400).json({ 
      error: "Email and password are required" 
    });
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ 
      error: "Invalid email format" 
    });
  }

  // Password validation (min 8 chars, 1 uppercase, 1 number)
  if (password.length < 8) {
    return res.status(400).json({ 
      error: "Password must be at least 8 characters long" 
    });
  }

  // Check if user exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return res.status(409).json({ 
      error: "User already exists with this email" 
    });
  }

  const registerDate = new Date();
  const passwordHash = await hashPassword(password);
  
  const user = new User({ 
    email: email.toLowerCase(), 
    registerDate, 
    passwordHash,
    role: role || "user" // default to "user" role
  });
  
  await user.save();
  
  res.status(201).json({ 
    success: true,
    message: "User registered successfully",
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      registerDate: user.registerDate
    }
  });
};

const login = async (req, res) => {
  const { email, password, deviceInfo } = req.body;

  if (!email || !password) {
    return res.status(400).json({ 
      error: "Email and password are required" 
    });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.status(404).json({ 
      error: "Invalid credentials" 
    });
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    return res.status(401).json({ 
      error: "Invalid credentials" 
    });
  }

  // Generate tokens
  const access = signAccess({ sub: user._id, role: user.role });
  const rid = genRefreshId();
  const refresh = signRefresh({ sub: user._id, rid });

  // Store refresh token hash in session
  const hashed = cryptoHash(rid);
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000); // 30 days
  
  user.sessions.push({
    deviceInfo: deviceInfo || req.get("User-Agent") || "Unknown device",
    refreshTokenHash: hashed,
    createdAt: new Date(),
    lastUsedAt: new Date(),
    expiresAt,
  });

  // Keep only last 5 sessions
  if (user.sessions.length > 5) {
    user.sessions = user.sessions.slice(-5);
  }

  user.lastLogin = new Date();
  await user.save();

  // Set HTTP-only cookie
  res.cookie(COOKIE_NAME, refresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
    maxAge: 30 * 24 * 3600 * 1000, // 30 days
  });

  res.json({ 
    success: true,
    access,
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      workerProfile: user.workerProfile
    }
  });
};

const refresh = async (req, res) => {
  const token = req.cookies[COOKIE_NAME];
  
  if (!token) {
    return res.status(401).json({ 
      error: "No refresh token provided",
      code: "NO_REFRESH_TOKEN"
    });
  }

  let payload;
  try {
    payload = verifyRefresh(token);
  } catch (err) {
    res.clearCookie(COOKIE_NAME, { path: "/" });
    return res.status(401).json({ 
      error: "Invalid or expired refresh token",
      code: "INVALID_REFRESH_TOKEN"
    });
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    res.clearCookie(COOKIE_NAME, { path: "/" });
    return res.status(401).json({ 
      error: "User not found",
      code: "USER_NOT_FOUND"
    });
  }

  const hashed = cryptoHash(payload.rid);
  const session = user.sessions.find((s) => s.refreshTokenHash === hashed);

  if (!session) {
    res.clearCookie(COOKIE_NAME, { path: "/" });
    return res.status(401).json({ 
      error: "Session not found",
      code: "SESSION_NOT_FOUND"
    });
  }

  if (session.expiresAt < new Date()) {
    user.sessions = user.sessions.filter((s) => s.refreshTokenHash !== hashed);
    await user.save();
    res.clearCookie(COOKIE_NAME, { path: "/" });
    return res.status(401).json({ 
      error: "Session expired",
      code: "SESSION_EXPIRED"
    });
  }

  // Rotate refresh token
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

  res.json({ 
    success: true,
    access: newAccess 
  });
};

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
  res.json({ 
    success: true,
    message: "Logged out successfully"
  });
};

// Get current user info
const me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-passwordHash -sessions')
      .populate('workerProfile');
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user info" });
  }
};

// Get user sessions
const sessions = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('sessions');
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Don't send refresh token hashes
    const sanitizedSessions = user.sessions.map(session => ({
      deviceInfo: session.deviceInfo,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      _id: session._id
    }));
    
    res.json({ sessions: sanitizedSessions });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
};

// Revoke a specific session
const revokeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const initialLength = user.sessions.length;
    user.sessions = user.sessions.filter(
      s => s._id.toString() !== sessionId
    );
    
    if (user.sessions.length === initialLength) {
      return res.status(404).json({ error: "Session not found" });
    }
    
    await user.save();
    res.json({ 
      success: true,
      message: "Session revoked successfully" 
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to revoke session" });
  }
};

export { 
  register, 
  login, 
  refresh, 
  logout, 
  me, 
  sessions, 
  revokeSession 
};