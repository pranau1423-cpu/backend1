import Review from "../models/Review.js";

export const createReview = async (req, res) => {
  try {
    const {
      workerId,
      contactRequestId,
      rating,
      reviewText,
      serviceQuality,
      punctuality,
      professionalism,
      valueForMoney,
    } = req.body;

    // Validate worker
    const worker = await Worker.findById(workerId);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    // Check if customer already reviewed
    const existingReview = await Review.findOne({
      worker: workerId,
      customer: req.user.id,
      contactRequest: contactRequestId,
    });

    if (existingReview) {
      return res
        .status(400)
        .json({ error: "You already reviewed this worker" });
    }

    // Create review
    const review = new Review({
      worker: workerId,
      customer: req.user.id,
      contactRequest: contactRequestId,
      rating,
      reviewText,
      serviceQuality,
      punctuality,
      professionalism,
      valueForMoney,
      verified: !!contactRequestId, // Verified if from actual job
    });

    await review.save();

    // Update worker rating
    const reviews = await Review.find({ worker: workerId });
    const avgRating =
      reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

    worker.rating = worker.rating || { average: 0, count: 0, breakdown: {} };
    worker.rating.average = parseFloat(avgRating.toFixed(1));
    worker.rating.count = reviews.length;
    worker.rating.breakdown = worker.rating.breakdown || {};
    worker.rating.breakdown[rating] =
      (worker.rating.breakdown[rating] || 0) + 1;

    await worker.save();

    // Create notification
    await Notification.create({
      recipient: worker.createdBy,
      sender: req.user.id,
      type: "review_received",
      title: "New Review",
      message: `You received a ${rating}-star review`,
      link: `/reviews/${review._id}`,
      metadata: { reviewId: review._id, rating },
    });

    res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      review,
    });
  } catch (err) {
    console.error("Create review error:", err);
    res.status(500).json({
      error: "Failed to create review",
      details: err.message,
    });
  }
};

export const getWorkerReviews = async (req, res) => {
  try {
    const { workerId } = req.params;
    const { sort = "-createdAt", limit = 20 } = req.query;

    const reviews = await Review.find({ worker: workerId })
      .populate("customer", "email mobile")
      .sort(sort)
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: reviews.length,
      reviews,
    });
  } catch (err) {
    console.error("Get reviews error:", err);
    res.status(500).json({
      error: "Failed to fetch reviews",
      details: err.message,
    });
  }
};
