// models/ServicePricingConfig.js
import mongoose from "mongoose";

const servicePricingConfigSchema = new mongoose.Schema({
    serviceId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        trim: true,
    },
    category: {
        type: String,
        required: true,
        trim: true
    },
    peakDays: {
        type: [String],
        default: [] // e.g. ["Saturday", "Sunday"]
    },
    peakMonths: {
        type: [String],
        default: [] // e.g. ["January", "December"]
    },
    specialDates: {
        type: [String],
        default: [] // e.g. ["2025-10-05", "2025-12-25"]
    },
    highDemandLocations: {
        type: [String],
        default: [] // e.g. ["Chennai", "Goa"]
    },
    editedBy: {
        type: String,
        default: "System", // fallback if no admin name
        trim: true,
    },
}, { timestamps: true });

export const ServicePricingConfig =
    mongoose.models.ServicePricingConfig ||
    mongoose.model("ServicePricingConfig", servicePricingConfigSchema);
