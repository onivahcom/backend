import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "userTables" },      // for normal users
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },  // for vendors
    type: { type: String, enum: ["user", "vendor"], required: true },  // helps filtering
    title: { type: String, required: true },
    content: { type: String, required: true },
    url: { type: String, required: true },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
