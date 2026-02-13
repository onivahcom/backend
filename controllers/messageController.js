import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import mongoose from 'mongoose';
import crypto from "crypto";

const secretKey = crypto.scryptSync("your-strong-secret", "salt", 32); // 32-byte key

// Encrypt
function encryptMessage(text) {
    const iv = crypto.randomBytes(16); // 128-bit IV
    const cipher = crypto.createCipheriv("aes-256-cbc", secretKey, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    return {
        encryptedText: encrypted,
        iv: iv.toString("hex")
    };
}

// Decrypt
export function decryptMessage(encryptedText, ivHex) {
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", secretKey, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
}
export function sanitizeMessage(msg) {
    return msg
        .replace(/\b\d{10}\b/g, '[hidden-phone]')
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/gi, '[hidden-email]')
    // .replace(/https?:\/\/[^\s]+/gi, '[link]');
}


// POST /api/messages
export const sendMessage = async (req, res) => {

    try {
        const { conversationId, senderId, senderRole, text, type } = req.body;
        const cleanText = sanitizeMessage(text);
        const { encryptedText, iv } = encryptMessage(cleanText);

        if (!conversationId || !senderId || !senderRole || !text) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Optional: validate senderRole is either "user" or "vendor"
        if (!['user', 'vendor'].includes(senderRole)) {
            return res.status(400).json({ error: 'Invalid senderRole' });
        }

        // Construct message payload
        const messageData = {
            conversationId,
            senderId,
            senderRole,
            text: encryptedText,
            iv,                   // needed to decrypt
            seenBy: [senderId], // ✅ Only sender has seen it initially
        };

        // Conditionally add `type` if it exists
        if (type) {
            messageData.type = type;
        }

        const message = await Message.create(messageData);

        // Update conversation's last updated time
        await Conversation.findByIdAndUpdate(conversationId, {
            updatedAt: new Date()
        });

        // After message is created and before emitting
        const decryptedText = decryptMessage(message.text, message.iv);

        // Replace encrypted text with decrypted for socket emission only
        const safeMessage = {
            ...message.toObject(),
            text: decryptedText
        };

        req.io.emit("receiveMessage", safeMessage);
        req.io.emit("newMessageNotification", {
            conversationId,
            senderId,
            message: safeMessage
        });


        // req.io.emit("receiveMessage", message.toObject());
        // // Add this inside sendMessage after saving the message:
        // req.io.emit("newMessageNotification", {
        //     conversationId,
        //     senderId,
        //     message
        // });

        res.status(201).json({ message });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

// GET /api/messages/:conversationId
// export const getMessagesByConversation = async (req, res) => {
//     try {
//         const { conversationId } = req.params;

//         const messages = await Message.find({ conversationId }).sort({ sentAt: 1 });

//         res.status(200).json({ messages });
//     } catch (error) {
//         console.error('Error fetching messages:', error);
//         res.status(500).json({ error: 'Server error' });
//     }
// };


export const getMessagesByConversation = async (req, res) => {
    try {
        const { conversationId } = req.params;

        // Step 1: Get the conversation to extract service info
        const conversation = await Conversation.findById(conversationId).populate('userId', 'profilePic').populate('vendorId', 'profilePic') // ✅ Populate before lean
            ;
        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const { serviceId, serviceCategory, userId, vendorId } = conversation;

        // Step 2: Dynamically get model based on collection name
        const serviceSchema = new mongoose.Schema({ name: String }, { strict: false });

        // Use existing model or create if not registered yet
        const ServiceModel =
            mongoose.models[serviceCategory] || mongoose.model(serviceCategory, serviceSchema, serviceCategory);

        const serviceDoc = await ServiceModel.findById(serviceId).select('additionalFields.businessName images');
        const serviceName = serviceDoc?.additionalFields.businessName || '';
        const serviceImage = serviceDoc?.images?.CoverImage?.[0] || null;
        const userPic = userId?.profilePic || '';
        const vendorPic = vendorId?.profilePic || '';

        // Step 3: Get all messages
        // const messages = await Message.find({ conversationId }).sort({ sentAt: 1 });
        const messagesFromDB = await Message.find({ conversationId }).sort({ sentAt: 1 });

        // 🔐 Decrypt messages
        const messages = messagesFromDB.map((msg) => {
            let decryptedText;
            try {
                decryptedText = decryptMessage(msg.text, msg.iv);
            } catch (err) {
                decryptedText = '[decryption failed]';
                console.error('Decryption error:', err);
            }

            return {
                ...msg.toObject(),
                text: decryptedText, // replace encrypted text with decrypted
            };
        });

        res.status(200).json({ messages, serviceName, serviceImage, userPic, vendorPic });

    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

export const getUserConversationsWithUnseenCounts = async (req, res) => {
    const userId = req.params.userId;

    try {
        // Get all conversations for the user (as user or vendor)
        const conversations = await Conversation.find({
            $or: [{ userId: userId }, { vendorId: userId }]
        });

        const results = await Promise.all(
            conversations.map(async (conv) => {
                const unseenCount = await Message.countDocuments({
                    conversationId: conv._id,
                    senderId: { $ne: userId }, // messages not sent by this user
                    seenBy: { $ne: userId }    // and not seen by this user
                });

                return {
                    ...conv._doc,
                    unseenCount
                };
            })
        );

        res.status(200).json(results);
    } catch (error) {
        console.error("Failed to fetch unseen counts", error);
        res.status(500).json({ message: "Server error" });
    }
};
