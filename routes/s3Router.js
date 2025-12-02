import express from "express";
import multer from "multer";
import uploadToS3 from "../s3/uploadImages.js";

const s3Router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });

s3Router.post("/upload-images", upload.array("images"), async (req, res) => {
    try {
        const vendorId = req.body.vendorId;
        const folderMap = JSON.parse(req.body.folderMap || "[]"); // array of {fileName, folderName}
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: "No files uploaded" });
        }

        // Map file.originalname to folderName
        const fileFolderMap = {};
        folderMap.forEach(({ fileName, folderName }) => {
            fileFolderMap[fileName] = folderName;
        });

        // Object to group urls by folderName
        const groupedUrls = {};

        for (const file of files) {
            const folderName = fileFolderMap[file.originalname];
            if (!folderName) {
                console.warn(`Folder not found for file ${file.originalname}, skipping`);
                continue;
            }
            const url = await uploadToS3(file.buffer, file.originalname, folderName, vendorId, file.mimetype);

            // Initialize array if doesn't exist
            if (!groupedUrls[folderName]) {
                groupedUrls[folderName] = [];
            }

            // Push the url (or an object with url and filename if you want)
            groupedUrls[folderName].push({
                url,
                fileName: file.originalname
            });
        }

        return res.status(200).json({ groupedUrls });
    } catch (error) {
        console.error("S3 Upload Error:", error);
        return res.status(500).json({ error: "Upload failed" });
    }
});


export default s3Router;
