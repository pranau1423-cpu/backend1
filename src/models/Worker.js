import mongoose from "mongoose";

const WorkerSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    profession: {
      type: String,
      required: true,
      trim: true,
    },
    experience: String,
    skills: [String],
    endorsements: [
      {
        endorserName: String,
        text: String,
        accepted: { type: Boolean, default: false },
        date: { type: Date, default: Date.now },
      },
    ],
    verified: {
      type: Boolean,
      default: false,
    },
    profileImageUrl: String,
    aadhaarNumber: {
      type: String,
      validate: {
        validator: function (v) {
          return !v || /^\d{12}$/.test(v);
        },
        message: (props) =>
          `${props.value} is not a valid 12-digit Aadhaar number!`,
      },
    },
    aadhaarUrl: String,
    voiceText: String,

    geometry: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
      },
    },

    // Flag system
    flags: {
      type: Number,
      default: 0,
    },
    flagReasons: [
      {
        reason: String,
        flaggedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        date: { type: Date, default: Date.now },
      },
    ],

    // Ownership
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // History tracking
    history: [
      {
        action: {
          type: String,
          enum: [
            "CREATED",
            "UPDATED",
            "ENDORSEMENT_ACCEPTED",
            "FLAGGED",
            "VERIFIED",
            "OTHER",
          ],
        },
        description: String,
        timestamp: { type: Date, default: Date.now },
        metadata: mongoose.Schema.Types.Mixed,
      },
    ],

    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    rating: {
      average: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
      breakdown: {
        5: { type: Number, default: 0 },
        4: { type: Number, default: 0 },
        3: { type: Number, default: 0 },
        2: { type: Number, default: 0 },
        1: { type: Number, default: 0 },
      },
    },
    stats: {
      totalJobs: { type: Number, default: 0 },
      completedJobs: { type: Number, default: 0 },
      cancelledJobs: { type: Number, default: 0 },
      responseRate: { type: Number, default: 0 },
      averageResponseTime: { type: Number, default: 0 }, // in minutes
      repeatCustomers: { type: Number, default: 0 },
    },
    availability: {
      available: { type: Boolean, default: true },
      daysAvailable: [String], // ["Monday", "Tuesday", etc.]
      hoursAvailable: {
        start: String, // "09:00"
        end: String, // "18:00"
      },
      nextAvailable: Date,
    },
    pricing: {
      hourlyRate: Number,
      minimumCharge: Number,
      calloutFee: Number,
      currency: { type: String, default: "INR" },
    },
    serviceArea: {
      maxDistance: { type: Number, default: 50 }, // km
      preferredLocations: [String],
    },
    certifications: [
      {
        name: String,
        issuedBy: String,
        issuedDate: Date,
        expiryDate: Date,
        documentUrl: String,
      },
    ],
    languages: [String],
    featured: { type: Boolean, default: false },
    lastActiveAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
WorkerSchema.index({ profession: 1 });
WorkerSchema.index({ verified: 1 });
WorkerSchema.index({ createdBy: 1 });
WorkerSchema.index({ fullName: "text", profession: "text", skills: "text" });

// Update the updatedAt timestamp before saving
WorkerSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

const Worker = mongoose.model("Worker", WorkerSchema);
export default Worker;
