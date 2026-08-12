const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const crypto = require("crypto");

const publicFolder = path.resolve(__dirname);
const server = http.createServer(requestHandler);
const wss = new WebSocket.Server({ noServer: true });

const rooms = new Map();

function createRoomId() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function getMimeType(urlPath) {
  const ext = path.extname(urlPath).toLowerCase();
  const map = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
  };
  return map[ext] || "application/octet-stream";
}

function requestHandler(req, res) {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method Not Allowed");
    return;
  }

  let urlPath = req.url.split("?")[0];
  if (urlPath === "/") {
    urlPath = "/index.html";
  }

  const filePath = path.join(publicFolder, path.normalize(urlPath.replace(/^\//, "")));
  if (!filePath.startsWith(publicFolder)) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Invalid request");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      } else {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Server error");
      }
      return;
    }

    res.writeHead(200, { "Content-Type": getMimeType(filePath) });
    res.end(data);
  });
}

function broadcastRoom(roomId, message) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.players.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.players.length === 0) {
    rooms.delete(roomId);
  }
}

wss.on("connection", (ws) => {
  ws.roomId = null;
  ws.playerColor = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (error) {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON." }));
      return;
    }

    switch (msg.type) {
      case "createRoom": {
        const roomId = createRoomId();
        const state = msg.state || null;
        const room = {
          roomId,
          state,
          players: [ws]
        };

        ws.roomId = roomId;
        ws.playerColor = "w";
        rooms.set(roomId, room);

        ws.send(JSON.stringify({
          type: "roomCreated",
          roomId,
          players: room.players.length,
          state,
          message: "Room created. Waiting for opponent."
        }));
        break;
      }

      case "joinRoom": {
        const { roomId } = msg;
        const room = rooms.get(roomId);

        if (!room) {
          ws.send(JSON.stringify({ type: "error", message: "Room not found." }));
          return;
        }

        if (room.players.length >= 2) {
          ws.send(JSON.stringify({ type: "error", message: "Room is full." }));
          return;
        }

        room.players.push(ws);
        ws.roomId = roomId;
        ws.playerColor = "b";

        ws.send(JSON.stringify({
          type: "roomJoined",
          roomId,
          players: room.players.length,
          state: room.state,
          message: "You joined the room. You are Black."
        }));

        room.players.forEach((playerWs) => {
          if (playerWs !== ws && playerWs.readyState === WebSocket.OPEN) {
            playerWs.send(JSON.stringify({
              type: "roomUpdate",
              roomId,
              players: room.players.length,
              state: room.state,
              message: "Opponent joined the room."
            }));
          }
        });
        break;
      }

      case "move": {
        const { roomId, state } = msg;
        const room = rooms.get(roomId);
        if (!room) {
          ws.send(JSON.stringify({ type: "error", message: "Room not found." }));
          return;
        }

        room.state = state;
        broadcastRoom(roomId, {
          type: "roomUpdate",
          roomId,
          players: room.players.length,
          state,
          message: "Move synchronized."
        });
        break;
      }

      case "resetRoom": {
        const { roomId, state } = msg;
        const room = rooms.get(roomId);
        if (!room) {
          ws.send(JSON.stringify({ type: "error", message: "Room not found." }));
          return;
        }

        room.state = state;
        broadcastRoom(roomId, {
          type: "roomUpdate",
          roomId,
          players: room.players.length,
          state,
          message: "Room reset by owner."
        });
        break;
      }

      default:
        ws.send(JSON.stringify({ type: "error", message: "Unknown message type." }));
    }
  });

  ws.on("close", () => {
    const { roomId } = ws;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    room.players = room.players.filter((playerWs) => playerWs !== ws);
    room.players.forEach((playerWs) => {
      if (playerWs.readyState === WebSocket.OPEN) {
        playerWs.send(JSON.stringify({
          type: "roomUpdate",
          roomId,
          players: room.players.length,
          state: room.state,
          message: "Opponent disconnected."
        }));
      }
    });

    cleanupRoom(roomId);
  });
});

server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
