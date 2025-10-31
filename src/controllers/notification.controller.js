import Notification from "../models/Notification.js";

export const getUserNotifications = async (req, res) => {
  try {
    const { unreadOnly = false } = req.query;

    let query = { recipient: req.user.id };
    if (unreadOnly === "true") {
      query.read = false;
    }

    const notifications = await Notification.find(query)
      .populate("sender", "email mobile")
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      recipient: req.user.id,
      read: false,
    });

    res.json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (err) {
    console.error("Get notifications error:", err);
    res.status(500).json({
      error: "Failed to fetch notifications",
      details: err.message,
    });
  }
};

export const markNotificationAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: req.user.id },
      { read: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({
      success: true,
      notification,
    });
  } catch (err) {
    console.error("Mark notification error:", err);
    res.status(500).json({
      error: "Failed to mark notification as read",
      details: err.message,
    });
  }
};

export const markAllNotificationsAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, read: false },
      { read: true, readAt: new Date() }
    );

    res.json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (err) {
    console.error("Mark all notifications error:", err);
    res.status(500).json({
      error: "Failed to mark notifications as read",
      details: err.message,
    });
  }
};
