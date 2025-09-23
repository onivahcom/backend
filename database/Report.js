import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "userTables", },
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "vendor", required: true },
        serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "RequestedService", required: true },
        categoryName: { type: String, required: true },
        reason: { type: String, required: true },
        status: {
            type: String,
            enum: ["pending", "reviewed", "resolved"],
            default: "pending",
        },
    },
    { timestamps: true }
);

export default mongoose.model("Report", reportSchema);
