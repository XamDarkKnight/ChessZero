/* net.js
 * Online play transport. Wraps PeerJS so the rest of the game only sees "a friend is connected, send/receive messages".
 *
 * How it connects: the host registers a short game code with the free public PeerJS matchmaking server.
 * The guest uses the same code to find the host, then the two browsers talk directly (WebRTC).
 * No chess data goes through a server of ours, and there is no account or database.
 *
 * Status values passed to onStatus(status, detail):
 *   connecting  reaching the matchmaking server or the host
 *   waiting     host is registered and waiting for the friend
 *   connected   both browsers are talking
 *   away        the friend dropped; the connection retries on its own
 *   not-found   guest could not find that game code
 *   full        the game already has two players
 *   error       something else went wrong (detail is a readable sentence)
 */
(function (root) {
  "use strict";

  var PREFIX = "wmchess-";
  var ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o/1/l/i to avoid mix-ups when reading a code aloud
  var HEARTBEAT_MS = 4000;
  var SILENCE_MS = 15000;

  function makeCode(length) {
    var out = "", bytes = new Uint8Array(length || 6);
    (root.crypto || root.msCrypto).getRandomValues(bytes);
    for (var i = 0; i < bytes.length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
  }

  function cleanCode(text) {
    return String(text || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  }

  function supported() {
    return typeof root.Peer === "function" && !!root.RTCPeerConnection;
  }

  // Tests can set window.CHESS_PEER_CONFIG to point at a private matchmaking server. Normal play leaves it unset.
  function peerOptions() {
    var o = root.CHESS_PEER_CONFIG;
    return o ? JSON.parse(JSON.stringify(o)) : {};
  }

  function create(handlers) {
    var net = {
      role: null, code: null,
      peer: null, conn: null,
      closed: false,
      status: "idle",
      lastSeen: 0, everConnected: false, directFails: 0,
      hbTimer: null, retryTimer: null, attempts: 0
    };

    function setStatus(status, detail) {
      net.status = status;
      if (handlers.onStatus) handlers.onStatus(status, detail || "");
    }

    function clearTimers() {
      clearInterval(net.hbTimer); clearTimeout(net.retryTimer);
      net.hbTimer = null; net.retryTimer = null;
    }

    function startHeartbeat() {
      clearInterval(net.hbTimer);
      net.hbTimer = setInterval(function () {
        if (!net.conn || !net.conn.open) return;
        try { net.conn.send({ t: "hb" }); } catch (e) { /* the close handler deals with it */ }
        if (Date.now() - net.lastSeen > SILENCE_MS) dropConnection();
      }, HEARTBEAT_MS);
    }

    function dropConnection() {
      var c = net.conn;
      net.conn = null;
      if (c) { try { c.close(); } catch (e) { /* already closed */ } }
      if (!net.closed) {
        setStatus("away");
        if (net.role === "guest") scheduleGuestRetry(2500);
      }
    }

    function attach(conn) {
      net.conn = conn;
      net.everConnected = true;
      net.lastSeen = Date.now();
      conn.on("data", function (msg) {
        net.lastSeen = Date.now();
        if (!msg || msg.t === "hb") return;
        if (msg.t === "full") { setStatus("full"); closeAll(true); return; }
        if (handlers.onMessage) handlers.onMessage(msg);
      });
      conn.on("close", function () {
        if (net.conn === conn) dropConnection();
      });
      conn.on("error", function () {
        if (net.conn === conn) dropConnection();
      });
      startHeartbeat();
      setStatus("connected");
      if (handlers.onOpen) handlers.onOpen(conn);
    }

    // If the matchmaking server never answers, say so instead of showing "Connecting" forever.
    function watchSignaling(peer) {
      setTimeout(function () {
        if (!net.closed && net.peer === peer && !peer.open && net.status !== "error") {
          setStatus("error", "Can't reach the matchmaking server (0.peerjs.com). It may be down, or your network or an ad/privacy blocker is blocking it. Try again in a few minutes, or on a different network.");
        }
      }, 15000);
    }

    /* ---------- host ---------- */

    net.host = function (code) {
      net.role = "host"; net.code = code; net.closed = false; net.attempts = 0;
      setStatus("connecting");
      openHostPeer();
    };

    function openHostPeer() {
      if (net.closed) return;
      var peer = new root.Peer(PREFIX + net.code, peerOptions());
      net.peer = peer;
      watchSignaling(peer);
      peer.on("open", function () {
        net.attempts = 0;
        if (!net.conn) setStatus("waiting");
      });
      peer.on("connection", function (conn) {
        if (net.conn && net.conn.open) {
          conn.on("open", function () {
            try { conn.send({ t: "full" }); } catch (e) { /* ignore */ }
            setTimeout(function () { try { conn.close(); } catch (e) { /* ignore */ } }, 400);
          });
          return;
        }
        // Wait for the data channel to open before announcing "connected".
        if (conn.open) attach(conn); else conn.on("open", function () { attach(conn); });
      });
      peer.on("disconnected", function () {
        if (!net.closed && net.peer === peer) { try { peer.reconnect(); } catch (e) { /* will be retried on error */ } }
      });
      peer.on("error", function (err) {
        if (net.closed) return;
        if (err.type === "unavailable-id") {
          // Our own previous session may still be registered for a few seconds after a refresh.
          if (++net.attempts <= 12) { try { peer.destroy(); } catch (e) { /* ignore */ } net.retryTimer = setTimeout(openHostPeer, 3000); return; }
          setStatus("error", "That game code is already in use. Create a new game instead.");
        } else if (err.type === "network" || err.type === "server-error" || err.type === "socket-error" || err.type === "socket-closed") {
          setStatus("error", "Can't reach the matchmaking server. Check your internet connection and try again.");
        } else if (err.type !== "peer-unavailable") {
          setStatus("error", "Connection problem (" + err.type + ").");
        }
      });
    }

    /* ---------- guest ---------- */

    net.join = function (code) {
      net.role = "guest"; net.code = code; net.closed = false; net.attempts = 0;
      setStatus("connecting");
      var peer = new root.Peer(undefined, peerOptions());
      net.peer = peer;
      watchSignaling(peer);
      peer.on("open", function () { connectToHost(); });
      peer.on("disconnected", function () {
        if (!net.closed && net.peer === peer) { try { peer.reconnect(); } catch (e) { /* ignore */ } }
      });
      peer.on("error", function (err) {
        if (net.closed) return;
        if (err.type === "peer-unavailable") {
          // Before the first connection, give up after a few tries. Afterwards the host may just be refreshing: keep trying.
          if (!net.everConnected && ++net.attempts >= 6) { setStatus("not-found"); return; }
          if (net.everConnected) setStatus("away");
          scheduleGuestRetry(3500);
        } else if (err.type === "network" || err.type === "server-error" || err.type === "socket-error" || err.type === "socket-closed") {
          setStatus("error", "Can't reach the matchmaking server. Check your internet connection and try again.");
        } else {
          setStatus("error", "Connection problem (" + err.type + ").");
        }
      });
    };

    function scheduleGuestRetry(ms) {
      clearTimeout(net.retryTimer);
      net.retryTimer = setTimeout(connectToHost, ms);
    }

    function connectToHost() {
      if (net.closed || (net.conn && net.conn.open)) return;
      if (!net.peer || net.peer.destroyed || net.peer.disconnected) { scheduleGuestRetry(2500); return; }
      if (net.status !== "away") setStatus("connecting");
      var conn = net.peer.connect(PREFIX + net.code, { reliable: true });
      var gaveUp = setTimeout(function () {
        if (!conn.open && !net.closed) {
          try { conn.close(); } catch (e) { /* ignore */ }
          if (!net.everConnected && ++net.directFails >= 2) {
            setStatus("error", "Found the game, but the two browsers couldn't connect directly. Your network (or your friend's) may block this. Try a different network, such as a phone hotspot, or turn off any VPN. Still retrying…");
          }
          scheduleGuestRetry(1500);
        }
      }, 12000);
      conn.on("open", function () { clearTimeout(gaveUp); net.attempts = 0; attach(conn); });
    }

    /* ---------- shared ---------- */

    net.send = function (msg) {
      if (!net.conn || !net.conn.open) return false;
      try { net.conn.send(msg); return true; } catch (e) { return false; }
    };

    net.connected = function () { return !!(net.conn && net.conn.open); };

    function closeAll(keepStatus) {
      net.closed = true;
      clearTimers();
      var c = net.conn, p = net.peer;
      net.conn = null; net.peer = null;
      if (c) { try { c.close(); } catch (e) { /* ignore */ } }
      if (p) { try { p.destroy(); } catch (e) { /* ignore */ } }
      if (!keepStatus) net.status = "idle";
    }

    net.leave = function (tellFriend) {
      if (tellFriend) net.send({ t: "bye" });
      closeAll(false);
    };

    return net;
  }

  var api = { create: create, makeCode: makeCode, cleanCode: cleanCode, supported: supported };
  root.ChessNet = api;
})(window);
