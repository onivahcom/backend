import express from "express";
import nodemailer from "nodemailer"
import Vendor from "../models/vendors.js";
import jwt from "jsonwebtoken";
import path from 'path';
import { fileURLToPath } from 'url';
import multer from "multer";
import fs from 'fs'
import twilio from 'twilio'; // Use ES6 import
import bcrypt from 'bcrypt'; // To hash the password
import RequestedService from "../models/RequestedService.js";
import mongoose from "mongoose";
import Feedback from "../models/Feedback.js";
import Message from "../models/Message.js";
import Booking from "../models/bookingSchema.js";
import { ServicePricingConfig } from "../models/ServicePricingConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const vendorRouter = express.Router();

// Storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = 'uploads/';
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath);
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // max 5MB
});

vendorRouter.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const transporter = nodemailer.createTransport({
    service: "Gmail", // Replace with your email service provider, or use custom SMTP settings
    tls: {
        rejectUnauthorized: false,
    },
    auth: {
        user: "pabishek61001@gmail.com", // Replace with your email address
        pass: "frau isgz jtkt gebe", // Replace with your email password or use environment variables
    },
});

// store otp
let otpStore = {};

// sign up send otp
const verificationTokens = {}; // In-memory store for verification tokens

// const accountSid = 'AC93a660151416ae6a93f897f268970391';
// const authToken = 'c1f6b8926ed0cc0ffbb9a23e603b281a';
// const whatsappNumber = "+14067977741"; //14155238886  //sms -14067977741 Twilio WhatsApp sandbox number
// const client = twilio(accountSid, authToken);

// vendor authentication
const vendorAuth = async (req, res, next) => {

    const token = req.cookies?.vd_token;

    if (!token) {
        // Clear cookie if no token found
        res.clearCookie('vd_token', {
            httpOnly: true,
            secure: false, // Set true if using HTTPS
            sameSite: 'Lax',
            path: '/', // important to match the cookie path
        });
        return res.status(401).json({ error: "Unauthorized: Token not provided." }); // Unauthorized

    }

    try {
        // Decode the JWT token
        const decoded = jwt.verify(token, process.env.VENDOR_SECRET_KEY);

        // Extract email and phone from the decoded token
        const { id } = decoded;

        // Find the vendor using the decoded email and phone
        const vendorData = await Vendor.findById(id).lean();

        if (!vendorData) {
            res.clearCookie('vd_token', {
                httpOnly: true,
                secure: false, // Set true if using HTTPS
                sameSite: 'Lax',
                path: '/', // important to match the cookie path
            });
            return res.status(404).json({ success: false, message: 'Vendor not found' });
        }

        // Attach the vendor data to the request object
        req.vendor = vendorData;

        // Proceed to the next middleware or route handler
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Unauthorized: Invalid token' });
    }
};

// protected-route
vendorRouter.get('/verify-token', vendorAuth, (req, res) => {
    const { password, ...vendorData } = req.vendor;  // Destructure to exclude the password
    res.status(200).json({ success: true, vendor: vendorData });
});

// signup verification
vendorRouter.get('/signup/verify/:token', (req, res) => {
    const { token } = req.params;

    try {
        // Verify the JWT token
        const decoded = jwt.verify(token, process.env.VENDOR_SECRET_KEY);
        const { email } = decoded;

        // Delete the token from the in-memory store after successful verification
        delete verificationTokens[email];

        // Send a JSON response indicating success
        return res.status(200).json({
            success: true,
            message: 'Email successfully verified. Please proceed to set your password.',
            redirectTo: '/vendor/password_setup', // Provide the next action or page
            userEmail: email
        });

    } catch (error) {
        console.error('Error verifying token:', error);

        // Check for token expiry
        if (error.name === 'TokenExpiredError') {
            const { email } = jwt.decode(token); // Decode to get the email even if expired
            delete verificationTokens[email]; // Remove expired token
            // Send a response indicating the token is expired
            return res.status(400).json({
                success: false,
                message: 'Verification link has expired. Please request a new one.',
                redirectTo: '/vendor-login', // URL to redirect if expired

            });
        }

        // If token is invalid (or any other error), remove it from the store
        const { email } = jwt.decode(token); // Decode to get the email
        delete verificationTokens[email]; // Remove invalid token
        // Send a response indicating the token is invalid
        return res.status(400).json({
            success: false,
            message: 'Invalid verification token. Please request a new one.',
            redirectTo: '/vendor-login', // URL to redirect if invalid,

        });
    }
});

// vendor login-verify otp
vendorRouter.post('/login/verify-otp', (req, res) => {
    const { loginInput, otp } = req.body;
    const storedOtpData = otpStore[loginInput];

    if (storedOtpData && storedOtpData.otp === parseInt(otp)) {
        const timeElapsed = Date.now() - storedOtpData.createdAt;
        if (timeElapsed < 5 * 60 * 1000) { // OTP valid for 5 mins
            // Generate JWT token
            const token = jwt.sign({ loginInput, userType: storedOtpData.userType }, process.env.JWT_SECRET_KEY, {
                expiresIn: 30 * 24 * 60 * 60 * 1000 // Token validity
            });

            res.cookie('vd_token', token, {
                httpOnly: true,
                secure: false, // Set to true if using HTTPS
                sameSite: 'Lax',
                maxAge: 7 * 24 * 60 * 60 * 1000, // 30 days in milliseconds,
                path: '/',

            });


            res.json({ success: true, token });
        } else {
            res.json({ success: false, message: "OTP expired" });
        }
    } else {
        res.json({ success: false, message: "Invalid OTP" });
    }
});

// Password setup API
vendorRouter.post('/set-password', async (req, res) => {
    const { email, phone, password } = req.body;

    if ((!email && !phone) || !password) {
        return res.status(400).json({
            success: false,
            message: 'Email or phone and password are required',
        });
    }

    try {
        // Check if user already exists
        const userExists = await Vendor.findOne({
            $or: [{ email }, { phone }],
        });

        if (userExists) {
            return res.status(400).json({
                success: false,
                message: 'User already registered!',
            });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const newUser = new vendor({
            email,
            phone,
            password: hashedPassword,
        });

        await newUser.save();

        // Generate JWT Token
        const tokenPayload = {
            email: newUser.email,
            phone: newUser.phone,
        };

        const token = jwt.sign(tokenPayload, process.env.VENDOR_SECRET_KEY, { expiresIn: 30 * 24 * 60 * 60 * 1000 });

        res.cookie('vd_token', token, {
            httpOnly: true,
            secure: false, // Set to true if using HTTPS
            sameSite: 'Lax',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 30 days in milliseconds,
            path: '/',
        });

        res.status(200).json({
            success: true,
            message: 'User registered and password set successfully',
            token,
        });

    } catch (error) {
        console.error('Error in /set-password:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
});

// vendor signup email verification
vendorRouter.post('/verify-email-otp', (req, res) => {
    const { email, otp } = req.body;

    // Simple validation for OTP
    if (String(otp) === String(otpStore[email])) {
        return res.status(200).json({
            message: 'Email OTP verified successfully.',
            verified: true,
        });
    } else {
        return res.status(400).json({
            message: 'Invalid Email OTP.',
            verified: false,
        });
    }
});

// vendor signup phone verification
vendorRouter.post('/verify-phone-otp', (req, res) => {
    const { phone, otp } = req.body;

    // Simple validation for OTP
    if (String(otp) === String(otpStore[phone])) {
        return res.status(200).json({
            message: 'Phone OTP verified successfully.',
            verified: true,
        });
    } else {
        return res.status(400).json({
            message: 'Invalid Phone OTP.',
            verified: false,
        });
    }
});

// Function to generate a random 4-digit OTP
const generateOtp = () => Math.floor(1000 + Math.random() * 9000);

// Send OTP to email
const sendEmailOtp = async (email) => {
    const otp = generateOtp();

    otpStore[email] = otp;
    const mailOptions = {
        from: 'pabishek61001@gmail.com',  // Your email address
        to: email,                     // Recipient's email address
        subject: 'Your OTP Code',
        text: `Your OTP code is: ${otp}`,
    };

    try {
        // await transporter.sendMail(mailOptions);
        console.log(`OTP sent to email: ${email, otp}`);
        return otp;  // Return the OTP for later verification
    } catch (error) {
        throw error;
    }
};

// Send OTP to phone (using Twilio SMS service)
const sendPhoneOtp = async (phone) => {
    const otp = generateOtp();
    otpStore[phone] = otp;

    try {
        // const message = await client.messages.create({
        //     from: whatsappNumber,
        //     to: `+${phone}`,
        //     body: `Your OTP is: ${otp}. Please use this to verify your account.`,
        // });
        console.log(`OTP sent to phone: ${phone},${otp}`);
        return otp;  // Return the OTP for later verification
    } catch (error) {
        console.error('Error sending phone OTP:', error);
        throw error;
    }
};

// vendor login send OTP (email or phone)
vendorRouter.post('/send-otp', async (req, res) => {
    const { type, email, phone } = req.body;

    try {
        let otp;

        if (type === 'email' && email) {
            // If email is provided, check if the user already exists by email
            let user = await Vendor.findOne({ email: email });

            if (user) {
                return res.status(404).json({ message: 'Email already registered' });
            }

            // Send OTP for email
            otp = await sendEmailOtp(email);
            return res.status(200).json({ message: 'Email OTP sent', otp });

        } else if (type === 'phone' && phone) {
            // If phone is provided, check if the user already exists by phone
            let user = await Vendor.findOne({ phone: phone });

            if (user) {
                return res.status(404).json({ message: 'Phone number already registered' });
            }

            // Send OTP for phone
            otp = await sendPhoneOtp(phone);
            return res.status(200).json({ message: 'Phone OTP sent', otp });

        } else {
            return res.status(400).json({ message: 'Invalid request, type or phone/email missing' });
        }
    } catch (error) {
        console.error("Error sending OTP:", error);
        res.status(500).json({ message: 'Error sending OTP', error });
    }
});

// vendor verify send OTP (email or phone)
vendorRouter.post('/vendor-login', async (req, res) => {
    const { email, phone, password } = req.body;

    // Check if email/phone and password are provided
    if (!password || (!email && !phone)) {
        return res.status(400).json({ success: false, message: 'Missing email/phone or password' });
    }

    try {
        let user;

        if (email) {
            // Search by email
            user = await Vendor.findOne({ email });
        } else if (phone) {
            // Search by phone
            user = await Vendor.findOne({ phone });
        }

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Compare the hashed password with the provided password (async operation)
        const isMatch = bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }

        // If password matches, generate a JWT token
        const tokenPayload = {
            id: user._id
            // vendorId: user.vendorId, // You can include additional user info like vendorId
        };

        const token = jwt.sign(tokenPayload, process.env.VENDOR_SECRET_KEY, { expiresIn: "7d" });

        res.cookie('vd_token', token, {
            httpOnly: true,
            secure: false, // Set to true if using HTTPS
            sameSite: 'Lax',
            path: "/",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        // Send the token to the frontend
        res.status(200).json({
            success: true,
            message: 'Login successful',
            token, // Send the token to the frontend
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// vendor profile update
vendorRouter.put('/profile/update/:vendorId', vendorAuth, async (req, res) => {
    try {
        const { vendorId } = req.params;
        const updatedFields = req.body;

        const updatedVendor = await Vendor.findByIdAndUpdate(vendorId, { $set: updatedFields }, { new: true });
        if (!updatedVendor) {
            return res.status(404).json({ error: 'Vendor not found' });
        }
        res.status(200).json({ message: 'Vendor profile updated successfully', vendor: updatedVendor });
    } catch (error) {
        console.error('Error updating vendor profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// vendor services listing based on email 
vendorRouter.get("/fetch/services", vendorAuth, async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ message: "Email is required" });

        const services_from = await RequestedService.find({
            email: email,
            // isApproved: true,

        });

        res.json({ success: true, services: services_from });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// ✅ Fetch vendor services by vendorId (simplified data)
vendorRouter.get("/:vendorId/services", vendorAuth, async (req, res) => {
    try {
        const { vendorId } = req.params;
        if (!vendorId) {
            return res.status(400).json({ message: "Vendor ID is required" });
        }

        const services = await RequestedService.find({
            vendorId: vendorId,
            isApproved: true,
        });

        // Transform response to include only required fields
        const formattedServices = services.map((service) => ({
            businessName: service.additionalFields?.businessName || "N/A",
            linkedServiceId: service.linkedServiceId || null,
            category: service.category || "Unknown",
            coverImage: service.images?.get("CoverImage")
        }));

        res.json({ success: true, services: formattedServices });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});




// get images for a specific vendor using email
vendorRouter.get('/fetch/:email/images', vendorAuth, async (req, res) => {
    const { email } = req.params;

    try {
        const services_from = await RequestedService.find({
            email: email,
            isApproved: true
        });

        const db = mongoose.connection.db;

        const services = await Promise.all(
            services_from.map(async (service) => {
                const { category, linkedServiceId } = service;

                try {
                    const collection = db.collection(category);
                    const linkedService = await collection.findOne({
                        _id: new mongoose.Types.ObjectId(linkedServiceId)
                    });

                    return linkedService;

                } catch (err) {
                    return null;
                }
            })
        );
        res.json({ success: true, services: services });

    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// particular service fetch by id
vendorRouter.get("/category/:category/:serviceId", vendorAuth, async (req, res) => {
    try {
        const { category, serviceId } = req.params;
        // Get the corresponding collection dynamically
        const service = await mongoose.connection
            .collection(category)
            .findOne({ _id: new mongoose.Types.ObjectId(serviceId) });
        if (!service) {
            return res.status(404).json({ message: "Service not found" });
        }
        // Get feedbacks for this service and populate user info
        const feedbacks = await Feedback.find({ serviceId })
            .populate('userId', 'firstname profilePic lastname') // populate only name and email
            .sort({ createdAt: -1 });

        // Combine and respond
        res.status(200).json({ ...service, feedbacks });

    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
});

// update /edit images
vendorRouter.post('/update-images', vendorAuth, async (req, res) => {
    try {
        const { category, categoryId, images } = req.body;

        if (!category || !categoryId || !images) {
            return res.status(400).json({ error: 'category, categoryId, and images are required.' });
        }

        if (!mongoose.Types.ObjectId.isValid(categoryId)) {
            return res.status(400).json({ error: 'Invalid categoryId.' });
        }

        const collections = await mongoose.connection.db.listCollections().toArray();
        if (!collections.some(c => c.name === category)) {
            return res.status(404).json({ error: `Collection '${category}' does not exist.` });
        }

        const objectId = new mongoose.Types.ObjectId(categoryId);
        const collection = mongoose.connection.db.collection(category);

        const updatedDoc = await collection.findOneAndUpdate(
            { _id: objectId },
            { $set: { images } }, // Use directly what frontend sent
            { returnDocument: 'after' }
        );

        // Step 2: Update linked requestedservices
        const requestedServicesCollection = mongoose.connection.db.collection('requestedservices');

        const updateResult = await requestedServicesCollection.updateMany(
            { linkedServiceId: objectId },
            { $set: { images } }
        );



        if (!updatedDoc) {
            return res.status(404).json({ error: 'Document not found with provided categoryId.' });
        }

        return res.json({ message: 'Images updated successfully.' });
    } catch (error) {
        console.error('Error updating images:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// description update changes
vendorRouter.put('/update-description', vendorAuth, async (req, res) => {
    const { serviceId, newDescription } = req.body;

    if (!serviceId || !newDescription) {
        return res.status(400).json({ error: 'Missing serviceId or newDescription' });
    }

    try {
        // 1. Find the service using serviceId
        const service = await RequestedService.findOne({ linkedServiceId: serviceId });
        if (!service) {
            return res.status(404).json({ error: 'Service not found using serviceId' });
        }

        const { category } = service;
        if (!category) {
            return res.status(400).json({ error: 'Category missing in service document' });
        }

        // 2. Update the RequestedService description
        const requestedUpdate = await RequestedService.updateOne(
            { linkedServiceId: serviceId },
            { $set: { 'additionalFields.description': newDescription } },
            { new: true }
        );

        // 3. Update the description inside additionalFields of the dynamic category collection
        const collection = mongoose.connection.db.collection(category);
        const dynamicUpdate = await collection.updateOne(
            { _id: new mongoose.Types.ObjectId(serviceId) },
            { $set: { 'additionalFields.description': newDescription } },
            { new: true } // returns the updated document
        );

        if (requestedUpdate.modifiedCount === 0 && dynamicUpdate.modifiedCount === 0) {
            return res.status(404).json({ error: 'No documents updated. Check serviceId and dynamic document _id.' });
        }

        return res.status(200).json({ message: 'Description updated successfully in both collections' });
    } catch (err) {
        console.error('Error updating description:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// why us update changes
vendorRouter.put('/update-whyus', vendorAuth, async (req, res) => {
    const { serviceId, newWhyus } = req.body;

    if (!serviceId || !newWhyus) {
        return res.status(400).json({ error: 'Missing serviceId or newWhyus' });
    }

    try {
        // 1. Find the service using serviceId
        const service = await RequestedService.findOne({ linkedServiceId: serviceId });
        if (!service) {
            return res.status(404).json({ error: 'Service not found using serviceId' });
        }

        const { category } = service;
        if (!category) {
            return res.status(400).json({ error: 'Category missing in service document' });
        }

        const whyusArray = Array.isArray(newWhyus) ? newWhyus : [newWhyus];


        // 2. Update the RequestedService generatedWhyUs
        const requestedUpdate = await RequestedService.updateOne(
            { linkedServiceId: serviceId },
            { $set: { 'additionalFields.generatedWhyUs': whyusArray } },
            { new: true }
        );

        // 3. Update the generatedWhyUs inside additionalFields of the dynamic category collection
        const collection = mongoose.connection.db.collection(category);
        const dynamicUpdate = await collection.updateOne(
            { _id: new mongoose.Types.ObjectId(serviceId) },
            { $set: { 'additionalFields.generatedWhyUs': whyusArray } },
            { new: true } // returns the updated document
        );

        if (requestedUpdate.modifiedCount === 0 && dynamicUpdate.modifiedCount === 0) {
            return res.status(404).json({ error: 'No documents updated. Check serviceId and dynamic document _id.' });
        }
        return res.status(200).json({ message: 'newWhyus updated successfully in both collections' });
    } catch (err) {
        console.error('Error updating generatedWhyUs:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

vendorRouter.put('/update-pricings', vendorAuth, async (req, res) => {
    const { serviceId, pricings } = req.body;

    if (!serviceId || !pricings) {
        return res.status(400).json({ error: 'Missing serviceId or pricings' });
    }

    try {
        // 1. Find the service using serviceId
        const service = await RequestedService.findOne({ linkedServiceId: serviceId });
        if (!service) {
            return res.status(404).json({ error: 'Service not found using serviceId' });
        }

        const { category } = service;
        if (!category) {
            return res.status(400).json({ error: 'Category missing in service document' });
        }

        const whyusArray = Array.isArray(pricings) ? pricings : [pricings];


        // 2. Update the RequestedService customPricing
        const requestedUpdate = await RequestedService.updateOne(
            { linkedServiceId: serviceId },
            { $set: { 'additionalFields.customPricing': whyusArray } },
            { new: true }
        );

        // 3. Update the customPricing inside additionalFields of the dynamic category collection
        const collection = mongoose.connection.db.collection(category);
        const dynamicUpdate = await collection.updateOne(
            { _id: new mongoose.Types.ObjectId(serviceId) },
            { $set: { 'additionalFields.customPricing': whyusArray } },
            { new: true } // returns the updated document
        );

        if (requestedUpdate.modifiedCount === 0 && dynamicUpdate.modifiedCount === 0) {
            return res.status(404).json({ error: 'No documents updated. Check serviceId and dynamic document _id.' });
        }
        return res.status(200).json({ message: 'pricings updated successfully in both collections' });
    } catch (err) {
        console.error('Error updating customPricing:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

vendorRouter.put('/update-fields', vendorAuth, async (req, res) => {
    const { serviceId, fields } = req.body;

    if (!serviceId || !fields) {
        return res.status(400).json({ error: 'Missing serviceId or fields' });
    }

    try {
        // 1. Find the service using serviceId
        const service = await RequestedService.findOne({ linkedServiceId: serviceId });
        if (!service) {
            return res.status(404).json({ error: 'Service not found using serviceId' });
        }

        const { category } = service;
        if (!category) {
            return res.status(400).json({ error: 'Category missing in service document' });
        }

        const whyusArray = Array.isArray(fields) ? fields : [fields];


        // 2. Update the RequestedService customFields
        const requestedUpdate = await RequestedService.updateOne(
            { linkedServiceId: serviceId },
            { $set: { 'additionalFields.customFields': whyusArray } },
            { new: true }
        );

        // 3. Update the customFields inside additionalFields of the dynamic category collection
        const collection = mongoose.connection.db.collection(category);
        const dynamicUpdate = await collection.updateOne(
            { _id: new mongoose.Types.ObjectId(serviceId) },
            { $set: { 'additionalFields.customFields': whyusArray } },
            { new: true } // returns the updated document
        );

        if (requestedUpdate.modifiedCount === 0 && dynamicUpdate.modifiedCount === 0) {
            return res.status(404).json({ error: 'No documents updated. Check serviceId and dynamic document _id.' });
        }
        return res.status(200).json({ message: 'fields updated successfully in both collections' });
    } catch (err) {
        console.error('Error updating customFields:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// delete images folder
vendorRouter.post("/delete-folder", vendorAuth, async (req, res) => {
    try {
        const { category, categoryId, folderName } = req.body;

        if (!category || !categoryId || !folderName) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const objectId = new mongoose.Types.ObjectId(categoryId);
        const collection = mongoose.connection.db.collection(category);

        const doc = await collection.findOne({ _id: objectId });

        if (!doc) {
            return res.status(404).json({ error: "Document not found" });
        }

        // Remove the folder from the `images` field
        if (doc.images && doc.images[folderName]) {

            await collection.updateOne(
                { _id: objectId },
                { $unset: { [`images.${folderName}`]: "" } }
            );
            // await doc.save();
            return res.status(200).json({ message: "Folder deleted successfully" });
        } else {
            return res.status(404).json({ error: "Folder not found in document" });
        }
    } catch (err) {
        console.error("Delete Folder Error:", err);
        return res.status(500).json({ error: "Server error while deleting folder" });
    }
});

// update folder name
vendorRouter.post('/update-folder-name', vendorAuth, async (req, res) => {
    const { serviceId, category, oldName, newName } = req.body;

    if (!serviceId || !category || !oldName || !newName) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        // Get the dynamic collection
        const collection = mongoose.connection.collection(category);

        // Find the document by serviceId
        const document = await collection.findOne({ _id: new mongoose.Types.ObjectId(serviceId) });

        if (!document) {
            return res.status(404).json({ message: 'Service not found' });
        }
        const images = document.images;
        if (!images || !images.hasOwnProperty(oldName)) {
            return res.status(404).json({ message: `Folder "${oldName}" not found.` });
        }

        // Prevent overwrite if new folder name already exists
        if (images.hasOwnProperty(newName)) {
            return res.status(400).json({ message: `Folder "${newName}" already exists.` });
        }

        // Prepare the new images object
        const updatedImages = {
            ...images,
            [newName]: images[oldName], // Copy old folder data to new folder name
        };
        delete updatedImages[oldName]; // Remove old folder key

        // Update the document in the collection
        await collection.updateOne(
            { _id: new mongoose.Types.ObjectId(serviceId) },
            { $set: { 'images': updatedImages } }
        );

        return res.status(200).json({ message: 'Folder renamed successfully' });
    } catch (error) {
        console.error('Error updating folder name:', error);
        return res.status(500).json({ message: 'Server error while updating folder name' });
    }
});

// unseen message count of vendor
vendorRouter.get('/unseen-count/:id', vendorAuth, async (req, res) => {
    try {
        const userId = req.params.id;

        const unseenCount = await Message.countDocuments({
            seenBy: { $ne: userId }
        });
        res.json({ unseenCount });
    } catch (err) {
        console.error("Error counting unseen messages:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

vendorRouter.get("/orders/count", vendorAuth, async (req, res) => {
    try {
        const { vendorId } = req.query;
        if (!vendorId) {
            return res.status(400).json({ message: "Vendor ID is required" });
        }

        const count = await Booking.countDocuments({
            status: { $ne: "pending" },   // not equal to "pending"
            hostId: vendorId,           // match vendor ID
        });
        res.json({ count });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
});

vendorRouter.get("/pending-orders/count", vendorAuth, async (req, res) => {
    try {
        const { vendorId } = req.query;

        if (!vendorId) {
            return res.status(400).json({ message: "Vendor ID is required" });
        }

        const count = await Booking.countDocuments({
            status: { $in: ['authorized', 'requested', 'captured', 'confirmed'] },
            hostId: vendorId, // cast string to ObjectId
        });

        res.json({ count });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
});


// show services of the vendor, based on their email
vendorRouter.get("/manage-dates", async (req, res) => {
    try {
        const { email } = req.query;

        if (!email) {
            return res.status(400).json({ error: "Email is required." });
        }

        // Step 1: Fetch requested services (category + linkedServiceId)
        const requestedServices = await RequestedService.find({ email, isApproved: true }).select("category linkedServiceId -_id");

        const db = mongoose.connection.db;

        // Optional: Get existing collection names to avoid querying non-existent ones
        const collectionsList = await db.listCollections().toArray();
        const existingCollections = collectionsList.map(col => col.name);

        // Step 2: Map through services and fetch the actual businessName from the linked collection
        const formattedServices = await Promise.all(
            requestedServices.map(async ({ category, linkedServiceId }) => {
                try {
                    // Ensure the collection exists
                    if (!existingCollections.includes(category)) {
                        return { category, businessName: "N/A (collection not found)" };
                    }

                    // Use native MongoDB collection access
                    const doc = await db
                        .collection(category)
                        .findOne({ _id: new mongoose.Types.ObjectId(linkedServiceId) }, { projection: { "additionalFields.businessName": 1, 'images.CoverImage': 1 } });

                    return {
                        category,
                        _id: doc?._id,
                        businessName: doc?.additionalFields?.businessName || "N/A",
                        coverImage: doc?.images?.CoverImage?.[0] || null
                    };
                } catch (err) {
                    return {
                        category,
                        businessName: "N/A (error)",
                    };
                }
            })
        );

        res.status(200).json(formattedServices);
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// manage availability by vendor
vendorRouter.put("/update-category-dates", async (req, res) => {
    try {
        const { category, businessName, dates, email } = req.body;

        if (!category || !businessName || !email || !dates || typeof dates !== "object") {

            return res.status(400).json({ error: "Invalid request data." });
        }

        // Get the collection dynamically
        const db = mongoose.connection.db;
        const categoryCollection = db.collection(category);

        // Find the document
        const existingCategory = await categoryCollection.findOne({
            "additionalFields.businessName": businessName,
            email: email
        });

        if (!existingCategory) {
            return res.status(404).json({ error: "Category not found" });
        }

        // Get existing dates
        let existingDates = existingCategory.dates || { booked: [], waiting: [], available: [] };
        // Normalize to avoid null/undefined

        existingDates = {
            booked: existingDates.booked || [],
            waiting: existingDates.waiting || [],
            available: existingDates.available || [],
        };

        const normalize = d => d.split('T')[0]; // keep YYYY-MM-DD only

        const removeFromAllCategories = (date) => {
            existingDates.booked = existingDates.booked.filter(d => normalize(d) !== normalize(date));
            existingDates.waiting = existingDates.waiting.filter(d => normalize(d) !== normalize(date));
            existingDates.available = existingDates.available.filter(d => normalize(d) !== normalize(date));
        };

        // Update dates with new incoming ones
        Object.entries(dates).forEach(([status, dateList]) => {
            dateList.forEach(date => {
                removeFromAllCategories(date); // ✅ remove from anywhere else
                if (!existingDates[status].includes(date)) {
                    existingDates[status].push(date); // ✅ add to correct status
                }
            });
        });

        // Remove duplicates
        existingDates.booked = [...new Set(existingDates.booked)];
        existingDates.waiting = [...new Set(existingDates.waiting)];
        existingDates.available = [...new Set(existingDates.available)];

        // Update the document
        const updatedCategory = await categoryCollection.findOneAndUpdate(
            { "additionalFields.businessName": businessName, email: email },
            { $set: { dates: existingDates } }, // Save the cleaned-up dates
            { returnDocument: "after" }
        );

        res.status(200).json({ message: "Dates updated successfully", updatedCategory });

    } catch (error) {
        console.error("Error updating category dates:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


vendorRouter.get("/service-bookings", async (req, res) => {
    try {
        const { category, serviceId } = req.query;

        if (!category || !serviceId) {
            return res.status(400).json({ error: "category and serviceId are required" });
        }

        // Fetch bookings for this serviceId & category
        const bookings = await Booking.find({
            category,
            serviceId: new mongoose.Types.ObjectId(serviceId),
        })
            .populate("userId", "firstname email") // user details
            .sort({ "package.dates": 1 });

        // Format response with required fields
        const formattedBookings = bookings.map(b => ({
            bookingId: b._id,
            user: {
                id: b.userId?._id,
                name: b.userId?.firstname || "N/A",
                email: b.userId?.email || "N/A",
            },
            service: {
                category: b.category,
                serviceId: b.serviceId,
                name: b.serviceName,
            },
            package: {
                title: b.package.title,
                description: b.package.description,
                amount: b.package.amount,
                dates: b.package.dates,
                additionalRequest: b.package.additionalRequest,
            },
            amount: b.amount,
            status: b.status,
            payment: {
                orderId: b.razorpayOrderId,
                paymentId: b.razorpayPaymentId,
            },
            // rejection: b.rejection || null,
            // createdAt: b.createdAt,
        }));

        res.status(200).json(formattedBookings);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// show services of the vendor, based on their email
vendorRouter.get("/get-vendor-services", async (req, res) => {
    try {
        const { email } = req.query;

        if (!email) {
            return res.status(400).json({ error: "Email is required." });
        }

        // Step 1: Fetch requested services (category + linkedServiceId)
        const requestedServices = await RequestedService.find({ email, isApproved: true }).select("category linkedServiceId -_id");

        const db = mongoose.connection.db;

        // Optional: Get existing collection names to avoid querying non-existent ones
        const collectionsList = await db.listCollections().toArray();
        const existingCollections = collectionsList.map(col => col.name);

        // Step 2: Map through services and fetch the actual businessName from the linked collection
        const formattedServices = await Promise.all(
            requestedServices.map(async ({ category, linkedServiceId }) => {
                try {
                    // Ensure the collection exists
                    if (!existingCollections.includes(category)) {
                        return { category, businessName: "N/A (collection not found)" };
                    }

                    // Use native MongoDB collection access
                    const doc = await db
                        .collection(category)
                        .findOne({ _id: new mongoose.Types.ObjectId(linkedServiceId) }, { projection: { "additionalFields.businessName": 1, 'images.CoverImage': 1 } });

                    return {
                        category,
                        _id: doc?._id,
                        businessName: doc?.additionalFields?.businessName || "N/A",
                        coverImage: doc?.images?.CoverImage?.[0] || null
                    };
                } catch (err) {
                    return {
                        category,
                        businessName: "N/A (error)",
                    };
                }
            })
        );

        res.status(200).json(formattedServices);
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});


//  Get pricing config for a specific service
vendorRouter.get("/pricing-config/:serviceId", async (req, res) => {
    try {
        const { serviceId } = req.params;

        const config = await ServicePricingConfig.findOne({ serviceId })
            .sort({ createdAt: -1 }) // latest config for this service
            .lean();

        if (!config) return res.status(404).json({ message: "No config found for this service" });

        res.json(config);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


//  Always insert a new pricing config (no overwrite)
vendorRouter.post("/pricing-config/update", async (req, res) => {
    try {
        const { serviceId, category, peakDays, peakMonths, specialDates, highDemandLocations } = req.body;

        const newConfig = new ServicePricingConfig({
            serviceId,
            category,
            peakDays,
            peakMonths,
            specialDates,
            highDemandLocations,
        });

        await newConfig.save();

        res.json({
            success: true,
            message: "✅ New configuration inserted successfully",
            config: newConfig,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



export default vendorRouter;
