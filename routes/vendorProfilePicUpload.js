import express from "express";
import multer from "multer";
import userTable from "../models/userTable.js";// adjust based on your model structure
import vendorProfilePicToS3 from "../s3/vendorProfilePicToS3.js";
import Vendor from "../models/vendors.js";

const vendorProfilePicUpload = express.Router();

// Use multer memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Route: Upload single profile picture
vendorProfilePicUpload.post("/:userId/upload-profile-pic", upload.single("profilePic"), async (req, res) => {
    try {
        const { userId } = req.params;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        // Upload to S3 and get back the CloudFront URL
        const profilePicUrl = await vendorProfilePicToS3(
            file.buffer,
            file.originalname,
            file.mimetype,
            userId
        );

        // Update user's profilePic in the DB
        const updatedUser = await Vendor.findByIdAndUpdate(
            userId,
            { profilePic: profilePicUrl },
            { new: true } // returns the updated doc
        );

        return res.status(200).json({
            message: "Profile picture uploaded successfully",
            profilePicUrl
        });
    } catch (error) {
        console.error("S3 Upload Error:", error);
        return res.status(500).json({ error: "Upload failed" });
    }
});

export default vendorProfilePicUpload;
