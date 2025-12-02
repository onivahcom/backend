import mongoose from "mongoose";

// Booking schema
const bookingSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "userTables",
        required: true
    },
    hostId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vendor",
        required: true
    },
    amount: Number,
    status: { type: String, default: 'pending' },

    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpayCardToken: String,
    razorpayMandateId: String,

    serviceName: String,
    category: { type: String, required: true },
    serviceId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },

    // Package details
    package: {
        title: { type: String, required: true },
        description: { type: String },
        amount: { type: Number, required: true },
        dates: [{ type: Date }],   // array of dates
        additionalRequest: { type: String } // now inside package
    },

    // Rejection details
    rejection: {
        reason: { type: String, maxlength: 300 },
        rejectedBy: { type: mongoose.Schema.Types.ObjectId, required: false }, // ID of who rejected
        rejectedByModel: { type: String, enum: ["user", "vendor"] },     // which model
        rejectedAt: { type: Date },
    },

    // 🔁 Cancellation details (for both user & vendor)
    cancellation: {
        cancelledBy: {
            type: String,
            enum: ["user", "vendor"],
        },
        cancelledById: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "cancellation.cancelledBy",
        },
        reason: { type: String, maxlength: 300 },
        cancelledAt: { type: Date },

        // Refund Info
        refundAmount: { type: Number, default: 0 },
        refundStatus: {
            type: String,
            enum: ["not_initiated", "initiated", "processed", "failed"],
            // default: "not_initiated",
        },
        refundTransactionId: String, // Razorpay refund ID

        // Vendor penalty (if vendor cancelled)
        vendorPenalty: {
            applied: { type: Boolean, default: false },
            amount: { type: Number, default: 0 },
            reason: { type: String },
        },
    },


}, { timestamps: true });

const Booking = mongoose.model('Booking', bookingSchema);

export default Booking;
