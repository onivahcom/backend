import UserVisitAnalytics from "../models/UserVisitAnalytics.js";
import mongoose from "mongoose";
import crypto from "crypto";
import RequestedService from "../models/requestedService.js";
import UserVisitLogs from "../models/userVisitLogs.js";


export const trackUserVisit = async (req, res) => {
    try {
        const {
            userId,
            vendorId,
            category,
            serviceId,
            guestId,
            deviceType,
            browser,
        } = req.body;

        if (!vendorId || !category || !serviceId) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const now = new Date();
        const ipAddress =
            req.headers["x-forwarded-for"] ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            null;

        const isLoggedIn = Boolean(userId);
        const identifierQuery = isLoggedIn
            ? { userId: new mongoose.Types.ObjectId(userId) }
            : { guestId };

        // 🎯 1️⃣ Find existing record for user/guest + vendor + service
        let existingVisit = await UserVisitAnalytics.findOne({
            ...identifierQuery,
            vendorId,
            service: serviceId,
        });

        if (existingVisit) {
            const lastActivity = existingVisit.lastVisit || existingVisit.firstVisit || now;
            const diffMinutes = (now - lastActivity) / (1000 * 60);
            const isNewSession = diffMinutes >= 10; // 🔥 10-minute rule

            if (isNewSession) {
                // 🆕 Start a new session
                existingVisit.sessionToken = crypto.randomUUID();
                existingVisit.sessionStartTime = now;
                existingVisit.visitCount += 1;
                existingVisit.isActive = true;

                if (existingVisit.lastVisit.toDateString() !== now.toDateString()) {
                    existingVisit.uniqueDaysVisited += 1;
                }


                // 🧾 Log this new session into UserVisitLogs (raw log)
                await UserVisitLogs.create({
                    ...(isLoggedIn ? { userId } : { guestId }),
                    vendorId,
                    category,
                    serviceId,
                    deviceType,
                    browser,
                    ipAddress,
                    visitDate: now,
                });

            } else {
                // 🔄 Continuing existing session (and reopen if closed)
                if (!existingVisit.sessionStartTime) {
                    existingVisit.sessionStartTime = now;
                    existingVisit.isActive = true;
                } else {
                    // console.log(`🔄 Continuing active session (${diffMinutes.toFixed(1)} min since last)`);
                }
            }

            // Always refresh metadata
            existingVisit.lastVisit = now;
            existingVisit.deviceType = deviceType;
            existingVisit.browser = browser;
            existingVisit.ipAddress = ipAddress;
            existingVisit.linked = isLoggedIn;

            await existingVisit.save();

            return res.status(200).json({
                message: isNewSession ? "New session started" : "Session continued",
                sessionToken: existingVisit.sessionToken,
            });
        }


        // 🧠 2️⃣ No existing record — create new
        const newVisit = new UserVisitAnalytics({
            ...(isLoggedIn
                ? { userId: new mongoose.Types.ObjectId(userId) }
                : { guestId }),
            vendorId: new mongoose.Types.ObjectId(vendorId),
            category,
            service: serviceId,
            deviceType,
            browser,
            linked: isLoggedIn,
            ipAddress,
            firstVisit: now,
            lastVisit: now,
            sessionToken: crypto.randomUUID(),
            sessionStartTime: now,
            visitCount: 1,
            uniqueDaysVisited: 1,
        });

        await newVisit.save();


        // 🧾 Log this first visit too
        await UserVisitLogs.create({
            ...(isLoggedIn ? { userId } : { guestId }),
            vendorId,
            category,
            serviceId,
            deviceType,
            browser,
            ipAddress,
            visitDate: now,
        });

        return res.status(201).json({
            message: "New visitor recorded",
            sessionToken: newVisit.sessionToken,
        });
    } catch (err) {
        res.status(500).json({ message: "Internal server error", error: err.message });
    }
};

// 🧠 End user session and update analytics
export const endUserSession = async (req, res) => {
    try {
        const { vendorId, serviceId, sessionToken, userId, guestId } = req.body;

        if (!vendorId || !serviceId || !sessionToken) {
            return res.status(400).json({
                message: "Missing vendorId, serviceId, or sessionToken",
            });
        }

        const query = {
            vendorId: new mongoose.Types.ObjectId(vendorId),
            service: new mongoose.Types.ObjectId(serviceId),
            sessionToken,
            ...(userId
                ? { userId: new mongoose.Types.ObjectId(userId) }
                : { guestId }),
        };

        //  Find the active analytics record
        const analytics = await UserVisitAnalytics.findOne(query);

        if (!analytics) {
            return res.status(404).json({ message: "Session not found" });
        }

        //  Handle already ended sessions gracefully
        if (!analytics.sessionStartTime) {
            return res.status(200).json({
                message: "Session already ended",
                totalTimeSpent: analytics.totalTimeSpent,
                avgSessionDuration: analytics.avgSessionDuration,
            });
        }

        //  Calculate duration for this session segment
        const now = new Date();
        const start = new Date(analytics.sessionStartTime);
        const duration = Math.max(0, (now - start) / 1000); // in seconds

        //  Accumulate total time and recompute averages
        analytics.totalTimeSpent = (analytics.totalTimeSpent || 0) + duration;
        analytics.avgSessionDuration =
            analytics.visitCount > 0
                ? analytics.totalTimeSpent / analytics.visitCount
                : duration;

        analytics.lastVisit = now;
        analytics.sessionEndTime = now;
        analytics.isActive = false;
        analytics.sessionStartTime = null; // ✅ mark closed cleanly

        await analytics.save();

        // 🕒 Convert to readable format
        const formatTime = (sec) => {
            const mins = Math.floor(sec / 60);
            const rem = Math.round(sec % 60);
            return `${mins}m ${rem}s`;
        };

        // 🧠 5️⃣ Respond with updated analytics (for dynamic pricing logic)
        return res.status(200).json({
            message: "Session ended successfully",
            duration: duration.toFixed(2),
            totalTimeSpent: analytics.totalTimeSpent.toFixed(2),
            avgSessionDuration: analytics.avgSessionDuration.toFixed(2),
            visitCount: analytics.visitCount,
        });
    } catch (err) {
        return res.status(500).json({ message: "Internal server error" });
    }
};



export const guestLink = async (req, res) => {
    try {
        const { guestId, userId } = req.body;

        if (!guestId || !userId) {
            return res.status(400).json({ message: "guestId and userId are required" });
        }

        // Step 1: Fetch all unlinked guest visits
        const guestRecords = await UserVisitAnalytics.find({ guestId, linked: false });
        if (guestRecords.length === 0) {
            return res.status(200).json({ message: "No guest analytics to link" });
        }

        for (const record of guestRecords) {
            // Step 2: Look for a user record for same vendor/service combo
            const existingUserRecord = await UserVisitAnalytics.findOne({
                userId: new mongoose.Types.ObjectId(userId),
                vendorId: record.vendorId,
                service: record.serviceId,
            });

            if (existingUserRecord) {
                // Merge visit counts & update lastVisit
                existingUserRecord.visitCount += record.visitCount || 1;
                existingUserRecord.lastVisit = new Date();
                existingUserRecord.uniqueDaysVisited += record.uniqueDaysVisited || 0;

                await existingUserRecord.save();

                // Mark guest record as linked
                record.linked = true;
                record.userId = userId;
                await record.save();
            } else {
                // Just reassign guest record to this user
                record.userId = userId;
                record.linked = true;
                await record.save();
            }
        }

        return res.status(200).json({ message: "Guest analytics linked successfully" });
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error" });
    }
};



// vendor

// Fetch vendor analytics
export const getVendorAnalytics = async (req, res) => {
    try {
        const { vendorId } = req.params;
        const { serviceId } = req.query;

        if (!mongoose.Types.ObjectId.isValid(vendorId)) {
            return res.status(400).json({ message: "Invalid vendor ID" });
        }

        // Step 1: Fetch analytics
        const query = { vendorId };
        if (serviceId) query.service = serviceId;

        const analytics = await UserVisitAnalytics.find(query);
        if (!analytics.length) {
            return res.status(200).json({
                totalVisits: 0,
                uniqueUsers: 0,
                avgSession: 0,
                avgSessionUnit: "min",
                conversionRate: 0,
            });
        }

        // Step 2: Basic metrics
        const totalVisits = analytics.reduce((sum, v) => sum + v.visitCount, 0);
        const uniqueUsers = new Set(analytics.map(v => v.userId?.toString() || v.guestId)).size;

        // Convert seconds → minutes
        const avgSessionSeconds = analytics.reduce((sum, v) => sum + (v.avgSessionDuration || 0), 0) / analytics.length;
        const avgSessionMinutes = avgSessionSeconds / 60;

        const totalConversions = analytics.filter(v => v.conversion).length;
        const conversionRate = ((totalConversions / analytics.length) * 100).toFixed(1);

        res.status(200).json({
            totalVisits,
            uniqueUsers,
            avgSession: avgSessionMinutes.toFixed(1),
            avgSessionUnit: "min",
            conversionRate,
        });

    } catch (err) {
        res.status(500).json({ message: "Internal server error", error: err.message });
    }
};

// get visitors chart
export const getVisitorsChart = async (req, res) => {
    try {
        const { vendorId } = req.params;

        // Fetch analytics grouped by serviceId
        const analytics = await UserVisitAnalytics.aggregate([
            {
                $match: {
                    vendorId: new mongoose.Types.ObjectId(vendorId)
                }
            },
            {
                $group: {
                    _id: "$service", // ensure your analytics model stores serviceId
                    totalVisits: { $sum: "$visitCount" },
                },
            },
        ]);

        if (!analytics.length) {
            return res.json({ success: true, data: [] });
        }

        //  Extract all service IDs
        const serviceIds = analytics.map(a => a._id);

        //  Fetch service details linked to vendor
        const services = await RequestedService.find({
            linkedServiceId: { $in: serviceIds },
            vendorId,
            isApproved: true,
        }).select("linkedServiceId additionalFields.businessName images");

        //  Merge service info with analytics
        const result = analytics.map(a => {
            const service = services.find(s => s.linkedServiceId.equals(a._id));

            // Handle Mongoose Map for images
            const coverImage = Array.isArray(service?.images?.get?.("CoverImage"))
                ? service.images.get("CoverImage")[0]
                : "";

            return {
                serviceId: a._id,
                businessName: service?.additionalFields?.businessName || "N/A",
                coverImage,
                totalVisits: a.totalVisits,
            };
        });


        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

