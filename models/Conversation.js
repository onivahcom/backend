import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'userTables',
            required: true
        },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
            required: true
        },
        serviceId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        serviceCategory: {
            type: String,
            required: true // e.g., "weddingHall", "caterer"
        }
    },
    { timestamps: true }
);


export default mongoose.model('Conversation', conversationSchema);
