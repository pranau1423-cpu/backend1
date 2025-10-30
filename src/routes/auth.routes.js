import express from "express";
const router = express.Router();

import { wrapAsync } from "../utils/wrapAsync.js";
import { authenticate } from "../middleware/auth.middleware.js";

import {
  register,
  login,
  emailLogin,
  refresh,
  logout,
  me,
  sessions,
  revokeSession,
} from "../controllers/auth.controller.js";

// Public routes
router.post("/register", wrapAsync(register));
router.post("/login", wrapAsync(login)); // Mobile + OTP login
router.post("/email-login", wrapAsync(emailLogin)); // Email + Password login
router.post("/refresh", wrapAsync(refresh));
router.post("/logout", wrapAsync(logout));

// Protected routes (require authentication)
router.get("/me", authenticate, wrapAsync(me));
router.get("/sessions", authenticate, wrapAsync(sessions));
router.delete("/sessions/:sessionId", authenticate, wrapAsync(revokeSession));

export default router;
