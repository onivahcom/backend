import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import http from "http";
import { Server } from 'socket.io';
import dotenv from "dotenv";
import authRouter from "./routes/authRouter.js";
import connectDB from "./database/mongodbConfig.js";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import userTable from "./database/userTable.js";
import ContactForm from './database/contactForm.js'
import vendorRouter from "./routes/VendorRouter.js";
import twilio from 'twilio'; // Use ES6 import
import adminRouter from "./adminController/adminRouter.js";
import RequestedService from "./database/requestedService.js";
import multer from "multer";
import AdminTable from "./database/adminTable.js";
import bcrypt from "bcrypt";
import Razorpay from "razorpay";
import path from "path";
import { v4 as uuidv4 } from 'uuid';
import s3Router from "./routes/s3Router.js";
import cookieParser from "cookie-parser";
import profilePicRouter from "./routes/profilePicUploadRouter.js";
import RefreshToken from "./database/RefreshToken.js";
import { generateAccessToken, generateRefreshToken } from "./utils/tokenUtils.js";
import tokenGen from "./routes/auth.js";
import helmet from 'helmet';
import Feedback from "./database/Feedback.js";
import vendorProfilePicUpload from "./routes/vendorProfilePicUpload.js";
import conversationRouter from "./routes/conversationRoutes.js";
import messageRouter from "./routes/messageRoutes.js";
import paymentRouter from "./routes/paymentRoutes.js";
import Message from "./models/Message.js";
import Conversation from "./models/Conversation.js";
import locationServiceRouter from "./routes/locationServiceRoute.js";
import rateLimit from 'express-rate-limit';
import axios from "axios";
import vendor from "./database/vendors.js";
import OpenAI from "openai";
import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import Report from "./database/Report.js";
import adhaarUpload from "./utils/adhaarUpload.js";
import Booking from "./database/bookingSchema.js";
import notificationRouter from "./routes/notifications.js";



dotenv.config(); // Load environment variables

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001", "http://localhost:4000", "https://onivah.com", "https://www.onivah.com", "https://backend.onivah.com", "https://algos.onivah.com"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true
  }
});

//  SOCKET.IO EVENTS
io.on('connection', (socket) => {
  // console.log('User connected:', socket.id);
  socket.on("setup", ({ userId }) => {
    socket.join(userId);
    // console.log("[Server] ✅ User joined room:", userId);
  });


  socket.on('sendMessage', (messageData) => {
    io.emit('receiveMessage', messageData);
  });

  socket.on("markAsSeen", async ({ conversationId, userId }) => {

    try {
      const updateResult = await Message.updateMany(
        {
          conversationId,
          seenBy: { $ne: userId },
        },
        { $addToSet: { seenBy: userId } }
      );
      // Optional: Notify the vendor (or other participant)
      const conversation = await Conversation.findById(conversationId);

      if (!conversation) return;

      let otherPartyId;
      if (String(conversation.userId) === userId) {
        otherPartyId = conversation.vendorId;
      } else {
        otherPartyId = conversation.userId;
      }

      io.to(otherPartyId.toString()).emit("seenConfirmation", {
        conversationId,
        seenBy: userId,
      });

      // io.to(userId).emit("seenUpdated", { conversationId, userId });
    } catch (err) {
      console.error("[Server] ❌ Failed to mark as seen:", err);
    }
  });

  socket.on('disconnect', () => {
    // console.log('User disconnected:', socket.id);
  });
});

app.set('trust proxy', 1);

const allowedOrigins = [
  'https://onivah.com',       // add both www and non-www if needed
  'https://www.onivah.com',
  'https://backend.onivah.com',
  'https://algos.onivah.com',
  'http://localhost:3000',
];

const pythonapi = 'https://algos.onivah.com';

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cache-Control", "Pragma"],
  credentials: true,
};

app.use(cors(corsOptions));

// handle preflight for all routes
app.options("*", cors(corsOptions));


app.use((req, res, next) => {
  req.io = io; // 👈 Attach io to request object
  next();
});


app.use(cookieParser());

// Always use basic Helmet protections
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: [
        "'self'",
        "http://localhost:3000", // allow frontend React dev
        "http://localhost:4000", // allow API backend
        "ws://localhost:4000",   // allow Socket.IO websockets
        "https://fphnc2kj-3000.inc1.devtunnels.ms",
        "https://fphnc2kj-4000.inc1.devtunnels.ms",
      ],
      frameAncestors: ["'self'", 'http://localhost:3000', 'https://fphnc2kj-3000.inc1.devtunnels.ms'],
    },
  },
}));

// Middleware to parse JSON bodies
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    'fullscreen=(self "http://localhost:3000" )'
  );
  next();
});

app.use('/uploads', express.static('uploads'));

// Advanced headers — only in PRODUCTION
if (process.env.NODE_ENV === "production") {
  // Content Security Policy (CSP)
  app.use(
    helmet.contentSecurityPolicy({
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'"], // allow inline if needed, not recommended
        styleSrc: ["'self'", "'unsafe-inline'"], // allow inline styles if required
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    })
  );

  // Strict Transport Security (HSTS) - enforce HTTPS
  app.use((req, res, next) => {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
    next();
  });

  // Referrer Policy
  app.use(
    helmet.referrerPolicy({
      policy: "no-referrer",
    })
  );

  // Permissions Policy - restrict APIs
  app.use(
    helmet.permissionsPolicy({
      features: {
        geolocation: ["'none'"],
        microphone: ["'none'"],
        camera: ["'none'"],
      },
    })
  );
}

// Disable x-powered-by always
app.disable("x-powered-by");

// routes
app.use("/auth", authRouter);
app.use("/vendor", vendorRouter);
app.use("/admin", adminRouter);
app.use("/api/s3", s3Router);
app.use("/api/profile", profilePicRouter);
app.use("/refreshToken", tokenGen);
app.use("/api/vendor/profile", vendorProfilePicUpload);
app.use("/api/conversations", conversationRouter);
app.use("/api/messages", messageRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/services', locationServiceRouter);
app.use("/notifications", notificationRouter);

// app.get("/pdf/signed-url/:publicId", getSignedPdfUrl);

const deleteLast10Messages = async () => {
  try {
    const messagesToDelete = await Message.find({})
      .sort({ createdAt: -1 }) // newest first
      .limit(7);

    const idsToDelete = messagesToDelete.map(msg => msg._id);

    await Message.deleteMany({ _id: { $in: idsToDelete } });

    console.log("✅ Deleted the last 10 messages from the collection.");
  } catch (error) {
    console.error("❌ Error deleting messages:", error);
  }
};

// deleteLast10Messages()

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});


// Storage config 
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // ensure this folder exists
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

// nodemailer config
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

// MongoDB connection
connectDB();

// store otp
let otpStore = {};

// WhatsApp sending function
// const accountSid = 'AC93a660151416ae6a93f897f268970391';
// const authToken = 'c1f6b8926ed0cc0ffbb9a23e603b281a';
const accountSid = '';
const authToken = '';

const whatsappNumber = "+1455238886"; //14155238886  //sms -14067977741 Twilio WhatsApp sandbox number

// const client = twilio(accountSid, authToken);


const OPENROUTER_API_KEY = "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";

async function testImageChat() {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "http://localhost:3000", // Replace with your site
        "X-Title": "My Test App",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        "model": "qwen/qwen3-coder:free",
        "messages": [
          {
            "role": "user",
            "content": "What is the meaning of life?"
          }
        ]
      })
    });

    const data = await response.json();
    console.log("AI Response:", data.choices?.[0]?.message?.content || data);
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run the test
// testImageChat();

const authenticateToken = async (req, res, next) => {

  const token = req.cookies?.accessToken;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: No token provided." });
  }

  jwt.verify(token, process.env.JWT_SECRET_KEY, async (err, payload) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(403).json({ error: "Token expired or invalid. Please log in again." });
      }
      return res.status(401).json({ error: 'Invalid token' }); // 🚫 bad token

    }

    try {
      const user = await userTable.findById(payload.userId).lean();
      if (!user) {
        return res.status(404).json({ error: "User not found." });
      }

      req.user = user; // Attach full user data to request
      next();
    } catch (dbError) {
      console.error("DB Error in auth middleware:", dbError);
      return res.status(500).json({ error: "Internal server error." });
    }
  });
};

// inital route
app.get("/", (req, res) => {
  res.status(200).send("Backend connected successfully...");
});

// admin login verification
app.post("/admin-login", async (req, res) => {
  const { username, password, role } = req.body;

  try {
    // Find admin by username AND role
    const admin = await AdminTable.findOne({ userName: username });
    if (!admin) {
      return res
        .status(400)
        .send({ success: false, message: "Admin not found." });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, admin.userPassword);

    if (!isMatch) {
      return res
        .status(400)
        .send({ success: false, message: "Invalid password." });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: admin._id,
        username: admin.userName,
        role: admin.role,
        permissions: admin.permissions,
      },
      process.env.JWT_SECRET_KEY,
    );

    // Set HttpOnly cookie
    res.cookie("onivah_admin", token, {
      httpOnly: true,
      secure: false, // set true in production with HTTPS
      sameSite: "Lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res
      .status(200)
      .send({ success: true, token, message: "Login successful!" });
  } catch (err) {
    console.log(err);
    res
      .status(500)
      .send({ success: false, message: "Error during login." });
  }
});

// fetch services dynamically based on category
app.get("/services/:category", async (req, res) => {
  try {
    let { category } = req.params;
    let { page = 1, limit = 20 } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    // Fetch documents directly from the collection
    const services = await mongoose.connection.db
      .collection(category)
      .find()
      .toArray();

    if (!services.length) {
      return res.status(404).json({ message: `No services found in ${category}` });
    }

    const total = services.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginated = services.slice(start, end);

    return res.status(200).json({
      success: true,
      service: paginated,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching services:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// fetch service based on particular id
app.get("/category/:category/:serviceId", async (req, res) => {
  try {
    const { category, serviceId } = req.params;

    // Get the corresponding collection dynamically
    // Get the service and remove phone/email fields
    const serviceArray = await mongoose.connection
      .collection(category)
      .aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(serviceId) } },
        { $unset: ["phone", "email", "additionalFields.phone", "additionalFields.email"] }
      ])
      .toArray();

    const service = serviceArray[0];

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }
    // Get feedbacks for this service and populate user info
    const feedbacks = await Feedback.find({ serviceId })
      .populate('userId', 'firstname profilePic lastname') // populate only name and email
      .sort({ createdAt: -1 });

    // Fetch vendor details using vendorId
    const vendorDetails = await vendor.findOne(
      { _id: service.vendorId },
      "firstName lastName profilePic"
    );

    // Combine and respond
    res.status(200).json({ ...service, feedbacks, vendorDetails });

  } catch (error) {
    console.error("Error fetching service by ID:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// header search option
app.get("/header/search", async (req, res) => {
  const { location, datesChoosed, category, page = 1, limit = 20 } = req.query; // added page & limit

  try {
    // If category is missing but location is present, return a response asking for category
    if (!category) {
      return res
        .status(200)
        .json({ success: false, message: "Category is required", service: [] });
    }

    // Fetch all documents from the specified category collection
    const services = await mongoose.connection.db
      .collection(category)
      .find()
      .toArray();

    // If location is missing, return all services under the specified category with pagination
    if (!location) {
      const total = services.length;
      const start = (page - 1) * limit;
      const end = start + parseInt(limit);
      const paginated = services.slice(start, end);

      return res.status(200).json({
        success: true,
        service: paginated,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit),
        },
      });
    }

    // Filter venues based on availableLocations if both category and location exist
    const filteredServices = services.filter((service) =>
      service.additionalFields?.availableLocations?.includes(location)
    );

    if (!filteredServices.length) {
      return res.status(200).json({
        success: false,
        message: "No venues available in the specified location",
        service: [],
      });
    }

    // Apply pagination to filtered services
    const total = filteredServices.length;
    const start = (page - 1) * limit;
    const end = start + parseInt(limit);
    const paginated = filteredServices.slice(start, end);

    // Return matched venues with pagination
    res.status(200).json({
      success: true,
      service: paginated,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching venue details:", err);
    res
      .status(500)
      .json({ success: false, message: "Error fetching venue details" });
  }
});

// search bar in the header 
app.get("/list/services", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json([]);

  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    const results = [];

    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;

      // Match collection name with query
      if (collectionName.toLowerCase().includes(query.toLowerCase())) {
        const count = await db.collection(collectionName).countDocuments();
        results.push({ _id: collectionName, count });
      }
    }
    res.json(results);
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

function generateOnivahId() {
  const randomString = Math.random().toString(36).substring(2, 10) +
    Math.random().toString(36).substring(2, 6).toUpperCase();
  return `onivah_${randomString}`;
}

// Helper function to send SMS
async function sendSMS(phone, otp) {
  console.log(phone, otp);
  try {
    // const message = await client.messages.create({
    //   from: "whatsapp:+14155238886", // Twilio WhatsApp sandbox number
    //   to: `whatsapp:${phone}`, // Example: whatsapp:+919543445782
    //   body: `🔑 Your OTP is: ${otp}. Please use this to verify your account.`,
    // });

    // console.log(`✅ OTP sent to phone: ${phone}, SID: ${message.sid}`);
    return { success: true, message: `OTP sent to phone: ${phone}` };
  } catch (error) {
    console.log("❌ Error sending WhatsApp OTP:", error);
    throw new Error("Error sending WhatsApp OTP");
  }
}

// Helper function to send SMS OTP
// async function sendSMS(phone, otp) {
//   console.log(phone, otp);
//   try {
//     const message = await client.messages.create({
//       from: "+1XXXXXXXXXX", // Replace with your Twilio SMS-enabled number
//       to: `+${phone}`, // Example: +919543445782 (include country code)
//       body: `🔑 Your OTP is: ${otp}. Please use this to verify your account.`,
//     });

//     console.log(`✅ OTP SMS sent to phone: ${phone}, SID: ${message.sid}`);
//     return { success: true, message: `OTP SMS sent to phone: ${phone}` };
//   } catch (error) {
//     console.log("❌ Error sending SMS OTP:", error);
//     throw new Error("Error sending SMS OTP");
//   }
// }


// sendSMS(919543445782, 1234);

// Helper function to send Email
function sendEmail(email, otp) {
  return new Promise((resolve, reject) => {
    const mailOptions = {
      from: 'pabishek61001@gmail.com',
      to: email,
      subject: 'Your One-Time Password (OTP) - Onivah',
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
          <div style="background-color: #6d4d94; color: white; padding: 15px; border-radius: 5px; text-align: center;">
            <h2>Welcome to Onivah 🎉</h2>
            <p>Your one-stop destination for Wedding Halls, Party Venues & Photography</p>
          </div>
          <div style="margin-top: 20px;">
            <p>Dear Customer,</p>
            <p>Thank you for choosing <strong>Onivah</strong> for your special occasion. To continue your login process, please use the OTP below:</p>
            <div style="font-size: 24px; font-weight: bold; color: #6d4d94; margin: 20px 0;">
              ${otp}
            </div>
            <p>This OTP is valid for <strong>5 minutes</strong>. Please do not share it with anyone.</p>
          </div>
          <hr style="margin: 30px 0;">
          <div style="font-size: 14px; color: #666;">
            <p>Need help planning your event? Explore our curated venues and photography packages designed to make your celebrations unforgettable.</p>
            <ul>
              <li>🎊 Wedding & Party Halls with Instant Booking</li>
              <li>📸 Professional Photographers for Every Occasion</li>
              <li>🎁 Exclusive Deals for Early Bookings</li>
            </ul>
            <p>Visit us at <a href="http://localhost:3001" style="color: #6d4d94; text-decoration: none;">Onivah</a></p>
          </div>
        </div>
      `,
    };
    console.log(otp);
    resolve({ success: true, message: `OTP sent to email: ${email}` });

    // transporter.sendMail(mailOptions, (error, info) => {
    //   if (error) {
    //     console.error('Error sending email:', error);
    //     return reject(new Error('Error sending email'));
    //   }
    //   console.log(otp);
    //   resolve({ success: true, message: `OTP sent to email: ${email}` });
    // });
  });
}

// Helper function to generate OTP and store it
function generateAndStoreOTP(userKey, userType, phone, email) {
  const otp = Math.floor(100000 + Math.random() * 900000);
  otpStore[userKey] = {
    otp,
    userType,
    email,
    phone,
    createdAt: Date.now(),
  };

  // Set a timeout to delete the OTP after 10 minutes
  setTimeout(() => {
    if (otpStore[userKey] && otpStore[userKey].otp === otp) {
      delete otpStore[userKey];
      console.log(`OTP for ${userKey} has been deleted.`);
    }
  }, 10 * 60 * 1000); // 10 minutes in milliseconds

  return otp;
}

// Helper function to verify OTP
function verifyOTP(userKey, enteredOtp) {
  // Check if OTP exists for the userKey
  if (!otpStore[userKey]) {
    return { success: false, message: "OTP not found or expired." };
  }

  const storedOtpData = otpStore[userKey];
  const currentTime = Date.now();

  // Check if the OTP has expired (more than 10 minutes)
  if (currentTime - storedOtpData.createdAt > 10 * 60 * 1000) {
    // OTP has expired
    delete otpStore[userKey];  // Clean up expired OTP
    return { success: false, message: "OTP has expired." };
  }

  // Check if the entered OTP matches the stored OTP
  if (storedOtpData.otp !== parseInt(enteredOtp)) {
    return { success: false, message: "Invalid OTP." };
  }

  // OTP is valid
  return { success: true, message: "OTP verified successfully." };
}

// Helper function to handle OTP sending
async function handleOTPSending(req, res, isSignup) {
  const { phone, email, userType } = req.body;

  console.log(phone, email, userType);
  const userKey = phone || email;

  if (!userKey || !userType) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  try {
    const user = await userTable.findOne(userType === 'phone' ? { phone } : { email });

    if (isSignup && user) {
      return res.status(400).json({ success: false, message: `The ${userType} already registered? Kindly Login.` });
    }

    if (!isSignup && !user) {
      return res.status(404).json({ success: false, message: 'New to our website? Kindly sign up.' });
    }

    const otp = generateAndStoreOTP(userKey, userType, phone, email);

    const result =
      userType === 'phone'
        ? await sendSMS(phone, otp)
        : await sendEmail(email, otp);

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error processing request:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// Helper function to handle OTP sending
async function profileOtpSending(req, res) {
  const { phone } = req.body;
  const userKey = phone;

  if (!userKey) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  try {
    const user = await userTable.findOne({ phone: phone });  // Use findOne instead of find
    if (user) {  // If a user is found
      return res.status(400).json({ success: false, message: `The ${userKey} number is already in use.` });
    }

    const otp = generateAndStoreOTP(phone, 'Phone', phone);
    const result = await sendSMS(phone, otp);

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error processing request:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// Login OTP sending
app.post('/login/send-otp', (req, res) => handleOTPSending(req, res, false));

// Signup OTP sending
app.post('/signup/send-otp', (req, res) => handleOTPSending(req, res, true));

// profile OTP sending ( for change )
app.post('/profile/send-otp', (req, res) => profileOtpSending(req, res));

// profile verify OTP
app.post("/profile/verify-otp", async (req, res) => {
  const { otp, phone, userId } = req.body;  // OTP, phone, and userId received from the frontend

  if (!otp || !phone || !userId) {
    return res.status(400).json({ success: false, message: "Missing OTP, phone, or userId." });
  }

  // Verify OTP first
  const verificationResult = verifyOTP(phone, otp);
  if (!verificationResult.success) {
    return res.status(400).json(verificationResult);  // Return error if OTP is invalid
  }

  try {
    // Update the user's phone number using the userId
    const updatedUser = await userTable.findOneAndUpdate(
      { _id: userId },  // Find the user by userId
      { $set: { phone: phone } },  // Update the phone number
      { new: true }  // Return the updated document
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    return res.json({ success: true, message: "Phone number updated successfully." });

  } catch (error) {
    console.error("Error processing request:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// verify login otp
app.post('/login/verify-otp', async (req, res) => {
  const { loginInput, otp, signUp } = req.body;
  const storedOtpData = otpStore[loginInput];

  if (!storedOtpData || storedOtpData.otp !== parseInt(otp)) {
    return res.json({ success: false, message: "Invalid OTP" });
  }

  const timeElapsed = Date.now() - storedOtpData.createdAt;
  if (timeElapsed > 5 * 60 * 1000) {
    return res.json({ success: false, message: "OTP expired" });
  }

  try {
    let user = await userTable.findOne(
      storedOtpData.userType === 'phone' ? { phone: loginInput } : { email: loginInput }
    );

    if (signUp) {
      if (user) {
        return res.status(400).json({ success: false, message: "User already exists. Please log in." });
      }

      const unique_Id = generateOnivahId();
      const newUser = new userTable({
        userId: `onivah_${unique_Id}`,
        [storedOtpData.userType === 'phone' ? 'phone' : 'email']: loginInput,
        entry_Time: new Date(),
      });

      await newUser.save();
      user = newUser;
    }

    // ✅ Create new refresh token entry
    const tokenId = uuidv4();

    await RefreshToken.create({
      userId: user._id,
      tokenId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      valid: true,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    // ✅ Generate tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id, tokenId);

    // ✅ Set cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return res.json({ success: true, message: signUp ? "User registered" : "Login success" });
  } catch (error) {
    console.error("Error processing request:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// user protected route
app.get('/protected-route', authenticateToken, async (req, res) => {
  if (!req.user) {
    return res.status(500).json({ error: 'User data not available' });
  }

  res.status(200).json({ user: req.user }); // Send the user data as JSON response
});

// vendor venue submission
app.post('/venue-submission', adhaarUpload.single('file'), async (req, res) => {
  try {
    // Access the Aadhar file
    const aadharFile = req.file || null;

    // Access other form data from the body
    const formFields = req.body;

    // Parse the customFields back to an array
    let customFields = [];
    if (formFields.customFields) {
      try {
        const fieldsArray = Array.isArray(formFields.customFields)
          ? formFields.customFields
          : [formFields.customFields];

        fieldsArray.forEach((item) => {
          const parsed = JSON.parse(item); // Each item is a JSON string
          customFields.push(...parsed); // Merge all items into one array
        });
      } catch (error) {
        console.error("Error parsing customFields:", error);
        return res.status(400).json({ message: "Invalid customFields format." });
      }
    }


    // Parse the generated whyus back to an array
    let whyus = [];
    if (formFields.generatedWhyUs) {
      try {
        const fieldsArray = Array.isArray(formFields.generatedWhyUs)
          ? formFields.generatedWhyUs
          : [formFields.generatedWhyUs];

        fieldsArray.forEach((item) => {
          const parsed = JSON.parse(item); // each item is JSON string
          whyus.push(...parsed); // merge into one array
        });
      } catch (error) {
        console.error("Error parsing generatedWhyUs:", error);
        return res.status(400).json({ message: "Invalid generatedWhyUs format." });
      }
    }


    let customPricing = [];
    if (formFields.customPricing) {
      try {
        customPricing = JSON.parse(formFields.customPricing);
      } catch (error) {
        console.error('Error parsing customPricing:', error);
        return res.status(400).json({ message: 'Invalid customPricing format.' });
      }
    }

    let groupedUrls = {};

    // If groupedUrls is a string, parse it, else use as-is
    if (formFields.groupedUrls) {
      if (typeof formFields.groupedUrls === 'string') {
        try {
          groupedUrls = JSON.parse(formFields.groupedUrls);
        } catch (error) {
          console.error('Error parsing groupedUrls:', error);
          return res.status(400).json({ message: 'Invalid groupedUrls format.' });
        }
      } else if (typeof formFields.groupedUrls === 'object') {
        groupedUrls = formFields.groupedUrls;
      } else {
        groupedUrls = {};
      }
    }

    // Convert groupedUrls to images format (folder => [url, url, ...])
    const formattedImages = {};
    for (const folder in groupedUrls) {
      formattedImages[folder] = groupedUrls[folder].map(img => img.url);
    }

    const { vendorId, fullName, email, category, ...restFields } = formFields;

    // ----------------------------
    // SPAM CHECK PER FIELD
    // ----------------------------
    const spamFields = [];

    for (const key in formFields) {
      const value = formFields[key];
      let textToCheck = '';

      if (typeof value === 'string') {
        textToCheck = value;
      } else if (Array.isArray(value)) {
        textToCheck = value.filter(v => typeof v === 'string').join(' ');
      } else if (typeof value === 'object' && value !== null) {
        textToCheck = JSON.stringify(value);
      }

      if (textToCheck) {
        const mlResponse = await axios.post(`${pythonapi}/predict`, {
          text: textToCheck,
        });

        const { is_spam, confidence } = mlResponse.data;
        if (is_spam) {
          spamFields.push({ field: key, confidence });
        }
      }
    }

    if (spamFields.length > 0) {
      return res.status(400).json({
        message: "Spam detected in your submission",
        details: spamFields,
      });
    }

    // File metadata
    const fileMeta = aadharFile
      ? {
        originalName: aadharFile.originalname || "Aadhar.pdf",
        publicId: aadharFile.public_id || aadharFile.filename, // fallback to filename
        resourceType: aadharFile.resource_type || "raw",
        mimeType: aadharFile.mimetype || "application/pdf",
        format: aadharFile.format || "pdf",
        bytes: aadharFile.bytes || null,
        secureUrl: aadharFile.path || aadharFile.secure_url,   // keep for later retrieval
        vendorId: formFields.vendorId,
      }
      : null;

    // Save data to database
    const savedRequest = await RequestedService.create({
      vendorId: new mongoose.Types.ObjectId(vendorId),
      fullName,
      email,
      category,
      additionalFields: {
        ...restFields,
        generatedWhyUs: whyus,
        customPricing: customPricing,
        customFields: customFields,
      },
      images: formattedImages,
      file: fileMeta,
    });

    // Send success response
    res.status(200).json({
      message: 'Form submitted successfully!',
      // data: savedRequest,
    });
  } catch (err) {
    console.error('❌ Submission Error:', err);
    res.status(500).json({ message: 'Failed to submit form.' });
  }
});

// save profile
app.post('/profile_save', async (req, res) => {
  try {
    const { firstname, lastname, email, phone, country, state, city, zipcode, userId } = req.body;


    // Find the user by userId
    const user = await userTable.findOne({ _id: userId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update the user's profile details
    user.firstname = firstname;
    user.lastname = lastname;
    user.email = email;
    user.phone = phone;
    user.country = country;
    user.state = state;
    user.city = city;
    user.zipcode = zipcode;

    // Save the updated user document
    await user.save();

    // Respond with success message
    res.status(200).json({ message: 'Profile updated successfully', user });
  } catch (error) {
    res.status(500).json({ message: 'Error saving profile', error: error.message });
  }
});

// contact form handler 
app.post('/user/contact', async (req, res) => {
  const { fullName, email, phoneNumber, eventDate, eventType, message } = req.body;

  try {
    // Create a new contact document
    const newContact = new ContactForm({
      fullName,
      email,
      phoneNumber,
      eventDate,
      eventType,
      message,
    });

    // Save to the database
    await newContact.save();
    res.status(200).json({ message: 'Contact information submitted successfully!' });
  } catch (error) {
    console.error('Error submitting contact form:', error);
    res.status(500).json({ error: 'Something went wrong, please try again.' });
  }
});

// show services of the vendor, based on their email
app.get("/get/vendor-dashboard/services", async (req, res) => {
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
          console.error(`Error accessing collection ${category}:`, err.message);
          return {
            category,
            businessName: "N/A (error)",
          };
        }
      })
    );

    res.status(200).json(formattedServices);
  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// manage availability by vendor
app.put("/update-category-dates", async (req, res) => {
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

    // Function to remove date from all categories before adding to a new one
    const removeFromAllCategories = (date) => {
      existingDates.booked = existingDates.booked.filter(d => d !== date);
      existingDates.waiting = existingDates.waiting.filter(d => d !== date);
      existingDates.available = existingDates.available.filter(d => d !== date);
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

// fetch the dates of the category
app.get("/get-category-dates", async (req, res) => {
  try {
    const { category, businessName, email } = req.query;
    if (!category || !businessName || !email) {
      return res.status(400).json({ error: "Missing required parameters." });
    }

    // Get the collection dynamically
    const db = mongoose.connection.db;
    const categoryCollection = db.collection(category);

    // Find the document with businessName and email
    const categoryData = await categoryCollection.findOne({
      "additionalFields.businessName": businessName,
      email: email
    });

    if (!categoryData) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Extract dates categorized as booked, waiting, available
    const { dates = { booked: [], waiting: [], available: [] } } = categoryData;

    res.status(200).json(dates);

  } catch (error) {
    console.log("Error fetching category dates:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// user feedback submit 
app.post('/submit/feedback', async (req, res) => {
  try {
    const { serviceId, userId, category, rating, feedback } = req.body;

    if (!rating) {
      return res.status(400).json({ message: 'Service and rating are required' });
    }

    const newFeedback = new Feedback({ serviceId, userId, category, rating, feedback });
    await newFeedback.save();

    res.status(200).json({ message: 'Feedback submitted successfully' });
  } catch (err) {
    console.error('Error saving feedback:', err);
    res.status(500).json({ message: 'Server error' });
  }
});



app.post("/create-order", async (req, res) => {
  const { amount, currency } = req.body;
  try {
    const order = await razorpay.orders.create({
      amount: amount * 100, // Amount in paise
      currency,
      receipt: "receipt#1",
    });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: "Order creation failed" });
  }
});

app.post("/capture-payment", async (req, res) => {
  const { payment_id, amount } = req.body;

  try {
    // 1. Fetch payment details using the ID
    const payment = await razorpay.payments.fetch(payment_id);

    // 2. Check if already captured
    if (payment.status === "captured") {

      return res.json({ success: true, message: "Payment already captured", payment });
    }

    // 3. Capture if not yet captured
    const response = await razorpay.payments.capture(payment_id, amount * 100, "INR");


    res.json({ success: true, captured: true, response });

  } catch (err) {
    console.error("PAYMENT CAPTURE ERROR:", err);
    res.status(500).json({ error: "Payment capture failed", details: err });
  }
});

app.get("/get-bookings", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // First fetch bookings with host details
    const bookings = await Booking.find({ userId })
      .populate("hostId", "_id city firstName lastName profilePic")
      .lean();

    // For each booking, fetch its service manually from raw collection
    const bookingsWithService = await Promise.all(
      bookings.map(async (booking) => {
        if (booking.serviceId && booking.category) {
          try {
            const collection = mongoose.connection.collection(booking.category); // use category as collection name
            const serviceDoc = await collection.findOne(
              { _id: new mongoose.Types.ObjectId(booking.serviceId) },
              { projection: { "images.CoverImage": 1, category: 1, "additionalFields.businessName": 1, _id: 1 } }
            );

            if (serviceDoc) {
              booking.serviceId = {
                coverImg: serviceDoc.images?.CoverImage?.[0] || null,
                category: serviceDoc.category || booking.category,
                businessName: serviceDoc.additionalFields.businessName,
                serviceId: serviceDoc._id,
              };
            }
          } catch (err) {
            console.error("Error fetching service for booking:", err);
          }
        }
        return booking;
      })
    );

    res.json(bookingsWithService);
  } catch (err) {
    console.error("Error fetching bookings:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// recently viewed 
app.get("/recently-viewed/:category/:serviceId", async (req, res) => {
  try {
    const { category, serviceId } = req.params;

    if (!category || !serviceId) {
      return res.status(400).json({ error: "Category and serviceId required" });
    }

    // Get the collection dynamically
    const db = mongoose.connection.db;
    const collection = db.collection(category);

    // Find the document by serviceId
    let query = {};
    if (mongoose.Types.ObjectId.isValid(serviceId)) {
      query._id = new mongoose.Types.ObjectId(serviceId);
    } else {
      query._id = serviceId; // fallback if you stored as string
    }
    const service = await collection.findOne(query);

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    // Only send required fields
    const responseData = {
      _id: service._id,
      businessName: service.additionalFields?.businessName,
      category: service.category,
      availableLocations: service.additionalFields?.availableLocations || [],
      coverImage: service.images?.CoverImage || [],
    };

    res.json(responseData);
  } catch (error) {
    console.log("Error fetching service:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /preferred-dates

app.post("/similar-availables/preferred-dates", async (req, res) => {
  try {
    const { dates } = req.body;

    if (!Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ message: "No dates provided" });
    }

    const collections = ["photography", "catering", "decor"]; // dynamic names
    const results = [];

    for (const name of collections) {
      const collection = mongoose.connection.db.collection(name);

      const doc = await collection.findOne(
        { "dates.available": { $in: dates } },
        {
          projection: {
            _id: 1,
            category: 1,
            "additionalFields.businessName": 1,
            "images.CoverImage": 1,
            "additionalFields.availableLocations": 1,
          },
        }
      );

      if (doc) {
        results.push({
          _id: doc._id,
          category: doc.category || name, // fallback if missing
          businessName: doc.additionalFields?.businessName,
          coverImage: doc?.images?.CoverImage?.[0] || null,
          availableLocations: doc?.additionalFields?.availableLocations || [],
        });
      }
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});





























// // GET all payments of a user
// app.get("/history/:userId", async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const payments = await Payment.find({ userId }).sort({ createdAt: -1 });
//     res.json({ success: true, payments });
//   } catch (error) {
//     console.error("Error fetching payments:", error);
//     res.status(500).json({ success: false, message: "Failed to fetch payments" });
//   }
// });







//  SECRET - GoYD0RlpxBUMf8NUTo7CokuQvoyHIwkT
// SID - SKd87f2f4ead4f65284d93027e54cc8592

// Accept a Mongoose model instead of collection name
async function emptyCollectionAndGetCount(Model) {
  const result = await Model.deleteMany({});
  console.log(`Deleted ${result.deletedCount} documents from '${Model.collection.collectionName}'`);
  return result.deletedCount;
}
// await emptyCollectionAndGetCount(RequestedService);




// using python ranking the services based on the search query
app.post('/search-ranked-services', async (req, res) => {
  const { query } = req.body;

  try {

    // Step 1: Try direct MongoDB query for businessName
    const directMatches = await RequestedService.find({
      isApproved: true,
      "additionalFields.businessName": { $regex: query, $options: "i" }
    }).lean();

    if (directMatches.length > 0) {
      // ✅ Found direct matches → return immediately
      return res.json({ rankedServices: directMatches });
    }

    // Step 2: Fallback to existing TF-IDF ranking logic
    const services = await RequestedService.find({ isApproved: true }).lean();

    // Helper function to generate a random integer between min and max (inclusive)
    function getRandomInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Helper function to generate a random float between min and max (inclusive), with decimals
    function getRandomFloat(min, max, decimals = 1) {
      return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
    }

    // Prepare data for Python TF-IDF service with random values
    const listingsForRanking = services.map(service => ({
      id: service._id.toString(),
      name: service.additionalFields?.businessName || "",
      description: service.additionalFields?.description || "",
      locations: service.additionalFields?.availableLocations || [], // array of strings
      popularity: getRandomInt(1, 10),
      reviews: getRandomInt(0, 500),
      distance: getRandomFloat(0.1, 20),
    }));

    // Call Python TF-IDF service
    const response = await axios.post(`${pythonapi}/search`, {
      listings: listingsForRanking,
      query,
    });
    const rankedListings = response.data.ranked_listings;

    // Map back ranked IDs to full MongoDB service objects
    const rankedServices = rankedListings.map(ranked =>
      services.find(s => s._id.toString() === ranked.id)
    );

    res.json({ rankedServices });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


let vendors = [];

app.post("/test-spam", async (req, res) => {
  const { name, description } = req.body;

  try {
    // Call Python FastAPI ML service
    const mlResponse = await axios.post(`${pythonapi}/predict`, {
      text: description,
    });

    const { is_spam, confidence } = mlResponse.data;
    console.log(is_spam, confidence);
    if (is_spam) {
      return res.status(400).json({
        message: `Rejected: Spam detected (confidence ${confidence})`,
      });
    }

    // Save vendor (fake DB push)
    vendors.push({ name, description });
    res.json({ message: "Vendor accepted and saved!", vendors });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Error validating vendor" });
  }
});







// Groq client
// const groq = new Groq({ apiKey: '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' }); // set your API key in .env

// app.post("/generate/why-us-reasons", async (req, res) => {
//   try {
//     const { combinedDescription } = req.body;

//     const completion = await groq.chat.completions.create({
//       model: "openai/gpt-oss-20b",
//       messages: [
//         {
//           role: "user",
//           content: `Based on the following vendor description, generate 4 compelling reasons to include in a "Why Choose Us" section for a wedding service website.
// Each reason should have:
// - A clear and catchy title (max 6 words)
// - A short description (no more than 25 words)

// Vendor Details:
// ${combinedDescription}

// Format:
// 1. <Title>: <Short Description>
// 2. ...
// 3. ...
// 4. ...`,
//         },
//       ],
//     });

//     // Groq returns structured content in completion.choices[0].message.content
//     const fullText = completion.choices?.[0]?.message?.content || "";
//     res.json({ fullText });

//   } catch (err) {
//     console.error("Error generating reasons:", err);
//     res.status(500).json({ error: "Failed to generate reasons" });
//   }
// });




// Initialize Gemini client with your API key
const gemini = new GoogleGenAI({
  apiKey: 'AIzaSyBmrq95Msguj9kaoM4vBriH7AlF0kJog6k', // set your Gemini API key in .env
});

app.post("/generate/why-us-reasons", async (req, res) => {
  try {
    const { combinedDescription } = req.body;

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
Based on the following vendor description, generate 4 compelling reasons to include in a "Why Choose Us" section for a wedding service website.
Each reason should have:
- A clear and catchy title (max 6 words)
- A short description (no more than 25 words)

Vendor Details:
${combinedDescription}

Format:
1. <Title>: <Short Description>
2. ...
3. ...
4. ...
      `,
    });

    // Gemini returns the text in response.text
    const fullText = response.text || "";
    res.json({ fullText });

  } catch (err) {
    console.error("Error generating reasons with Gemini:", err);
    res.status(500).json({ error: "Failed to generate reasons" });
  }
});



// const PUTER_APP_ID = "app-33bbbca2-cb88-425f-a496-7dfb898742b8";

// app.post('/test/chat', async (req, res) => {
//   const { message } = req.body;

//   try {
//     const response = await fetch("https://api.puter.com/v2/ai/chat", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         "X-Puter-App-Id": PUTER_APP_ID
//       },
//       body: JSON.stringify({ messages: [{ role: "user", content: message }] })
//     });

//     const text = await response.text();

//     let data;
//     try {
//       data = JSON.parse(text);
//     } catch {
//       console.error("Puter raw response:", text);
//       return res.status(500).json({ error: "Invalid response from Puter: " + text });
//     }

//     const aiMessage = data?.choices?.[0]?.message?.content || "";
//     res.json({ reply: aiMessage });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "AI request failed" });
//   }
// });

// report a service
app.post("/report-service", async (req, res) => {
  try {
    const { userId, vendorId, serviceId, categoryName, reason } = req.body;
    console.log(userId, vendorId, serviceId, categoryName, reason);
    if (!vendorId || !serviceId || !categoryName || !reason) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const report = new Report({ userId, vendorId, serviceId, categoryName, reason });
    await report.save();

    res.status(201).json({ message: "Report submitted successfully", report });
  } catch (err) {
    console.error("Error submitting report:", err);
    res.status(500).json({ message: "Server error" });
  }
});


app.get("/recommend/:serviceId", async (req, res) => {
  try {
    const { serviceId } = req.params;

    // 1. Fetch base service
    const baseService = await RequestedService.findOne({ linkedServiceId: serviceId }).lean();

    if (!baseService) {
      return res.status(404).json({ success: false, message: "Service not found" });
    }

    // 2. Fetch other services
    const allServices = await RequestedService.find(
      { linkedServiceId: { $ne: serviceId }, isApproved: true },
      {
        "additionalFields.phone": 0, // exclude sensitive info
        "additionalFields.addressLine1": 0, // exclude sensitive info
        "additionalFields.addressLine2": 0, // exclude sensitive info
        "additionalFields.gstNumber": 0, // exclude sensitive info
        "additionalFields.aadharNumber": 0, // exclude sensitive info
        "additionalFields.groupedUrls": 0, // exclude sensitive info
      }
    ).lean();

    // 3. Send cleaned data (lean() ensures plain JS object, not Mongoose doc)
    const response = await axios.post("https://algos.onivah.com/recommend", {
      baseService,
      candidates: allServices,
    });

    // 4. Return sorted recommendations
    return res.json({ success: true, recommendations: response.data });
  } catch (err) {
    console.error("Recommendation error:", err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});



// bookings





// Razorpay webhook to confirm payment authorization
// app.post('/api/webhook', async (req, res) => {
//   const { payload } = req.body;
//   const payment = payload.payment.entity;

//   // Update booking with razorpayPaymentId
//   const booking = await Booking.findOne({ razorpayOrderId: payment.order_id });
//   if (booking) {
//     booking.razorpayPaymentId = payment.id;
//     await booking.save();
//   }

//   res.status(200).send('OK');
// });



// app.post("/api/vendor-approve", async (req, res) => {
//   const { paymentId, amount } = req.body;

//   try {
//     const captureResponse = await axios.post(
//       `https://${razorpay.key_id}:${razorpay.key_secret}@api.razorpay.com/v1/payments/${paymentId}/capture`,
//       {
//         amount: amount * 100, // in paise
//         currency: "INR"
//       }
//     );

//     res.json({ success: true, data: captureResponse.data });
//   } catch (error) {
//     console.error("Capture error", error);
//     res.status(500).json({ success: false });
//   }
// });



async function createSuperAdmin() {
  try {
    const userData = {
      userName: "onivah001",
      userPassword: "$2b$10$AMUw8z1T.wDS09gfgrv5v.SKQbvIQDTawPVv0aLqt7jsaC0Rkx/Ey",
      role: "superadmin",
      permissions: [
        "dashboard",
        "admin_users",
        "compose_mail",
        "view_requests",
        "view_approved_requests",
        "view_declined_requests",
        "delete_requests",
        "view_vendors",
        "view_vendor_profile",
        "view_users",
        "view_user_profile",
        "create_user",
        "view_inbox",
        "approval_logs",
        "manage_users",
      ],
    };

    const newAdmin = new AdminTable(userData);
    await newAdmin.save();

    console.log("✅ Superadmin created:", newAdmin);
  } catch (error) {
    console.error("❌ Error creating superadmin:", error.message);
  }
}





// updateSuperAdmin();


























// Port setup
const port = process.env.PORT || 4000; // Logical OR instead of bitwise OR
server.listen(port, () => {
  console.log("Node.js is running on port", port);
});

