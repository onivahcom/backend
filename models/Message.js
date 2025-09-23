import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
    {
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Conversation',
            required: true
        },
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        senderRole: {
            type: String,
            enum: ['user', 'vendor'],
            required: true
        },
        text: {
            type: String,
            required: true
        },
        iv: {
            type: String,
            required: true
        },
        type: {
            type: String,
            enum: ['text', 'payment_request'],
            default: 'text'
        },
        seenBy: [String], // List of userIds who have seen the message

    },
    {
        timestamps: { createdAt: 'sentAt', updatedAt: false }
    }
);

export default mongoose.model('Message', messageSchema);
