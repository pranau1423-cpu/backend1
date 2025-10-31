import express from "express";
import { authenticate, authorize } from "../middleware/auth.middleware.js";
import { wrapAsync } from "../utils/wrapAsync.js";
import Worker from "../models/Worker.js";
import ContactRequest from "../models/ContactRequest.js";
import Review from "../models/Review.js";

const router = express.Router();

// Get worker analytics (owner only)
router.get(
  "/worker/:id",
  authenticate,
  wrapAsync(async (req, res) => {
    const worker = await Worker.findById(req.params.id);

    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    if (
      worker.createdBy.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Get contact requests analytics
    const requests = await ContactRequest.find({ worker: req.params.id });
    const requestsByStatus = {
      pending: requests.filter((r) => r.status === "pending").length,
      accepted: requests.filter((r) => r.status === "accepted").length,
      completed: requests.filter((r) => r.status === "completed").length,
      rejected: requests.filter((r) => r.status === "rejected").length,
      cancelled: requests.filter((r) => r.status === "cancelled").length,
    };

    // Calculate average response time
    const acceptedRequests = requests.filter((r) => r.responseTime);
    const avgResponseTime =
      acceptedRequests.length > 0
        ? acceptedRequests.reduce((sum, r) => {
            return sum + (r.responseTime - r.createdAt);
          }, 0) /
          acceptedRequests.length /
          60000 // Convert to minutes
        : 0;

    // Get reviews analytics
    const reviews = await Review.find({ worker: req.params.id });
    const reviewsByRating = {
      5: reviews.filter((r) => r.rating === 5).length,
      4: reviews.filter((r) => r.rating === 4).length,
      3: reviews.filter((r) => r.rating === 3).length,
      2: reviews.filter((r) => r.rating === 2).length,
      1: reviews.filter((r) => r.rating === 1).length,
    };

    // Revenue analytics
    const completedJobs = requests.filter((r) => r.status === "completed");
    const totalRevenue = completedJobs.reduce(
      (sum, r) => sum + (r.actualCost || 0),
      0
    );
    const avgJobValue =
      completedJobs.length > 0 ? totalRevenue / completedJobs.length : 0;

    // Monthly trends
    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      return {
        month: date.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        }),
        requests: requests.filter((r) => {
          const reqDate = new Date(r.createdAt);
          return (
            reqDate.getMonth() === date.getMonth() &&
            reqDate.getFullYear() === date.getFullYear()
          );
        }).length,
        completed: completedJobs.filter((r) => {
          const reqDate = new Date(r.completedAt);
          return (
            reqDate.getMonth() === date.getMonth() &&
            reqDate.getFullYear() === date.getFullYear()
          );
        }).length,
      };
    }).reverse();

    res.json({
      success: true,
      analytics: {
        overview: {
          totalRequests: requests.length,
          completedJobs: completedJobs.length,
          totalRevenue,
          avgJobValue: Math.round(avgJobValue),
          avgResponseTime: Math.round(avgResponseTime),
          rating: worker.rating?.average || 0,
          totalReviews: reviews.length,
        },
        requestsByStatus,
        reviewsByRating,
        monthlyTrends: last6Months,
        topServices: getTopServices(requests),
        repeatCustomers: getRepeatCustomers(requests),
      },
    });
  })
);

// Helper functions
function getTopServices(requests) {
  const services = {};
  requests.forEach((r) => {
    if (r.serviceRequired) {
      services[r.serviceRequired] = (services[r.serviceRequired] || 0) + 1;
    }
  });
  return Object.entries(services)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([service, count]) => ({ service, count }));
}

function getRepeatCustomers(requests) {
  const customers = {};
  requests.forEach((r) => {
    const customerId = r.customer.toString();
    customers[customerId] = (customers[customerId] || 0) + 1;
  });
  return Object.values(customers).filter((count) => count > 1).length;
}

// Get platform analytics (admin only)
router.get(
  "/platform",
  authenticate,
  authorize("admin"),
  wrapAsync(async (req, res) => {
    const totalWorkers = await Worker.countDocuments();
    const verifiedWorkers = await Worker.countDocuments({ verified: true });
    const totalRequests = await ContactRequest.countDocuments();
    const completedRequests = await ContactRequest.countDocuments({
      status: "completed",
    });
    const totalReviews = await Review.countDocuments();
    const avgPlatformRating = await Review.aggregate([
      { $group: { _id: null, avg: { $avg: "$rating" } } },
    ]);

    res.json({
      success: true,
      analytics: {
        workers: {
          total: totalWorkers,
          verified: verifiedWorkers,
          verificationRate: ((verifiedWorkers / totalWorkers) * 100).toFixed(1),
        },
        requests: {
          total: totalRequests,
          completed: completedRequests,
          completionRate: ((completedRequests / totalRequests) * 100).toFixed(
            1
          ),
        },
        reviews: {
          total: totalReviews,
          averageRating: avgPlatformRating[0]?.avg.toFixed(1) || 0,
        },
      },
    });
  })
);

export default router;
