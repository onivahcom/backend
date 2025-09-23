import express from 'express';
import {
    sendMessage,
    getMessagesByConversation,
    getUserConversationsWithUnseenCounts
} from '../controllers/messageController.js';

const messageRouter = express.Router();

// POST /api/messages → send a message
messageRouter.post('/', sendMessage);

// GET /api/messages/:conversationId → get all messages for a conversation
messageRouter.get('/:conversationId', getMessagesByConversation);

// routes/messageRoutes.js
messageRouter.get('/unseenCounts/:userId', getUserConversationsWithUnseenCounts);


export default messageRouter;
