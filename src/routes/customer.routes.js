// src/routes/customer.routes.js
import express from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { wrapAsync } from "../utils/wrapAsync.js";
import Customer from "../models/Customer.js";

const CustomerRoutes = express.Router();

// Save/Update customer profile
CustomerRoutes.post(
  "/save",
  authenticate,
  wrapAsync(async (req, res) => {
    const { fullName, address, city, state, pincode, alternatePhone } =
      req.body;

    // Validation
    if (!fullName || !address || !city || !state) {
      return res.status(400).json({
        error: "Full name, address, city, and state are required",
      });
    }

    // Validate pincode if provided
    if (pincode && !/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        error: "Pincode must be 6 digits",
      });
    }

    // Validate alternate phone if provided
    if (
      alternatePhone &&
      !/^\+?[0-9]{10,13}$/.test(alternatePhone.replace(/\s/g, ""))
    ) {
      return res.status(400).json({
        error: "Invalid alternate phone number format",
      });
    }

    try {
      // Check if customer profile already exists
      let customer = await Customer.findOne({ userId: req.user.id });

      if (customer) {
        // Update existing profile
        customer.fullName = fullName;
        customer.address = address;
        customer.city = city;
        customer.state = state;
        customer.pincode = pincode || customer.pincode;
        customer.alternatePhone = alternatePhone || customer.alternatePhone;
        customer.updatedAt = new Date();
        await customer.save();
      } else {
        // Create new profile
        customer = new Customer({
          userId: req.user.id,
          fullName,
          address,
          city,
          state,
          pincode,
          alternatePhone,
        });
        await customer.save();
      }

      res.json({
        success: true,
        message: "Customer profile saved successfully",
        customer,
      });
    } catch (err) {
      console.error("Save customer profile error:", err);
      res.status(500).json({
        error: "Failed to save customer profile",
        details: err.message,
      });
    }
  })
);

// Get customer profile
CustomerRoutes.get(
  "/profile",
  authenticate,
  wrapAsync(async (req, res) => {
    const customer = await Customer.findOne({ userId: req.user.id });

    if (!customer) {
      return res.status(404).json({
        error: "Customer profile not found",
      });
    }

    res.json({ customer });
  })
);

export default CustomerRoutes;
