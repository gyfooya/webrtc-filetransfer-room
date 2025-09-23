const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3001;

// Store rooms and their peers
const rooms = new Map();
const peers = new Map(); // peer id -> { ws, roomId, peerId }

class SignalingServer {
  constructor() {
    this.wss = new WebSocket.Server({ port: PORT });
    this.setupServer();
  }

  setupServer() {
    this.wss.on('connection', (ws) => {
      console.log('New WebSocket connection established');

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error('Error parsing message:', error);
          this.sendError(ws, 'Invalid JSON message');
        }
      });

      ws.on('close', () => {
        this.handleDisconnection(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.handleDisconnection(ws);
      });

      // Send welcome message
      this.sendMessage(ws, {
        type: 'server-info',
        message: 'Connected to signaling server',
        timestamp: Date.now()
      });
    });

    console.log(`🚀 WebRTC Signaling Server running on port ${PORT}`);
  }

  handleMessage(ws, message) {
    const { type, room, peerId } = message;

    console.log(`📨 Message: ${type} from peer ${peerId} in room ${room}`);

    switch (type) {
      case 'join-room':
        this.handleJoinRoom(ws, message);
        break;
      case 'leave-room':
        this.handleLeaveRoom(ws, message);
        break;
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        this.relayMessage(ws, message);
        break;
      default:
        console.warn('Unknown message type:', type);
        this.sendError(ws, `Unknown message type: ${type}`);
    }
  }

  handleJoinRoom(ws, message) {
    const { room, peerId } = message;

    if (!room || !peerId) {
      this.sendError(ws, 'Room and peerId are required');
      return;
    }

    // Remove peer from previous room if exists
    this.handleLeaveRoom(ws, message);

    // Add peer to new room
    if (!rooms.has(room)) {
      rooms.set(room, new Set());
    }

    const roomPeers = rooms.get(room);
    roomPeers.add(peerId);
    peers.set(peerId, { ws, roomId: room, peerId });

    console.log(`✅ Peer ${peerId} joined room ${room}. Room size: ${roomPeers.size}`);

    // Notify all peers in the room about the new peer (this will trigger reconnection)
    this.broadcastToRoom(room, {
      type: 'peer-joined',
      peerId: peerId,
      peerCount: roomPeers.size,
      timestamp: Date.now()
    }, peerId); // exclude the joining peer

    // Send current room status to the joining peer
    this.sendMessage(ws, {
      type: 'room-joined',
      room: room,
      peerId: peerId,
      peerCount: roomPeers.size,
      peers: Array.from(roomPeers).filter(id => id !== peerId),
      timestamp: Date.now()
    });

    // If there are other peers, send peer list for connection initiation
    if (roomPeers.size > 1) {
      const otherPeers = Array.from(roomPeers).filter(id => id !== peerId);
      this.sendMessage(ws, {
        type: 'peers-available',
        peers: otherPeers,
        room: room
      });

      // Also notify existing peers that they should reset their connections
      this.broadcastToRoom(room, {
        type: 'peer-reconnect-needed',
        newPeerId: peerId,
        peerCount: roomPeers.size,
        timestamp: Date.now()
      }, peerId);
    }
  }

  handleLeaveRoom(ws, message) {
    const { peerId } = message;

    if (!peerId || !peers.has(peerId)) {
      return;
    }

    const peerInfo = peers.get(peerId);
    const { roomId } = peerInfo;

    if (roomId && rooms.has(roomId)) {
      const roomPeers = rooms.get(roomId);
      roomPeers.delete(peerId);

      console.log(`❌ Peer ${peerId} left room ${roomId}. Room size: ${roomPeers.size}`);

      // Notify remaining peers
      this.broadcastToRoom(roomId, {
        type: 'peer-left',
        peerId: peerId,
        peerCount: roomPeers.size,
        timestamp: Date.now()
      });

      // Clean up empty room
      if (roomPeers.size === 0) {
        rooms.delete(roomId);
        console.log(`🗑️ Room ${roomId} deleted (empty)`);
      }
    }

    peers.delete(peerId);
  }

  handleDisconnection(ws) {
    // Find and remove the disconnected peer
    for (const [peerId, peerInfo] of peers.entries()) {
      if (peerInfo.ws === ws) {
        console.log(`🔌 Peer ${peerId} disconnected`);
        this.handleLeaveRoom(ws, { peerId });
        break;
      }
    }
  }

  relayMessage(senderWs, message) {
    const { targetPeer, room } = message;

    if (targetPeer && targetPeer !== 'broadcast') {
      // Direct message to specific peer
      const targetPeerInfo = peers.get(targetPeer);
      if (targetPeerInfo && targetPeerInfo.ws.readyState === WebSocket.OPEN) {
        this.sendMessage(targetPeerInfo.ws, message);
        console.log(`📤 Relayed ${message.type} to peer ${targetPeer}`);
      } else {
        console.warn(`❌ Target peer ${targetPeer} not found or disconnected`);
      }
    } else {
      // Broadcast to all peers in room except sender
      const senderPeerId = message.fromPeer;
      this.broadcastToRoom(room, message, senderPeerId);
      console.log(`📡 Broadcasted ${message.type} to room ${room}`);
    }
  }

  broadcastToRoom(roomId, message, excludePeerId = null) {
    if (!rooms.has(roomId)) return;

    const roomPeers = rooms.get(roomId);
    for (const peerId of roomPeers) {
      if (peerId === excludePeerId) continue;

      const peerInfo = peers.get(peerId);
      if (peerInfo && peerInfo.ws.readyState === WebSocket.OPEN) {
        this.sendMessage(peerInfo.ws, message);
      }
    }
  }

  sendMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendError(ws, error) {
    this.sendMessage(ws, {
      type: 'error',
      error: error,
      timestamp: Date.now()
    });
  }

  // Get server stats
  getStats() {
    return {
      connectedPeers: peers.size,
      activeRooms: rooms.size,
      roomDetails: Array.from(rooms.entries()).map(([roomId, peers]) => ({
        roomId,
        peerCount: peers.size,
        peers: Array.from(peers)
      }))
    };
  }
}

// Create and start server
const server = new SignalingServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down signaling server...');
  server.wss.close(() => {
    console.log('✅ Server shut down gracefully');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down signaling server...');
  server.wss.close(() => {
    console.log('✅ Server shut down gracefully');
    process.exit(0);
  });
});

// Log stats every 30 seconds
setInterval(() => {
  const stats = server.getStats();
  console.log('📊 Server Stats:', {
    peers: stats.connectedPeers,
    rooms: stats.activeRooms
  });
}, 30000);

module.exports = SignalingServer;
