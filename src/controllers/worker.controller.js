// src/controllers/worker.controller.js

import Worker from "../models/Worker.js";
import User from "../models/user.model.js";
import cloudinary from "../utils/cloudinary.js";
import fs from "fs";

/**
 * Get all workers with optional filtering
 * GET /api/worker/
 */
export const getAllWorkers = async (req, res) => {
  try {
    const { profession, verified, search, lat, lng, radius = 50 } = req.query;

    let filter = {};

    // Filter by profession
    if (profession && profession !== "all") {
      filter.profession = new RegExp(profession, "i");
    }

    // Filter by verified status
    if (verified === "true") {
      filter.verified = true;
    }

    // Search across multiple fields
    if (search) {
      filter.$or = [
        { fullName: new RegExp(search, "i") },
        { profession: new RegExp(search, "i") },
        { skills: new RegExp(search, "i") },
      ];
    }

    // Fetch workers
    let workers = await Worker.find(filter)
      .select("-history -aadhaarNumber -__v")
      .populate("createdBy", "email")
      .sort({ createdAt: -1 })
      .lean();

    // If location is provided, calculate distance and filter by radius
    if (lat && lng) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const maxRadius = parseFloat(radius);

      workers = workers
        .map((worker) => {
          if (worker.geometry?.coordinates) {
            const [workerLng, workerLat] = worker.geometry.coordinates;
            const distance = calculateDistance(
              userLat,
              userLng,
              workerLat,
              workerLng
            );

            return {
              ...worker,
              distance: parseFloat(distance.toFixed(2)),
            };
          }
          return worker;
        })
        .filter((worker) => !worker.distance || worker.distance <= maxRadius);

      // Sort by distance
      workers.sort(
        (a, b) => (a.distance || Infinity) - (b.distance || Infinity)
      );
    }

    res.json({
      success: true,
      count: workers.length,
      workers,
    });
  } catch (err) {
    console.error("Get workers error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch workers",
      details: err.message,
    });
  }
};

/**
 * Get single worker by ID
 * GET /api/worker/worker/:id
 */
export const getWorkerById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!id || id === "undefined" || id === "null") {
      return res.status(400).json({
        error: "Invalid worker ID",
        message: "Worker ID is required",
      });
    }

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid worker ID format",
        message: "ID must be a valid MongoDB ObjectId",
      });
    }

    const worker = await Worker.findById(id)
      .select("-aadhaarNumber -history")
      .populate("createdBy", "email role")
      .lean();

    if (!worker) {
      return res.status(404).json({
        success: false,
        error: "Worker not found",
      });
    }

    // Add computed fields
    const enrichedWorker = {
      ...worker,
      rating: (4 + Math.random()).toFixed(1), // Mock rating - replace with real data
      jobsCompleted: Math.floor(Math.random() * 100) + 10, // Mock - replace with real data
      responseTime: "Usually responds in 2 hours", // Mock
      availability: "Available now", // Mock
    };

    res.json({
      success: true,
      worker: enrichedWorker,
    });
  } catch (err) {
    console.error("Get worker by ID error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch worker",
      details: err.message,
    });
  }
};

/**
 * Get worker profile with full details (for owner/admin)
 * GET /api/worker/profile/:id
 */
export const getWorkerProfile = async (req, res) => {
  try {
    const { id } = req.params;

    const worker = await Worker.findById(id)
      .populate("createdBy", "email role")
      .lean();

    if (!worker) {
      return res.status(404).json({
        success: false,
        error: "Worker not found",
      });
    }

    // Check authorization
    if (
      req.user.role !== "admin" &&
      worker.createdBy._id.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        error: "Not authorized to view full profile",
      });
    }

    res.json({
      success: true,
      worker,
    });
  } catch (err) {
    console.error("Get worker profile error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch worker profile",
      details: err.message,
    });
  }
};

/**
 * Get workers near location
 * POST /api/worker/nearby
 */
export const getNearbyWorkers = async (req, res) => {
  try {
    const { latitude, longitude, radius = 10, profession } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: "Latitude and longitude are required",
      });
    }

    const radiusInRadians = radius / 6371; // Earth's radius in km

    let query = {
      "geometry.coordinates": {
        $geoWithin: {
          $centerSphere: [[longitude, latitude], radiusInRadians],
        },
      },
    };

    if (profession && profession !== "all") {
      query.profession = new RegExp(profession, "i");
    }

    const workers = await Worker.find(query)
      .select("-history -aadhaarNumber")
      .lean();

    // Calculate exact distances
    const workersWithDistance = workers
      .map((worker) => {
        if (worker.geometry?.coordinates) {
          const [lng, lat] = worker.geometry.coordinates;
          const distance = calculateDistance(latitude, longitude, lat, lng);
          return { ...worker, distance: parseFloat(distance.toFixed(2)) };
        }
        return worker;
      })
      .sort((a, b) => (a.distance || 0) - (b.distance || 0));

    res.json({
      success: true,
      count: workersWithDistance.length,
      workers: workersWithDistance,
    });
  } catch (err) {
    console.error("Get nearby workers error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch nearby workers",
      details: err.message,
    });
  }
};

/**
 * Search workers by skill or name
 * GET /api/worker/search
 */
export const searchWorkers = async (req, res) => {
  try {
    const { query, profession, verified } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Search query is required",
      });
    }

    let filter = {
      $or: [
        { fullName: new RegExp(query, "i") },
        { profession: new RegExp(query, "i") },
        { skills: { $in: [new RegExp(query, "i")] } },
      ],
    };

    if (profession) {
      filter.profession = new RegExp(profession, "i");
    }

    if (verified === "true") {
      filter.verified = true;
    }

    const workers = await Worker.find(filter)
      .select("-history -aadhaarNumber")
      .limit(20)
      .lean();

    res.json({
      success: true,
      count: workers.length,
      workers,
    });
  } catch (err) {
    console.error("Search workers error:", err);
    res.status(500).json({
      success: false,
      error: "Search failed",
      details: err.message,
    });
  }
};

/**
 * Update worker availability status
 * PATCH /api/worker/:id/availability
 */
export const updateAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const { available } = req.body;

    const worker = await Worker.findById(id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        error: "Worker not found",
      });
    }

    // Check authorization
    if (
      worker.createdBy.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        error: "Not authorized",
      });
    }

    // Add availability field (you may need to add this to the schema)
    worker.available = available;
    worker.history.push({
      action: "OTHER",
      description: `Availability changed to ${
        available ? "available" : "unavailable"
      }`,
      timestamp: new Date(),
      metadata: { userId: req.user.id },
    });

    await worker.save();

    res.json({
      success: true,
      message: "Availability updated",
      available: worker.available,
    });
  } catch (err) {
    console.error("Update availability error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update availability",
      details: err.message,
    });
  }
};

/**
 * Get worker statistics
 * GET /api/worker/:id/stats
 */
export const getWorkerStats = async (req, res) => {
  try {
    const { id } = req.params;

    const worker = await Worker.findById(id).lean();

    if (!worker) {
      return res.status(404).json({
        success: false,
        error: "Worker not found",
      });
    }

    // Mock statistics - replace with real data from jobs/reviews collections
    const stats = {
      totalJobs: Math.floor(Math.random() * 100) + 10,
      completedJobs: Math.floor(Math.random() * 80) + 5,
      averageRating: (4 + Math.random()).toFixed(1),
      totalReviews: Math.floor(Math.random() * 50) + 5,
      responseRate: Math.floor(Math.random() * 30) + 70,
      completionRate: Math.floor(Math.random() * 20) + 80,
      endorsements: worker.endorsements?.filter((e) => e.accepted).length || 0,
      memberSince: worker.createdAt,
      lastActive: new Date(),
    };

    res.json({
      success: true,
      stats,
    });
  } catch (err) {
    console.error("Get worker stats error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch statistics",
      details: err.message,
    });
  }
};

/**
 * Contact worker (log contact request)
 * POST /api/worker/:id/contact
 */
export const contactWorker = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, contactMethod } = req.body;

    const worker = await Worker.findById(id).populate(
      "createdBy",
      "email mobile"
    );

    if (!worker) {
      return res.status(404).json({
        success: false,
        error: "Worker not found",
      });
    }

    // Log the contact request in history
    worker.history.push({
      action: "OTHER",
      description: "Contact request received",
      timestamp: new Date(),
      metadata: {
        userId: req.user.id,
        contactMethod,
        message: message?.substring(0, 100), // Store first 100 chars only
      },
    });

    await worker.save();

    // Return worker's contact info
    res.json({
      success: true,
      message: "Contact information retrieved",
      contact: {
        email: worker.createdBy?.email,
        mobile: worker.createdBy?.mobile,
        preferredMethod: worker.createdBy?.mobile ? "mobile" : "email",
      },
    });
  } catch (err) {
    console.error("Contact worker error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to process contact request",
      details: err.message,
    });
  }
};

/**
 * Create a new worker
 * POST /api/worker/create
 */
export const createWorker = async (req, res) => {
  try {
    const {
      fullName,
      profession,
      experience,
      skills,
      profileImageUrl,
      aadhaarNumber,
      aadhaarUrl,
      voiceText,
      geometry,
    } = req.body;

    // Validation
    if (!fullName || !profession) {
      return res.status(400).json({
        success: false,
        error: "Full name and profession are required",
      });
    }

    // Validate Aadhaar if provided
    if (aadhaarNumber) {
      const cleanNumber = aadhaarNumber.replace(/\s/g, "");
      if (!/^\d{12}$/.test(cleanNumber)) {
        return res.status(400).json({
          success: false,
          error: "Invalid Aadhaar number",
          message: "Aadhaar must be exactly 12 digits",
        });
      }
    }

    const worker = new Worker({
      fullName,
      profession,
      experience,
      skills: Array.isArray(skills) ? skills : [],
      profileImageUrl,
      aadhaarNumber,
      aadhaarUrl,
      voiceText,
      geometry,
      createdBy: req.user.id,
      history: [
        {
          action: "CREATED",
          description: "Worker profile created",
          timestamp: new Date(),
          metadata: { userId: req.user.id },
        },
      ],
    });

    await worker.save();

    // Update user profile to link worker
    await User.findByIdAndUpdate(req.user.id, {
      workerProfile: worker._id,
      role: "worker",
    });

    res.status(201).json({
      success: true,
      message: "Worker created successfully",
      worker,
    });
  } catch (err) {
    console.error("Create worker error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to create worker",
      details: err.message,
    });
  }
};

/**
 * Update worker details
 * PUT /api/worker/:id
 */
export const updateWorker = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const worker = await Worker.findById(id);
    if (!worker) {
      return res.status(404).json({
        success: false,
        error: "Worker not found",
      });
    }

    // Check authorization
    if (
      worker.createdBy?.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        error: "Not authorized to update this worker",
      });
    }

    // Validate Aadhaar if being updated
    if (updates.aadhaarNumber) {
      const cleanNumber = updates.aadhaarNumber.replace(/\s/g, "");
      if (!/^\d{12}$/.test(cleanNumber)) {
        return res.status(400).json({
          success: false,
          error: "Invalid Aadhaar number",
          message: "Aadhaar must be exactly 12 digits",
        });
      }
      updates.aadhaarNumber = cleanNumber;
    }

    // Add history entry
    const historyEntry = {
      action: "UPDATED",
      description: `Worker profile updated`,
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
      message: "Worker updated successfully",
      worker: updatedWorker,
    });
  } catch (err) {
    console.error("Update worker error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update worker",
      details: err.message,
    });
  }
};

/**
 * Delete worker
 * DELETE /api/worker/:id
 */
export const deleteWorker = async (req, res) => {
  try {
    const { id } = req.params;

    const worker = await Worker.findById(id);
    if (!worker) {
      return res.status(404).json({
        success: false,
        error: "Worker not found",
      });
    }

    // Check authorization (admin only or owner)
    if (
      req.user.role !== "admin" &&
      worker.createdBy?.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        error: "Not authorized to delete this worker",
      });
    }

    // Delete associated images from Cloudinary if needed
    // You can add cloudinary deletion logic here

    await Worker.findByIdAndDelete(id);

    // Remove worker reference from user
    await User.findByIdAndUpdate(worker.createdBy, {
      workerProfile: null,
      role: "user",
    });

    res.json({
      success: true,
      message: "Worker deleted successfully",
    });
  } catch (err) {
    console.error("Delete worker error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to delete worker",
      details: err.message,
    });
  }
};

// Helper function to calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default {
  getAllWorkers,
  getWorkerById,
  getWorkerProfile,
  getNearbyWorkers,
  searchWorkers,
  updateAvailability,
  getWorkerStats,
  contactWorker,
  createWorker,
  updateWorker,
  deleteWorker,
};
