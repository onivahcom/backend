import mongoose from "mongoose";

const userVisitAnalyticsSchema = new mongoose.Schema(
    {
        // 👤 Logged-in user (optional)
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false, // changed from true ➜ false
        },

        // 🧑‍💼 Vendor details
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vendor",
            required: true,
        },

        category: {
            type: String,
            required: true, // e.g., "Photography", "Catering"
            trim: true,
        },
        service: {
            type: String,
            required: true, // e.g., "Wedding Photography"
            trim: true,
        },

        //  Visit stats
        visitCount: { type: Number, default: 1 },
        firstVisit: { type: Date, default: Date.now },
        lastVisit: { type: Date, default: Date.now },
        uniqueDaysVisited: { type: Number, default: 1 },
        lastSessionId: { type: String },
        linked: { type: Boolean, default: false }, // <– important

        // 🕵️‍♂️ Anonymous user tracking
        guestId: { type: String }, // e.g., generated client ID or browser fingerprint
        // userVisitAnalytics.js

        sessionStartTime: { type: Date },
        sessionToken: { type: String },
        sessionExpiry: { type: Date },

        // ⏱ Time tracking
        totalTimeSpent: { type: Number, default: 0 },
        avgSessionDuration: { type: Number, default: 0 },

        // 🌐 User source & environment
        source: {
            type: String,
            enum: ["organic", "ad", "referral"],
            default: "organic",
        },
        ipAddress: { type: String },
        deviceType: {
            type: String,
            enum: ["mobile", "desktop", "tablet", "unknown"],
            default: "desktop",
        },
        browser: { type: String, default: "Unknown" },

        // 💰 Conversion tracking
        conversion: { type: Boolean, default: false },
    },
    { timestamps: true }
);

const UserVisitAnalytics = mongoose.model(
    "UserVisitAnalytics",
    userVisitAnalyticsSchema
);

export default UserVisitAnalytics;
