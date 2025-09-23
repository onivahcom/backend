// server/models/StripePayment.js
import mongoose from "mongoose";

const stripePaymentSchema = new mongoose.Schema({
    sessionId: String,
    customerEmail: String,
    amountTotal: Number,
    currency: String,
    paymentStatus: String,
    createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("StripePayment", stripePaymentSchema);
