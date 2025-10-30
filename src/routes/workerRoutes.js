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

dotenv.config();
const router = express.Router();

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper function to validate Aadhaar number
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

// PUBLIC ROUTES (no auth required)

// Get all workers (public viewing)
router.get("/", optionalAuth, async (req, res) => {
  try {
    const { profession, verified, search } = req.query;
    const filter = {};

    if (profession) filter.profession = new RegExp(profession, "i");
    if (verified === "true") filter.verified = true;
    if (search) {
      filter.$or = [
        { fullName: new RegExp(search, "i") },
        { profession: new RegExp(search, "i") },
        { skills: new RegExp(search, "i") },
      ];
    }

    const workers = await Worker.find(filter)
      .select("-history -aadhaarNumber") // Hide sensitive data
      .sort({ createdAt: -1 });

    res.json({ workers, count: workers.length });
  } catch (err) {
    console.error("Fetch workers error:", err);
    res.status(500).json({ error: "Failed to fetch workers" });
  }
});
// Get single worker by ID (public)
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ ADD VALIDATION
    if (!id || id === "undefined" || id === "null") {
      return res.status(400).json({
        error: "Invalid worker ID",
        message: "Worker ID is required",
      });
    }

    // ✅ CHECK IF VALID MONGODB ID
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid worker ID format",
        message: "ID must be a valid MongoDB ObjectId",
      });
    }

    const worker = await Worker.findById(id).select("-history -aadhaarNumber");

    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    res.json({ worker });
  } catch (err) {
    console.error("Fetch worker error:", err);
    res.status(500).json({
      error: "Failed to fetch worker",
      details: err.message,
    });
  }
});

// PROTECTED ROUTES (authentication required)

// Upload worker photo (authenticated users only)
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

      console.log("File received:", req.file);

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

// Generate worker card (authenticated users only)
router.post(
  "/generate-card",
  authenticate,
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "aadhaar", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { text, aadhaarNumber } = req.body;

      if (!text) {
        return res.status(400).json({
          error: "No text provided",
          message: "Please provide 'text' field in request body",
        });
      }

      console.log("Text received:", text);
      console.log("Aadhaar number received:", aadhaarNumber);

      // Validate Aadhaar number if provided
      let validatedAadhaar = null;
      if (aadhaarNumber) {
        const validation = validateAadhaar(aadhaarNumber);
        if (!validation.valid) {
          if (req.files?.photo?.[0]?.path)
            fs.unlinkSync(req.files.photo[0].path);
          if (req.files?.aadhaar?.[0]?.path)
            fs.unlinkSync(req.files.aadhaar[0].path);
          return res.status(400).json({
            error: "Invalid Aadhaar number",
            message: validation.message,
          });
        }
        validatedAadhaar = validation.cleanNumber;
      }

      // Upload photo if provided
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

      // Upload Aadhaar card if provided
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

      // Generate data from Gemini
      // Inside routes/worker.routes.js

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
            console.log("User ID:", req.user?.id);
            console.log("Text received:", text);
            console.log("Aadhaar received:", aadhaarNumber);
            console.log("Files received:", req.files);

            if (!text) {
              return res.status(400).json({
                error: "Missing text description",
                message: "Please provide a description of the worker.",
              });
            }

            // 🔹 Validate Aadhaar number if present
            let validatedAadhaar = null;
            if (aadhaarNumber) {
              const validation = validateAadhaar(aadhaarNumber);
              if (!validation.valid) {
                return res.status(400).json({
                  error: "Invalid Aadhaar number",
                  message: validation.message,
                });
              }
              validatedAadhaar = validation.cleanNumber;
            }

            // 🔹 Upload photo if present
            let profileImageUrl = null;
            if (req.files?.photo?.[0]) {
              try {
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
              } catch (err) {
                console.error("Cloudinary Photo Upload Error:", err);
                return res
                  .status(500)
                  .json({ error: "Photo upload failed", details: err.message });
              } finally {
                if (
                  req.files.photo[0]?.path &&
                  fs.existsSync(req.files.photo[0].path)
                )
                  fs.unlinkSync(req.files.photo[0].path);
              }
            }

            // 🔹 Upload Aadhaar if present
            let aadhaarUrl = null;
            if (req.files?.aadhaar?.[0]) {
              try {
                const aadhaarResult = await cloudinary.uploader.upload(
                  req.files.aadhaar[0].path,
                  {
                    folder: "worker-aadhaar",
                    resource_type: "image",
                  }
                );
                aadhaarUrl = aadhaarResult.secure_url;
              } catch (err) {
                console.error("Cloudinary Aadhaar Upload Error:", err);
                return res
                  .status(500)
                  .json({
                    error: "Aadhaar upload failed",
                    details: err.message,
                  });
              } finally {
                if (
                  req.files.aadhaar[0]?.path &&
                  fs.existsSync(req.files.aadhaar[0].path)
                )
                  fs.unlinkSync(req.files.aadhaar[0].path);
              }
            }

            // 🔹 Call Gemini AI
            let cardData;
            try {
              console.log("Calling Gemini API...");
              const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash-exp",
              });

              const prompt = `
          Extract and structure this user description into valid JSON.
          Format:
          {
            "fullName": "",
            "profession": "",
            "experience": "",
            "skills": [],
            "endorsements": [],
            "verified": false,
            "voiceText": ""
          }
          Return ONLY JSON (no markdown, no extra text).
          User description: ${text}
        `;

              const result = await model.generateContent(prompt);
              const responseText = result.response.text();
              console.log("Gemini Raw Response:", responseText);

              const cleanText = responseText
                .replace(/```(?:json)?|```/g, "")
                .trim();
              cardData = JSON.parse(cleanText);
            } catch (err) {
              console.error("Gemini AI or JSON Parse Error:", err);
              return res.status(500).json({
                error: "Gemini AI failed or returned invalid JSON",
                details: err.message,
              });
            }

            // 🔹 Validate Gemini output
            if (!cardData.fullName || !cardData.profession) {
              console.error("AI response missing key fields:", cardData);
              return res.status(400).json({
                error: "AI failed to extract required details",
                details: cardData,
              });
            }

            // Ensure skills array
            if (typeof cardData.skills === "string") {
              cardData.skills = [cardData.skills];
            }

            // 🔹 Add image & Aadhaar URLs
            if (profileImageUrl) cardData.profileImageUrl = profileImageUrl;
            if (aadhaarUrl) cardData.aadhaarUrl = aadhaarUrl;
            if (validatedAadhaar) cardData.aadhaarNumber = validatedAadhaar;

            // 🔹 Save to MongoDB
            try {
              const worker = new Worker({
                ...cardData,
                createdBy: req.user.id,
                history: [
                  {
                    action: "CREATED",
                    description: "Worker card auto-generated via AI",
                    timestamp: new Date(),
                    metadata: { userId: req.user.id },
                  },
                ],
              });

              await worker.save();

              // Link to user profile
              await User.findByIdAndUpdate(req.user.id, {
                workerProfile: worker._id,
                role: "worker",
              });

              console.log("✅ Worker saved successfully:", worker._id);
              return res.status(201).json({
                success: true,
                message: "Worker card generated successfully",
                worker,
              });
            } catch (dbErr) {
              console.error("MongoDB Save Error:", dbErr);
              return res
                .status(500)
                .json({ error: "MongoDB save failed", details: dbErr.message });
            }
          } catch (err) {
            console.error("Unexpected /generate-card Error:", err);
            return res.status(500).json({
              error: "AI processing or MongoDB save failed",
              details: err.message,
            });
          }
        }
      );

      await worker.save();

      // Update user profile to link worker
      await User.findByIdAndUpdate(req.user.id, {
        workerProfile: worker._id,
        role: "worker",
      });

      console.log("✅ Worker auto-saved:", worker._id);

      res.json({
        success: true,
        message: "Worker card generated and saved successfully",
        worker,
      });
    } catch (err) {
      console.error("Text processing error:", err);
      if (
        req.files?.photo?.[0]?.path &&
        fs.existsSync(req.files.photo[0].path)
      ) {
        fs.unlinkSync(req.files.photo[0].path);
      }
      if (
        req.files?.aadhaar?.[0]?.path &&
        fs.existsSync(req.files.aadhaar[0].path)
      ) {
        fs.unlinkSync(req.files.aadhaar[0].path);
      }
      res.status(500).json({
        error: "AI processing or MongoDB save failed",
        details: err.message,
      });
    }
  }
);

// Update worker (owner or admin only)
router.put("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const worker = await Worker.findById(id);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    // Check authorization: must be owner or admin
    if (
      worker.createdBy?.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ error: "Not authorized to update this worker" });
    }

    // Validate Aadhaar if being updated
    if (updates.aadhaarNumber) {
      const validation = validateAadhaar(updates.aadhaarNumber);
      if (!validation.valid) {
        return res.status(400).json({
          error: "Invalid Aadhaar number",
          message: validation.message,
        });
      }
      updates.aadhaarNumber = validation.cleanNumber;
    }

    // Add history entry
    const historyEntry = {
      action: "UPDATED",
      description: `Worker profile updated by ${req.user.id}`,
      timestamp: new Date(),
      metadata: {
        updatedFields: Object.keys(updates),
        userId: req.user.id,
      },
    };

    updates.history = [...(worker.history || []), historyEntry];
    updates.updatedAt = new Date();

    const updatedWorker = await Worker.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({
      success: true,
      worker: updatedWorker,
    });
  } catch (err) {
    console.error("Update worker error:", err);
    res.status(500).json({
      error: "Failed to update worker",
      details: err.message,
    });
  }
});

// Flag a Worker (authenticated users can flag, auto-delete after threshold)
router.post("/:id/flag", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: "Reason is required" });
    }

    const worker = await Worker.findById(id);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    // Initialize flag data
    worker.flags = (worker.flags || 0) + 1;
    worker.flagReasons = worker.flagReasons || [];
    worker.flagReasons.push({
      reason,
      flaggedBy: req.user.id,
      date: new Date(),
    });

    // Auto-delete if flags exceed threshold (e.g., 3 flags)
    const FLAG_THRESHOLD = 3;
    if (worker.flags >= FLAG_THRESHOLD) {
      await Worker.findByIdAndDelete(id);
      return res.json({
        success: true,
        deleted: true,
        message: `Worker ${worker.fullName} exceeded flag threshold and was removed.`,
      });
    }

    await worker.save();

    res.json({
      success: true,
      deleted: false,
      message: `Worker flagged (${worker.flags}/${FLAG_THRESHOLD}).`,
      worker: {
        _id: worker._id,
        fullName: worker.fullName,
        flags: worker.flags,
      },
    });
  } catch (error) {
    console.error("Error flagging worker:", error);
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

// Accept Endorsement (worker owner only)
router.post("/:id/endorsement", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { endorsementId, endorserName, endorsementText } = req.body;

    const worker = await Worker.findById(id);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    // Only owner can accept endorsements
    if (worker.createdBy?.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Add endorsement
    worker.endorsements.push({
      endorserName: endorserName || "Anonymous",
      text: endorsementText || "Endorsed",
      accepted: true,
      date: new Date(),
    });

    worker.history.push({
      action: "ENDORSEMENT_ACCEPTED",
      description: "Worker accepted an endorsement",
      timestamp: new Date(),
      metadata: { endorserName, userId: req.user.id },
    });

    await worker.save();
    res.json({ success: true, message: "Endorsement accepted", worker });
  } catch (error) {
    console.error("Error accepting endorsement:", error);
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

// Get worker history (owner or admin only)
router.get("/:id/history", authenticate, async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    // Check authorization
    if (
      worker.createdBy?.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ error: "Not authorized to view history" });
    }

    res.json({ history: worker.history || [] });
  } catch (err) {
    console.error("Fetch history error:", err);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// ADMIN ONLY ROUTES

// Delete worker (admin only)
router.delete("/:id", authenticate, authorize("admin"), async (req, res) => {
  try {
    const worker = await Worker.findByIdAndDelete(req.params.id);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }
    res.json({ success: true, message: "Worker deleted successfully" });
  } catch (err) {
    console.error("Delete worker error:", err);
    res.status(500).json({ error: "Failed to delete worker" });
  }
});

export default router;
