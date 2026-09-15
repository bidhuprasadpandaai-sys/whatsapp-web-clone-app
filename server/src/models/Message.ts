import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String },
    type: { type: String, enum: ['text', 'image', 'audio', 'file'], default: 'text' },
    fileUrl: { type: String }
  },
  { timestamps: true }
);

export default mongoose.model('Message', messageSchema);
