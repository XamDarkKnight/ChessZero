// Bot sanity checks: finds forced mates, does not hang its queen, and answers within its time budget.
// Run:  node tests/ai.js
"use strict";
var E = require("../js/engine.js");
var AI = require("../js/ai.js");

var failed = 0;
function check(name, ok, extra) {
  if (!ok) failed++;
  console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : ""));
}

// 1. Mate in one: Qh5 is not mate here, but Ra8# is.
var mate1 = new E.Position("6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1");
var r1 = AI.think(mate1, { depth: 3, timeMs: 1000 });
check("finds back-rank mate in one", r1.move.tr === 0 && r1.move.tc === 0 && r1.move.fr === 7 && r1.move.fc === 0,
      "played " + E.sqName(r1.move.fr, r1.move.fc) + E.sqName(r1.move.tr, r1.move.tc));

// 2. Mate in one with queen and king against a lone king (Qg7#, protected by the king on f6).
var mate2 = new E.Position("7k/8/5K2/8/8/8/8/6Q1 w - - 0 1");
var r2 = AI.think(mate2, { depth: 4, timeMs: 800 });
check("finds queen mate in one", r2.move.tr === 1 && r2.move.tc === 6,
      "played " + E.sqName(r2.move.fr, r2.move.fc) + E.sqName(r2.move.tr, r2.move.tc));

// 3. Black's queen on h4 is attacked by the knight on f3: a sound bot wins it (Nxh4).
var tactics = new E.Position("rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1");
var r3 = AI.think(tactics, { depth: 3, timeMs: 1000 });
check("captures an undefended queen", r3.move.tr === 4 && r3.move.tc === 7,
      "chose " + E.sqName(r3.move.fr, r3.move.fc) + E.sqName(r3.move.tr, r3.move.tc));

// 4. Time budget is respected for the strongest bot.
var mid = new E.Position("r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 8");
var best = AI.getBot("magnus");
var t0 = Date.now();
var r4 = AI.think(mid, best);
var spent = Date.now() - t0;
check("strongest bot answers within budget", spent < best.timeMs + 400, spent + "ms, reached depth " + r4.depth + ", " + r4.nodes + " nodes");

// 5. Weak bot still returns legal moves from every position type (promotion, ep, castling).
var weird = ["r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", E.START_FEN];
var allLegal = weird.every(function (fen) {
  var p = new E.Position(fen);
  for (var i = 0; i < 10; i++) {
    var rr = AI.think(p, AI.getBot("lebron"));
    if (!rr) return true;
    var m = p.findMove(rr.move.fr, rr.move.fc, rr.move.tr, rr.move.tc, rr.move.promo);
    if (!m) return false;
    p.make(m);
  }
  return true;
});
check("weak bot only plays legal moves", allLegal);

console.log(failed ? "\n" + failed + " check(s) FAILED" : "\nAll bot checks passed");
process.exit(failed ? 1 : 0);
