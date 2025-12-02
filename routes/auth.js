// routes/auth.js
import express from "express";
import jwt from 'jsonwebtoken';
import RefreshToken from "../models/RefreshToken.js";
import { generateAccessToken, generateRefreshToken } from '../utils/tokenUtils.js';
import { v4 as uuidv4 } from 'uuid';

const tokenGen = express.Router();



tokenGen.get("/refresh", async (req, res) => {

    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ message: "No refresh token" });

    try {
        const payload = jwt.verify(refreshToken, process.env.REFRESH_SECRET_KEY);
        const now = new Date();

        const existing = await RefreshToken.findOne({ tokenId: payload.tokenId });


        // 🛡 Reuse Detection
        if (!existing || !existing.valid || existing.expiresAt < now) {

            await RefreshToken.updateMany({ userId: payload.userId }, { valid: false });
            res.clearCookie("accessToken");
            res.clearCookie("refreshToken");
            return res.status(403).json({ message: "Refresh token reuse detected. Logged out." });
        }

        // 📍 Device/IP/User-Agent Check
        const sameIP = existing.ip === req.ip;
        const sameAgent = existing.userAgent === req.headers["user-agent"];

        if (!sameIP || !sameAgent) {

            await RefreshToken.updateMany({ userId: payload.userId }, { valid: false });
            res.clearCookie("accessToken");
            res.clearCookie("refreshToken");
            return res.status(403).json({ message: "Suspicious activity detected. Session killed." });
        }

        // ♻️ Issue new token FIRST
        const newTokenId = uuidv4();
        await RefreshToken.create({
            userId: payload.userId,
            tokenId: newTokenId,
            ip: req.ip,
            userAgent: req.headers["user-agent"],
            valid: true,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        const newAccessToken = generateAccessToken(payload.userId);
        const newRefreshToken = generateRefreshToken(payload.userId, newTokenId);

        // ✅ Send new tokens before invalidating old one
        res.cookie("accessToken", newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: "/",
        });

        res.cookie("refreshToken", newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Lax",
            maxAge: existing.expiresAt,
            path: "/",
        });


        // 🕒 Gracefully expire old token shortly after
        setTimeout(async () => {
            try {
                await RefreshToken.updateOne({ tokenId: payload.tokenId }, { valid: false });
            } catch (e) {
                // console.error("❌ Failed to invalidate old token:", e);
            }
        }, 10 * 1000); // 10 seconds grace

        // 🧪 Debug: Log all user tokens
        const allTokens = await RefreshToken.find({ userId: payload.userId }).sort({ createdAt: -1 });
        // console.table(allTokens.map(t => ({
        //     tokenId: t.tokenId,
        //     valid: t.valid,
        //     expiresAt: t.expiresAt.toISOString(),
        // })));

        return res.status(200).json({ message: "Token refreshed" });

    } catch (err) {
        // console.error("❌ Refresh token error:", err);

        res.clearCookie("accessToken");
        res.clearCookie("refreshToken");
        return res.status(403).json({ message: "Refresh token invalid or expired." });
    }
});



// routes/auth.js
tokenGen.post('/logout-all', async (req, res) => {
    const accessToken = req.cookies.accessToken;

    if (!accessToken) return res.sendStatus(204);

    try {
        const payload = jwt.verify(accessToken, process.env.JWT_SECRET_KEY);

        await RefreshToken.updateMany({ userId: payload.userId }, { valid: false });

        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        res.status(200).json({ message: 'Logged out from all devices.' });
    } catch (err) {
        res.status(403).json({ message: 'Invalid token.' });
    }
});

export default tokenGen; // Ensure you export the router
