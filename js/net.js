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

  /* Relay ("TURN") servers carry the game when the two browsers can't reach each other directly,
   * for example two computers on the same Wi-Fi whose router blocks them from talking.
   * js/config.js can set CHESS_TURN_API_URL to fetch working relay credentials (see README). */
  var relayIce = [], relayLoad = null, relayInfo = "none";
  function loadRelay() {
    if (relayLoad) return relayLoad;
    var url = root.CHESS_TURN_API_URL;
    if (!url || !root.fetch) { relayLoad = Promise.resolve(); return relayLoad; }
    relayLoad = Promise.race([
      root.fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (list) {
        if (Array.isArray(list) && list.length) { relayIce = list; relayInfo = "ok"; } else relayInfo = "bad";
      }).catch(function () { relayInfo = "bad"; }),
      new Promise(function (res) { setTimeout(function () { if (relayInfo === "none") relayInfo = "slow"; res(); }, 5000); })
    ]);
    return relayLoad;
  }
  // Relay servers pasted straight into js/config.js (the "configuration snippet" from metered.ca).
  function pastedIce() {
    var list = root.CHESS_ICE_SERVERS;
    return Array.isArray(list) ? list.filter(function (x) { return x && x.urls; }) : [];
  }
  function allIce() { return relayIce.concat(pastedIce(), DEFAULT_ICE); }

  // Tests can set window.CHESS_PEER_CONFIG to point at a private matchmaking server. Normal play leaves it unset.
  function peerOptions() {
    var o = root.CHESS_PEER_CONFIG;
    return o ? JSON.parse(JSON.stringify(o)) : { config: { iceServers: allIce() } };
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
      loadRelay().then(openHostPeer);
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
      loadRelay().then(function () { if (!net.closed) startGuestPeer(); });
    };

    function startGuestPeer() {
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

  /* ---------- direct mode: no matchmaking server ----------
   * The two players swap two short codes (for example over WhatsApp) and the browsers connect straight to each other.
   * On the same Wi-Fi this needs nothing from the internet. */
  var DEFAULT_ICE = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"], username: "peerjs", credential: "peerjsp" },
    { urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turn:openrelay.metered.ca:443?transport=tcp"],
      username: "openrelayproject", credential: "openrelayproject" } // free public relay; may or may not be up
  ];

  function iceConfig() {
    var c = root.CHESS_PEER_CONFIG && root.CHESS_PEER_CONFIG.config;
    return c || { iceServers: allIce() };
  }

  function createManual(handlers) {
    var net = { manual: true, role: null, pc: null, dc: null, closed: false, status: "idle" };

    function setStatus(status, detail) {
      net.status = status;
      if (handlers.onStatus) handlers.onStatus(status, detail || "");
    }
    function encode(desc) { return btoa(JSON.stringify({ t: desc.type, s: desc.sdp })); }
    function decode(text, want) {
      try {
        var o = JSON.parse(atob(String(text || "").replace(/\s+/g, "")));
        if (o && o.t === want && typeof o.s === "string") return { type: o.t, sdp: o.s };
      } catch (e) { /* fall through */ }
      return null;
    }
    function gathered(pc) {
      return new Promise(function (resolve) {
        if (pc.iceGatheringState === "complete") return resolve();
        var done = false;
        function finish() { if (!done) { done = true; resolve(); } }
        pc.addEventListener("icegatheringstatechange", function () { if (pc.iceGatheringState === "complete") finish(); });
        setTimeout(finish, 5000);
      });
    }
    function watch(pc) {
      pc.onconnectionstatechange = function () {
        if (net.closed) return;
        if (pc.connectionState === "failed") {
          setStatus("error", "The two browsers couldn't reach each other. Make sure you are on the same Wi-Fi. Guest or public Wi-Fi often blocks devices from talking to each other, and a VPN can too.");
        } else if (pc.connectionState === "disconnected" || pc.connectionState === "closed") {
          setStatus("away");
        }
      };
    }
    function wire(dc) {
      net.dc = dc;
      dc.onopen = function () { setStatus("connected"); if (handlers.onOpen) handlers.onOpen(dc); };
      dc.onmessage = function (e) {
        var msg; try { msg = JSON.parse(e.data); } catch (x) { return; }
        if (!msg || msg.t === "hb") return;
        if (handlers.onMessage) handlers.onMessage(msg);
      };
      dc.onclose = function () { if (!net.closed) setStatus("away"); };
    }

    // Host: resolves with the code to send to the friend.
    net.host = function () {
      net.role = "host";
      var pc;
      return loadRelay().then(function () {
        pc = net.pc = new root.RTCPeerConnection(iceConfig());
        watch(pc);
        wire(pc.createDataChannel("chess"));
        return pc.createOffer();
      }).then(function (o) { return pc.setLocalDescription(o); })
        .then(function () { return gathered(pc); })
        .then(function () { setStatus("waiting"); return encode(pc.localDescription); });
    };
    // Host: apply the friend's reply code.
    net.acceptAnswer = function (text) {
      var d = decode(text, "answer");
      if (!d) return Promise.reject(new Error("That isn't a reply code. Paste the whole code your friend sent back."));
      return net.pc.setRemoteDescription(d);
    };
    // Guest: resolves with the reply code to send back to the host.
    net.join = function (text) {
      net.role = "guest";
      var d = decode(text, "offer");
      if (!d) return Promise.reject(new Error("That isn't a game code. Paste the whole code your friend sent you."));
      var pc;
      return loadRelay().then(function () {
        pc = net.pc = new root.RTCPeerConnection(iceConfig());
        watch(pc);
        pc.ondatachannel = function (e) { wire(e.channel); };
        return pc.setRemoteDescription(d);
      }).then(function () { return pc.createAnswer(); })
        .then(function (a) { return pc.setLocalDescription(a); })
        .then(function () { return gathered(pc); })
        .then(function () { setStatus("waiting"); return encode(pc.localDescription); });
    };
    net.send = function (msg) {
      if (!net.dc || net.dc.readyState !== "open") return false;
      try { net.dc.send(JSON.stringify(msg)); return true; } catch (e) { return false; }
    };
    net.connected = function () { return !!(net.dc && net.dc.readyState === "open"); };
    net.leave = function (tellFriend) {
      if (tellFriend) net.send({ t: "bye" });
      net.closed = true;
      try { if (net.dc) net.dc.close(); } catch (e) { /* ignore */ }
      try { if (net.pc) net.pc.close(); } catch (e) { /* ignore */ }
      net.dc = null; net.pc = null; net.status = "idle";
    };
    return net;
  }

  /* ---------- "Test my connection" ---------- */
  function diagnose(log) {
    log(root.Peer ? "OK    Game library loaded" : "FAIL  Game library did not load. Re-upload the vendor folder to GitHub.");
    log(root.RTCPeerConnection ? "OK    This browser supports direct connections" : "FAIL  This browser can't do direct connections. Try Chrome, Edge, Firefox or Safari.");

    var server = new Promise(function (resolve) {
      var ws, done = false;
      function end(line) { if (!done) { done = true; clearTimeout(t); log(line); try { ws.close(); } catch (e) { /* ignore */ } resolve(); } }
      var t = setTimeout(function () { end("FAIL  Matchmaking server (0.peerjs.com) didn't answer in 8 seconds. It may be down or blocked on this network."); }, 8000);
      try { ws = new WebSocket("wss://0.peerjs.com/peerjs?key=peerjs&id=diag" + makeCode(8) + "&token=" + makeCode(8)); }
      catch (e) { end("FAIL  Matchmaking server can't be contacted from this page."); return; }
      ws.onopen = function () { end("OK    Matchmaking server reachable"); };
      ws.onerror = function () { end("FAIL  Matchmaking server (0.peerjs.com) is down or blocked on this network (try turning off ad blockers or a VPN)."); };
    });

    var ice = loadRelay().then(function () { return new Promise(function (resolve) {
      if (!root.RTCPeerConnection) return resolve();
      if (pastedIce().length) log("OK    Relay settings found in js/config.js (" + pastedIce().length + " entries)");
      if (relayInfo === "none") { if (!pastedIce().length) log("INFO  No relay set in js/config.js (see README, \"Relay\")."); }
      else if (relayInfo === "ok") log("OK    Relay key works (" + relayIce.length + " relay servers loaded)");
      else log("FAIL  The relay key in js/config.js didn't work. Check the address you pasted.");
      var types = {}, pc = new root.RTCPeerConnection({ iceServers: allIce() });
      var finished = false;
      var finish = function () {
        if (finished) return;
        finished = true;
        try { pc.close(); } catch (e) { /* ignore */ }
        var found = Object.keys(types);
        if (!found.length) log("FAIL  No network addresses found at all. Something is blocking WebRTC in this browser.");
        else {
          log("INFO  Address types found: " + found.join(", "));
          if (types.srflx || types.relay) log("OK    This network can reach the internet for direct connections");
          else log("WARN  Only local addresses found. Online play over the internet will likely fail here, but Direct mode on the same Wi-Fi can still work.");
          if (types.relay) log("OK    Relay reachable: games can connect even if your Wi-Fi blocks devices from seeing each other");
          else log("WARN  No relay reachable. If both computers are on the same Wi-Fi and won't connect, set up a relay key (README, \"Relay\").");
        }
        resolve();
      };
      pc.onicecandidate = function (e) {
        if (!e.candidate) return finish();
        var m = /typ (\w+)/.exec(e.candidate.candidate); if (m) types[m[1]] = 1;
      };
      pc.createDataChannel("t");
      pc.createOffer().then(function (o) { return pc.setLocalDescription(o); });
      setTimeout(finish, 6000);
    }); });
    return Promise.all([server, ice]);
  }

  var api = { create: create, createManual: createManual, diagnose: diagnose, makeCode: makeCode, cleanCode: cleanCode, supported: supported };
  root.ChessNet = api;
})(window);
