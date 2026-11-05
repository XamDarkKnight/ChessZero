"use strict";

var assert = require("assert");
var fs = require("fs");
var vm = require("vm");

function createTimers() {
  var nextId = 1, now = 0, timers = {};
  function add(fn, delay, interval) {
    var id = nextId++;
    timers[id] = { fn: fn, at: now + delay, interval: interval };
    return id;
  }
  function clear(id) { delete timers[id]; }
  return {
    setTimeout: function (fn, delay) { return add(fn, delay || 0, 0); },
    clearTimeout: clear,
    setInterval: function (fn, delay) { return add(fn, delay || 0, delay || 1); },
    clearInterval: clear,
    advance: function (duration) {
      var end = now + duration, id, timer, nextAt;
      while (true) {
        id = null; nextAt = end + 1;
        Object.keys(timers).forEach(function (key) {
          if (timers[key].at < nextAt) { id = key; nextAt = timers[key].at; }
        });
        if (id === null || nextAt > end) break;
        now = nextAt;
        timer = timers[id];
        if (timer.interval) timer.at += timer.interval;
        else delete timers[id];
        timer.fn();
      }
      now = end;
    }
  };
}

function Emitter() { this.listeners = {}; }
Emitter.prototype.on = function (name, fn) {
  (this.listeners[name] || (this.listeners[name] = [])).push(fn);
};
Emitter.prototype.emit = function (name, value) {
  (this.listeners[name] || []).slice().forEach(function (fn) { fn(value); });
};

function Connection() {
  Emitter.call(this);
  this.open = false;
  this.closed = false;
  this.sent = [];
}
Connection.prototype = Object.create(Emitter.prototype);
Connection.prototype.send = function (message) { this.sent.push(message); };
Connection.prototype.close = function () {
  if (this.closed) return;
  this.closed = true;
  this.open = false;
  this.emit("close");
};
Connection.prototype.openChannel = function () {
  this.open = true;
  this.emit("open");
};

function makeHarness() {
  var timers = createTimers(), peers = [];
  function Peer(id) {
    Emitter.call(this);
    this.id = id;
    this.open = false;
    this.destroyed = false;
    this.disconnected = false;
    this.connections = [];
    peers.push(this);
  }
  Peer.prototype = Object.create(Emitter.prototype);
  Peer.prototype.connect = function () {
    var conn = new Connection();
    this.connections.push(conn);
    return conn;
  };
  Peer.prototype.destroy = function () { this.destroyed = true; };
  Peer.prototype.reconnect = function () { this.disconnected = false; };

  var browser = { Peer: Peer, RTCPeerConnection: function () {} };
  var context = {
    window: browser,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../js/net.js"), "utf8"), context);
  return { net: browser.ChessNet, peers: peers, timers: timers };
}

function checkGuestIgnoresLateConnection() {
  var h = makeHarness(), statuses = [];
  var net = h.net.create({ onStatus: function (status) { statuses.push(status); } });
  net.join("room1234");
  var peer = h.peers[0];
  peer.open = true;
  peer.emit("open");
  var first = peer.connections[0];

  h.timers.advance(12000);
  assert.strictEqual(first.closed, true, "timed-out attempt should close");
  h.timers.advance(1500);
  var second = peer.connections[1];
  assert.ok(second, "retry should start after timeout");

  first.openChannel();
  assert.notStrictEqual(net.status, "connected", "late connection must not replace the retry");
  assert.strictEqual(first.closed, true, "late connection must be closed");

  second.openChannel();
  assert.strictEqual(net.status, "connected", "current connection should be accepted");
  net.leave(false);
  console.log("PASS guest ignores a timed-out connection that opens late");
}

function checkHostKeepsOnePendingConnection() {
  var h = makeHarness();
  var net = h.net.create({});
  net.host("room1234");
  var peer = h.peers[0];
  peer.open = true;
  peer.emit("open");
  var first = new Connection(), second = new Connection();
  peer.emit("connection", first);
  peer.emit("connection", second);
  assert.strictEqual(second.closed, true, "duplicate pending connection should be closed");
  first.openChannel();
  assert.strictEqual(net.status, "connected", "first pending connection should be accepted");
  net.leave(false);
  console.log("PASS host accepts only one pending connection");
}

function checkHostRejectsAlreadyOpenDuplicate() {
  var h = makeHarness();
  var net = h.net.create({});
  net.host("room1234");
  var peer = h.peers[0];
  peer.open = true;
  peer.emit("open");
  var active = new Connection();
  peer.emit("connection", active);
  active.openChannel();

  var duplicate = new Connection();
  duplicate.open = true;
  peer.emit("connection", duplicate);
  assert.strictEqual(duplicate.sent[0].t, "full", "already-open duplicate should receive the full-game message");
  net.leave(false);
  console.log("PASS host rejects an already-open duplicate connection");
}

checkGuestIgnoresLateConnection();
checkHostKeepsOnePendingConnection();
checkHostRejectsAlreadyOpenDuplicate();
