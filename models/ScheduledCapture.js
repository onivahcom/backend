import mongoose from "mongoose";


const ScheduledCaptureSchema = new mongoose.Schema({
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    cardToken: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    captureDate: { type: Date, required: true }, // e.g., serviceDate - 3 days
    status: { type: String, enum: ["pending", "success", "failed"], default: "pending" }
}, { timestamps: true });

const ScheduledCaptures = mongoose.model("ScheduledCaptures", ScheduledCaptureSchema);
export default ScheduledCaptures;
