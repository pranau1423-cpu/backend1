import ContactRequest from "../models/ContactRequest.js";
import Worker from "../models/Worker.js";
import User from "../models/user.model.js";
import Customer from "../models/Customer.js";
import Notification from "../models/Notification.js";

// Create contact request
export const createContactRequest = async (req, res) => {
  try {
    const {
      workerId,
      message,
      serviceRequired,
      preferredDateTime,
      urgency,
      estimatedBudget,
    } = req.body;

    // Validate worker exists
    const worker = await Worker.findById(workerId);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    // Get customer profile
    const customerProfile = await Customer.findOne({ userId: req.user.id });

    // Get customer location (from Customer profile or User)
    let location = null;
    if (customerProfile) {
      location = {
        address: `${customerProfile.address}, ${customerProfile.city}, ${customerProfile.state}`,
      };
    }

    // Create contact request
    const contactRequest = new ContactRequest({
      worker: workerId,
      customer: req.user.id,
      customerProfile: customerProfile?._id,
      message,
      serviceRequired,
      preferredDateTime,
      urgency: urgency || "medium",
      estimatedBudget,
      location,
    });

    await contactRequest.save();

    // Update worker stats
    worker.stats = worker.stats || {};
    worker.stats.totalJobs = (worker.stats.totalJobs || 0) + 1;
    await worker.save();

    // Create notification for worker
    const customerUser = await User.findById(req.user.id);
    await Notification.create({
      recipient: worker.createdBy,
      sender: req.user.id,
      type: "contact_request",
      title: "New Contact Request",
      message: `${
        customerUser.email || customerUser.mobile
      } wants to hire you for ${serviceRequired || "a service"}`,
      link: `/contact-requests/${contactRequest._id}`,
      metadata: { contactRequestId: contactRequest._id },
    });

    res.status(201).json({
      success: true,
      message: "Contact request sent successfully",
      contactRequest,
    });
  } catch (err) {
    console.error("Create contact request error:", err);
    res.status(500).json({
      error: "Failed to create contact request",
      details: err.message,
    });
  }
};

// Get contact requests for worker
export const getWorkerContactRequests = async (req, res) => {
  try {
    const { status } = req.query;

    // Find worker profile
    const worker = await Worker.findOne({ createdBy: req.user.id });
    if (!worker) {
      return res.status(404).json({ error: "Worker profile not found" });
    }

    let query = { worker: worker._id };
    if (status) {
      query.status = status;
    }

    const requests = await ContactRequest.find(query)
      .populate("customer", "email mobile")
      .populate("customerProfile")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (err) {
    console.error("Get worker contact requests error:", err);
    res.status(500).json({
      error: "Failed to fetch contact requests",
      details: err.message,
    });
  }
};

// Get contact requests for customer
export const getCustomerContactRequests = async (req, res) => {
  try {
    const { status } = req.query;

    let query = { customer: req.user.id };
    if (status) {
      query.status = status;
    }

    const requests = await ContactRequest.find(query)
      .populate("worker")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (err) {
    console.error("Get customer contact requests error:", err);
    res.status(500).json({
      error: "Failed to fetch contact requests",
      details: err.message,
    });
  }
};

// Update contact request status
export const updateContactRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, responseMessage, workStartDate, workEndDate, actualCost } =
      req.body;

    const contactRequest = await ContactRequest.findById(id);
    if (!contactRequest) {
      return res.status(404).json({ error: "Contact request not found" });
    }

    // Authorization check
    const worker = await Worker.findById(contactRequest.worker);
    if (
      worker.createdBy.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Update status
    contactRequest.status = status;
    if (status === "accepted") {
      contactRequest.responseTime = new Date();
    }
    if (status === "completed") {
      contactRequest.completedAt = new Date();
      contactRequest.workEndDate = workEndDate || new Date();
      if (actualCost) contactRequest.actualCost = actualCost;

      // Update worker stats
      worker.stats = worker.stats || {};
      worker.stats.completedJobs = (worker.stats.completedJobs || 0) + 1;
      await worker.save();
    }
    if (workStartDate) contactRequest.workStartDate = workStartDate;

    await contactRequest.save();

    // Create notification for customer
    let notificationMessage = "";
    switch (status) {
      case "accepted":
        notificationMessage = `${worker.fullName} accepted your request`;
        break;
      case "rejected":
        notificationMessage = `${worker.fullName} declined your request`;
        break;
      case "completed":
        notificationMessage = `${worker.fullName} marked the work as completed`;
        break;
    }

    await Notification.create({
      recipient: contactRequest.customer,
      sender: req.user.id,
      type: `request_${status}`,
      title: "Request Update",
      message: notificationMessage,
      link: `/contact-requests/${contactRequest._id}`,
      metadata: { contactRequestId: contactRequest._id },
    });

    res.json({
      success: true,
      message: `Request ${status} successfully`,
      contactRequest,
    });
  } catch (err) {
    console.error("Update contact request error:", err);
    res.status(500).json({
      error: "Failed to update contact request",
      details: err.message,
    });
  }
};
