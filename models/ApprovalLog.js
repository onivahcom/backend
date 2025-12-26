import mongoose from 'mongoose';

// Define schema for storing approval/decline data
const approvalLogSchema = new mongoose.Schema({
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminTable', // Assuming Admin model exists
        required: true,
    },
    approved: [
        {
            serviceCategory: { type: String, required: true },
            serviceName: { type: String, required: true },
            serviceId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'RequestedService', // Reference to the requested service
                required: true,
            },
            serviceOwner: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Vendor', // Reference to the requested service
                required: true,
            },
        },
    ],
    declined: [
        {
            serviceCategory: { type: String, required: true },
            serviceName: { type: String, required: true },
            serviceId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'RequestedService', // Reference to the requested service
                required: true,
            },
            serviceOwner: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Vendor', // Reference to the requested service
                required: true,
            },
            declineReason: { type: String, required: true },
        },
    ],
    timestamp: { type: Date, default: Date.now },
});

const ApprovalLog = mongoose.model('ApprovalLog', approvalLogSchema);

export default ApprovalLog;
