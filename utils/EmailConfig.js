
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    service: "Gmail",
    tls: {
        rejectUnauthorized: false,
    },
    auth: {
        user: "onivah.com@gmail.com", // Replace with your email address
        pass: "whis itue tmtu ypqs", // Replace with your email password or use environment variables frau isgz jtkt gebe

    },
});

export default transporter;
