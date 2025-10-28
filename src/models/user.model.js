import mongoose from "mongoose";


const sessionSchema = new mongoose.Schema({
  deviceInfo: { type: String, default: "" },
  refreshTokenHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
});

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ["user", "worker", "admin"],
    default: "user"
  },
  geometry: {
    type: {
      type: String,
      enum: ["Point"],
    },
    coordinates: {
      type: [Number],
    },
  },
  registerDate: {
    type: Date,
    default: Date.now
  },
  sessions: [sessionSchema],
  // Link to worker profile if user is a worker
  workerProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Worker",
    default: null
  },
  verified: {
    type: Boolean,
    default: false
  },
  lastLogin: Date
}, {
  timestamps: true,
});

// Index for faster queries
userSchema.index({ email: 1 });
userSchema.index({ "sessions.refreshTokenHash": 1 });

export default mongoose.model("User", userSchema);