// src/routes/workerRoutes.js
import express from "express";
import multer from "multer";
import fs from "fs";
import dotenv from "dotenv";
import cloudinary from "../utils/cloudinary.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Worker from "../models/Worker.js";
import User from "../models/user.model.js";
import {
  authenticate,
  authorize,
  optionalAuth,
} from "../middleware/auth.middleware.js";
import {
  getAllWorkers,
  getWorkerById,
  getWorkerProfile,
  getNearbyWorkers,
  searchWorkers,
  updateAvailability,
  getWorkerStats,
  contactWorker,
} from "../controllers/worker.controller.js";

dotenv.config();
const router = express.Router();

// ===============================
// CONFIG
// ===============================
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 },
});
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ===============================
// HELPERS
// ===============================
function validateAadhaar(aadhaarNumber) {
  if (!aadhaarNumber)
    return { valid: false, message: "Aadhaar number is required" };

  const cleanNumber = aadhaarNumber.replace(/\s/g, "");
  if (!/^\d{12}$/.test(cleanNumber)) {
    return {
      valid: false,
      message: "Aadhaar number must be exactly 12 digits",
    };
  }
  return { valid: true, cleanNumber };
}

// ===============================
// PUBLIC ROUTES
// ===============================

// ✅ Get all workers
router.get("/", optionalAuth, getAllWorkers);

// ✅ Search workers
router.get("/search", optionalAuth, searchWorkers);

// ✅ Get single worker by ID (this is the main fix — removed extra /worker)
router.get("/:id", optionalAuth, getWorkerById);

// ✅ Worker stats
router.get("/:id/stats", optionalAuth, getWorkerStats);

// ✅ Nearby workers
router.post("/nearby", optionalAuth, getNearbyWorkers);

// ===============================
// PROTECTED ROUTES
// ===============================

// ✅ Upload worker photo
router.post(
  "/upload-photo",
  authenticate,
  upload.single("photo"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "No file uploaded",
          message: "Please ensure you're sending a file with key 'photo'",
        });
      }

      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "worker-photos",
        resource_type: "image",
        transformation: [
          { width: 500, height: 500, crop: "fill" },
          { quality: "auto" },
        ],
      });

      fs.unlinkSync(req.file.path);
      res.json({ imageUrl: result.secure_url });
    } catch (err) {
      console.error("Upload error:", err);
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({
        error: "Photo upload failed",
        details: err.message,
      });
    }
  }
);

// ✅ Generate worker card
router.post(
  "/generate-card",
  authenticate,
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "aadhaar", maxCount: 1 },
  ]),
  async (req, res) => {
    console.log("---- /generate-card START ----");
    try {
      const { text, aadhaarNumber } = req.body;
      if (!text)
        return res.status(400).json({ error: "Missing worker description" });

      // Aadhaar validation
      let validatedAadhaar = null;
      if (aadhaarNumber) {
        const validation = validateAadhaar(aadhaarNumber);
        if (!validation.valid)
          return res.status(400).json({
            error: "Invalid Aadhaar number",
            message: validation.message,
          });
        validatedAadhaar = validation.cleanNumber;
      }

      // Upload photo
      let profileImageUrl = null;
      if (req.files?.photo?.[0]) {
        const photoResult = await cloudinary.uploader.upload(
          req.files.photo[0].path,
          {
            folder: "worker-photos",
            resource_type: "image",
            transformation: [
              { width: 500, height: 500, crop: "fill" },
              { quality: "auto" },
            ],
          }
        );
        profileImageUrl = photoResult.secure_url;
        fs.unlinkSync(req.files.photo[0].path);
      }

      // Upload Aadhaar
      let aadhaarUrl = null;
      if (req.files?.aadhaar?.[0]) {
        const aadhaarResult = await cloudinary.uploader.upload(
          req.files.aadhaar[0].path,
          {
            folder: "worker-aadhaar",
            resource_type: "image",
          }
        );
        aadhaarUrl = aadhaarResult.secure_url;
        fs.unlinkSync(req.files.aadhaar[0].path);
      }

      // AI extraction
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
      const prompt = `
Extract and structure this user description into valid JSON:
{
  "fullName": "",
  "profession": "",
  "experience": "",
  "skills": [],
  "endorsements": [],
  "verified": false,
  "voiceText": ""
}
Return ONLY JSON.
User description: ${text}`;
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const cleanText = responseText.replace(/```(?:json)?|```/g, "").trim();
      const cardData = JSON.parse(cleanText);

      if (!cardData.fullName || !cardData.profession)
        return res.status(400).json({
          error: "AI failed to extract required fields",
          details: cardData,
        });

      if (typeof cardData.skills === "string")
        cardData.skills = [cardData.skills];
      if (!Array.isArray(cardData.skills)) cardData.skills = [];

      if (profileImageUrl) cardData.profileImageUrl = profileImageUrl;
      if (aadhaarUrl) cardData.aadhaarUrl = aadhaarUrl;
      if (validatedAadhaar) cardData.aadhaarNumber = validatedAadhaar;

      // Save to DB
      const worker = new Worker({
        ...cardData,
        createdBy: req.user.id,
        history: [
          {
            action: "CREATED",
            description: "Worker card generated by AI",
            timestamp: new Date(),
            metadata: { userId: req.user.id },
          },
        ],
      });

      await worker.save();
      await User.findByIdAndUpdate(req.user.id, {
        workerProfile: worker._id,
        role: "worker",
      });

      res.status(201).json({
        success: true,
        message: "Worker card generated successfully",
        worker,
      });
    } catch (err) {
      console.error("Unexpected /generate-card error:", err);
      res.status(500).json({
        error: "Worker card generation failed",
        details: err.message,
      });
    }
  }
);

// ✅ Update worker
router.put("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const worker = await Worker.findById(id);
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    if (
      worker.createdBy?.toString() !== req.user.id &&
      req.user.role !== "admin"
    )
      return res.status(403).json({ error: "Not authorized" });

    if (updates.aadhaarNumber) {
      const validation = validateAadhaar(updates.aadhaarNumber);
      if (!validation.valid)
        return res.status(400).json({
          error: "Invalid Aadhaar number",
          message: validation.message,
        });
      updates.aadhaarNumber = validation.cleanNumber;
    }

    updates.history = [
      ...(worker.history || []),
      {
        action: "UPDATED",
        description: "Worker profile updated",
        timestamp: new Date(),
        metadata: { userId: req.user.id },
      },
    ];

    const updatedWorker = await Worker.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
    res.json({ success: true, worker: updatedWorker });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to update worker", details: err.message });
  }
});

// ✅ Private profile
router.get("/profile/:id", authenticate, getWorkerProfile);

// ✅ Update availability
router.patch("/:id/availability", authenticate, updateAvailability);

// ✅ Contact worker
router.post("/:id/contact", authenticate, contactWorker);

// ✅ Flag worker
router.post("/:id/flag", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const worker = await Worker.findById(id);
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    worker.flags = (worker.flags || 0) + 1;
    worker.flagReasons.push({
      reason,
      flaggedBy: req.user.id,
      date: new Date(),
    });

    if (worker.flags >= 3) {
      await Worker.findByIdAndDelete(id);
      return res.json({
        success: true,
        deleted: true,
        message: `Worker ${worker.fullName} removed after multiple flags.`,
      });
    }

    await worker.save();
    res.json({
      success: true,
      message: `Worker flagged (${worker.flags}/3).`,
      worker: {
        _id: worker._id,
        fullName: worker.fullName,
        flags: worker.flags,
      },
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to flag worker", details: err.message });
  }
});

// ✅ Accept endorsement
router.post("/:id/endorsement", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { endorserName, endorsementText } = req.body;
    const worker = await Worker.findById(id);
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    if (worker.createdBy?.toString() !== req.user.id)
      return res.status(403).json({ error: "Not authorized" });

    worker.endorsements.push({
      endorserName: endorserName || "Anonymous",
      text: endorsementText || "Endorsed",
      accepted: true,
      date: new Date(),
    });

    worker.history.push({
      action: "ENDORSEMENT_ACCEPTED",
      description: "Endorsement accepted",
      timestamp: new Date(),
    });

    await worker.save();
    res.json({ success: true, message: "Endorsement accepted", worker });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Worker history
router.get("/:id/history", authenticate, async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    if (
      worker.createdBy?.toString() !== req.user.id &&
      req.user.role !== "admin"
    )
      return res.status(403).json({ error: "Not authorized" });

    res.json({ history: worker.history || [] });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// ===============================
// ADMIN ROUTES
// ===============================
router.delete("/:id", authenticate, authorize("admin"), async (req, res) => {
  try {
    const worker = await Worker.findByIdAndDelete(req.params.id);
    if (!worker) return res.status(404).json({ error: "Worker not found" });
    res.json({ success: true, message: "Worker deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete worker" });
  }
});

export default router;
