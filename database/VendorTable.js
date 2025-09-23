import mongoose from "mongoose";

const vendorSchema = new mongoose.Schema({
    // name: {
    //     type: String,
    //     required: true,
    // },
    // email: {
    //     type: String,
    //     required: true,
    //     // unique: true,
    // },
    // phone: {
    //     type: String,
    //     required: true,
    // },
    vendorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'vendor',
        required: true,
    },
    // linkedServiceId: {
    //     type: mongoose.Schema.Types.ObjectId,
    //     ref: 'RequestedService',
    //     required: true,
    // },
    businesses: [{
        businessName: { type: String, required: true },
        addressLine1: { type: String, required: true },
        addressLine2: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        country: { type: String, required: true },
        pincode: { type: String, required: true },
        gstNumber: { type: String },
        aadharNumber: { type: String },
        images: [String],
        file: {  // File-related details
            filename: { type: String },
            mimeType: { type: String },
            size: { type: Number },
        },
        linkedServiceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'RequestedService',
        },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true,
});

const VendorsTable = mongoose.model('VendorsTable', vendorSchema);

export default VendorsTable;
