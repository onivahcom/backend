// utils/customPricingUpload.js
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const customPricingUpload = multer({
    storage: new CloudinaryStorage({
        cloudinary,
        params: async (req, file) => {
            try {

                console.log(req.body);

                // parse titleMap manually if it's a string
                const titleMapRaw = req.body.titleMap;
                let titleMap = {};
                if (titleMapRaw) {
                    if (typeof titleMapRaw === "string") {
                        titleMap = JSON.parse(titleMapRaw);
                    } else {
                        titleMap = titleMapRaw;
                    }
                }

                const fieldname = file.fieldname; // e.g. "pricingImage_0"
                const title = titleMap[fieldname] || "untitled";

                return {
                    folder: `vendor/${req.body.vendorId}/pricings/${title}`,
                    resource_type: "image",
                    public_id: `${title}_${Date.now()}`,
                    overwrite: true,
                };
            } catch (err) {
                console.error("CloudinaryStorage params error:", err.message);
                throw new Error("Invalid titleMap JSON");
            }
        },
    }),
});

export default customPricingUpload;
