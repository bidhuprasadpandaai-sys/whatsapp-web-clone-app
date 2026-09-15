# WhatsApp Web Clone App

A simple clone of WhatsApp Web built with modern web technologies.

## Overview

This repository contains the client and server components for a WhatsApp Web clone. The **client** directory holds the front‑end code, while the **server** directory contains the back‑end API and WebSocket logic.

## Getting Started

### Prerequisites
- Node.js (v18 or later)
- npm or yarn

### Setup
```bash
# Clone the repo
git clone <repo-url>
cd -whatsapp-web-clone-app

# Install dependencies for client and server
cd client && npm install && cd ..
cd server && npm install && cd ..
```

### Running the Application
```bash
# In one terminal, start the server
cd server && npm run dev

# In another terminal, start the client
cd client && npm run dev
```

The client will be available at `http://localhost:3000` and will connect to the server running on `http://localhost:5000` (or as configured).

## Features
- Real‑time messaging via WebSockets
- User authentication mock‑up
- Responsive UI with dark mode and modern styling

## Contributing
Feel free to open issues or submit pull requests. Follow the contribution guidelines and ensure code follows the project's linting and formatting rules.

## License
This project is licensed under the MIT License.
