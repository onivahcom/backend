import express from "express";
import multer from "multer";
import uploadProfilePictureToS3 from "../s3/uploadProfilePictureToS3.js";
import userTable from "../database/userTable.js";// adjust based on your model structure

const profilePicRouter = express.Router();

// Use multer memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Route: Upload single profile picture
profilePicRouter.post("/:userId/upload-profile-pic", upload.single("profilePic"), async (req, res) => {
    try {
        const { userId } = req.params;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        // Upload to S3 and get back the CloudFront URL
        const profilePicUrl = await uploadProfilePictureToS3(
            file.buffer,
            file.originalname,
            file.mimetype,
            userId
        );

        // Update user's profilePic in the DB
        const updatedUser = await userTable.findByIdAndUpdate(
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

export default profilePicRouter;
