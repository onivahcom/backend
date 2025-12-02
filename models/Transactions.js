import mongoose from "mongoose";

const transactions = new mongoose.Schema({

    // ------ CORE REFERENCES ------
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Booking",
        required: true
    },

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

    serviceId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },

    category: {
        type: String,
        required: true
    },

    serviceName: String,

    // ------ WHICH PAYMENT GATEWAY ------
    provider: {
        type: String,
        enum: ["RAZORPAY", "PAYPAL", "STRIPE", "CASH", "OTHER"],
        required: true
    },

    // ------ COMMON PAYMENT FIELDS ------
    amount: Number,
    currency: { type: String, default: "INR" },
    status: {
        type: String,
        enum: ["pending", "authorized", "captured", "failed", "refunded", 'rejected', 'cancelled',],
        default: "pending"
    },

    // ------ PROVIDER-SPECIFIC DATA ------
    razorpay: {
        orderId: String,
        paymentId: String,
        signature: String,

        method: String, // upi, card, netbanking, wallet
        methodDetails: {
            upi: {
                vpa: { type: String },
                rrn: { type: String }
            },
            card: {
                last4: { type: String },
                network: { type: String },
                type: { type: String }
            },
            bank: {
                bankName: { type: String },
                accountNumber: { type: String },
                ifsc: { type: String }
            }
        },

        // Capture
        capture: {
            capturedAt: Date,
            captureAmount: Number,
            captureId: String
        },

        // Refund
        refund: {
            refundId: String,
            refundAmount: Number,
            refundStatus: String,
            refundedAt: Date
        },

        failure: {
            reason: String,
            code: String,
            description: String,
            failedAt: Date,
            razorpayErrorCode: String,
            razorpayErrorDescription: String
        }
    },

    paypal: {
        orderId: String,
        captureId: String,
        payerId: String,
        payerEmail: String,
        payerName: String,

        status: String, // COMPLETED, FAILED

        refund: {
            refundId: String,
            refundStatus: String,
            refundedAt: Date
        },

        failure: {
            reason: String,
            message: String,
            failedAt: Date
        }
    },

    // For future Stripe or any other provider
    meta: mongoose.Schema.Types.Mixed,

}, { timestamps: true });

const Transactions = mongoose.model("Transactions", transactions);
export default Transactions;
