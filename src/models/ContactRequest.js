import mongoose from "mongoose";

const ContactRequestSchema = new mongoose.Schema(
  {
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    customerProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "completed", "cancelled"],
      default: "pending",
    },
    message: {
      type: String,
      trim: true,
    },
    serviceRequired: {
      type: String,
      trim: true,
    },
    preferredDateTime: Date,
    urgency: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    location: {
      address: String,
      coordinates: {
        type: [Number], // [lng, lat]
        index: "2dsphere",
      },
    },
    estimatedBudget: {
      min: Number,
      max: Number,
      currency: { type: String, default: "INR" },
    },
    workStartDate: Date,
    workEndDate: Date,
    actualCost: Number,
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    review: String,
    images: [String],
    responseTime: Date,
    completedAt: Date,
    cancelReason: String,
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
ContactRequestSchema.index({ worker: 1, createdAt: -1 });
ContactRequestSchema.index({ customer: 1, createdAt: -1 });
ContactRequestSchema.index({ status: 1 });

export default mongoose.model("ContactRequest", ContactRequestSchema);
