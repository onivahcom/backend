import express from 'express';
import {
    createOrGetConversation,
    getUserConversations,
    getVendorConversations
} from '../controllers/conversationController.js';

const conversationRouter = express.Router();

// POST /api/conversations → user initiates conversation
conversationRouter.post('/', createOrGetConversation);

// GET /api/conversations/user/:userId → get all for user
conversationRouter.get('/user/:userId', getUserConversations);

// GET /api/conversations/vendor/:vendorId → get all for vendor
conversationRouter.get('/vendor/:vendorId', getVendorConversations);

export default conversationRouter;
