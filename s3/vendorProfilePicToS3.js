import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

const s3Client = new S3Client({
    region: process.env.AWS_REGION_NAME,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const vendorProfilePicToS3 = async (buffer, originalName, mimetype, userId) => {
    const uniqueFileName = `${userId}/profile-pic/${uuidv4()}-${originalName}`;

    const command = new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: uniqueFileName,
        Body: buffer,
        ContentType: mimetype,
    });

    await s3Client.send(command);

    // 🔁 Return CloudFront-based URL (not S3)
    return `${process.env.AWS_CLOUDFRONT_URL}/${uniqueFileName}`;
};

export default vendorProfilePicToS3;
