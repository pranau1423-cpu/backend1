import express from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { wrapAsync } from "../utils/wrapAsync.js";
import {
  createReview,
  getWorkerReviews,
} from "../controllers/review.controller.js";

const router = express.Router();

// Create review (customer only)
router.post("/", authenticate, wrapAsync(createReview));

// Get reviews for a worker
router.get("/worker/:workerId", wrapAsync(getWorkerReviews));

// Update review (customer can edit their own review)
router.patch(
  "/:id",
  authenticate,
  wrapAsync(async (req, res) => {
    const Review = (await import("../models/Review.js")).default;
    const { rating, reviewText } = req.body;

    const review = await Review.findOne({
      _id: req.params.id,
      customer: req.user.id,
    });

    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    if (rating) review.rating = rating;
    if (reviewText) review.reviewText = reviewText;
    await review.save();

    res.json({ success: true, review });
  })
);

// Worker responds to review
router.post(
  "/:id/respond",
  authenticate,
  wrapAsync(async (req, res) => {
    const Review = (await import("../models/Review.js")).default;
    const Worker = (await import("../models/Worker.js")).default;
    const { responseText } = req.body;

    const review = await Review.findById(req.params.id).populate("worker");
    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    const worker = await Worker.findById(review.worker._id);
    if (worker.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    review.response = {
      text: responseText,
      respondedAt: new Date(),
    };
    await review.save();

    res.json({ success: true, review });
  })
);

export default router;
