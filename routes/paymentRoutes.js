// routes/payments.js
import express from 'express';
import Razorpay from 'razorpay';
import Payment from '../database/Payment.js';
import Booking from '../database/bookingSchema.js';
import mongoose from 'mongoose';

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
            // callback_url: 'http://localhost:3000/payment/callback',
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
        console.error('Error creating Razorpay link:', err);
        res.status(500).json({ error: 'Failed to create payment link' });
    }
});

// User requests booking
paymentRouter.post('/book', async (req, res) => {
    const { userId, hostId, amount, package: pkg, serviceId, serviceName, category } = req.body;

    try {
        // Create Razorpay order with payment_capture=0 (authorize only)
        const options = {
            amount: amount * 100, // in paise
            currency: "INR",
            payment_capture: 0,// 🚨 important: authorize only, do not capture now
        };
        const order = await razorpay.orders.create(options);


        // Save booking in DB
        const booking = new Booking({
            userId,
            hostId,
            amount,
            status: 'pending',
            razorpayOrderId: order.id,
            package: {
                title: pkg.title,
                description: pkg.description,
                amount: pkg.price,
                dates: pkg.dates,
                additionalRequest: pkg.additionalRequest || ""
            },
            serviceName,
            category,
            serviceId
        });

        await booking.save();

        res.json({ success: true, order });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// save-payment
paymentRouter.post("/save-payment", async (req, res) => {
    try {
        const { orderId, paymentId } = req.body;

        const booking = await Booking.findOneAndUpdate(
            { razorpayOrderId: orderId },
            { razorpayPaymentId: paymentId, status: "authorized" },
            { new: true }
        );

        if (!booking) {
            return res.status(404).json({ error: "Booking not found" });
        }

        res.json({ success: true, booking });
    } catch (err) {
        console.error("Save payment error:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
});

// reject
paymentRouter.post("/booking/:id/reject", async (req, res) => {
    const bookingId = req.params.id;
    const { reason, rejectedById, rejectedByModel } = req.body;

    try {
        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ error: "Booking not found" });

        booking.status = "rejected";
        booking.rejection = {
            reason: reason?.trim() || "No reason provided",
            rejectedBy: rejectedById,
            rejectedByModel, // must be "userTables" or "vendor"
            rejectedAt: new Date(),
        };

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
        console.error("Error fetching bookings:", err);
        res.status(500).json({ error: "Server error" });
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

        // 3️⃣ Auto-book dates if autoBook is true
        const bookingsArray = Array.isArray(selectedBookings) ? selectedBookings : [selectedBookings];

        if (autoBook && bookingsArray?.length > 0) {
            for (const sb of bookingsArray) {
                const { serviceId, category, package: pkg } = sb;
                const dates = pkg?.dates || []; // safely get dates array

                // Dynamic collection name: category of the service
                const service = await mongoose.connection.db
                    .collection(category)
                    .findOne({ _id: new mongoose.Types.ObjectId(serviceId) });

                if (service) {
                    const serviceDates = service.dates || { booked: [], waiting: [], available: [] };
                    const updatedBooked = [...(serviceDates.booked || []), ...dates];

                    await mongoose.connection.db
                        .collection(category)
                        .updateOne(
                            { _id: new mongoose.Types.ObjectId(serviceId) },
                            {
                                $set: { "dates.booked": updatedBooked },
                                $pull: { "dates.waiting": { $in: dates }, "dates.available": { $in: dates } }
                            }
                        );
                }
            }
        }


        res.json({
            success: true,
            // captured
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, error: err.message });
    }
});



export default paymentRouter;
