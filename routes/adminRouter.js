import express from "express";
import nodemailer from "nodemailer"
import Vendor from "../models/vendors.js";
import jwt from "jsonwebtoken";
import ContactForm from "../models/contactForm.js";
import RequestedService from "../models/RequestedService.js";
import userTable from "../models/userTable.js";
import VendorsTable from "../models/VendorTable.js";
import AdminTable from "../models/adminTable.js";
import mongoose from "mongoose";
import ApprovalLog from "../models/ApprovalLog.js";
import cors from "cors";
import cloudinary from "../config/cloudinary.js";
import bcrypt from "bcrypt";
import { ServicePricingConfig } from "../models/ServicePricingConfig.js";
import Transactions from "../models/Transactions.js";


const adminRouter = express.Router();

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

const verifyToken = (req, res, next) => {
    const token = req.cookies.onivah_admin; // ✅ Get token from cookie

    if (!token) {
        return res.status(403).json({ success: false, message: "No token provided" });
    }

    jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(401).json({ success: false, message: "Invalid or expired token" });
        }
        // Attach user info from JWT to request
        req.user = {
            id: decoded.id,
            username: decoded.username,
            role: decoded.role,
            permissions: decoded.permissions,
        };

        next();
    });
};

const authorize = (requiredPermission) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        if (!req.user.permissions.includes(requiredPermission)) {
            return res.status(403).json({ success: false, message: "Forbidden: No permission" });
        }

        next();
    };
};

// admin protected
adminRouter.get('/admin-protected', verifyToken, async (req, res) => {
    try {
        const admin = req.user; // ✅ use decoded data as admin
        if (!admin) {
            return res.status(404).json({ success: false, message: "Admin not found" });
        }
        res.status(200).json({
            success: true,
            data: {
                message: "Welcome, Admin!",
                admin, // ✅ will look like the object you shared
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// user contact form retrieve in admin
adminRouter.get('/get/contacts', async (req, res) => {
    try {
        const contacts = await ContactForm.find();
        res.json(contacts);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching contacts' });
    }
});

// admin inbox mark as read
adminRouter.put('/contacts/:id/mark-read', async (req, res) => {
    const { id } = req.params;
    console.log(id);
    try {
        const contact = await ContactForm.findByIdAndUpdate(
            id,
            { isRead: true },
            { new: true } // Return the updated contact
        );
        if (!contact) {
            return res.status(404).json({ message: 'Contact not found' });
        }
        res.json(contact);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error updating contact' });
    }
});

// admin compose email
adminRouter.post('/send-email', async (req, res) => {
    const { recipient, subject, message } = req.body;

    try {
        const mailOptions = {
            from: 'pabishek61001@gmail.com',   // Sender address
            to: recipient,                  // List of receivers
            subject: subject,               // Subject line
            html: message                   // HTML body content
        };

        // Send mail using the transporter
        const info = await transporter.sendMail(mailOptions);

        // Success response
        res.status(200).json({
            message: 'Email sent successfully!',
            info
        });
    } catch (error) {
        // Error response
        res.status(500).json({
            message: 'Failed to send email.',
            error
        });
    }
});

// fetch services requested
adminRouter.get('/requested-services', verifyToken, authorize('view_requests'), async (req, res) => {
    try {
        // Fetch all records from the collection
        const requestedServices = await RequestedService.find({ isApproved: false, declined: false });
        res.status(200).json(requestedServices);
    } catch (error) {
        console.error('Error fetching requested services:', error);
        res.status(500).json({ message: 'Failed to fetch data.' });
    }
});

// Route to get service details (including stored file info)
adminRouter.get('/get-file/:id', async (req, res) => {
    try {
        // Find the requested service by ID
        const service = await RequestedService.findById(req.params.id);

        if (!service) {
            return res.status(404).json({ message: 'Service not found' });
        }

        // Construct relative path for frontend
        const filePath = `http://localhost:4000/uploads/${service.file.storedName}`;

        res.status(200).json({
            service,
            filePath, // relative path only
        });
    } catch (err) {
        console.error('Error fetching service:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// Fetch only approved services
adminRouter.get('/approved-services', verifyToken, authorize('view_approved_requests'), async (req, res) => {
    try {
        const approvedServices = await RequestedService.find({ isApproved: true });

        res.status(200).json(approvedServices);
    } catch (error) {
        console.error('Error fetching approved services:', error);
        res.status(500).json({ message: 'Failed to fetch data.' });
    }
});

// Fetch only approved services
adminRouter.get('/declined-services', verifyToken, authorize('view_declined_requests'), async (req, res) => {
    try {
        const declinedServices = await RequestedService.find({ declined: true })
            .populate('vendorId', 'firstName profilePic _id');
        res.status(200).json(declinedServices);
    } catch (error) {
        console.error('Error fetching declined services:', error);
        res.status(500).json({ message: 'Failed to fetch data.' });
    }
});

// admin page customer count
adminRouter.get('/users/count', verifyToken, authorize('dashboard'), async (req, res) => {
    try {
        const userCount = await userTable.countDocuments(); // Get the count of users in the userTable
        const vendorCount = await VendorsTable.countDocuments(); // Get the count of users in the userTable

        res.json({ userCount: userCount, vendorCount: vendorCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// fetch admin card details
adminRouter.get("/fetch/dashboard-details", verifyToken, authorize('dashboard'), async (req, res) => {
    try {
        // Fetch all requested services
        const services = await RequestedService.find();
        // Initialize categorized data
        const categorizedData = {
            approved: { count: 0, services: [] },
            pending: { count: 0, services: [] },
            declined: { count: 0, services: [] },
            categories: [],
        };

        // Category-wise count map
        const categoryMap = new Map();

        services.forEach(service => {
            // Categorize based on status
            if (service.isApproved) {
                categorizedData.approved.count++;
                categorizedData.approved.services.push(service);
            } else if (service.declined) {
                categorizedData.declined.count++;
                categorizedData.declined.services.push(service);
            } else {
                categorizedData.pending.count++;
                categorizedData.pending.services.push(service);
            }

            // Update category count
            if (service.category) {
                categoryMap.set(service.category, (categoryMap.get(service.category) || 0) + 1);
            }
        });


        // Convert categoryMap to array
        categorizedData.categories = Array.from(categoryMap, ([name, count]) => ({ name, count }));

        res.status(200).json(categorizedData);
    } catch (error) {
        console.error("Error fetching requested services:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

adminRouter.get("/pdf/signed-url/*", verifyToken, authorize('view_approved_requests'), async (req, res) => {
    try {
        const publicId = req.params[0]; // captures everything after /pdf/signed-url/
        if (!publicId) {
            return res
                .status(400)
                .json({ success: false, message: "publicId is required" });
        }

        // Optional: if you store format in DB or pass it via query
        const fileFormat = "pdf"; // hard-coded for Aadhaar PDF, can also come from req.query.format

        // Generate signed URL for private raw file
        const signedUrl = cloudinary.utils.private_download_url(publicId, fileFormat, {
            resource_type: "raw",
            expires_at: Math.floor(Date.now() / 1000) + 60 * 5, // expires in 5 mins
        });

        res.json({ success: true, signedUrl });
    } catch (err) {
        console.error("Signed URL error:", err);
        res
            .status(500)
            .json({ success: false, message: "Failed to generate signed URL" });
    }
});

adminRouter.post("/approve-service", verifyToken, authorize('view_approved_requests'), async (req, res) => {

    const getCategoryModel = (categoryName) => {
        const modelName = categoryName;

        if (mongoose.models[modelName]) {
            return mongoose.models[modelName];
        }

        const serviceSchema = new mongoose.Schema({
            vendorId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'vendor',
                required: true,
            },
            fullName: String,
            email: String,
            category: String,
            additionalFields: { type: mongoose.Schema.Types.Mixed, default: {} },
            images: {
                type: Map,
                of: [String],
                default: {},
            },
        }, { collection: categoryName });

        return mongoose.model(modelName, serviceSchema, categoryName);
    };

    try {

        const { serviceId, adminId } = req.body; // ✅ extract from POST body
        console.log(serviceId, adminId);
        const requestedService = await RequestedService.findById(serviceId);
        if (!requestedService) {
            return res.status(404).json({ message: "Requested service not found" });
        }

        const { vendorId, fullName, email, phone, category, additionalFields, images, file } = requestedService;

        // Split additionalFields
        const {
            lastName,
            addressLine1,
            addressLine2,
            city,
            state,
            country,
            pincode,
            gstNumber,
            aadharNumber,
            businessName,
            ...otherFields // Catch any extras
        } = additionalFields;

        const ServiceModel = getCategoryModel(category);

        // update service
        const newService = new ServiceModel({
            vendorId: new mongoose.Types.ObjectId(vendorId), // <-- ensure it's an ObjectId
            fullName,
            email,
            category,
            additionalFields: { ...otherFields, businessName },
            images,
        });
        await newService.save();

        await RequestedService.findByIdAndUpdate(serviceId, {
            isApproved: true,
            linkedServiceId: newService._id,
        });

        // Create a new business object
        const newBusiness = {
            category,
            businessName,
            addressLine1,
            addressLine2,
            city,
            state,
            country,
            pincode,
            gstNumber,
            aadharNumber,
            // images,
            images: Array.from(images.values()).flat(),
            file, // Include the file object
            linkedServiceId: newService._id,
        };

        // handle vendor table update
        let vendor = await VendorsTable.findOne({ vendorId });

        if (vendor) {
            // ✅ Vendor exists, update by pushing new business
            await VendorsTable.updateOne(
                { vendorId }, {
                $push: { businesses: newBusiness }
            }
            );
        } else {
            // ✅ New vendor - insert with vendorId and businesses only
            await VendorsTable.create({
                vendorId,
                businesses: [newBusiness]
            });
        }

        // handle approval log
        const approvalLog = new ApprovalLog({
            adminId: adminId, // Replace with actual admin ID
            approved: [
                {
                    serviceOwner: vendorId,
                    serviceName: businessName,
                    serviceCategory: category,
                    serviceId: requestedService._id,
                },
            ],
        });

        await approvalLog.save();

        res.status(200).json({
            message: `Service approved and added to ${category} collection, vendor registered with a new business.`,
        });

    } catch (error) {
        console.log("Error approving service:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// get all vendors
adminRouter.get("/list/vendor", verifyToken, authorize('view_vendors'), async (req, res) => {
    try {
        const vendors = await Vendor.find();
        res.json(vendors);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
});

// get all users
adminRouter.get("/list/users", verifyToken, authorize('view_users'), async (req, res) => {
    try {
        const users = await userTable.find();
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});

// get user based on id
adminRouter.get("/users/:id", verifyToken, authorize('view_user_profile'), async (req, res) => {
    try {
        const user = await userTable.findById(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});

// get vendor based on id
adminRouter.get("/vendor/:id", verifyToken, authorize('view_vendor_profile'), async (req, res) => {
    try {
        const user = await Vendor.findById(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});

// GET all approval logs with populated fields
adminRouter.get("/approval-logs", verifyToken, authorize('approval_logs'), async (req, res) => {
    try {
        const logs = await ApprovalLog.find()
            .populate("adminId", "userName email")
            .populate("approved.serviceOwner", "firstName email")
            .populate("declined.serviceOwner", "firstName email")
            .populate("approved.serviceId", "title")
            .populate("declined.serviceId", "title")
            .sort({ timestamp: -1 });
        res.json(logs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
});

// populate admin approved logs
const fetchApprovalLogs = async () => {
    try {
        const logs = await ApprovalLog.find({})
            .populate("adminId", "userName") // Only populate admin's userName
            .populate("approved.serviceId", "fullName email category additionalFields")
            .populate("declined.serviceId", "fullName email category declineReason");
        console.log(logs);
        return logs;
    } catch (error) {
        console.error("❌ Error fetching approval logs:", error);
        throw error;
    }
};

// services count
async function requestCounts() {
    try {
        const requestCount = await RequestedService.countDocuments();
        console.log("Total requested services:", requestCount);
    } catch (error) {
        console.error("Error counting requested services:", error);
    }
}

// delete services
async function deleteTodaysRequestedServices() {
    try {
        // Get today's date
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth(); // Month is 0-based (0 = January, 1 = February, etc.)
        const currentDate = today.getDate();

        // Create a date object for the start of today (midnight)
        const startOfDay = new Date(currentYear, currentMonth, currentDate);

        // Create a date object for the start of the next day (midnight)
        const startOfNextDay = new Date(currentYear, currentMonth, currentDate + 1);

        // Delete the services created today
        const deletedServices = await RequestedService.deleteMany({
            createdAt: { $gte: startOfDay, $lt: startOfNextDay },
        });

        console.log(`Deleted ${deletedServices.deletedCount} requested services created today.`);
    } catch (error) {
        console.error("Error deleting today's requested services:", error);
    }
}
// deleteTodaysRequestedServices()

// Decline a requested service
adminRouter.put("/decline-service/:id", verifyToken, authorize("view_declined_requests"), async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id; // assuming verifyToken sets req.user

    try {
        const service = await RequestedService.findById(id).populate("vendorId"); // adjust populate key if needed

        if (!service) {
            return res.status(404).json({ message: "Service not found" });
        }

        // Update service as declined
        service.declined = true;
        service.declineReason = reason;
        await service.save();

        // Update ApprovalLog
        await ApprovalLog.findOneAndUpdate(
            { adminId },
            {
                $push: {
                    declined: {
                        serviceCategory: service.category,
                        serviceName: service.additionalFields.businessName,
                        serviceId: service._id,
                        serviceOwner: service.vendorId?._id, // adjust field name if different
                        declineReason: reason,
                    },
                },
                $setOnInsert: { timestamp: new Date() },
            },
            { upsert: true, new: true }
        );

        res
            .status(200)
            .json({ message: "Service request declined and logged successfully." });
    } catch (error) {
        console.error("Error declining service request:", error);
        res.status(500).json({ message: "Failed to decline request." });
    }
}
);
// const getCollections = async () => {
//     try {
//         await connectDB(); // Ensure the DB is connected
//         const collections = await mongoose.connection.db.listCollections().toArray();
//         console.log("All Collections in MongoDB:", collections.map(col => col.name));
//     } catch (error) {
//         console.error("Error fetching collections:", error);
//     }
// };

// getCollections();

// const getPartyHallCollection = async () => {
//     try {
//         await connectDB(); // Ensure the DB is connected
//         const partyHallCollection = mongoose.connection.db.collection('convention_center');
//         const documents = await partyHallCollection.find().toArray();
//         console.log("Documents in party_hall collection:", documents);
//     } catch (error) {
//         console.error("Error fetching documents from party_hall:", error);
//     }
// };

// getPartyHallCollection();


// DELETE service by category and ID
adminRouter.delete("/delete-service/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const requestedService = await RequestedService.findById(id);
        if (!requestedService) {
            return res.status(404).json({ message: "Requested service not found" });
        }

        const { category, linkedServiceId } = requestedService;

        const getCategoryModel = (categoryName) => {
            const modelName = categoryName;
            if (mongoose.models[modelName]) {
                return mongoose.models[modelName];
            }

            const serviceSchema = new mongoose.Schema({
                fullName: String,
                email: String,
                category: String,
                additionalFields: Object,
                images: [String],
            }, { collection: categoryName });

            return mongoose.model(modelName, serviceSchema, categoryName);
        };

        const ServiceModel = getCategoryModel(category);

        if (linkedServiceId) {
            await ServiceModel.findByIdAndDelete(linkedServiceId);
        }

        await RequestedService.findByIdAndDelete(id);

        res.status(200).json({ message: "Service deleted from both collections" });
    } catch (error) {
        console.error("Error deleting service:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Register new admin
adminRouter.post("/create-user", verifyToken, authorize('create_user'), async (req, res) => {
    try {
        const { userName, userPassword, role, permissions } = req.body;
        console.log(userName, userPassword, role, permissions);

        // Check if already exists
        const existing = await AdminTable.findOne({ $or: [{ userName }] });
        if (existing) {
            return res.status(400).json({ message: "User already exists" });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(userPassword, salt);

        // Save user
        const newUser = new AdminTable({
            userName,
            userPassword: hashedPassword,
            role,
            permissions,
        });

        await newUser.save();

        res.status(201).json({
            message: "Admin user created successfully",
            user: { id: newUser._id, userName, role, permissions },
        });
    } catch (err) {
        console.log("Error creating admin:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// Get all admins
adminRouter.get("/admins", verifyToken, authorize('admin_users'), async (req, res) => {
    try {
        const admins = await AdminTable.find({});
        res.status(200).json({ success: true, admins });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Update admin
adminRouter.put("/admins/:id", verifyToken, authorize('admin_users'), async (req, res) => {
    try {
        const { userName, role, permissions, userPassword } = req.body;

        let updateData = { userName, role, permissions };

        if (userPassword) {
            const hashedPassword = await bcrypt.hash(userPassword, 10);
            updateData.userPassword = hashedPassword;
        }

        const updatedAdmin = await AdminTable.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );

        res.status(200).json({ success: true, admin: updatedAdmin });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error updating admin" });
    }
});

// Delete admin
adminRouter.delete("/admins/:id", verifyToken, authorize('admin_users'), async (req, res) => {
    try {
        await AdminTable.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: "Admin deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error deleting admin" });
    }
});

//search users/vendors
adminRouter.post("/search/manage-users", verifyToken, authorize('manage_users'), async (req, res) => {
    try {
        const { filterBy, userType, formattedQuery } = req.body;
        if (!filterBy || !userType || !formattedQuery) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Pick correct model
        const Model = userType === "vendor" ? vendor : userTable;

        // Build search criteria
        let searchCriteria = {};
        if (filterBy === "phone") {
            searchCriteria.phone = formattedQuery;
        } else if (filterBy === "email") {
            searchCriteria.email = formattedQuery;
        } else if (filterBy === "id") {
            // vendor has _id / vendorId, customer has userId
            if (userType === "vendor") {
                searchCriteria._id = formattedQuery;
            } else {
                searchCriteria.userId = formattedQuery;
            }
        }

        // Find user/vendor
        const user = await Model.findOne(searchCriteria).lean();

        if (!user) {
            return res.status(404).json({ message: "No user found" });
        }

        return res.status(200).json({
            message: "User found",
            data: user,
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
});


// ✅ Get pricing config for a category
adminRouter.get("/pricing-config/:category", async (req, res) => {
    try {
        const { category } = req.params;
        const config = await ServicePricingConfig.findOne({ category })
            .sort({ createdAt: -1 }) //  Get latest created config
            .lean();

        if (!config) return res.status(404).json({ message: "No config found" });
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ✅ Always insert a new pricing config (no overwrite)
adminRouter.post("/pricing-config/update", async (req, res) => {
    try {
        const { category, peakDays, peakMonths, specialDates, highDemandLocations, admin } = req.body;


        const newConfig = new ServicePricingConfig({
            category,
            peakDays,
            peakMonths,
            specialDates,
            highDemandLocations,
            editedBy: admin || "Unknown",
        });

        await newConfig.save();

        res.json({
            success: true,
            message: "✅ New configuration inserted successfully",
            config: newConfig,
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/search-recipient?type=vendor&search=abc
adminRouter.get("/search-recipient", async (req, res) => {
    try {
        const { type, search } = req.query;

        console.log(type, search);

        if (!["vendor", "user"].includes(type)) {
            return res.status(400).json({ message: "Invalid type. Must be 'user' or 'vendor'." });
        }

        let results = [];
        const regex = search ? { $regex: search, $options: "i" } : {};

        if (type === "vendor") {
            results = await Vendor.find({ firstName: regex }).limit(20).select("firstName lastName email city state country _id");
        } else if (type === "user") {
            results = await userTable.find({ firstname: regex }).limit(20).select("firstname lastname email city state country _id");
        }
        console.log(results);
        res.json(results);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server error" });
    }
});

//    GET ALL TRANSACTIONS
adminRouter.get("/get-transactions", async (req, res) => {
    try {
        const txns = await Transactions.find()
            .populate({
                path: "userId",
                model: "userTables",
                select: "firstname lastname email phone profilePic city state"
            })
            .populate({
                path: "hostId",
                model: "Vendor",
                select: "firstName lastName name phone businessName city state profilePic"
            })
            .populate({
                path: "bookingId",
                model: "Booking"
            });

        res.json({
            success: true,
            data: txns
        });

    } catch (err) {
        console.error("Transaction list error:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
});

//    GET SINGLE TRANSACTION BY ID
adminRouter.get("/get-transaction/:id", async (req, res) => {
    try {
        const txn = await Transactions.findById(req.params.id)
            .populate({
                path: "userId",
                select: "firstname lastname email phone city state country zipcode profilePic _id"
            })
            .populate({
                path: "hostId",
                select: "firstName lastName businessName city state country email phone profilePic _id"
            })
            .populate({
                path: "bookingId",
                populate: [
                    {
                        path: "userId",
                        select: "firstname lastname email phone"
                    },
                    {
                        path: "hostId",
                        select: "firstName lastName businessName city state"
                    }
                ]
            });

        if (!txn) {
            return res.status(404).json({ success: false, error: "Transaction not found" });
        }

        res.json({ success: true, data: txn });

    } catch (err) {
        console.error("Single transaction fetch error:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
});






// log out
adminRouter.post("/logout", (req, res) => {
    try {
        res.clearCookie("onivah_admin", {
            httpOnly: true,
            secure: false, // true in production with HTTPS
            sameSite: "Lax",
        });

        res.status(200).json({ success: true, message: "Logged out successfully" });
    } catch (err) {
        console.error("Logout error:", err);
        res.status(500).json({ success: false, message: "Server error during logout" });
    }
});






export default adminRouter;
