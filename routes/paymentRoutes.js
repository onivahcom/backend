// routes/payments.js
import express from 'express';
import Razorpay from 'razorpay';
import Payment from '../models/Payment.js';
import Booking from '../models/bookingSchema.js';
import mongoose from 'mongoose';
import crypto from "crypto";
import Transactions from '../models/Transactions.js';
import axios from 'axios';
import ScheduledCaptures from '../models/ScheduledCapture.js';
import authenticateToken from '../middleware/userAuth.js';

const paymentRouter = express.Router();

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// POST /api/payments/create-link
paymentRouter.post('/create-link', async (req, res) => {
    const { amount, note, vendorId, customerId, conversationId, messageId } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }

    try {
        const response = await razorpay.paymentLink.create({
            amount: Math.round(amount * 100),
            currency: 'INR',
            description: note || 'Payment Request',
            notify: {
                sms: false,
                email: false
            },
            reminder_enable: true,
            notes: {
                // vendorId,
                // customerId,
                context: 'payment_request'
            },
            // callback_url: 'http://localhost:3001/payment/callback',
            callback_method: 'get'
        });

        const savedPayment = await Payment.create({
            vendorId,
            customerId,
            conversationId,
            messageId,
            amount,
            note,
            razorpayLinkId: response.id,
            razorpayShortUrl: response.short_url,
            status: response.status,
            rawResponse: response
        });

        res.json({ paymentLink: response.short_url, paymentId: savedPayment._id });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create payment link' });
    }
});

// User requests booking
paymentRouter.post('/book', authenticateToken, async (req, res) => {

    const { userId, hostId, amount, package: pkg, serviceId, serviceName, category, cancellationPolicy, paymentPreference } = req.body;

    const cleanAmount = Math.round(amount);
    const isDelayed = paymentPreference === 'delayed';
    const finalUserId = mongoose.Types.ObjectId.isValid(userId) ? userId : new mongoose.Types.ObjectId();


    try {
        // Create Razorpay order with payment_capture=0 (authorize only)
        const options = {
            amount: cleanAmount * 100, // ₹1 vs full amount
            currency: "INR",
            payment_capture: isDelayed ? 0 : 1 // 🚨 capture only for immediate
        };
        const order = await razorpay.orders.create(options);

        // Save booking in DB
        const booking = new Booking({
            userId: finalUserId,
            hostId,
            amount: cleanAmount,
            status: 'attempted',
            razorpayOrderId: order.id,
            package: {
                title: pkg.title,
                description: pkg.description,
                amount: pkg.price,
                dates: pkg.dates,
                additionalRequest: pkg.additionalRequest || "",
                checkIn: pkg.checkIn,
                checkOut: pkg.checkOut,
            },
            serviceName,
            category,
            serviceId,
            razorpayCardToken: null,
        });

        await booking.save();


        res.json({ success: true, order, rzp_key: process.env.RAZORPAY_KEY_ID });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// save-payment
paymentRouter.post("/save-payment", async (req, res) => {
    try {
        const { orderId, paymentId, signature, paymentPreference, razorpayCardToken, checkIn, checkOut } = req.body;

        // 1. Verify signature
        const body = `${orderId}|${paymentId}`;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest("hex");

        if (expectedSignature !== signature) {
            return res.status(400).json({
                success: false,
                error: "Invalid signature"
            });
        }

        // 2. Get payment details from Razorpay
        const paymentInfo = await razorpay.payments.fetch(paymentId);

        // 3. Update booking
        const booking = await Booking.findOneAndUpdate(
            { razorpayOrderId: orderId },
            {
                razorpayPaymentId: paymentId,
                razorpayCardToken: razorpayCardToken || undefined,
                status: paymentPreference === 'delayed' ? "requested" : 'captured',
            },
            { new: true }
        );

        if (!booking) {
            return res.status(404).json({ error: "Booking not found" });
        }

        // 4. Save Transaction
        await Transactions.create({
            provider: "RAZORPAY",
            bookingId: booking._id,
            userId: booking.userId,
            hostId: booking.hostId,
            serviceId: booking.serviceId,
            serviceName: booking.serviceName,
            category: booking.category,
            amount: booking.amount,
            currency: "INR",
            status: paymentPreference === 'delayed' ? "authorized" : 'captured',
            razorpay: {
                orderId,
                paymentId,
                signature,

                method: paymentInfo.method,

                methodDetails: {
                    upi: paymentInfo.method === "upi" ? {
                        vpa: paymentInfo.vpa,
                        rrn: paymentInfo.acquirer_data?.rrn
                    } : undefined,

                    card: paymentInfo.method === "card" ? {
                        last4: paymentInfo.card?.last4,
                        network: paymentInfo.card?.network,
                        type: paymentInfo.card?.type
                    } : undefined,

                    bank: paymentInfo.method === "netbanking" ? {
                        bankName: paymentInfo.bank,
                        // Netbanking does not return IFSC or acc number
                    } : undefined
                }
            }
        });

        // ------------------------------------------
        // 5. If NOT delayed => Auto Book Dates Here
        // ------------------------------------------
        // if (paymentPreference !== "delayed") {
        //     console.log(paymentPreference);
        //     const serviceId = booking.serviceId;
        //     const category = booking.category;
        //     const dates = booking.package?.dates || [];

        //     if (!serviceId || !category) {
        //         console.log(" Missing serviceId or category in booking");
        //         return;
        //     }

        //     if (dates.length > 0) {

        //         const dateStrings = dates.map(
        //             d => new Date(d).toISOString().split("T")[0]
        //         );

        //         // Fetch service
        //         const service = await mongoose.connection.db
        //             .collection(category)
        //             .findOne({ _id: new mongoose.Types.ObjectId(serviceId) });

        //         if (service) {
        //             const serviceDates = service.dates || {
        //                 booked: [],
        //                 waiting: [],
        //                 available: []
        //             };

        //             // Convert booked list to set
        //             const bookedSet = new Set(
        //                 serviceDates.booked.map(d => new Date(d).toISOString().split("T")[0])
        //             );

        //             // Add new dates
        //             dateStrings.forEach(d => bookedSet.add(d));

        //             const updatedBooked = Array.from(bookedSet);

        //             await mongoose.connection.db
        //                 .collection(category)
        //                 .updateOne(
        //                     { _id: new mongoose.Types.ObjectId(serviceId) },
        //                     {
        //                         $set: { "dates.booked": updatedBooked },
        //                         $pull: {
        //                             "dates.waiting": { date: { $in: dateStrings } },
        //                             "dates.available": { date: { $in: dateStrings } }
        //                         }
        //                     }
        //                 );

        //         }
        //     }
        // }

        if (paymentPreference !== "delayed") {

            const serviceId = booking.serviceId;
            const category = booking.category;
            const dates = booking.package?.dates || [];

            // Fetch service
            const service = await mongoose.connection.db
                .collection(category)
                .findOne({ _id: new mongoose.Types.ObjectId(serviceId) });

            if (!service) return;

            const serviceDates = service.dates || {
                booked: [],
                waiting: [],
                available: [],
                others: []
            };

            /**
             * STEP 1: Normalize existing booked entries into a Map (keyed by date)
             * This avoids duplicates and keeps full objects
             */
            const bookedMap = new Map();

            (serviceDates.booked || []).forEach(b => {
                if (!b) return;

                // if old data is just a string date
                if (typeof b === "string") {
                    bookedMap.set(b, {
                        date: b,
                        title: "booked",
                        description: "",
                        status: "booked",
                        checkIn: null,
                        checkOut: null
                    });
                }

                // if proper object
                if (typeof b === "object" && b.date) {
                    bookedMap.set(b.date, b);
                }
            });

            /**
             * STEP 2: Create booked objects for new dates
             */
            dates.forEach(date => {
                if (!bookedMap.has(date)) {
                    bookedMap.set(date, {
                        date,
                        title: booking?.package?.title || "booked",
                        description: booking?.package?.description || "",
                        status: "booked",
                        checkIn: checkIn || null,
                        checkOut: checkOut || null
                    });
                }
            });

            const updatedBooked = Array.from(bookedMap.values());

            /**
             * STEP 3: Update DB
             * - Set booked with full objects
             * - Remove same dates from waiting & available
             */
            await mongoose.connection.db
                .collection(category)
                .updateOne(
                    { _id: new mongoose.Types.ObjectId(serviceId) },
                    {
                        $set: {
                            "dates.booked": updatedBooked
                        },
                        // $pull: {
                        //     "dates.waiting": { date: { $in: dateStrings } },
                        //     "dates.available": { date: { $in: dateStrings } }
                        // }
                    }
                );
        }


        res.json({ success: true, booking });

    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, error: "Server error" });
    }
});

// approves
paymentRouter.post('/booking/:id/approve', async (req, res) => {
    const bookingId = req.params.id;
    const { autoBook, selectedBookings } = req.body; // coming from frontend

    try {
        // 1️⃣ Find booking
        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ error: 'Booking not found' });

        // 2️⃣ Capture payment (existing logic)
        const captured = await razorpay.payments.capture(
            booking.razorpayPaymentId,
            booking.amount * 100,
            'INR'
        );

        booking.status = 'captured';
        await booking.save();

        // 3️⃣ Update Transactions collection
        await Transactions.findOneAndUpdate(
            { bookingId: booking._id, 'razorpay.paymentId': booking.razorpayPaymentId },
            {
                $set: {
                    status: 'captured',
                    'razorpay.capture.capturedAt': new Date(),
                    'razorpay.capture.captureAmount': booking.amount,
                    'razorpay.capture.captureId': captured.id
                }
            }
        );

        // if (booking.status === 'requested') {
        //     // 1️⃣ Calculate capture date (3 days before service)
        //     const serviceDates = booking.package?.dates || [];
        //     const firstServiceDate = new Date(serviceDates[0]);
        //     const captureDate = new Date(firstServiceDate);
        //     captureDate.setDate(captureDate.getDate() - 3);

        //     // If capture date is past, use today
        //     const now = new Date();
        //     if (captureDate < now) captureDate.setTime(now.getTime());

        //     // 2️⃣ Store in ScheduledCaptures without updating booking status
        //     await ScheduledCaptures.create({
        //         bookingId: booking._id,
        //         userId: booking.userId,
        //         hostId: booking.hostId,
        //         cardToken: booking.razorpayCardToken,
        //         amount: booking.amount,
        //         currency: "INR",
        //         captureDate,
        //         status: "pending"
        //     });

        //     booking.status = 'captured';
        //     await booking.save();


        // }

        // 4️⃣ Auto-book dates if autoBook is true

        const bookingsArray = Array.isArray(selectedBookings) ? selectedBookings : [selectedBookings];

        if (autoBook && bookingsArray?.length > 0) {
            for (const sb of bookingsArray) {
                const { serviceId, category, package: pkg } = sb;
                const dates = (pkg?.dates || []).map(d => new Date(d).toISOString().split("T")[0]); // normalize as YYYY-MM-DD

                const service = await mongoose.connection.db
                    .collection(category)
                    .findOne({ _id: new mongoose.Types.ObjectId(serviceId) });

                if (service) {
                    const bookedDateObjects = dates.map((d) => ({
                        date: d,
                        title: "Booked By Customer",
                        description: "This is a system generated notification, based on your approval for this order",
                        status: "Booked",
                    }));

                    await mongoose.connection.db
                        .collection(category)
                        .updateOne(
                            {
                                _id: new mongoose.Types.ObjectId(serviceId),
                                "dates.booked.date": { $nin: dates } // ⛔ prevent duplicates
                            },
                            {
                                // ✅ Add booked objects
                                $addToSet: {
                                    "dates.booked": { $each: bookedDateObjects }
                                },

                                // ✅ Remove from waiting & available
                                $pull: {
                                    "dates.waiting": { date: { $in: dates } },
                                    "dates.available": { date: { $in: dates } }
                                }
                            }
                        );
                }

            }
        }


        res.json({
            success: true,
            captured
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// payment success
paymentRouter.get("/bookings/:id", async (req, res) => {
    try {
        // 1) Fetch Booking
        const booking = await Booking.findById(req.params.id).select(
            "amount createdAt userId hostId serviceId category serviceName"
        );

        if (!booking) {
            return res.status(404).json({ success: false, error: "Booking not found" });
        }

        // 2) Fetch latest payment for this booking
        const payment = await Transactions.findOne({ bookingId: booking._id })
            .sort({ createdAt: -1 });

        // 3) If no payment yet → pending state
        if (!payment) {
            return res.json({
                success: true,
                booking: {
                    provider: null,
                    transactionId: null,
                    orderId: null,
                    paymentMethod: "N/A",
                    status: "pending",
                    amount: booking.amount,
                    date: booking.createdAt,
                    failure: null
                }
            });
        }

        // 4) Normalize payment fields for unified response
        let provider = payment.provider;
        let transactionId = null;
        let orderId = null;
        let paymentMethod = payment.paymentMethod || "Online";
        let failure = payment.failure || null;

        if (provider === "RAZORPAY") {
            transactionId = payment.razorpay?.paymentId || null;
            orderId = payment.razorpay?.orderId || null;
            paymentMethod = payment.razorpay?.method || paymentMethod;
        }

        if (provider === "PAYPAL") {
            transactionId = payment.paypal?.transactionId || null;
            orderId = payment.paypal?.orderId || null;
            paymentMethod = payment.paypal?.paymentSource || paymentMethod;
        }

        // 5) Final response
        res.json({
            success: true,
            booking: {
                provider,
                transactionId,
                orderId,
                paymentMethod,
                status: payment.status,   // pending / authorized / captured / failed / refunded
                amount: payment.amount,
                date: payment.createdAt,
                failure
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, error: "Server error" });
    }
});

// Payment failed
paymentRouter.post("/payment-failed", async (req, res) => {
    try {
        const { orderId, error } = req.body;

        const booking = await Booking.findOneAndUpdate(
            { razorpayOrderId: orderId },
            { status: "failed" },
            { new: true }
        );

        await Transactions.create({
            provider: "RAZORPAY",

            bookingId: booking?._id,
            userId: booking?.userId,
            hostId: booking?.hostId,
            serviceId: booking?.serviceId,
            serviceName: booking?.serviceName,
            category: booking?.category,

            amount: booking?.amount,
            currency: "INR",
            status: "failed",

            razorpay: {
                orderId,
                failure: {
                    reason: error.description,
                    code: error.code,
                    description: error.description,
                    razorpayErrorCode: error.code,
                    razorpayErrorDescription: error.description,
                    failedAt: new Date()
                }
            }
        });

        res.json({ success: true, booking });

    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

// reject
paymentRouter.post("/booking/:id/reject", async (req, res) => {
    const bookingId = req.params.id;
    const { reason, rejectedById, rejectedByModel } = req.body;

    try {
        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ error: "Booking not found" });

        // Store current payment status
        const paymentStatus = booking.status;

        // Update rejection info
        booking.status = "rejected";
        booking.rejection = {
            reason: reason?.trim() || "No reason provided",
            rejectedBy: rejectedById,
            rejectedByModel,
            rejectedAt: new Date(),
        };

        // If payment exists and is authorized/captured, process refund/void
        if (booking.razorpayPaymentId) {
            try {
                let cancelData = null;

                if (booking.status === "captured") {
                    // Refund captured payment
                    cancelData = await razorpay.payments.refund(booking.razorpayPaymentId, {
                        amount: booking.amount * 100
                    });

                    booking.cancellation.refundAmount = booking.amount;
                    booking.cancellation.refundStatus = "processed";
                    booking.cancellation.refundTransactionId = cancelData.id;

                    await Transactions.findOneAndUpdate(
                        { bookingId },
                        {
                            $set: {
                                "razorpay.refund.refundId": cancelData.id,
                                "razorpay.refund.refundAmount": cancelData.amount / 100,
                                "razorpay.refund.refundStatus": "initiated",
                                "razorpay.refund.refundedAt": new Date()
                            }
                        }
                    );
                } else if (booking.status === "authorized") {
                    // Authorized payment will auto-expire if not captured
                    booking.cancellation.refundAmount = booking.amount;
                    booking.cancellation.refundStatus = "not_captured";
                }
            } catch (err) {
                booking.cancellation.refundStatus = "failed";
            }
        }


        await booking.save();
        res.json({ success: true, message: "Booking rejected", booking });

    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});


// bookings fetch
paymentRouter.get("/get-bookings", async (req, res) => {
    try {
        const { vendorId } = req.query;
        if (!vendorId) {
            return res.status(400).json({ error: "vendorId is required" });
        }
        // Find bookings for this vendor and populate customer details
        const bookings = await Booking.find({ hostId: vendorId })
            .populate("userId", "_id city firstname lastname profilePic");
        res.json(bookings);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Server error" });
    }
});


























export async function initiateRefund(paymentId, amount) {
    try {
        const payment = await razorpay.payments.fetch(paymentId);

        if (!payment.captured) throw new Error("Payment not captured yet");

        const refundableAmount = payment.amount - payment.amount_refunded;
        if (refundableAmount <= 0) throw new Error("Nothing left to refund");

        // If amount is 0 → return 0 (no refund)
        if (!amount || Number(amount) === 0) {
            return { refunded: false, amount: 0 };
        }

        const requestedAmountPaise = Number(amount) * 100;

        const refundAmount = Math.min(requestedAmountPaise, refundableAmount);

        if (refundAmount <= 0) {
            return { refunded: false, amount: 0 };
        }

        const refundOptions = { amount: refundAmount };

        const refund = await razorpay.payments.refund(paymentId, refundOptions);

        return refund;

    } catch (err) {
        throw new Error(err.error?.description || err.message);
    }
}




export default paymentRouter;
