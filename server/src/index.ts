import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8005;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/whatsapp-clone';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Multer config
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const fileUrl = `http://localhost:${PORT}/uploads/${req.file.filename}`;
  res.status(200).json({ fileUrl });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

// ── Socket.io ────────────────────────────────────────────────────────────────
// Map userId → Set of socketIds (a user may have multiple tabs open)
const userSocketMap = new Map<string, Set<string>>();

const addUserSocket = (userId: string, socketId: string) => {
  if (!userSocketMap.has(userId)) userSocketMap.set(userId, new Set());
  userSocketMap.get(userId)!.add(socketId);
};

const removeUserSocket = (userId: string, socketId: string) => {
  userSocketMap.get(userId)?.delete(socketId);
  if (userSocketMap.get(userId)?.size === 0) userSocketMap.delete(userId);
};

const emitToUser = (userId: string, event: string, data: any) => {
  const sockets = userSocketMap.get(userId);
  if (sockets) {
    sockets.forEach(sid => io.to(sid).emit(event, data));
  }
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Client must emit this right after connecting
  socket.on('register_user', (userId: string) => {
    addUserSocket(userId, socket.id);
    console.log(`Registered userId ${userId} -> socketId ${socket.id}`);
  });

  socket.on('join_room', (roomId: string) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });

  // Main message relay: emit to the room AND directly to each participant
  socket.on('send_message', (data: {
    roomId: string;
    chatId: string;
    senderId: string;
    recipientIds: string[];
    text?: string;
    type: string;
    fileUrl?: string;
    createdAt?: string;
    _id?: string;
  }) => {
    const payload = { ...data };

    // Only emit directly to each recipient by userId.
    // Do NOT also broadcast to the room — that would cause a double-delivery
    // because recipients have already joined the room on mount.
    if (data.recipientIds && Array.isArray(data.recipientIds)) {
      data.recipientIds.forEach((recipientId) => {
        if (recipientId !== data.senderId) {
          emitToUser(recipientId, 'receive_message', payload);
        }
      });
    }
  });

  socket.on('disconnect', () => {
    // Clean up all userId registrations for this socket
    userSocketMap.forEach((sockets, userId) => {
      if (sockets.has(socket.id)) removeUserSocket(userId, socket.id);
    });
    console.log('User disconnected:', socket.id);
  });
});

// ── Start ────────────────────────────────────────────────────────────────────
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => console.error('MongoDB connection error:', err));
