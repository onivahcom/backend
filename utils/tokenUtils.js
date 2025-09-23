// utils/tokenUtils.js
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

export const generateAccessToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET_KEY, { expiresIn: '1d' });
};

export const generateRefreshToken = (userId, tokenId) => {
    return jwt.sign({ userId, tokenId }, process.env.REFRESH_SECRET_KEY, { expiresIn: '7d' });
};

export const createRefreshTokenDoc = async (userId, req, RefreshToken) => {
    const tokenId = uuidv4();

    await RefreshToken.create({
        userId,
        tokenId,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return tokenId;
};




