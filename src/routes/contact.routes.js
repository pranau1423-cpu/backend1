import express from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { wrapAsync } from "../utils/wrapAsync.js";
import {
  createContactRequest,
  getWorkerContactRequests,
  getCustomerContactRequests,
  updateContactRequestStatus,
} from "../controllers/contact.controller.js";

const router = express.Router();

// Create contact request (customer)
router.post("/", authenticate, wrapAsync(createContactRequest));

// Get contact requests for worker
router.get("/worker", authenticate, wrapAsync(getWorkerContactRequests));

// Get contact requests for customer
router.get("/customer", authenticate, wrapAsync(getCustomerContactRequests));

// Update contact request status (worker)
router.patch(
  "/:id/status",
  authenticate,
  wrapAsync(updateContactRequestStatus)
);

// Get single contact request
router.get(
  "/:id",
  authenticate,
  wrapAsync(async (req, res) => {
    const ContactRequest = (await import("../models/ContactRequest.js"))
      .default;

    const request = await ContactRequest.findById(req.params.id)
      .populate("worker")
      .populate("customer", "email mobile")
      .populate("customerProfile");

    if (!request) {
      return res.status(404).json({ error: "Contact request not found" });
    }

    // Authorization check
    if (
      request.customer.toString() !== req.user.id &&
      request.worker.createdBy.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ error: "Not authorized" });
    }

    res.json({ success: true, request });
  })
);

export default router;
