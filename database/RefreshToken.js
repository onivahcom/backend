// models/RefreshToken.js
import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tokenId: { type: String, required: true, unique: true }, // UUIDv4
    ip: String,
    userAgent: String,
    valid: { type: Boolean, default: true },
    expiresAt: { type: Date, required: true },
}, { timestamps: true });

export default mongoose.model('RefreshToken', refreshTokenSchema);
