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
        ref: "vendor",
        required: true
    },
    amount: Number,
    status: { type: String, default: 'pending' },
    razorpayOrderId: String,
    razorpayPaymentId: String,
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
        rejectedByModel: { type: String, enum: ["userTables", "vendor"] },     // which model
        rejectedAt: { type: Date },
    },

}, { timestamps: true });

const Booking = mongoose.model('Booking', bookingSchema);

export default Booking;
