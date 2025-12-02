import cron from "node-cron";
import mongoose from "mongoose";
import UserVisitLogs from "../models/userVisitLogs.js";


export const calculateVisitorTrend = async () => {
    try {

        const now = new Date();
        const startDate = new Date();
        startDate.setDate(now.getDate() - 3); // last 3 days

        // 🧩 1️⃣ Fetch logs from the last 3 days
        const logs = await UserVisitLogs.aggregate([
            {
                $match: {
                    visitDate: { $gte: startDate },
                },
            },
            {
                $project: {
                    serviceId: 1,
                    category: 1,
                    userId: 1,
                    guestId: 1,
                    date: { $dateToString: { format: "%Y-%m-%d", date: "$visitDate" } },
                },
            },
            // Group by serviceId + category + date, count unique visitors (userId or guestId)
            {
                $group: {
                    _id: {
                        serviceId: "$serviceId",
                        category: "$category",
                        date: "$date",
                    },
                    uniqueVisitors: {
                        $addToSet: { $ifNull: ["$userId", "$guestId"] },
                    },
                },
            },
            {
                $project: {
                    serviceId: "$_id.serviceId",
                    category: "$_id.category",
                    date: "$_id.date",
                    uniqueVisitorCount: { $size: "$uniqueVisitors" },
                    _id: 0,
                },
            },
            {
                $sort: { serviceId: 1, date: 1 },
            },
        ]);

        if (!logs.length) {
            return;
        }

        // 🧩 2️⃣ Group logs by serviceId
        const serviceStats = {};
        for (const entry of logs) {
            const { serviceId, category, date, uniqueVisitorCount } = entry;
            if (!serviceStats[serviceId]) serviceStats[serviceId] = { category, days: {} };
            serviceStats[serviceId].days[date] = uniqueVisitorCount;
        }

        // 🧩 3️⃣ Calculate trend for each service
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dayBefore = new Date();
        dayBefore.setDate(dayBefore.getDate() - 2);

        const yDate = yesterday.toISOString().split("T")[0];
        const dbfDate = dayBefore.toISOString().split("T")[0];

        for (const [serviceId, data] of Object.entries(serviceStats)) {
            const { category, days } = data;
            const yCount = days[yDate] || 0;
            const dbfCount = days[dbfDate] || 0;

            let visitorsAvg = yCount;
            let trendPercent = 0;

            if (yCount && dbfCount) {
                visitorsAvg = (yCount + dbfCount) / 2;
                trendPercent = ((yCount - dbfCount) / dbfCount) * 100;
            }

            // 📝 Update respective service (enable when ready)

            await updateServiceTrend({
                serviceId,
                category,
                visitorsAvg,
                trendPercent,
            });

        }

    } catch (err) {
        console.log("❌ [Visitor Trend Job] Error:", err);
    }
};

/**
 * 🕒  Cron Schedule — Runs every day at 6 AM and 6 PM
 * Format: second (optional) minute hour day month weekday
 */

cron.schedule("0 6,18 * * *", async () => {
    await calculateVisitorTrend();
});

/**
 * Update visitorsAvg and trendPercent for a specific service.
 * Works dynamically across category-based collections.
 */

export const updateServiceTrend = async ({ category, serviceId, visitorsAvg, trendPercent }) => {
    try {
        if (!category || !serviceId) {
            console.warn("⚠️ Missing category or serviceId. Skipping update.");
            return;
        }

        // ✅ Validate and sanitize values
        const safeAvg = typeof visitorsAvg === "number" && !isNaN(visitorsAvg) ? visitorsAvg : 0;
        const safeTrend = typeof trendPercent === "number" && !isNaN(trendPercent) ? trendPercent : 0;

        // ✅ Build dynamic collection name
        const collectionName = `${category.toLowerCase()}`;

        // ✅ Ensure collection exists before updating
        const collections = await mongoose.connection.db.listCollections().toArray();
        const exists = collections.some(col => col.name === collectionName);
        if (!exists) {
            return;
        }


        // ✅ Update the service document
        const result = await mongoose.connection.collection(collectionName).updateOne(
            { _id: new mongoose.Types.ObjectId(serviceId) },
            { $set: { visitorsAvg: safeAvg, trendPercent: safeTrend } }
        );

        if (result.matchedCount === 0) {
            console.log(` No service found in '${collectionName}' with ID ${serviceId}`);
        } else {
            console.log(`✅ Updated ${collectionName} (${serviceId}) → Avg: ${safeAvg}, Trend: ${safeTrend}%`);
        }
    } catch (err) {
        console.log("🚨 [updateServiceTrend] Failed:", err.message);
    }
};

