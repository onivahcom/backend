import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
    {
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'vendor', required: true },
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'userTables' },
        amount: { type: Number, required: true },
        note: { type: String },
        razorpayLinkId: { type: String, required: true },
        razorpayShortUrl: { type: String, required: true },
        status: {
            type: String,
            enum: ['created', 'paid', 'expired', 'cancelled'],
            default: 'created'
        },
        conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
        messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
        paidAt: { type: Date },
        rawResponse: { type: mongoose.Schema.Types.Mixed }
    },
    {
        timestamps: true
    }
);

export default mongoose.model('Payment', paymentSchema);
