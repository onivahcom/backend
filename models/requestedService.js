import mongoose from "mongoose";


const requestedServiceSchema = new mongoose.Schema(
    {
        fullName: { type: String, required: true },
        email: { type: String, required: true },
        category: { type: String, required: true },
        additionalFields: { type: mongoose.Schema.Types.Mixed, default: {} },
        images: {
            type: Map,
            of: [String], // Each key is a folder name, value is array of strings (keys)
            default: {}
        },
        file: {
            originalName: { type: String },
            storedName: { type: String },
            mimeType: { type: String },
            size: { type: Number },
            publicId: { type: String },
            resourceType: { type: String },
            secureUrl: { type: String },
        },
        serviceVisibility: {
            type: String,
            enum: ["active", "inactive", "busy"],
            default: "offline",
        },
        isApproved: { type: Boolean, default: false }, // True if approved, false otherwise
        declined: { type: Boolean, default: false }, // True if declined
        declineReason: { type: String, default: null }, // Reason for decline (if declined)
        linkedServiceId: { type: mongoose.Schema.Types.ObjectId, default: null },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
            required: true,
        },
        termsandconditions: {
            type: [String], // Array of strings
            default: [],
        },
        cancellationPolicy: {
            type: String,
            enum: ["flexible", "moderate", "strict"],
            default: "moderate",
            required: true,
        },
        paymentPreference: {
            type: String,
            enum: ["immediate", "delayed", "scheduled"],
            default: "delayed",
            required: true,
        },

    },
    { timestamps: true }
);

const RequestedService =
    mongoose.models.RequestedService || mongoose.model('RequestedService', requestedServiceSchema);

export default RequestedService;