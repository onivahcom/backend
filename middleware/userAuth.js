import userTable from "../models/userTable.js";
import jwt from "jsonwebtoken";

// middleware
const authenticateToken = async (req, res, next) => {

    const token = req.cookies?.accessToken;

    if (!token) {
        return res.status(401).json({ error: "Unauthorized: No token provided." });
    }

    jwt.verify(token, process.env.JWT_SECRET_KEY, async (err, payload) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(403).json({ error: "Token expired or invalid. Please log in again." });
            }
            return res.status(401).json({ error: 'Invalid token' }); // 🚫 bad token

        }
        try {
            const user = await userTable.findById(payload.userId).lean();
            if (!user) {
                return res.status(404).json({ error: "User not found." });
            }

            req.user = user; // Attach full user data to request
            next();
        } catch (dbError) {
            return res.status(500).json({ error: "Internal server error." });
        }
    });
};

export default authenticateToken;