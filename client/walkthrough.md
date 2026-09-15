# Auth, Media & 2-Way Chat Implementation

I have fully implemented the requested features to turn this clone into a functioning real-time app! 

Here is what was accomplished:

## 1. Authentication & Routing
- Restructured the app using Vue Router.
- Added `LoginView.vue` and `SignupView.vue` with WhatsApp Web styling.
- Configured a Pinia auth store to handle JWT tokens and protect the chat route.
- If you aren't logged in, navigating to `localhost:5173/` automatically redirects you to `/login`.

## 2. Real-Time 2-Way Chat
- The sidebar now automatically fetches a list of all registered users (excluding yourself).
- Clicking a user creates or fetches a dedicated MongoDB chat room between you and that user.
- Socket.io now uses the specific `chatId` to emit messages, meaning you can open two incognito browser windows, log into two different accounts, and chat with each other in real-time!

## 3. Media & Emojis
- **Emojis**: Clicking the smiley face icon opens an emoji picker (powered by `emoji-picker-element`). Clicking an emoji inserts it directly into your message input!
- **Voice Notes**: Holding down the microphone icon activates your browser's microphone (`MediaRecorder`). Releasing the button automatically uploads the `.webm` audio to the backend and sends it as a playable audio message.
- **Attachments**: Clicking the paperclip icon opens a file dialog. Selecting an image displays it in the chat, and selecting a regular file displays a download link!
- **Backend**: Set up `multer` in Node.js to handle file uploads, saving them in `server/uploads` and serving them statically.

## How to Test
1. Make sure to restart both your `client` and `server` dev servers to pick up the new npm packages (`multer` and `emoji-picker-element`).
2. Open `http://localhost:5173/`. You'll be asked to sign up.
3. Sign up as `User A`.
4. Open a completely separate incognito window, navigate to `http://localhost:5173/`, and sign up as `User B`.
5. Start chatting! You can send text, attach images, or record voice notes back and forth between the two windows.
