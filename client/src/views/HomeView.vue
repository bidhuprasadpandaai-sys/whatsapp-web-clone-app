<script setup lang="ts">
import { ref, onMounted, nextTick, onBeforeUnmount } from 'vue';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/auth';
import 'emoji-picker-element';

const authStore = useAuthStore();
const currentUser = authStore.user;
let socket: Socket | null = null;

// ─── State ──────────────────────────────────────────────────────────────────
const users       = ref<any[]>([]);
const chats       = ref<any[]>([]);
const activeChat  = ref<any>(null);
const messages    = ref<any[]>([]);
const newMessage  = ref('');
const messagesContainer = ref<HTMLElement | null>(null);
const showEmojiPicker   = ref(false);
const fileInput         = ref<HTMLInputElement | null>(null);
const isRecording       = ref(false);
const unreadMap         = ref<Record<string, number>>({});

let mediaRecorder: MediaRecorder | null = null;
let audioChunks:   Blob[] = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const toStr = (id: any): string => (id?.$oid ?? id ?? '').toString();

/** Return the other participant's user object from a populated chat */
const otherUser = (chat: any) =>
  chat.participants?.find((p: any) => toStr(p._id) !== currentUser.id) ?? { username: 'Unknown' };

/** Update sidebar: set lastMessage, bubble to top, bump unread. */
const upsertChatInSidebar = (msg: any, chatObj?: any) => {
  const chatId = toStr(msg.chatId);
  let idx = chats.value.findIndex(c => toStr(c._id) === chatId);

  if (idx === -1 && chatObj) {
    // Brand-new chat arriving from the other side — add it to the sidebar
    chats.value.unshift({ ...chatObj, lastMessage: msg });
    socket?.emit('join_room', chatId);
    return;
  }
  if (idx === -1) return; // we don't have this chat locally — ignore

  chats.value[idx].lastMessage = msg;
  const [chat] = chats.value.splice(idx, 1);
  chats.value.unshift(chat);

  const activeChatId = activeChat.value ? toStr(activeChat.value._id) : '';
  if (chatId !== activeChatId) {
    unreadMap.value[chatId] = (unreadMap.value[chatId] ?? 0) + 1;
  }
};

// ─── Socket ──────────────────────────────────────────────────────────────────
onMounted(async () => {
  socket = io('http://localhost:8005');

  socket.on('connect', () => {
    // Register user so server can deliver messages by userId
    socket?.emit('register_user', currentUser.id);
    // Re-join all known rooms
    chats.value.forEach(c => socket?.emit('join_room', toStr(c._id)));
  });

  socket.on('receive_message', (data) => {
    const incomingChatId = toStr(data.chatId);
    const activeChatId   = activeChat.value ? toStr(activeChat.value._id) : '';

    // If this is a brand-new chat we don't have, fetch it and add to sidebar
    const exists = chats.value.some(c => toStr(c._id) === incomingChatId);
    if (!exists) {
      fetch(`http://localhost:8005/api/chat/${currentUser.id}`)
        .then(r => r.json())
        .then((allChats: any[]) => {
          const incoming = allChats.find(c => toStr(c._id) === incomingChatId);
          if (incoming) upsertChatInSidebar(data, incoming);
        });
    } else {
      upsertChatInSidebar(data);
    }

    if (incomingChatId === activeChatId) {
      messages.value.push(data);
      scrollToBottom();
    }
  });

  await Promise.all([fetchUsers(), fetchMyChats()]);
  document.addEventListener('emoji-click', onEmojiClick as EventListener);
});

onBeforeUnmount(() => {
  socket?.disconnect();
  document.removeEventListener('emoji-click', onEmojiClick as EventListener);
});

// ─── Data fetching ────────────────────────────────────────────────────────────
const fetchUsers = async () => {
  const res  = await fetch('http://localhost:8005/api/auth/users');
  const data = await res.json();
  users.value = data.filter((u: any) => u._id !== currentUser.id);
};

const fetchMyChats = async () => {
  const res  = await fetch(`http://localhost:8005/api/chat/${currentUser.id}`);
  chats.value = await res.json();
  chats.value.forEach(c => socket?.emit('join_room', toStr(c._id)));
};

// ─── Chat selection ───────────────────────────────────────────────────────────
const onEmojiClick = (e: any) => {
  newMessage.value += e.detail.unicode;
  showEmojiPicker.value = false;
};

const selectUser = async (user: any) => {
  const res  = await fetch('http://localhost:8005/api/chat/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senderId: currentUser.id, receiverId: user._id }),
  });
  const chat = await res.json();   // participants are populated from server

  // Add / refresh in sidebar
  const existing = chats.value.findIndex(c => toStr(c._id) === toStr(chat._id));
  if (existing === -1) chats.value.unshift(chat);
  else chats.value[existing] = chat;

  socket?.emit('join_room', toStr(chat._id));
  unreadMap.value[toStr(chat._id)] = 0;
  activeChat.value = chat;

  const msgRes = await fetch(`http://localhost:8005/api/chat/message/${toStr(chat._id)}`);
  messages.value = await msgRes.json();
  scrollToBottom();
};

const selectChat = async (chat: any) => {
  activeChat.value = chat;
  socket?.emit('join_room', toStr(chat._id));
  unreadMap.value[toStr(chat._id)] = 0;

  const msgRes = await fetch(`http://localhost:8005/api/chat/message/${toStr(chat._id)}`);
  messages.value = await msgRes.json();
  scrollToBottom();
};

// ─── Media ────────────────────────────────────────────────────────────────────
const triggerFileUpload = () => fileInput.value?.click();

const handleFileUpload = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (!target.files?.length) return;
  const file = target.files[0];
  await uploadAndSend(file, file.type.startsWith('image/') ? 'image' : 'file');
  target.value = '';
};

const uploadAndSend = async (blob: Blob, type: string) => {
  if (!activeChat.value) return;
  const formData = new FormData();
  const filename = type === 'audio' ? `voice-${Date.now()}.webm` : (blob as File).name;
  formData.append('file', blob, filename);
  const res = await fetch('http://localhost:8005/api/upload', { method: 'POST', body: formData });
  const { fileUrl } = await res.json();
  await sendApiMessage('', type, fileUrl);
};

const startRecording = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Use ogg/opus if available, otherwise webm
    const mimeType = MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')
      ? 'audio/ogg; codecs=opus'
      : 'audio/webm';
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    audioChunks = [];
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: mimeType });
      await uploadAndSend(audioBlob, 'audio');
    };
    mediaRecorder.start();
    isRecording.value = true;
  } catch {
    alert('Microphone access denied. Please allow mic access in your browser.');
  }
};

const stopRecording = () => {
  if (mediaRecorder && isRecording.value) {
    mediaRecorder.stop();
    isRecording.value = false;
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
};

// ─── Send ─────────────────────────────────────────────────────────────────────
const sendMessage = async () => {
  if (!newMessage.value.trim() || !activeChat.value) return;
  await sendApiMessage(newMessage.value, 'text', null);
  newMessage.value = '';
};

const sendApiMessage = async (text: string, type: string, fileUrl: string | null) => {
  if (!activeChat.value) return;
  const chat = activeChat.value;

  const msgData = {
    chatId:   toStr(chat._id),
    senderId: currentUser.id,
    text,
    type,
    fileUrl,
  };

  const res = await fetch('http://localhost:8005/api/chat/message', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(msgData),
  });
  const savedMsg = await res.json();

  messages.value.push(savedMsg);
  upsertChatInSidebar(savedMsg);

  // Build recipient list from populated participants
  const recipientIds: string[] = (chat.participants ?? [])
    .map((p: any) => toStr(p._id))
    .filter((id: string) => id !== currentUser.id);

  socket?.emit('send_message', {
    ...savedMsg,
    roomId: toStr(chat._id),
    chatId: toStr(chat._id),
    recipientIds,
  });

  scrollToBottom();
};

const scrollToBottom = async () => {
  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
};

const logout = () => authStore.logout();
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-[#111b21] text-[#e9edef] font-sans">

    <!-- ═══════════════ SIDEBAR ═══════════════ -->
    <div class="w-[30%] min-w-[350px] max-w-[450px] border-r border-[#222d34] flex flex-col bg-[#111b21] shrink-0">

      <!-- Header -->
      <div class="bg-[#202c33] h-[59px] flex items-center px-4 justify-between shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full overflow-hidden cursor-pointer">
            <img :src="`https://ui-avatars.com/api/?name=${currentUser.username}&background=00a884&color=fff`" alt="me" class="w-full h-full object-cover" />
          </div>
          <span class="font-medium text-[#e9edef]">{{ currentUser.username }}</span>
        </div>
        <button @click="logout" title="Logout" class="hover:bg-[#374248] p-2 rounded-full transition-colors text-[#aebac1]">
          <span class="material-icons text-xl">logout</span>
        </button>
      </div>

      <!-- Scrollable list -->
      <div class="flex-1 overflow-y-auto custom-scrollbar">

        <!-- Recent chats -->
        <template v-if="chats.length > 0">
          <div class="px-3 pt-3 pb-1 text-[11px] text-[#8696a0] uppercase tracking-widest">Recent</div>
          <div
            v-for="chat in chats"
            :key="toStr(chat._id)"
            @click="selectChat(chat)"
            :class="['flex items-center px-3 py-2 cursor-pointer transition-colors group',
                     activeChat && toStr(activeChat._id) === toStr(chat._id) ? 'bg-[#2a3942]' : 'hover:bg-[#202c33]']"
          >
            <div class="w-[49px] h-[49px] rounded-full overflow-hidden mr-3 shrink-0 bg-gray-600">
              <img :src="`https://ui-avatars.com/api/?name=${otherUser(chat).username}&background=random`" alt="avatar" class="w-full h-full object-cover" />
            </div>
            <div class="flex-1 border-b border-[#222d34] pb-2 pt-1 h-[60px] flex flex-col justify-center min-w-0">
              <div class="flex justify-between items-baseline mb-0.5">
                <h3 class="text-[#e9edef] text-[17px] font-normal truncate pr-2">{{ otherUser(chat).username }}</h3>
                <span class="text-[12px] whitespace-nowrap shrink-0"
                      :class="(unreadMap[toStr(chat._id)] ?? 0) > 0 ? 'text-[#00a884]' : 'text-[#8696a0]'"
                      v-if="chat.lastMessage">
                  {{ new Date(chat.lastMessage.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                </span>
              </div>
              <div class="flex justify-between items-center">
                <p class="text-[14px] text-[#8696a0] truncate">
                  <span v-if="chat.lastMessage?.type === 'audio'">🎤 Voice note</span>
                  <span v-else-if="chat.lastMessage?.type === 'image'">📷 Photo</span>
                  <span v-else-if="chat.lastMessage?.type === 'file'">📎 File</span>
                  <span v-else>{{ chat.lastMessage?.text || 'No messages yet' }}</span>
                </p>
                <span v-if="(unreadMap[toStr(chat._id)] ?? 0) > 0"
                      class="bg-[#00a884] text-[#111b21] text-[11px] font-bold px-1.5 rounded-full flex items-center justify-center min-w-[20px] h-[20px] shrink-0 ml-2">
                  {{ unreadMap[toStr(chat._id)] }}
                </span>
              </div>
            </div>
          </div>
        </template>

        <!-- New Chat — all users -->
        <div class="px-3 pt-3 pb-1 text-[11px] text-[#8696a0] uppercase tracking-widest">New Chat</div>
        <div
          v-for="user in users"
          :key="user._id"
          @click="selectUser(user)"
          class="flex items-center px-3 py-2 cursor-pointer hover:bg-[#202c33] transition-colors"
        >
          <div class="w-[49px] h-[49px] rounded-full overflow-hidden mr-3 shrink-0 bg-gray-600">
            <img :src="`https://ui-avatars.com/api/?name=${user.username}&background=random`" alt="avatar" class="w-full h-full object-cover" />
          </div>
          <div class="flex-1 border-b border-[#222d34] pb-2 pt-1 h-[60px] flex flex-col justify-center">
            <h3 class="text-[#e9edef] text-[17px] font-normal truncate">{{ user.username }}</h3>
            <p class="text-[14px] text-[#8696a0]">Tap to start a chat</p>
          </div>
        </div>

      </div>
    </div>

    <!-- ═══════════════ CHAT AREA ═══════════════ -->
    <div v-if="activeChat" class="flex-1 flex flex-col bg-[#0b141a] relative min-w-0">

      <!-- Chat Header -->
      <div class="bg-[#202c33] h-[59px] flex items-center px-4 justify-between shrink-0 absolute top-0 w-full z-10">
        <div class="flex items-center cursor-pointer flex-1 min-w-0">
          <div class="w-10 h-10 rounded-full overflow-hidden mr-4 shrink-0 bg-gray-600">
            <img :src="`https://ui-avatars.com/api/?name=${otherUser(activeChat).username}&background=random`" alt="avatar" class="w-full h-full object-cover" />
          </div>
          <div class="flex flex-col justify-center truncate">
            <h3 class="text-[#e9edef] text-[16px] leading-5 truncate">{{ otherUser(activeChat).username }}</h3>
            <p class="text-[13px] text-[#8696a0]">click here for contact info</p>
          </div>
        </div>
      </div>

      <!-- Messages -->
      <div
        ref="messagesContainer"
        class="flex-1 overflow-y-auto px-[5%] pt-[80px] pb-[70px] custom-scrollbar"
        style="background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png'); background-size: contain; background-repeat: repeat;"
      >
        <div class="flex flex-col gap-1 max-w-[800px] mx-auto">

          <div
            v-for="msg in messages"
            :key="msg._id || msg.createdAt"
            :class="['rounded-lg px-3 pt-2 pb-1.5 max-w-[65%] text-[14.2px] shadow-sm relative mb-1 break-words',
                     toStr(msg.senderId) === toStr(currentUser.id)
                       ? 'self-end bg-[#005c4b] text-[#e9edef] rounded-tr-none'
                       : 'self-start bg-[#202c33] text-[#e9edef] rounded-tl-none']"
          >
            <!-- Image -->
            <div v-if="msg.type === 'image'" class="mb-1">
              <img :src="msg.fileUrl" class="max-w-[240px] rounded-md" />
            </div>

            <!-- Audio -->
            <div v-else-if="msg.type === 'audio'" class="mb-1 w-[260px]">
              <audio controls class="w-full">
                <source :src="msg.fileUrl" />
                Your browser does not support audio playback.
              </audio>
            </div>

            <!-- File -->
            <div v-else-if="msg.type === 'file'" class="mb-1 p-2 bg-black/20 rounded-md flex items-center gap-2">
              <span class="material-icons text-[#aebac1]">description</span>
              <a :href="msg.fileUrl" target="_blank" class="underline text-[#aebac1] truncate">Download File</a>
            </div>

            <!-- Text -->
            <span v-if="msg.text" class="inline-block" :class="toStr(msg.senderId) === toStr(currentUser.id) ? 'pr-[65px] pb-[14px]' : 'pr-[50px] pb-[14px]'">
              {{ msg.text }}
            </span>
            <div v-else class="pb-3"></div>

            <!-- Timestamp + tick -->
            <div class="absolute bottom-1 right-2 flex items-center gap-1">
              <span class="text-[11px] text-[#8696a0]">
                {{ new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
              </span>
              <span v-if="toStr(msg.senderId) === toStr(currentUser.id)" class="material-icons text-[#53bdeb] text-[16px]">done_all</span>
            </div>
          </div>

        </div>
      </div>

      <!-- Emoji Picker -->
      <div v-if="showEmojiPicker" class="absolute bottom-[62px] left-4 z-20 shadow-2xl rounded-xl overflow-hidden border border-[#222d34]">
        <emoji-picker class="dark"></emoji-picker>
      </div>

      <!-- Input Bar -->
      <div class="bg-[#202c33] px-4 py-[10px] flex items-center gap-3 shrink-0 absolute bottom-0 w-full z-10">
        <button @click="showEmojiPicker = !showEmojiPicker" class="text-[#8696a0] hover:text-[#aebac1] transition-colors">
          <span class="material-icons text-[26px]">mood</span>
        </button>
        <button @click="triggerFileUpload" class="text-[#8696a0] hover:text-[#aebac1] transition-colors">
          <span class="material-icons text-[26px]">attach_file</span>
        </button>
        <input type="file" ref="fileInput" class="hidden" @change="handleFileUpload" />

        <div class="flex-1 bg-[#2a3942] rounded-lg min-h-[42px] flex items-center px-4">
          <input
            v-if="!isRecording"
            v-model="newMessage"
            @keyup.enter="sendMessage"
            type="text"
            placeholder="Type a message"
            class="bg-transparent border-none outline-none text-[#d1d7db] w-full text-[15px] placeholder:text-[#8696a0] py-2"
          />
          <span v-else class="text-[#f15c6d] animate-pulse text-sm">🎤 Recording… release to send</span>
        </div>

        <button v-if="newMessage.trim()" @click="sendMessage" class="text-[#00a884] hover:text-[#00c99e] transition-colors">
          <span class="material-icons text-[26px]">send</span>
        </button>
        <button
          v-else
          @mousedown="startRecording"
          @mouseup="stopRecording"
          @mouseleave="stopRecording"
          :class="isRecording ? 'text-[#f15c6d] animate-pulse' : 'text-[#8696a0]'"
          class="hover:text-[#aebac1] transition-colors"
        >
          <span class="material-icons text-[26px]">mic</span>
        </button>
      </div>
    </div>

    <!-- ═══════════════ EMPTY STATE ═══════════════ -->
    <div v-else class="flex-1 flex flex-col items-center justify-center bg-[#222e35] border-l border-[#222d34]">
      <div class="text-center px-8">
        <div class="w-48 h-48 rounded-full bg-[#2a3942] flex items-center justify-center mx-auto mb-8">
          <span class="material-icons text-[#8696a0] text-[96px]">chat</span>
        </div>
        <h1 class="text-[#e9edef] text-[32px] font-light mb-3">WhatsApp Web</h1>
        <p class="text-[#8696a0] text-[14px] leading-6 max-w-[400px] mx-auto">
          Send and receive messages without keeping your phone online.<br />
          Select a contact from the sidebar to start chatting.
        </p>
      </div>
      <div class="absolute bottom-10 flex items-center text-[#8696a0] text-[13px]">
        <span class="material-icons text-[14px] mr-1">lock</span> End-to-end encrypted
      </div>
    </div>

  </div>
</template>

<style>
.custom-scrollbar::-webkit-scrollbar       { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(134,150,160,.3); border-radius: 3px; }
.custom-scrollbar:hover::-webkit-scrollbar-thumb { background-color: rgba(134,150,160,.5); }
</style>
