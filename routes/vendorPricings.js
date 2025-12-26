// routes/vendorPricings.js
import express from "express";
import customPricingUpload from "../utils/customPricingUpload.js";

const vendorPricings = express.Router();

vendorPricings.post("/upload/custom-pricing-images", customPricingUpload.any(), (req, res) => {
    try {
        const files = req.files;
        if (!files || !files.length) {
            return res.status(400).json({ message: "No files uploaded" });
        }

        const pricingImageUrls = {};
        files.forEach((file) => {
            const index = file.fieldname.split("_")[1];
            pricingImageUrls[index] = file.path; // Cloudinary secure URL
        });

        res.status(200).json({ pricingImageUrls });
    } catch (err) {
        console.error("Custom pricing upload error:", err.message);
        res.status(500).json({ message: "Failed to upload pricing images", error: err.message });
    }
}
);

export default vendorPricings;
