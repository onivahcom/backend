import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema(
    {
        serviceId: { type: mongoose.Schema.Types.ObjectId, },
        category: { type: String, },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'userTables', required: true },
        rating: { type: Number, required: true },
        feedback: { type: String },
    },
    { timestamps: true }
);

export default mongoose.model('Feedback', feedbackSchema);
