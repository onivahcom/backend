import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "userTables" },      // for normal users
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },  // for vendors
    type: { type: String, enum: ["user", "vendor"], required: true },  // helps filtering
    title: { type: String, required: true },
    messageType: { type: String, enum: ["order", "payment", "system", "promo"], default: "system" }, // new field
    content: { type: String, required: true },
    url: { type: String, },
    read: { type: Boolean, default: false },
    sendBy: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: "sendByModel"
    },

    sendByModel: {
        type: String,
        enum: ["adminTables", "userTables", "Vendor"],
        required: true
    },


}, { timestamps: true });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
