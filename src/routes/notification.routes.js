import express from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { wrapAsync } from "../utils/wrapAsync.js";
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../controllers/notification.controller.js";

const router = express.Router();

// Get user notifications
router.get("/", authenticate, wrapAsync(getUserNotifications));

// Mark notification as read
router.patch("/:id/read", authenticate, wrapAsync(markNotificationAsRead));

// Mark all notifications as read
router.post("/read-all", authenticate, wrapAsync(markAllNotificationsAsRead));

// Delete notification
router.delete(
  "/:id",
  authenticate,
  wrapAsync(async (req, res) => {
    const Notification = (await import("../models/Notification.js")).default;

    const result = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipient: req.user.id,
    });

    if (!result) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ success: true, message: "Notification deleted" });
  })
);

export default router;
