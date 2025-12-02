import express from "express";
import Transactions from "../models/Transactions.js";
import mongoose from "mongoose";

const paymentAnalyticsRouter = express.Router();

/* -----------------------------------------------------
   1. TOTAL COUNTS & BASIC METRICS
----------------------------------------------------- */

paymentAnalyticsRouter.get("/overview", async (req, res) => {
    try {
        const totalsAgg = await Transactions.aggregate([
            {
                $group: {
                    _id: null,
                    totalRevenue: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "captured"] }, "$amount", 0]
                        }
                    },
                    authorizedAmount: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "authorized"] }, "$amount", 0]
                        }
                    },
                    totalCount: { $sum: 1 },
                    authorizedCount: { $sum: { $cond: [{ $eq: ["$status", "authorized"] }, 1, 0] } },
                    capturedCount: { $sum: { $cond: [{ $eq: ["$status", "captured"] }, 1, 0] } },
                    failedCount: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
                    refundedCount: { $sum: { $cond: [{ $eq: ["$status", "refunded"] }, 1, 0] } }
                }
            }
        ]);

        const monthlyAgg = await Transactions.aggregate([
            {
                $match: { status: "captured" }  // Only captured payments
            },
            {
                $group: {
                    _id: { $month: "$createdAt" },
                    totalAmount: { $sum: "$amount" }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        const statusDist = await Transactions.aggregate([
            { $group: { _id: "$status", total: { $sum: 1 } } }
        ]);

        const providerDist = await Transactions.aggregate([
            { $group: { _id: "$provider", total: { $sum: 1 } } }
        ]);

        const categoryAgg = await Transactions.aggregate([
            {
                $group: {
                    _id: "$category", totalAmount: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "captured"] }, "$amount", 0]
                        }
                    }
                }
            },
            { $sort: { totalAmount: -1 } },
            { $limit: 5 }
        ]);

        const latest = await Transactions.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate({ path: "userId", select: "firstname lastname email profilePic" })
            .populate({ path: "hostId", select: "firstName lastName businessName profilePic city" });

        res.json({
            success: true,
            data: {
                totals: totalsAgg[0] || {},
                monthly: monthlyAgg.map(m => ({ label: `Month ${m._id}`, totalAmount: m.totalAmount })),
                statusDist,
                providerDist,
                categoryAgg,
                latest
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: "Server error" });
    }
});

// GET: Single transaction by ID
paymentAnalyticsRouter.get("/transaction/:id", async (req, res) => {
    try {
        const txn = await Transactions.findById(req.params.id)
            .populate({ path: "userId", select: "firstname lastname email phone city state profilePic" })
            .populate({ path: "hostId", select: "firstName lastName businessName city state profilePic" });

        if (!txn) return res.status(404).json({ success: false, error: "Transaction not found" });

        res.json({ success: true, data: txn });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: "Server error" });
    }
});



/* -----------------------------------------------------
   2. REVENUE LAST 30 DAYS (FOR LINE GRAPH)
----------------------------------------------------- */
paymentAnalyticsRouter.get("/revenue-daily", async (req, res) => {
    try {
        const revenue = await Transactions.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                    },
                    status: { $in: ["authorized", "captured"] }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
                    },
                    total: { $sum: "$amount" }
                }
            },
            {
                $sort: { "_id": 1 }
            }
        ]);

        return res.json({ success: true, data: revenue });

    } catch (err) {
        console.error("Revenue Daily Error:", err);
        res.status(500).json({ success: false, error: "Server Error" });
    }
});


/* -----------------------------------------------------
   3. REVENUE LAST 12 MONTHS (BAR GRAPH)
----------------------------------------------------- */
paymentAnalyticsRouter.get("/revenue-monthly", async (req, res) => {
    try {
        const revenue = await Transactions.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1))
                    },
                    status: { $in: ["captured"] }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m", date: "$createdAt" }
                    },
                    total: { $sum: "$amount" }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        res.json({ success: true, data: revenue });

    } catch (err) {
        console.error("Revenue Monthly Error:", err);
        res.status(500).json({ success: false, error: "Server Error" });
    }
});


/* -----------------------------------------------------
   4. PAYMENT METHOD BREAKDOWN (PIE CHART)
----------------------------------------------------- */
paymentAnalyticsRouter.get("/payment-methods", async (req, res) => {
    try {
        const breakdown = await Transactions.aggregate([
            {
                $group: {
                    _id: "$razorpay.method",
                    count: { $sum: 1 },
                    totalAmount: { $sum: "$amount" }
                }
            },
            { $sort: { totalAmount: - 1 } }
        ]);

        res.json({ success: true, data: breakdown });

    } catch (err) {
        console.error("Payment Method Breakdown Error:", err);
        res.status(500).json({ success: false, error: "Server Error" });
    }
});


/* -----------------------------------------------------
   5. CATEGORY BREAKDOWN
----------------------------------------------------- */
paymentAnalyticsRouter.get("/category-breakdown", async (req, res) => {
    try {
        const categories = await Transactions.aggregate([
            {
                $group: {
                    _id: "$category",
                    count: { $sum: 1 },
                    totalAmount: { $sum: "$amount" }
                }
            },
            { $sort: { totalAmount: -1 } }
        ]);

        return res.json({ success: true, data: categories });

    } catch (err) {
        console.error("Category Breakdown Error:", err);
        res.status(500).json({ success: false, error: "Server Error" });
    }
});


export default paymentAnalyticsRouter;
