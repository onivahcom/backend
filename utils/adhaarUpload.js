import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
        return {
            folder: "vendor_docs",
            public_id: `${req.body.vendorId}_aadhar`,
            resource_type: "raw",   // store as raw so PDFs, DOCs, etc. work
            type: "private",        // makes file private (not publicly accessible)
            format: "pdf",          // enforce PDF format
        };
    },
});

const adhaarUpload = multer({ storage });
export default adhaarUpload;

