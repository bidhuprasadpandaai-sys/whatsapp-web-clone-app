import express from 'express';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';

const router = express.Router();

// Create or find existing chat, always populate participants
router.post('/create', async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;
    let chat = await Chat.findOne({
      participants: { $all: [senderId, receiverId] },
    }).populate('participants', '-password');

    if (!chat) {
      const newChat = await Chat.create({ participants: [senderId, receiverId] });
      chat = await Chat.findById(newChat._id).populate('participants', '-password') as any;
    }
    res.status(200).json(chat);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Get all chats for a user, always populate participants
router.get('/:userId', async (req, res) => {
  try {
    const chats = await Chat.find({
      participants: { $in: [req.params.userId] },
    }).populate('participants', '-password').sort({ updatedAt: -1 });
    res.status(200).json(chats);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Save a message
router.post('/message', async (req, res) => {
  try {
    const { chatId, senderId, text, type, fileUrl } = req.body;
    const message = await Message.create({ chatId, senderId, text, type, fileUrl });
    // Update chat's updatedAt to bubble it in sidebar
    await Chat.findByIdAndUpdate(chatId, { updatedAt: new Date() });
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Get messages for a chat
router.get('/message/:chatId', async (req, res) => {
  try {
    const messages = await Message.find({ chatId: req.params.chatId }).sort({ createdAt: 1 });
    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

export default router;
