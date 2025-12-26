import mongoose from "mongoose";

const serviceAvailabilitySchema = new mongoose.Schema(
    {
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vendor",
            required: true,
            index: true,
        },

        serviceId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },

        category: {
            type: String,
            required: true,
            index: true,
        },

        status: {
            type: String,
            enum: ["active", "inactive", "busy"],
            index: true,
        },

        reason: {
            type: String,
            trim: true,
            maxlength: 250,
        },

        offlineFrom: {
            type: Date,
            default: null,
        },

        offlineTo: {
            type: Date,
            default: null,
        },

        updatedBy: {
            type: String,
            enum: ["vendor", "admin", "system"],
            default: "vendor",
        },
    },
    {
        timestamps: true,
    }
);


const ServiceAvailability = mongoose.model("ServiceAvailability", serviceAvailabilitySchema, "ServiceAvailability");

export default ServiceAvailability;
