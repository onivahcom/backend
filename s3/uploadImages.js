import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

const s3 = new S3Client({
    region: process.env.AWS_REGION_NAME,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const uploadToS3 = async (fileBuffer, fileName, folderName, vendorId, mimeType) => {
    const key = `${vendorId}/${folderName}/${uuidv4()}-${fileName}`;

    const command = new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        Body: fileBuffer,
        ContentType: "image/jpg,png,jpeg,webp",
    });

    await s3.send(command);

    return `${process.env.AWS_CLOUDFRONT_URL}/${key}`;
    ; // Return only the key, NOT the full URL
};

export default uploadToS3;