import mongoose from "mongoose";

const ReviewSchema = new mongoose.Schema(
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
    contactRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContactRequest",
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    reviewText: {
      type: String,
      required: true,
      trim: true,
    },
    serviceQuality: Number,
    punctuality: Number,
    professionalism: Number,
    valueForMoney: Number,
    images: [String],
    helpful: {
      type: Number,
      default: 0,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    response: {
      text: String,
      respondedAt: Date,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

ReviewSchema.index({ worker: 1, createdAt: -1 });
ReviewSchema.index({ rating: 1 });

export default mongoose.model("Review", ReviewSchema);
