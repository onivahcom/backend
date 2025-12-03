import mongoose from "mongoose";
import cron from "node-cron";
import VendorsTable from "../models/VendorTable.js";
import RequestedService from "../models/requestedService.js";
import Vendor from "../models/vendors.js";
import Feedback from "../models/Feedback.js"; //  Import feedback model

export const updateVendorRatings = async () => {

    const results = [];

    try {
        const vendors = await VendorsTable.find();

        for (const vendor of vendors) {
            if (!vendor?.businesses?.length) continue;

            let totalTrend = 0;
            let totalVisitors = 0;
            let totalFeedbackRating = 0;
            let feedbackCount = 0;
            let count = 0;

            for (const biz of vendor.businesses) {
                if (!biz.linkedServiceId) continue;

                try {
                    // 🧩 Step 1: find the service request to get category
                    const requested = await RequestedService.findOne({ linkedServiceId: biz.linkedServiceId });
                    if (!requested || !requested.category) continue;

                    const category = requested.category;

                    // 🧩 Step 2: access the dynamic collection
                    const collection = mongoose.connection.collection(category);

                    // 🧩 Step 3: fetch the actual service doc
                    const service = await collection.findOne({ _id: new mongoose.Types.ObjectId(biz.linkedServiceId) });

                    if (service) {
                        totalTrend += service.trendPercent || 0;
                        totalVisitors += service.visitorsAvg || 0;
                        count++;
                    }

                    // 🧩 Step 4: also get average feedback rating for this service
                    const feedbackStats = await Feedback.aggregate([
                        { $match: { serviceId: new mongoose.Types.ObjectId(biz.linkedServiceId), category } },
                        { $group: { _id: null, avgRating: { $avg: "$rating" }, count: { $sum: 1 } } },
                    ]);

                    if (feedbackStats.length > 0) {
                        totalFeedbackRating += feedbackStats[0].avgRating || 0;
                        feedbackCount++;
                    }
                } catch (err) {
                    console.log(` Error reading service ${biz.linkedServiceId}: ${err.message}`);
                }
            }

            if (count > 0) {
                const avgTrend = totalTrend / count;
                const avgVisitors = totalVisitors / count;
                const avgFeedback = feedbackCount > 0 ? totalFeedbackRating / feedbackCount : 0;

                // 🧮 Combine metrics:
                // trend (40%) + visitors (20%) + feedback (40%)
                const score = 0.4 * avgTrend + 0.2 * (avgVisitors * 20) + 0.4 * (avgFeedback * 20);
                const finalRating = Math.min(5, Math.max(1, (score / 100) * 5));

                const result = {
                    vendorId: vendor.vendorId,
                    avgTrend: avgTrend.toFixed(2),
                    avgVisitors: avgVisitors.toFixed(2),
                    avgFeedback: avgFeedback.toFixed(2),
                    finalRating: finalRating.toFixed(1),
                };
                results.push(result);

                // ✅ Update the existing vendor record
                await Vendor.findByIdAndUpdate(
                    vendor.vendorId, // 👈 this must actually be _id
                    {
                        $set: {
                            rating: Number(finalRating.toFixed(1)),
                            lastRatedAt: new Date(),
                            avgTrendPercent: Number(avgTrend.toFixed(2)),
                            totalVisitors: Number(avgVisitors.toFixed(2)),
                            avgFeedbackRating: Number(avgFeedback.toFixed(2)),
                        },
                    },
                    { new: true }
                );

            }
        }

        return results;
    } catch (err) {
        console.log("❌ Error during vendor rating job:", err);
    }
};

/**
 * 🕕 Cron Job — runs every day at 6 AM & 6 PM
 */
cron.schedule("0 6,18 * * *", async () => {
    const results = await updateVendorRatings();
});
