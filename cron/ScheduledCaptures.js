
import mongoose from "mongoose";
import cron from "node-cron";
import ScheduledCaptures from "../models/ScheduledCapture";

cron.schedule('0 * * * *', async () => { // Every hour at minute 0

    const now = new Date();
    const pendingCaptures = await ScheduledCaptures.find({ status: 'pending', captureDate: { $lte: now } });

    for (const sc of pendingCaptures) {
        try {
            // Capture payment using Razorpay token
            const payment = await razorpay.payments.capture(sc.razorpayPaymentId, sc.amount * 100, sc.currency);

            sc.status = 'success';
            await sc.save();

            // Update Booking + Transactions
            await Booking.findByIdAndUpdate(sc.bookingId, { status: 'captured' });
            await Transactions.findOneAndUpdate(
                { bookingId: sc.bookingId },
                { status: 'captured', 'razorpay.capture.captureId': payment.id, 'razorpay.capture.capturedAt': new Date() }
            );

        } catch (err) {
            console.error(`Capture failed for booking ${sc.bookingId}:`, err);
            sc.status = 'failed';
            await sc.save();
            // Optionally notify user for manual retry if OTP required
        }
    }
});
