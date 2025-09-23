import express from 'express';
import Notification from '../database/Notifications.js';

const notificationRouter = express.Router();

// GET notifications for user/vendor
notificationRouter.get("/:type/:id", async (req, res) => {
    try {
        const { type, id } = req.params;

        if (!["user", "vendor"].includes(type)) {
            return res.status(400).json({ message: "Invalid type. Must be 'user' or 'vendor'." });
        }

        const query = type === "user" ? { userId: id, type } : { vendorId: id, type };
        const notifications = await Notification.find(query).sort({ createdAt: -1 });

        res.json({ success: true, notifications });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error", error });
    }
});

// POST a new notification
notificationRouter.post("/", async (req, res) => {
    try {
        const { type, userId, vendorId, title, content, url } = req.body;

        if (!["user", "vendor"].includes(type)) {
            return res.status(400).json({ message: "Invalid type. Must be 'user' or 'vendor'." });
        }

        if (!title || !content || !url) {
            return res.status(400).json({ message: "Title, content, and URL are required." });
        }

        const newNotification = new Notification({
            type,
            userId: type === "user" ? userId : null,
            vendorId: type === "vendor" ? vendorId : null,
            title,
            content,
            url,
            read: false,
        });

        await newNotification.save();

        res.status(201).json({ success: true, notification: newNotification });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error", error });
    }
});

// Marks a single notification as read
notificationRouter.patch("/read/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const notification = await Notification.findByIdAndUpdate(
            id,
            { read: true },
            { new: true } // return updated document
        );

        if (!notification) {
            return res.status(404).json({ success: false, message: "Notification not found" });
        }

        res.json({ success: true, notification });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error", error });
    }
});


// PATCH /notifications/read-all/:type/:id
notificationRouter.patch("/read-all/:type/:id", async (req, res) => {
    try {
        const { type, id } = req.params;

        if (!["user", "vendor"].includes(type)) {
            return res.status(400).json({ message: "Invalid type. Must be 'user' or 'vendor'." });
        }

        const query = type === "user" ? { userId: id, type, read: false } : { vendorId: id, type, read: false };

        const result = await Notification.updateMany(query, { read: true });

        res.json({ success: true, modifiedCount: result.modifiedCount });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error", error });
    }
});




export default notificationRouter;
