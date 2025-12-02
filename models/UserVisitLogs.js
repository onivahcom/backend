import mongoose from "mongoose";

const userVisitLogSchema = new mongoose.Schema(
    {
        // 👤 Optional logged-in user
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "userTables",
            required: false,
        },

        // 🧑‍💼 Vendor reference
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "vendor",
            required: true,
        },

        // 📂 Category name (e.g., "Photography", "Catering")
        category: {
            type: String,
            required: true,
            trim: true,
        },

        // 🆔 Service ID (not ref, because services are in category-specific collections)
        serviceId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },

        // 🕐 Visit timestamp
        visitDate: {
            type: Date,
            default: Date.now,
            index: true, // 🔍 Fast date-based queries
        },

        // 🕵️‍♂️ Guest tracking
        guestId: { type: String },

        // 🌍 Optional metadata
        ipAddress: { type: String },
        deviceType: {
            type: String,
            enum: ["mobile", "desktop", "tablet", "unknown"],
            default: "unknown",
        },
        browser: { type: String, default: "Unknown" },
    },
    { timestamps: true }
);

// 🧹 Auto-delete logs older than 60 days (TTL Index)
userVisitLogSchema.index({ visitDate: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 }); // 60 days

const UserVisitLogs = mongoose.model("UserVisitLogs", userVisitLogSchema);

export default UserVisitLogs;
