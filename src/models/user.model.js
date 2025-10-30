import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
  deviceInfo: { type: String, default: "" },
  refreshTokenHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      unique: true,
      sparse: true, // Allow null values for email (when using mobile)
      lowercase: true,
      trim: true,
    },
    mobile: {
      type: String,
      sparse: true, // Allow null values for mobile (when using email)
      trim: true,
    },
    passwordHash: {
      type: String,
      // Not required because mobile login doesn't need password
    },
    role: {
      type: String,
      enum: ["user", "worker", "customer", "admin"],
      default: "user",
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
      default: Date.now,
    },
    sessions: [sessionSchema],
    workerProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
    },
    verified: {
      type: Boolean,
      default: false,
    },
    lastLogin: Date,
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
userSchema.index({ email: 1 });
userSchema.index({ mobile: 1 });
userSchema.index({ "sessions.refreshTokenHash": 1 });

// Ensure at least email or mobile exists
userSchema.pre("save", function (next) {
  if (!this.email && !this.mobile) {
    next(new Error("Either email or mobile is required"));
  } else {
    next();
  }
});

export default mongoose.model("User", userSchema);
