const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const crypto = require("crypto");

const publicFolder = path.resolve(__dirname);
const rooms = new Map();

function createRoomId() {
  let roomId;

  do {
    roomId = crypto.randomBytes(3).toString("hex").toUpperCase();
  } while (rooms.has(roomId));

  return roomId;
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  const mimeTypes = {
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

  return mimeTypes[extension] || "application/octet-stream";
}

function requestHandler(req, res) {
  if (req.method !== "GET") {
    res.writeHead(405, {
      "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("Method Not Allowed");
    return;
  }

  let urlPath;

  try {
    urlPath = decodeURIComponent(req.url.split("?")[0]);
  } catch {
    res.writeHead(400, {
      "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("Invalid URL");
    return;
  }

  if (urlPath === "/") {
    urlPath = "/index.html";
  }

  const relativePath = urlPath.replace(/^\/+/, "");
  const filePath = path.resolve(publicFolder, relativePath);

  if (
    filePath !== publicFolder &&
    !filePath.startsWith(publicFolder + path.sep)
  ) {
    res.writeHead(403, {
      "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8"
      });

      res.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    res.writeHead(200, {
      "Content-Type": getMimeType(filePath),
      "Cache-Control": "no-cache"
    });

    res.end(data);
  });
}

const server = http.createServer(requestHandler);

const wss = new WebSocket.Server({
  noServer: true
});

function safeSend(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcastRoom(roomId, message) {
  const room = rooms.get(roomId);

  if (!room) {
    return;
  }

  room.players.forEach(player => {
    safeSend(player.ws, message);
  });
}

function removePlayerFromRoom(ws) {
  const roomId = ws.roomId;

  if (!roomId) {
    return;
  }

  const room = rooms.get(roomId);

  if (!room) {
    ws.roomId = null;
    ws.playerColor = null;
    return;
  }

  room.players = room.players.filter(player => player.ws !== ws);

  if (room.players.length === 0) {
    rooms.delete(roomId);
  } else {
    broadcastRoom(roomId, {
      type: "roomUpdate",
      roomId,
      players: room.players.length,
      state: room.state,
      message: "Opponent disconnected."
    });
  }

  ws.roomId = null;
  ws.playerColor = null;
}

function getPlayerRoom(ws, roomId) {
  const room = rooms.get(roomId);

  if (!room) {
    safeSend(ws, {
      type: "error",
      message: "Room not found."
    });

    return null;
  }

  if (ws.roomId !== roomId) {
    safeSend(ws, {
      type: "error",
      message: "You are not a member of this room."
    });

    return null;
  }

  return room;
}

wss.on("connection", ws => {
  ws.roomId = null;
  ws.playerColor = null;
  ws.isAlive = true;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", rawMessage => {
    let message;

    try {
      message = JSON.parse(rawMessage.toString());
    } catch {
      safeSend(ws, {
        type: "error",
        message: "Invalid message."
      });

      return;
    }

    switch (message.type) {
      case "createRoom": {
        removePlayerFromRoom(ws);

        const roomId = createRoomId();

        const room = {
          roomId,
          state: message.state || null,
          players: [
            {
              ws,
              color: "w"
            }
          ]
        };

        rooms.set(roomId, room);

        ws.roomId = roomId;
        ws.playerColor = "w";

        safeSend(ws, {
          type: "roomCreated",
          roomId,
          players: 1,
          playerColor: "w",
          state: room.state,
          message: "Room created. Waiting for opponent."
        });

        break;
      }

      case "joinRoom": {
        const roomId = String(message.roomId || "")
          .trim()
          .toUpperCase();

        const room = rooms.get(roomId);

        if (!room) {
          safeSend(ws, {
            type: "error",
            message: "Room not found. Check the room code."
          });

          return;
        }

        if (room.players.length >= 2) {
          safeSend(ws, {
            type: "error",
            message: "Room is full."
          });

          return;
        }

        removePlayerFromRoom(ws);

        room.players.push({
          ws,
          color: "b"
        });

        ws.roomId = roomId;
        ws.playerColor = "b";

        safeSend(ws, {
          type: "roomJoined",
          roomId,
          players: room.players.length,
          playerColor: "b",
          state: room.state,
          message: "You joined as Black."
        });

        broadcastRoom(roomId, {
          type: "roomUpdate",
          roomId,
          players: room.players.length,
          state: room.state,
          message: "Both players are connected."
        });

        break;
      }

      case "move": {
        const roomId = String(message.roomId || "")
          .trim()
          .toUpperCase();

        const room = getPlayerRoom(ws, roomId);

        if (!room) {
          return;
        }

        if (room.players.length < 2) {
          safeSend(ws, {
            type: "error",
            message: "Wait for your opponent to join."
          });

          return;
        }

        if (!room.state || room.state.turn !== ws.playerColor) {
          safeSend(ws, {
            type: "error",
            message: "It is not your turn."
          });

          return;
        }

        if (!message.state || !Array.isArray(message.state.board)) {
          safeSend(ws, {
            type: "error",
            message: "Invalid game state."
          });

          return;
        }

        const expectedNextTurn =
          ws.playerColor === "w" ? "b" : "w";

        if (message.state.turn !== expectedNextTurn) {
          safeSend(ws, {
            type: "error",
            message: "Invalid turn change."
          });

          return;
        }

        room.state = message.state;

        broadcastRoom(roomId, {
          type: "roomUpdate",
          roomId,
          players: room.players.length,
          state: room.state,
          message: "Move synchronized."
        });

        break;
      }

      case "resetRoom": {
        const roomId = String(message.roomId || "")
          .trim()
          .toUpperCase();

        const room = getPlayerRoom(ws, roomId);

        if (!room) {
          return;
        }

        if (ws.playerColor !== "w") {
          safeSend(ws, {
            type: "error",
            message: "Only White can start a new game."
          });

          return;
        }

        if (!message.state || !Array.isArray(message.state.board)) {
          safeSend(ws, {
            type: "error",
            message: "Invalid reset state."
          });

          return;
        }

        room.state = message.state;

        broadcastRoom(roomId, {
          type: "roomUpdate",
          roomId,
          players: room.players.length,
          state: room.state,
          message: "A new game has started."
        });

        break;
      }

      case "leaveRoom": {
        removePlayerFromRoom(ws);

        safeSend(ws, {
          type: "roomLeft",
          message: "You left the room."
        });

        break;
      }

      default:
        safeSend(ws, {
          type: "error",
          message: "Unknown message type."
        });
    }
  });

  ws.on("close", () => {
    removePlayerFromRoom(ws);
  });

  ws.on("error", error => {
    console.error("WebSocket error:", error.message);
  });
});

server.on("upgrade", (request, socket, head) => {
  const requestUrl = new URL(
    request.url,
    `http://${request.headers.host || "localhost"}`
  );

  if (requestUrl.pathname !== "/ws") {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, ws => {
    wss.emit("connection", ws, request);
  });
});

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }

    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.on("close", () => {
  clearInterval(heartbeatInterval);
});

const PORT = Number(process.env.PORT) || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`ChessZero server running on port ${PORT}`);
});