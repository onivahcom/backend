import express from "express";
import Feedback from "../models/Feedback.js";


const feedbackRouter = express.Router();

// ✅ Get all feedbacks for a service & average rating
export const getFeedbackByService = async (req, res) => {
    try {
        const { serviceId } = req.params;
        const feedbacks = await Feedback.find({ serviceId }).sort({ createdAt: -1 });
        if (feedbacks.length === 0) {
            return res.json({ feedbacks: [], averageRating: 0 });
        }

        const total = feedbacks.reduce((sum, f) => sum + f.rating, 0);
        const averageRating = total / feedbacks.length;

        res.json({ feedbacks, averageRating });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
};


export default feedbackRouter;
