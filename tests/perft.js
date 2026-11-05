// Rules check: counts every legal move sequence from well-known test positions and compares the
// totals with the published reference numbers (chessprogramming.org "Perft Results").
// Any bug in castling, en passant, promotion or pins shows up as a wrong total.
// Run:  node tests/perft.js
"use strict";
var E = require("../js/engine.js");

var cases = [
  { name: "Start position", fen: E.START_FEN, depth: 4, expect: 197281 },
  { name: "Kiwipete (castling, pins, ep)", fen: "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", depth: 3, expect: 97862 },
  { name: "Endgame with en passant pins", fen: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", depth: 4, expect: 43238 },
  { name: "Promotions and checks", fen: "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", depth: 3, expect: 9467 },
  { name: "Mirrored promotions", fen: "r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1", depth: 3, expect: 9467 },
  { name: "Position 5", fen: "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", depth: 3, expect: 62379 },
  { name: "Position 6", fen: "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", depth: 3, expect: 89890 }
];

var failed = 0;
cases.forEach(function (t) {
  var p = new E.Position(t.fen);
  var before = p.fen();
  var t0 = Date.now();
  var got = p.perft(t.depth);
  var ok = got === t.expect && p.fen() === before; // also proves unmake restores the position exactly
  if (!ok) failed++;
  console.log((ok ? "PASS " : "FAIL ") + t.name + "  depth " + t.depth + "  " + got + (ok ? "" : " (expected " + t.expect + ")") + "  " + (Date.now() - t0) + "ms");
});

// Notation spot checks
var n = new E.Position("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
var legal = n.legalMoves();
var sans = legal.map(function (m) { return n.san(m, legal); });
["O-O", "O-O-O", "Rb1", "Rh2", "Kd2"].forEach(function (want) {
  var ok = sans.indexOf(want) >= 0;
  if (!ok) failed++;
  console.log((ok ? "PASS " : "FAIL ") + "notation " + want);
});
var promo = new E.Position("7k/P7/8/8/8/8/8/K7 w - - 0 1");
var pl = promo.legalMoves();
var ps = pl.map(function (m) { return promo.san(m, pl); });
["a8=Q+", "a8=N", "a8=R+", "a8=B"].forEach(function (want) {
  var ok = ps.indexOf(want) >= 0;
  if (!ok) failed++;
  console.log((ok ? "PASS " : "FAIL ") + "notation " + want);
});

console.log(failed ? "\n" + failed + " check(s) FAILED" : "\nAll rules checks passed");
process.exit(failed ? 1 : 0);
