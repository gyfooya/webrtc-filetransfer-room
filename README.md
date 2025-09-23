# WebRTC P2P File Transfer with Automatic Room Connection
A WebRTC-based peer-to-peer file transfer application with automatic connection when peers join the same room. Features a dedicated Node.js signaling server for robust room management.

## Features

- 🚀 **Automatic Connection**: Peers automatically connect when joining the same room
- 🏠 **Room-based System**: Join rooms by ID or generate random ones
- 📁 **P2P File Transfer**: Direct peer-to-peer file transfer without server storage
- 🔄 **Real-time Progress**: Live transfer progress with speed indicators
- 📱 **Responsive Design**: Works on desktop and mobile browsers
- 🛠 **Manual Fallback**: Traditional manual connection option available



## Security Considerations

- Files transfer directly between peers (not through server)
- Room IDs should be shared securely
- Use HTTPS/WSS in production

## Configuration
### Client Configuration

Edit the WebSocket URL in `index.html`:
```javascript
const wsUrl = 'ws://localhost:3001'; // Change for production
```

Edit the Stun server URL in `index.html`:
```javascript
iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
```
use custom Stun server (disable Turn, add IPv6only)
coturn package is a good starting point

