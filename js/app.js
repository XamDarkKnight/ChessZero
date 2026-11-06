/* app.js
 * Game controller and UI: board, clocks, pass-and-play, bots and online play.
 * Rules live in engine.js, the bots in ai.js, the connection in net.js.
 */
(function () {
  "use strict";

  var E = window.ChessEngine, AI = window.ChessAI, Net = window.ChessNet;
  var other = E.other, FILES = E.FILES;
  var $ = function (id) { return document.getElementById(id); };

  var GLYPH = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" };
  var TEXT_PRESENTATION = "︎"; // stops phones turning the pawn into an emoji
  var PIECE_NAME = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight", P: "pawn" };
  var CLOCK_CHOICES = [[0, "No clock"], [1, "1 minute"], [3, "3 minutes"], [5, "5 minutes"], [10, "10 minutes"], [15, "15 minutes"], [30, "30 minutes"]];
  var SESSION_MAX_AGE = 12 * 3600 * 1000;

  var G = {
    mode: "online",              // "online" | "local" | "bot"
    pos: null,                   // engine Position
    legalAll: [],                // legal moves for the side to move
    played: [],                  // [{ m, san, color, snap }]
    keys: [],                    // position keys for repetition counting
    selected: null,
    cursor: { r: 6, c: 4 },
    flipped: false,
    hints: true,
    result: null,                // { kind, winner } once the game is over
    myColor: "w",                // your side in online and bot games
    botId: "lebron",
    botThinking: false,
    botTimer: null,
    botToken: 0,
    pending: false,              // promotion dialog open
    clockMs: 0,                  // 0 = no clock
    clock: { w: 0, b: 0, active: null, last: 0, timer: null, flagTimer: null },
    online: null,                // set while an online game exists
    dialogCancel: null,
    noticeTimer: null
  };

  /* ---------- small helpers ---------- */

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem("wmchess." + key);
      if (value === null) localStorage.removeItem("wmchess." + key);
      else localStorage.setItem("wmchess." + key, value);
    } catch (e) { /* storage can be blocked; the game works without it */ }
    return null;
  }

  function fmtTime(ms) {
    ms = Math.max(0, Math.floor(ms));
    var total = Math.floor(ms / 1000), m = Math.floor(total / 60), s = total % 60;
    if (ms < 10000) return m + ":" + (s < 10 ? "0" : "") + s + "." + Math.floor((ms % 1000) / 100);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function pieceSpan(p) {
    return el("span", "piece " + (p[0] === "w" ? "white-piece" : "black-piece"), GLYPH[p[1]] + TEXT_PRESENTATION);
  }

  function colorName(c) { return c === "w" ? "White" : "Black"; }

  function nameFor(color) {
    if (G.mode === "online") return color === G.myColor ? "You" : "Your friend";
    if (G.mode === "bot") return color === G.myColor ? "You" : AI.getBot(G.botId).name;
    return colorName(color);
  }

  function winnerLine(color) {
    if (G.mode === "local") return colorName(color) + " wins!";
    return color === G.myColor ? "You win!" : nameFor(color) + " wins!";
  }

  function notify(text) {
    var n = $("notice");
    n.textContent = text; n.hidden = false;
    clearTimeout(G.noticeTimer);
    G.noticeTimer = setTimeout(function () { n.hidden = true; }, 6000);
  }

  function readClock(id) { return (parseFloat($(id).value) || 0) * 60 * 1000; }

  function linkFor(code) { return location.href.split("#")[0] + "#" + code; }

  function movesArray() {
    return G.played.map(function (p) { return [p.m.fr, p.m.fc, p.m.tr, p.m.tc, p.m.promo || ""]; });
  }

  /* ---------- game core ---------- */

  function refreshLegal() { G.legalAll = G.pos.legalMoves(); }

  function resetGame(clockMs) {
    stopClock();
    cancelBot();
    G.pos = new E.Position();
    G.played = []; G.keys = [G.pos.key()];
    G.selected = null; G.result = null; G.pending = false;
    G.clockMs = clockMs || 0;
    G.clock.w = G.clock.b = G.clockMs;
    G.clock.active = null;
    $("endOverlay").hidden = true;
    closeDialog();
    refreshLegal();
    if (G.clockMs) startClockLoop();
  }

  function canHumanMove() {
    if (G.result || G.pending || !G.pos) return false;
    if (G.mode === "local") return true;
    if (G.mode === "bot") return G.pos.turn === G.myColor && !G.botThinking;
    var o = G.online;
    return !!(o && o.started && o.connected && G.pos.turn === G.myColor);
  }

  function onSquare(r, c) {
    G.cursor = { r: r, c: c };
    if (!canHumanMove()) { renderBoard(); return; }
    var p = G.pos.board[r][c];
    if (G.selected) {
      var s = G.selected;
      var moves = G.legalAll.filter(function (m) { return m.fr === s.r && m.fc === s.c && m.tr === r && m.tc === c; });
      if (moves.length) { playHuman(moves); return; }
    }
    G.selected = (p && p[0] === G.pos.turn) ? { r: r, c: c } : null;
    renderBoard();
  }

  function playHuman(moves) {
    if (moves.length > 1 || moves[0].promo) askPromotion(moves);
    else commit(moves[0], "local");
  }

  // source: "local" (played on this screen), "remote" (friend), "bot", or "replay" (rebuilding a saved game)
  function commit(m, source, clk) {
    var mover = G.pos.turn;
    if (G.clockMs) tickClock();
    var snap = G.clockMs ? { w: G.clock.w, b: G.clock.b } : null;
    var san = G.pos.san(m, G.legalAll);
    G.pos.make(m);
    G.keys.push(G.pos.key());
    G.played.push({ m: m, san: san, color: mover, snap: snap });
    G.selected = null;
    refreshLegal();

    if (G.clockMs && source !== "replay") {
      if (clk) { G.clock.w = clk.w; G.clock.b = clk.b; }
      G.clock.active = G.pos.turn; // starts after White's first move
      G.clock.last = Date.now();
      clearTimeout(G.clock.flagTimer); G.clock.flagTimer = null;
    }
    if (G.online) { G.online.offerIn = false; G.online.offerOut = false; }

    if (m.cap && m.cap[1] === "Q" && source !== "replay") queenReaction(mover);
    var res = detectResult(mover);
    if (res) finish(res, source === "replay");
    else if (source !== "replay" && G.pos.inCheck(G.pos.turn)) showCheckToast();

    if (source === "local" && G.mode === "online") {
      sendNet({ t: "move", n: G.played.length, fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc, promo: m.promo || "",
                w: Math.round(G.clock.w), b: Math.round(G.clock.b) });
    }
    if (source !== "replay") {
      saveHostSession();
      renderAll();
      if (G.mode === "bot") scheduleBot();
    }
  }

  function detectResult(mover) {
    var pos = G.pos;
    if (G.legalAll.length === 0) {
      return pos.inCheck(pos.turn) ? { kind: "checkmate", winner: mover } : { kind: "stalemate", winner: null };
    }
    if (pos.insufficientMaterial()) return { kind: "insufficient", winner: null };
    if (pos.halfmove >= 100) return { kind: "fifty", winner: null };
    var key = G.keys[G.keys.length - 1], n = 0;
    for (var i = 0; i < G.keys.length; i++) if (G.keys[i] === key) n++;
    if (n >= 3) return { kind: "repetition", winner: null };
    return null;
  }

  function finish(res, silent) {
    if (G.result) return;
    G.result = res;
    G.clock.active = null;
    G.selected = null;
    cancelBot();
    clearHostSession();
    if (!silent) showEnd(res);
    renderAll();
  }

  function resultTitle(res) {
    return { checkmate: "CHECKMATE", stalemate: "STALEMATE", timeout: "TIME OUT", resign: "RESIGNED",
             draw: "DRAW AGREED", insufficient: "DRAW", fifty: "DRAW", repetition: "DRAW" }[res.kind] || "GAME OVER";
  }

  function resultMessage(res) {
    switch (res.kind) {
      case "checkmate": return winnerLine(res.winner);
      case "timeout": return nameFor(other(res.winner)) + " ran out of time. " + winnerLine(res.winner);
      case "resign": return nameFor(other(res.winner)) + " resigned. " + winnerLine(res.winner);
      case "stalemate": return "No legal moves, so it's a draw.";
      case "insufficient": return "Not enough pieces left to checkmate.";
      case "fifty": return "50 moves without a capture or pawn move.";
      case "repetition": return "The same position happened three times.";
      case "draw": return "Both players agreed to a draw.";
    }
    return "";
  }

  /* ---------- clocks ---------- */

  function startClockLoop() {
    if (!G.clock.timer) G.clock.timer = setInterval(function () { tickClock(); renderClocks(); }, 100);
  }

  function stopClock() {
    clearInterval(G.clock.timer); G.clock.timer = null;
    clearTimeout(G.clock.flagTimer); G.clock.flagTimer = null;
    G.clock.active = null;
  }

  function tickClock() {
    var c = G.clock;
    if (!c.active || G.result) return;
    var now = Date.now();
    c[c.active] -= now - c.last;
    c.last = now;
    if (c[c.active] <= 0) {
      var who = c.active;
      c[who] = 0;
      c.active = null;
      onFlag(who);
    }
  }

  function onFlag(color) {
    if (G.result) return;
    if (G.mode !== "online") { finish({ kind: "timeout", winner: other(color) }); return; }
    if (color === G.myColor) {
      sendNet({ t: "flag", color: color });
      finish({ kind: "timeout", winner: other(color) });
    } else {
      // Give the friend's last move a moment to arrive before calling their flag.
      clearTimeout(G.clock.flagTimer);
      G.clock.flagTimer = setTimeout(function () {
        G.clock.flagTimer = null;
        if (!G.result && G.clock[color] <= 0) finish({ kind: "timeout", winner: other(color) });
      }, 2500);
    }
  }

  function pauseClock() { tickClock(); G.clock.active = null; }

  function resumeClock() {
    if (G.clockMs && G.played.length && !G.result) {
      G.clock.active = G.pos.turn;
      G.clock.last = Date.now();
      startClockLoop();
    }
  }

  /* ---------- bot ---------- */

  function cancelBot() {
    G.botToken++;
    clearTimeout(G.botTimer); G.botTimer = null;
    G.botThinking = false;
  }

  function scheduleBot() {
    if (G.mode !== "bot" || G.result || G.pos.turn === G.myColor || G.botThinking) return;
    G.botThinking = true;
    renderAll();
    var token = ++G.botToken, bot = AI.getBot(G.botId);
    G.botTimer = setTimeout(function () {
      if (token !== G.botToken) return;
      var opts = {};
      for (var k in bot) opts[k] = bot[k];
      if (G.clockMs) opts.timeMs = Math.min(bot.timeMs, Math.max(80, G.clock[other(G.myColor)] / 25));
      var res = AI.think(G.pos, opts);
      if (token !== G.botToken) return;
      G.botThinking = false;
      if (!res) return;
      var m = G.pos.findMove(res.move.fr, res.move.fc, res.move.tr, res.move.tc, res.move.promo, G.legalAll);
      if (m) commit(m, "bot");
    }, 350); // lets the "thinking" message paint, and keeps instant replies from feeling jumpy
  }

  /* ---------- online ---------- */

  function sendNet(msg) { return !!(G.online && G.online.net && G.online.net.send(msg)); }

  function startOnline(o) {
    leaveOnline(false);
    resetGame(o.clockMs);
    G.mode = "online";
    G.myColor = o.myColor;
    G.flipped = G.myColor === "b";
    var online = G.online = {
      role: o.role, code: o.code, net: null, status: "connecting", detail: "",
      connected: false, started: false, friendLeft: false,
      offerIn: false, offerOut: false, rematchMine: false, rematchTheirs: false
    };
    var handlers = {
      onStatus: onNetStatus,
      onMessage: onNetMessage,
      onOpen: function () { if (online.role === "guest") online.net.send({ t: "hello" }); }
    };
    if (o.manual) {
      online.manual = true; online.status = "waiting"; online.outCode = ""; online.step = o.role === "host" ? "making" : "paste-offer";
      online.net = Net.createManual(handlers);
      if (o.role === "host") {
        online.net.host().then(function (code) { online.outCode = code; online.step = "send-offer"; renderAll(); },
          function () { online.status = "error"; online.detail = "Couldn't set up the direct connection in this browser."; renderAll(); });
      }
    } else {
      online.net = Net.create(handlers);
      if (o.role === "host") { saveHostSession(); online.net.host(o.code); }
      else online.net.join(o.code);
    }
    renderAll();
  }

  function leaveOnline(tellFriend) {
    var o = G.online;
    if (!o) return;
    if (o.net) o.net.leave(tellFriend);
    G.online = null;
    if (o.role === "host") clearHostSession();
  }

  function createOnlineGame() {
    var choice = $("selColorOnline").value;
    var color = choice === "random" ? (Math.random() < 0.5 ? "w" : "b") : choice;
    var code = store("room");
    if (!code || !/^[a-z0-9]{4,12}$/.test(code)) { code = Net.makeCode(8); store("room", code); } // same link every time
    startOnline({ role: "host", code: code, myColor: color, clockMs: readClock("selClockOnline") });
  }

  function onNetStatus(status, detail) {
    var o = G.online;
    if (!o) return;
    var was = o.connected;
    o.status = status; o.detail = detail || "";
    o.connected = status === "connected";
    if (was && !o.connected) pauseClock();
    renderAll();
  }

  function sendWelcome() {
    sendNet({ t: "welcome", you: other(G.myColor), clockMs: G.clockMs, moves: movesArray(),
              w: Math.round(G.clock.w), b: Math.round(G.clock.b), result: G.result });
  }

  function replayMoves(list) {
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      var m = G.pos.findMove(x[0], x[1], x[2], x[3], x[4] || null, G.legalAll);
      if (!m) return false;
      commit(m, "replay");
    }
    return true;
  }

  function applyWelcome(msg) {
    var o = G.online;
    resetGame(msg.clockMs || 0);
    G.myColor = msg.you === "b" ? "b" : "w";
    G.flipped = G.myColor === "b";
    if (!Array.isArray(msg.moves) || !replayMoves(msg.moves)) { notify("Couldn't load the game from your friend. Reload the page to retry."); return; }
    if (G.clockMs) { G.clock.w = msg.w; G.clock.b = msg.b; }
    if (msg.result && !G.result) finish(msg.result, true);
    o.started = true;
    o.offerIn = o.offerOut = false;
    resumeClock();
    renderAll();
  }

  function resyncWithFriend() {
    var o = G.online;
    if (!o) return;
    if (o.role === "host") sendWelcome(); else sendNet({ t: "sync" });
  }

  function onNetMessage(msg) {
    var o = G.online;
    if (!o || !msg || typeof msg.t !== "string") return;
    switch (msg.t) {
      case "hello":
        if (o.role !== "host") return;
        o.started = true; o.friendLeft = false;
        sendWelcome();
        resumeClock();
        renderAll();
        break;
      case "welcome":
        if (o.role === "guest") applyWelcome(msg);
        break;
      case "sync":
        if (o.role === "host") sendWelcome();
        break;
      case "move":
        if (G.result || !o.started) return;
        if (msg.n !== G.played.length + 1 || G.pos.turn === G.myColor) { resyncWithFriend(); return; }
        var m = G.pos.findMove(msg.fr, msg.fc, msg.tr, msg.tc, msg.promo || null, G.legalAll);
        if (!m) { resyncWithFriend(); return; }
        commit(m, "remote", G.clockMs ? { w: msg.w, b: msg.b } : null);
        break;
      case "resign":
        finish({ kind: "resign", winner: G.myColor });
        break;
      case "flag":
        finish({ kind: "timeout", winner: other(msg.color === "b" ? "b" : "w") });
        break;
      case "draw-offer":
        if (!G.result) { o.offerIn = true; renderAll(); }
        break;
      case "draw-accept":
        if (o.offerOut && !G.result) finish({ kind: "draw", winner: null });
        break;
      case "draw-decline":
        o.offerOut = false; notify("Your friend declined the draw."); renderAll();
        break;
      case "rematch":
        o.rematchTheirs = true;
        if (o.role === "host" && o.rematchMine) startRematch(); else renderAll();
        break;
      case "newgame":
        if (o.role !== "guest") return;
        resetGame(msg.clockMs || 0);
        G.myColor = msg.you === "b" ? "b" : "w";
        G.flipped = G.myColor === "b";
        o.started = true; o.rematchMine = o.rematchTheirs = false; o.offerIn = o.offerOut = false;
        renderAll();
        break;
      case "react":
        if (STICKERS.indexOf(msg.e) >= 0) showReaction(msg.e, "");
        break;
      case "bye":
        o.friendLeft = true; notify("Your friend left the game."); renderAll();
        break;
    }
  }

  function requestRematch() {
    var o = G.online;
    if (!o || !G.result) return;
    o.rematchMine = true;
    sendNet({ t: "rematch" });
    if (o.role === "host" && o.rematchTheirs) startRematch(); else renderAll();
  }

  function startRematch() { // host only: colours swap
    var o = G.online;
    var hostColor = other(G.myColor);
    var clockMs = G.clockMs;
    resetGame(clockMs);
    G.myColor = hostColor;
    G.flipped = hostColor === "b";
    o.rematchMine = o.rematchTheirs = false; o.offerIn = o.offerOut = false;
    sendNet({ t: "newgame", you: other(hostColor), clockMs: clockMs });
    saveHostSession();
    renderAll();
  }

  function resignOrDraw(kind) {
    var o = G.online;
    if (kind === "resign") {
      if (G.mode === "online") sendNet({ t: "resign" });
      finish({ kind: "resign", winner: other(G.myColor) });
    } else if (kind === "offer" && o) {
      o.offerOut = true; sendNet({ t: "draw-offer" }); renderAll();
    } else if (kind === "accept" && o) {
      o.offerIn = false; sendNet({ t: "draw-accept" }); finish({ kind: "draw", winner: null });
    } else if (kind === "decline" && o) {
      o.offerIn = false; sendNet({ t: "draw-decline" }); renderAll();
    }
  }

  /* The host can refresh the page and carry on: the game is kept in this browser for a while. */
  function saveHostSession() {
    var o = G.online;
    if (!o || o.role !== "host" || o.manual || G.result) return;
    store("session", JSON.stringify({ code: o.code, myColor: G.myColor, clockMs: G.clockMs, moves: movesArray(),
                                      w: G.clock.w, b: G.clock.b, ts: Date.now() }));
  }

  function clearHostSession() { store("session", null); }

  function loadHostSession() {
    try {
      var s = JSON.parse(store("session") || "null");
      if (s && s.code && Date.now() - s.ts < SESSION_MAX_AGE) return s;
    } catch (e) { /* ignore */ }
    return null;
  }

  function resumeHostSession(s) {
    startOnline({ role: "host", code: s.code, myColor: s.myColor, clockMs: s.clockMs });
    if (!replayMoves(s.moves || [])) { notify("The saved game couldn't be restored."); clearHostSession(); return; }
    if (G.clockMs) { G.clock.w = s.w; G.clock.b = s.b; G.clock.active = null; }
    renderAll();
  }

  /* ---------- reactions ---------- */

  var QUEEN_WIN = [["\uD83D\uDE08", "QUEEN DOWN!"], ["\uD83E\uDD21", "WHERE'S YOUR QUEEN?"], ["\uD83D\uDC80", "RIP QUEEN"],
                   ["\uD83D\uDE0E", "THANKS FOR THE QUEEN"], ["\uD83D\uDDFF", "NO QUEEN, NO PROBLEM"], ["\uD83D\uDD25", "QUEEN SLAIN"]];
  var QUEEN_LOSE = [["\uD83D\uDE2D", "MY QUEEN!!"], ["\uD83E\uDD2F", "HOW DID I MISS THAT?!"], ["\uD83D\uDC80", "QUEEN GONE"],
                    ["\uD83E\uDEE0", "WELL, THAT HURT"], ["\uD83D\uDE24", "REVENGE TIME"], ["\uD83E\uDD72", "IT'S FINE. I'M FINE."]];
  var QUEEN_NEUTRAL = [["\uD83D\uDC80", "QUEEN DOWN!"], ["\uD83D\uDE31", "NOT THE QUEEN!"], ["\uD83E\uDD21", "OOPS, QUEEN GONE"], ["\uD83D\uDD25", "QUEEN SLAIN"]];
  var STICKERS = ["\uD83D\uDE02", "\uD83D\uDC80", "\uD83E\uDD21", "\uD83D\uDE2D", "\uD83D\uDD25", "\uD83D\uDDFF", "\uD83D\uDE08", "\uD83E\uDEE1"];
  var reactTimer = null, lastSticker = 0;

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function showReaction(face, text) {
    var box = $("reaction"), rain = $("rain");
    rain.textContent = "";
    for (var i = 0; i < 16; i++) {
      var d = el("span", "rain-item", face);
      d.style.left = Math.random() * 96 + "%";
      d.style.fontSize = 28 + Math.random() * 36 + "px";
      d.style.animationDuration = 1.6 + Math.random() * 1.4 + "s";
      d.style.animationDelay = Math.random() * 0.6 + "s";
      rain.appendChild(d);
    }
    $("rFace").textContent = face;
    $("rText").textContent = text || "";
    box.hidden = false;
    // restart the CSS animations
    var f = $("rFace"), t = $("rText");
    f.style.animation = "none"; t.style.animation = "none"; void f.offsetWidth; f.style.animation = ""; t.style.animation = "";
    clearTimeout(reactTimer);
    reactTimer = setTimeout(function () { box.hidden = true; rain.textContent = ""; }, 3000);
  }

  function queenReaction(capturer) {
    var set = G.mode === "local" ? QUEEN_NEUTRAL : (capturer === G.myColor ? QUEEN_WIN : QUEEN_LOSE);
    var r = pick(set);
    showReaction(r[0], r[1]);
    var b = $("board");
    b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake");
  }

  function sendSticker(e) {
    if (Date.now() - lastSticker < 1200 || STICKERS.indexOf(e) < 0) return;
    lastSticker = Date.now();
    if (sendNet({ t: "react", e: e })) showReaction(e, "");
  }

  /* ---------- dialogs and overlays ---------- */

  function openDialog(title, body, buttons, onCancel) {
    $("dlgTitle").textContent = title;
    var b = $("dlgBody"); b.textContent = "";
    [].concat(body).forEach(function (n) { b.appendChild(typeof n === "string" ? el("p", "", n) : n); });
    var bt = $("dlgBtns"); bt.textContent = "";
    buttons.forEach(function (d) {
      var x = el("button", "btn " + (d.kind || ""), d.label);
      x.type = "button";
      x.onclick = function () { closeDialog(true); if (d.onClick) d.onClick(); };
      bt.appendChild(x);
    });
    G.dialogCancel = onCancel || null;
    $("dialog").hidden = false;
    var first = $("dlgBody").querySelector("button") || bt.querySelector("button");
    if (first) first.focus();
  }

  function closeDialog(handled) {
    if ($("dialog").hidden) return;
    $("dialog").hidden = true;
    var cancel = G.dialogCancel;
    G.dialogCancel = null;
    if (!handled && cancel) cancel();
  }

  function confirmDialog(title, text, yesLabel, onYes, danger) {
    openDialog(title, text, [
      { label: "Cancel", kind: "ghost" },
      { label: yesLabel, kind: danger ? "danger" : "primary", onClick: onYes }
    ]);
  }

  function askPromotion(moves) {
    var color = G.pos.turn, row = el("div", "promo-row");
    G.pending = true;
    ["Q", "R", "B", "N"].forEach(function (t) {
      var b = el("button", "promo-btn");
      b.type = "button";
      b.appendChild(pieceSpan(color + t));
      b.appendChild(el("span", "name", PIECE_NAME[t]));
      b.onclick = function () {
        closeDialog(true);
        G.pending = false;
        commit(moves.filter(function (x) { return x.promo === t; })[0], "local");
      };
      row.appendChild(b);
    });
    openDialog("Promote your pawn", [row], [{ label: "Cancel", kind: "ghost", onClick: function () { G.pending = false; renderAll(); } }],
               function () { G.pending = false; renderAll(); });
  }

  function showEnd(res) {
    $("endTitle").textContent = resultTitle(res);
    $("endMessage").textContent = resultMessage(res);
    $("endOverlay").hidden = false;
    updateEndButton();
    $("btnEndPrimary").focus();
  }

  function updateEndButton() {
    var b = $("btnEndPrimary"), o = G.online;
    if (G.mode !== "online") { b.textContent = "Play again"; b.disabled = false; return; }
    if (!o || !o.connected) { b.textContent = "Friend is offline"; b.disabled = true; return; }
    if (o.rematchMine) { b.textContent = "Waiting for friend…"; b.disabled = true; return; }
    b.textContent = o.rematchTheirs ? "Accept rematch" : "Rematch"; b.disabled = false;
  }

  function showCheckToast() {
    var t = $("checkToast");
    t.classList.remove("show");
    void t.offsetWidth;
    t.classList.add("show");
  }

  /* ---------- rendering ---------- */

  function renderAll() {
    renderBoard(); renderBars(); renderStatus(); renderMoves(); renderControls(); renderOnlinePanel(); renderOffer();
    if (!$("endOverlay").hidden) updateEndButton();
  }

  function renderBoard() {
    var boardEl = $("board"), pos = G.pos;
    boardEl.textContent = "";
    var last = G.played.length ? G.played[G.played.length - 1].m : null;
    var checkKing = pos.inCheck(pos.turn) ? pos.kings[pos.turn] : null;
    var targets = {};
    if (G.selected && G.hints && canHumanMove()) {
      G.legalAll.forEach(function (m) {
        if (m.fr === G.selected.r && m.fc === G.selected.c) targets[m.tr + "," + m.tc] = m.cap ? "capture" : "legal";
      });
    }
    for (var i = 0; i < 64; i++) {
      var dr = Math.floor(i / 8), dc = i % 8;
      var r = G.flipped ? 7 - dr : dr, c = G.flipped ? 7 - dc : dc;
      var p = pos.board[r][c];
      var sq = el("button", "sq " + ((r + c) % 2 ? "dark" : "light"));
      sq.type = "button"; sq.tabIndex = -1;
      sq.dataset.r = r; sq.dataset.c = c;
      if (last && ((last.fr === r && last.fc === c) || (last.tr === r && last.tc === c))) sq.classList.add("last");
      if (G.selected && G.selected.r === r && G.selected.c === c) sq.classList.add("selected");
      var t = targets[r + "," + c];
      if (t) sq.classList.add(t);
      if (checkKing && checkKing[0] === r && checkKing[1] === c) sq.classList.add("check");
      if (G.cursor.r === r && G.cursor.c === c) sq.classList.add("cursor");
      if (p) sq.appendChild(pieceSpan(p));
      if (dc === 0) sq.appendChild(el("span", "coord rank", String(8 - r)));
      if (dr === 7) sq.appendChild(el("span", "coord file", FILES[c]));
      sq.setAttribute("aria-label", E.sqName(r, c) + ", " + (p ? colorName(p[0]).toLowerCase() + " " + PIECE_NAME[p[1]] : "empty"));
      boardEl.appendChild(sq);
    }
  }

  function renderBars() {
    var topColor = G.flipped ? "w" : "b";
    fillBar("Top", topColor);
    fillBar("Bottom", other(topColor));
  }

  function fillBar(which, color) {
    var bar = $("bar" + which);
    $("name" + which).textContent = nameFor(color) + (G.mode === "local" ? "" : " · " + colorName(color));
    bar.classList.toggle("active", !G.result && G.pos.turn === color && (G.mode !== "online" || (G.online && G.online.started)));
    var dot = $("dot" + which), o = G.online;
    dot.hidden = !(G.mode === "online" && o && color !== G.myColor);
    dot.classList.toggle("on", !!(o && o.connected && o.started));
    dot.title = o && o.connected ? "Connected" : "Not connected";
    $("clock" + which).hidden = !G.clockMs;
    renderClocks();
  }

  function renderClocks() {
    ["Top", "Bottom"].forEach(function (which) {
      var color = (which === "Top") === G.flipped ? "w" : "b";
      var c = $("clock" + which);
      if (c.hidden) return;
      c.textContent = fmtTime(G.clock[color]);
      c.classList.toggle("low", G.clock[color] < 10000);
    });
  }

  function statusText() {
    var pos = G.pos, o = G.online;
    if (G.result) return resultTitle(G.result).charAt(0) + resultTitle(G.result).slice(1).toLowerCase() + ". " + resultMessage(G.result);
    var chk = pos.inCheck(pos.turn) ? " Check!" : "";
    if (G.mode === "online") {
      if (!o) return "Create a game and send your friend the link.";
      if (o.status === "not-found") return "Couldn't find that game. Ask your friend to keep their page open, then reload this page.";
      if (o.status === "full") return "This game already has two players.";
      if (o.status === "error") return o.detail;
      if (o.friendLeft) return "Your friend left the game.";
      if (!o.started) {
        if (o.manual) return o.role === "host" ? "Send your friend the code above, then paste their reply code." : "Paste the code your friend sent you, then send back your reply code.";
        return o.role === "host" ? "Waiting for your friend to open the link…" : "Connecting to the game…";
      }
      if (!o.connected) return o.manual ? "The direct connection was lost. Leave the game and set up a new one." : "Your friend is disconnected. The game waits for them to come back…";
      return (pos.turn === G.myColor ? "Your move." : "Your friend's move.") + chk;
    }
    if (G.mode === "bot") {
      if (G.botThinking) return AI.getBot(G.botId).name + " is thinking…";
      return (pos.turn === G.myColor ? "Your move." : AI.getBot(G.botId).name + " to move.") + chk;
    }
    return colorName(pos.turn) + " to move." + chk;
  }

  function renderStatus() {
    var text = statusText();
    $("status").textContent = text;
    var mine = G.mode === "online" && G.online && G.online.connected && !G.result && G.pos.turn === G.myColor;
    document.title = (mine ? "● Your move — " : "") + "Multiplayer Chess";
  }

  function renderMoves() {
    var box = $("moves");
    box.textContent = "";
    if (!G.played.length) { box.appendChild(el("div", "empty", "Moves will appear here.")); return; }
    for (var i = 0; i < G.played.length; i += 2) {
      var row = el("div", "mv");
      row.appendChild(el("span", "n", (i / 2 + 1) + "."));
      row.appendChild(el("span", "", G.played[i].san));
      row.appendChild(el("span", "", G.played[i + 1] ? G.played[i + 1].san : ""));
      box.appendChild(row);
    }
    box.scrollTop = box.scrollHeight;
  }

  var SUBTITLES = {
    online: "Play a friend on separate computers. Share a link, no sign-up.",
    local: "Two players, one screen. Legal chess moves only.",
    bot: "Play a bot with its own style and strength."
  };

  function renderControls() {
    var m = G.mode, o = G.online, inProgress = !G.result;
    $("subtitle").textContent = SUBTITLES[m];
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
      t.setAttribute("aria-selected", t.dataset.mode === m ? "true" : "false");
    });
    $("cfgOnline").hidden = m !== "online";
    $("cfgLocal").hidden = m !== "local";
    $("cfgBot").hidden = m !== "bot";
    $("btnUndo").hidden = m === "online";
    $("btnUndo").disabled = !G.played.length;
    $("btnDraw").hidden = m !== "online";
    $("btnDraw").disabled = !(o && o.started && o.connected && inProgress && !o.offerOut && G.played.length > 0);
    $("btnResign").hidden = m === "local";
    $("btnResign").disabled = m === "bot" ? !inProgress : !(o && o.started && inProgress);
    $("stickers").hidden = !(m === "online" && o && o.started);
    $("btnNewLink").hidden = !store("room");
    $("btnHints").textContent = "Hints: " + (G.hints ? "on" : "off");
    $("btnHints").classList.toggle("on", G.hints);
    var bot = AI.getBot($("selBot").value);
    $("botCard").textContent = "";
    $("botCard").appendChild(document.createTextNode(bot.name));
    $("botCard").appendChild(el("small", "", bot.title));
    $("botCard").appendChild(el("em", "", "Level: " + bot.level));
  }

  function renderOnlinePanel() {
    var o = G.online, live = G.mode === "online" && !!o;
    $("onlineSetup").hidden = live;
    $("onlineLive").hidden = !live;
    if (!live) return;
    var dot = $("connDot"), text = $("connText");
    var cls = "wait", msg = "Connecting…";
    if (o.status === "waiting") msg = "Waiting for your friend…";
    if (o.status === "connected") { cls = "ok"; msg = o.started ? "Friend connected" : "Connecting to your friend…"; }
    if (o.status === "away") msg = "Friend disconnected. Waiting…";
    if (o.status === "not-found" || o.status === "full" || o.status === "error") { cls = "bad"; msg = o.status === "full" ? "Game is full" : o.status === "not-found" ? "Game not found" : "Connection problem"; }
    dot.className = "conn-dot " + cls;
    text.textContent = msg;
    var showLink = o.role === "host" && !o.manual && !(o.started && o.connected && G.played.length > 0);
    $("linkBox").hidden = !showLink;
    if (showLink) $("linkInput").value = linkFor(o.code);
    renderManual();
  }

  function renderManual() {
    var o = G.online, box = $("manualBox");
    var show = !!(o && o.manual && !o.started && o.status !== "error" && o.status !== "connected");
    box.hidden = !show;
    if (!show) return;
    var out = o.step === "send-offer" || o.step === "send-answer";
    var inp = o.step === "send-offer" || o.step === "paste-offer";
    $("manualOutWrap").hidden = !out;
    $("manualInWrap").hidden = !inp;
    if (out && $("manualOut").value !== o.outCode) $("manualOut").value = o.outCode;
    var hint = { making: "Making your code…",
                 "send-offer": "Step 1: copy this code and send it to your friend. Step 2: paste the reply code they send back, then press Connect.",
                 "paste-offer": "Paste the code your friend sent you, then press Make reply code.",
                 "send-answer": "Now send this reply code back to your friend. The game starts as soon as they press Connect." }[o.step];
    $("manualHint").textContent = hint || "";
    $("manualInLabel").textContent = o.step === "send-offer" ? "Paste your friend's reply code here" : "Paste your friend's code here";
    $("btnManualGo").textContent = o.step === "send-offer" ? "Connect" : "Make reply code";
  }

  function manualGo() {
    var o = G.online;
    if (!o || !o.manual) return;
    var text = $("manualIn").value;
    if (o.step === "send-offer") {
      o.net.acceptAnswer(text).then(function () { notify("Connecting…"); $("manualIn").value = ""; },
        function (e) { notify(e.message || "That code didn't work."); });
    } else if (o.step === "paste-offer") {
      o.step = "making"; renderAll();
      o.net.join(text).then(function (code) { o.outCode = code; o.step = "send-answer"; $("manualIn").value = ""; renderAll(); },
        function (e) { o.step = "paste-offer"; renderAll(); notify(e.message || "That code didn't work."); });
    }
  }

  function startDirect(role) {
    var choice = $("selColorOnline").value;
    var color = choice === "random" ? (Math.random() < 0.5 ? "w" : "b") : choice;
    startOnline({ role: role, code: "direct", myColor: role === "host" ? color : "b", clockMs: role === "host" ? readClock("selClockOnline") : 0, manual: true });
  }

  function runDiagnostics() {
    var out = $("diagOut"), btn = $("btnDiag");
    out.hidden = false; out.textContent = "Testing… (up to 10 seconds)\n"; btn.disabled = true;
    Net.diagnose(function (line) { out.textContent += line + "\n"; }).then(function () {
      out.textContent += "Done. If you ask for help, send a screenshot of this box.\n"; btn.disabled = false;
    });
  }

  function renderOffer() {
    var bar = $("offerBar"), o = G.online;
    bar.textContent = "";
    var add = function (text, buttons) {
      bar.appendChild(el("span", "", text));
      buttons.forEach(function (b) {
        var x = el("button", "btn " + (b.kind || ""), b.label);
        x.type = "button"; x.onclick = b.onClick;
        bar.appendChild(x);
      });
    };
    var saved = G.mode === "online" && !o ? loadHostSession() : null;
    if (saved) {
      add("You have an online game from earlier.", [
        { label: "Resume", kind: "good", onClick: function () { resumeHostSession(saved); } },
        { label: "Discard", kind: "ghost", onClick: function () { clearHostSession(); renderOffer(); } }
      ]);
    } else if (o && o.offerIn && !G.result) {
      add("Your friend offers a draw.", [
        { label: "Accept", kind: "good", onClick: function () { resignOrDraw("accept"); } },
        { label: "Decline", kind: "ghost", onClick: function () { resignOrDraw("decline"); } }
      ]);
    } else if (o && o.offerOut && !G.result) {
      add("Draw offer sent. Waiting for an answer…", []);
    } else if (o && G.result && o.rematchTheirs && !o.rematchMine) {
      add("Your friend wants a rematch.", [{ label: "Accept", kind: "good", onClick: requestRematch }]);
    } else if (o && G.result && o.rematchMine) {
      add("Rematch requested. Waiting for your friend…", []);
    }
    bar.hidden = !bar.firstChild;
  }

  /* ---------- user actions ---------- */

  function startLocal() {
    leaveOnline(false);
    resetGame(readClock("selClockLocal"));
    G.mode = "local"; G.myColor = "w"; G.flipped = false;
    renderAll();
  }

  function startBot() {
    leaveOnline(false);
    var choice = $("selColorBot").value;
    var color = choice === "random" ? (Math.random() < 0.5 ? "w" : "b") : choice;
    resetGame(readClock("selClockBot"));
    G.mode = "bot"; G.botId = $("selBot").value; G.myColor = color; G.flipped = color === "b";
    renderAll();
    scheduleBot();
  }

  function undo() {
    if (G.mode === "online" || !G.played.length) return;
    cancelBot();
    var steps = G.mode === "bot" && G.pos.turn === G.myColor ? 2 : 1;
    steps = Math.min(steps, G.played.length);
    var snap = null;
    for (var i = 0; i < steps; i++) {
      snap = G.played[G.played.length - 1].snap;
      G.pos.unmake(); G.played.pop(); G.keys.pop();
    }
    G.result = null; G.selected = null;
    $("endOverlay").hidden = true;
    refreshLegal();
    if (G.clockMs && snap) {
      G.clock.w = snap.w; G.clock.b = snap.b;
      G.clock.active = G.played.length ? G.pos.turn : null;
      G.clock.last = Date.now();
      startClockLoop();
    }
    renderAll();
    if (G.mode === "bot") scheduleBot();
  }

  function needsConfirm() { return G.played.length > 0 && !G.result; }

  function switchMode(mode) {
    if (mode === G.mode) return;
    var go = function () {
      if (mode === "online") { leaveOnline(false); resetGame(0); G.mode = "online"; G.myColor = "w"; G.flipped = false; renderAll(); }
      else if (mode === "local") startLocal();
      else startBot();
    };
    if (G.mode === "online" && G.online && needsConfirm()) {
      confirmDialog("Leave this game?", "Your online game is still in progress. Leaving ends it for both of you.", "Leave game", go, true);
    } else go();
  }

  function leaveClicked() {
    var go = function () {
      leaveOnline(true); resetGame(0); G.mode = "online"; G.myColor = "w"; G.flipped = false; renderAll();
    };
    if (needsConfirm()) confirmDialog("Leave this game?", "Leaving ends the game for both of you.", "Leave game", go, true);
    else go();
  }

  function copyLink() {
    var input = $("linkInput"), btn = $("btnCopy");
    var done = function () { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy"; }, 1800); };
    input.select();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(done, function () { try { document.execCommand("copy"); done(); } catch (e) { /* link is selected, user can copy */ } });
    } else {
      try { document.execCommand("copy"); done(); } catch (e) { /* link is selected, user can copy */ }
    }
  }

  function onEndPrimary() {
    if (G.mode === "online") { requestRematch(); updateEndButton(); return; }
    $("endOverlay").hidden = true;
    if (G.mode === "bot") startBot(); else startLocal();
  }

  function setupBoardKeys() {
    $("board").addEventListener("keydown", function (e) {
      var dirs = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      var d = dirs[e.key];
      if (d) {
        var f = G.flipped ? -1 : 1;
        G.cursor = { r: Math.max(0, Math.min(7, G.cursor.r + d[0] * f)), c: Math.max(0, Math.min(7, G.cursor.c + d[1] * f)) };
        renderBoard(); e.preventDefault();
      } else if (e.key === "Enter" || e.key === " ") { onSquare(G.cursor.r, G.cursor.c); e.preventDefault(); }
      else if (e.key === "Escape") { G.selected = null; renderBoard(); }
    });
  }

  /* ---------- start-up ---------- */

  function fillSelects() {
    Array.prototype.forEach.call(document.querySelectorAll(".clock-select"), function (s) {
      CLOCK_CHOICES.forEach(function (c) { var o = el("option", "", c[1]); o.value = c[0]; s.appendChild(o); });
    });
    AI.BOTS.forEach(function (b) { var o = el("option", "", b.name + " (" + b.level + ")"); o.value = b.id; $("selBot").appendChild(o); });
  }

  function applyTheme(name) {
    document.body.className = document.body.className.replace(/\btheme-\S+/g, "").trim() + " theme-" + name;
    $("selTheme").value = name;
    store("theme", name);
  }

  function wire() {
    $("board").addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".sq") : null;
      if (b) onSquare(+b.dataset.r, +b.dataset.c);
    });
    setupBoardKeys();
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
      t.addEventListener("click", function () { switchMode(t.dataset.mode); });
    });
    $("btnCreate").addEventListener("click", createOnlineGame);
    $("btnCopy").addEventListener("click", copyLink);
    $("btnDirectHost").addEventListener("click", function () { startDirect("host"); });
    $("btnDirectJoin").addEventListener("click", function () { startDirect("guest"); });
    $("btnManualGo").addEventListener("click", manualGo);
    $("btnDiag").addEventListener("click", runDiagnostics);
    $("btnManualCopy").addEventListener("click", function () {
      var t = $("manualOut"), b = this;
      t.select();
      var done = function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy code"; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(done, function () { try { document.execCommand("copy"); done(); } catch (e) { /* selected for manual copy */ } });
      else { try { document.execCommand("copy"); done(); } catch (e) { /* selected for manual copy */ } }
    });
    $("btnNewLink").addEventListener("click", function () { store("room", null); renderAll(); notify("Done. Your next game gets a brand new link."); });
    Array.prototype.forEach.call(document.querySelectorAll("#stickers button"), function (b) {
      b.addEventListener("click", function () { sendSticker(b.dataset.e); });
    });
    $("linkInput").addEventListener("focus", function () { this.select(); });
    $("btnLeave").addEventListener("click", leaveClicked);
    $("btnStartLocal").addEventListener("click", function () {
      if (needsConfirm()) confirmDialog("Start a new game?", "The current game will be lost.", "New game", startLocal, true); else startLocal();
    });
    $("btnStartBot").addEventListener("click", function () {
      if (needsConfirm()) confirmDialog("Start a new game?", "The current game will be lost.", "New game", startBot, true); else startBot();
    });
    $("selBot").addEventListener("change", renderControls);
    $("btnUndo").addEventListener("click", undo);
    $("btnFlip").addEventListener("click", function () { G.flipped = !G.flipped; renderAll(); });
    $("btnHints").addEventListener("click", function () { G.hints = !G.hints; store("hints", G.hints ? "1" : "0"); renderAll(); });
    $("btnDraw").addEventListener("click", function () { resignOrDraw("offer"); });
    $("btnResign").addEventListener("click", function () {
      confirmDialog("Resign this game?", "You will lose the game.", "Resign", function () { resignOrDraw("resign"); }, true);
    });
    $("selTheme").addEventListener("change", function () { applyTheme(this.value); });
    $("btnEndPrimary").addEventListener("click", onEndPrimary);
    $("btnEndView").addEventListener("click", function () { $("endOverlay").hidden = true; });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!$("dialog").hidden) closeDialog(false);
      else if (!$("endOverlay").hidden) $("endOverlay").hidden = true;
    });
    $("dialog").addEventListener("click", function (e) { if (e.target === $("dialog")) closeDialog(false); });
  }

  function init() {
    fillSelects();
    wire();
    var theme = store("theme");
    applyTheme(/^(classic|ice|forest|midnight|royal)$/.test(theme || "") ? theme : "classic");
    G.hints = store("hints") !== "0";

    var fileProtocol = location.protocol === "file:";
    if (fileProtocol || !Net.supported()) {
      $("fileNotice").hidden = false;
      $("fileNotice").textContent = fileProtocol
        ? "Online play needs the game to be on a website, not opened as a file from your computer. Upload it as described in README.md. Pass & play and Vs bot work right now."
        : "This browser can't make the direct connection online play needs. Try a recent Chrome, Edge, Firefox or Safari.";
      $("btnCreate").disabled = true;
    }

    var code = Net.cleanCode(location.hash.slice(1));
    G.mode = "online";
    resetGame(0);
    G.myColor = "w";
    if (code.length >= 4 && !fileProtocol && Net.supported()) {
      startOnline({ role: "guest", code: code, myColor: "b", clockMs: 0 });
    } else {
      renderAll();
    }
    window.addEventListener("hashchange", function () {
      var c = Net.cleanCode(location.hash.slice(1));
      if (c.length >= 4 && (!G.online || G.online.code !== c) && !fileProtocol && Net.supported()) {
        startOnline({ role: "guest", code: c, myColor: "b", clockMs: 0 });
      }
    });
  }

  init();
})();
