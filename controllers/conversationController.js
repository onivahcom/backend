import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { decryptMessage } from './messageController.js';

// Create or Get existing conversation
export const createOrGetConversation = async (req, res) => {

    try {
        const { userId, vendorId, serviceId, serviceCategory } = req.body;
        if (!userId) {
            return res.status(401).json({ error: " Kindly login to continue!" });
        }

        if (!vendorId || !serviceId || !serviceCategory) {

            return res.status(500).json({ error: "Internal server error. Missing required service/vendor details." });
        }

        // Check if a conversation already exists
        let conversation = await Conversation.findOne({
            userId,
            vendorId,
            serviceId
        });

        if (conversation) {
            return res.status(200).json({ conversation });
        }

        // Create new conversation
        conversation = await Conversation.create({
            userId,
            vendorId,
            serviceId,
            serviceCategory
        });

        res.status(201).json({ conversation });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
};

// Get all conversations for a user
// export const getUserConversations = async (req, res) => {
//     try {
//         const { userId } = req.params;

//         const conversations = await Conversation.find({ userId }).sort({ updatedAt: -1 });

//         res.status(200).json({ conversations });
//     } catch (error) {
//         console.error('Error fetching user conversations:', error);
//         res.status(500).json({ error: 'Server error' });
//     }
// };

const GenericServiceSchema = new mongoose.Schema({}, { strict: false });

export const getUserConversations = async (req, res) => {
    try {
        const { userId } = req.params;

        const conversations = await mongoose
            .model('Conversation')
            .find({ userId })
            .populate('vendorId', 'profilePic firstName')
            .sort({ updatedAt: -1 })
            .lean();


        const populatedConversations = await Promise.all(
            conversations.map(async (convo) => {
                const collectionName = convo.serviceCategory; // dynamic collection
                try {
                    const DynamicModel = mongoose.connection.model(
                        collectionName,
                        GenericServiceSchema,
                        collectionName // explicitly use collection name
                    );

                    const serviceDetails = await DynamicModel
                        .findById(convo.serviceId)
                        .select('additionalFields.businessName images')
                        .lean();

                    const messageFromDB = await Message.findOne({ conversationId: convo._id })
                        .sort({ sentAt: -1 })
                        .select("text iv sentAt")
                        .lean();

                    let lastMessage = null;

                    if (messageFromDB) {
                        try {
                            const decryptedText = decryptMessage(
                                messageFromDB.text,
                                messageFromDB.iv
                            );

                            lastMessage = {
                                text: decryptedText,
                                senderId: messageFromDB.senderId,
                                sentAt: messageFromDB.sentAt
                            };
                        } catch (err) {
                            lastMessage = {
                                text: "[decryption failed]",
                                senderId: messageFromDB.senderId,
                                sentAt: messageFromDB.sentAt
                            };
                        }
                    }

                    return {
                        ...convo,
                        serviceName: serviceDetails?.additionalFields?.businessName || '',
                        serviceImage: serviceDetails?.images?.CoverImage?.[0] || null,
                        // vendorPic: convo.vendorId?.profilePic || '',
                        lastMessage
                    };

                } catch (err) {
                    console.warn(`⚠️ Failed to fetch service for category: ${collectionName}`, err.message);
                    return convo; // fallback if any error
                }
            })
        );

        res.status(200).json({ conversations: populatedConversations });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
};




// Get all conversations for a vendor
// export const getVendorConversations = async (req, res) => {
//     try {
//         const { vendorId } = req.params;

//         const conversations = await Conversation.find({ vendorId }).sort({ updatedAt: -1 });

//         res.status(200).json({ conversations });
//     } catch (error) {
//         console.error('Error fetching vendor conversations:', error);
//         res.status(500).json({ error: 'Server error' });
//     }
// };


export const getVendorConversations = async (req, res) => {
    try {
        const { vendorId } = req.params;

        const conversations = await mongoose
            .model('Conversation')
            .find({ vendorId })
            .populate('userId', 'profilePic firstname lastname')
            .sort({ updatedAt: -1 })
            .lean();

        const populatedConversations = await Promise.all(
            conversations.map(async (convo) => {
                const collectionName = convo.serviceCategory; // dynamic collection
                try {
                    const DynamicModel = mongoose.connection.model(
                        collectionName,
                        GenericServiceSchema,
                        collectionName // explicitly use collection name
                    );

                    const serviceDetails = await DynamicModel
                        .findById(convo.serviceId)
                        .select('additionalFields.businessName images')
                        .lean();

                    const messageFromDB = await Message.findOne({ conversationId: convo._id })
                        .sort({ sentAt: -1 })
                        .select("text iv sentAt")
                        .lean();

                    let lastMessage = null;

                    if (messageFromDB) {
                        try {
                            const decryptedText = decryptMessage(
                                messageFromDB.text,
                                messageFromDB.iv
                            );

                            lastMessage = {
                                text: decryptedText,
                                senderId: messageFromDB.senderId,
                                sentAt: messageFromDB.sentAt
                            };
                        } catch (err) {
                            lastMessage = {
                                text: "[decryption failed]",
                                senderId: messageFromDB.senderId,
                                sentAt: messageFromDB.sentAt
                            };
                        }
                    }

                    return {
                        ...convo,
                        serviceName: serviceDetails?.additionalFields?.businessName || '',
                        serviceImage: serviceDetails?.images?.CoverImage?.[0] || null,
                        lastMessage
                    };



                } catch (err) {
                    console.warn(`⚠️ Failed to fetch service for category: ${collectionName}`, err.message);
                    return convo; // fallback if any error
                }
            })
        );

        res.status(200).json({ conversations: populatedConversations });
    } catch (error) {
        console.error('❌ Error fetching user conversations:', error);
        res.status(500).json({ error: 'Server error' });
    }
};
