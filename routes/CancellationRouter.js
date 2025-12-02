import express from "express";
import Booking from "../models/bookingSchema.js";
import { calculateRefund } from "../utils/calculateRefund.js";
import { initiateRefund } from "./paymentRoutes.js";
import mongoose from "mongoose";
import userTable from "../models/userTable.js";
import Notification from "../models/Notifications.js";
import Transactions from "../models/Transactions.js";
import Razorpay from "razorpay";
import axios from "axios";


const cancellationRouter = express.Router();

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

cancellationRouter.post("/cancel-order", async (req, res) => {

    try {
        const { bookingId, reason, role } = req.body;
        const userId = req.user._id;
        const booking = await Booking.findById(bookingId);
        const collectionName = booking.category.toLowerCase();
        const collection = mongoose.connection.collection(collectionName);
        const service = await collection.findOne({ _id: booking.serviceId });

        if (!booking) return res.status(404).json({ message: "Booking not found" });

        const isVendor = role === "vendor";
        const cancelledBy = isVendor ? "vendor" : "user";

        // calculate refund % (based on policy)
        let refundAmount = 0;

        if (booking.status === "captured") {
            refundAmount = isVendor
                ? booking.amount  // Vendor cancel → full refund
                : calculateRefund(
                    booking,
                    service?.additionalFields?.cancellationPolicy
                );
        } else {
            refundAmount = 0;  // Payment not captured → no refund
        }


        // trigger Razorpay refund if captured
        let refundResponse = null;

        if (booking.status === "authorized" || booking.status === "requested") {
            const payment = await razorpay.payments.fetch(booking.razorpayPaymentId);

            // Check if domestic card
            // const isDomesticCard = payment.method === "card" && !payment.international && !payment?.card?.emi;

            // if (isDomesticCard) {
            //     // Void the payment
            //     try {
            //         const voidResult = await axios.post(
            //             `https://api.razorpay.com/v1/payments/${booking.razorpayPaymentId}/void`,
            //             {},
            //             {
            //                 auth: {
            //                     username: process.env.RAZORPAY_KEY_ID,
            //                     password: process.env.RAZORPAY_KEY_SECRET
            //                 }
            //             }
            //         );
            //     } catch (err) {
            //         // optionally throw or continue depending on your flow
            //     }
            // }


            // Update booking status
            booking.status = isVendor ? "rejected" : "cancelled";
            await booking.save();

            // Update transaction
            await Transactions.findOneAndUpdate(
                { bookingId },
                {
                    status: booking.status,
                    "razorpay.capture": null,
                    "razorpay.refund": null
                }
            );
        }


        if (booking.status === "captured" || booking.status === "confirmed" && refundAmount > 0) {

            refundResponse = await initiateRefund(booking.razorpayPaymentId, refundAmount);

            booking.status = isVendor ? "refunded" : "cancelled";

            await Transactions.findOneAndUpdate(
                { bookingId },
                {
                    status: "refunded",
                    "razorpay.refund": {
                        refundId: refundResponse.id,
                        refundAmount,
                        refundStatus: refundResponse.status,
                        refundedAt: new Date()
                    }
                }
            );
        }

        // FREE BOOKED DATES IF USER CANCELS
        if (!isVendor) {
            const serviceCollection = mongoose.connection.collection(booking.category);

            // Format dates as "YYYY-MM-DD" strings to match DB
            const datesToPull = booking.package.dates.map(d => {
                const dateObj = new Date(d);
                const year = dateObj.getFullYear();
                const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
                const day = dateObj.getDate().toString().padStart(2, "0");
                return `${year}-${month}-${day}`;
            });

            const result = await serviceCollection.updateOne(
                { _id: new mongoose.Types.ObjectId(booking.serviceId) },
                {
                    $pull: {
                        "dates.booked": { $in: datesToPull }
                    }
                }
            );

        }


        // Update booking
        booking.cancellation = {
            cancelledBy,
            cancelledById: isVendor ? booking.hostId : userId,
            reason,
            cancelledAt: new Date(),
            refundAmount,
            refundStatus: refundResponse ? "initiated" : null,
            refundTransactionId: refundResponse?.id || null,
            vendorPenalty: isVendor
                ? { applied: true, amount: 100, reason: "Vendor cancelled booking" }
                : { applied: false },
        };

        await booking.save();


        // SEND NOTIFICATION TO VENDOR WHEN USER CANCELS
        if (!isVendor) {
            await Notification.create({
                userId: booking.userId || null,
                vendorId: booking.hostId,
                type: "vendor",
                title: "Booking Cancelled",
                messageType: "order",
                content: `The booking for ${booking.serviceName} has been cancelled by the user.`,
                sendBy: userId,
                sendByModel: "userTables",
            });
        }


        // SEND NOTIFICATION TO USER WHEN VENDOR CANCELS
        if (isVendor) {
            await Notification.create({
                userId: booking.userId,
                vendorId: booking.hostId || null,
                type: "user",
                title: "Booking Cancelled by Vendor",
                messageType: "order",
                content: `Your booking for ${booking.serviceName} has been cancelled by the vendor.`,
                sendBy: booking.hostId,
                sendByModel: "Vendor",
            });
        }


        res.json({ success: true, booking });
    } catch (error) {
        res.status(500).json({ message: "Cancellation failed", error });
    }
});

cancellationRouter.get("/refund-preview/:bookingId", async (req, res) => {
    try {
        const { bookingId } = req.params;

        // 1. Fetch the booking
        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ message: "Booking not found" });

        // 2. Determine cancellation policy
        let policy;

        if (!policy) {
            // dynamic collection
            const collectionName = booking.category; // assuming this matches your collection name
            const collection = mongoose.connection.collection(collectionName);

            // find the service document by serviceId
            const serviceDoc = await collection.findOne({ _id: booking.serviceId });

            if (serviceDoc) {
                policy = serviceDoc.cancellationPolicy || serviceDoc?.additionalFields?.cancellationPolicy;
            } else {
                policy = "moderate"; // default policy
            }
        }

        // 3. Calculate refund
        const refundAmount = calculateRefund(booking, policy);
        // 4. Return response
        res.json({
            success: true,
            refundAmount,
            totalAmount: booking.amount,
            policy,
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to calculate refund", error });
    }
});

async function clearCollections() {
    await Booking.deleteMany({});
    await Transactions.deleteMany({});
    await Notification.deleteMany({});

    logCleanup("All collections cleared!");
}

function logCleanup(message) {
    console.log("CLEANUP LOG:", message);
}

// clearCollections();

export default cancellationRouter;
