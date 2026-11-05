/* engine.js
 * Chess rules: move generation, legality, SAN, FEN and draw helpers.
 * No DOM access. Loads in the browser as window.ChessEngine and in Node with require().
 *
 * Board layout: board[r][c], r = 0 is Black's back rank (rank 8), c = 0 is the a-file.
 * Pieces are two-letter strings: colour (w or b) + type (K Q R B N P), for example "wN".
 */
(function (root) {
  "use strict";

  var FILES = "abcdefgh";
  var START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  var WK = 1, WQ = 2, BK = 4, BQ = 8; // castling rights bits

  var KNIGHT_JUMPS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  var KING_STEPS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  var ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  var QUEEN_DIRS = ROOK_DIRS.concat(BISHOP_DIRS);
  var PROMO_TYPES = ["Q", "R", "B", "N"];

  function other(color) { return color === "w" ? "b" : "w"; }
  function sqName(r, c) { return FILES[c] + (8 - r); }

  // Castling rights that disappear when a piece moves from, or is captured on, a square.
  function rightsLostAt(r, c) {
    if (r === 7) return c === 0 ? WQ : c === 7 ? WK : c === 4 ? (WK | WQ) : 0;
    if (r === 0) return c === 0 ? BQ : c === 7 ? BK : c === 4 ? (BK | BQ) : 0;
    return 0;
  }

  function Move(fr, fc, tr, tc, piece, cap) {
    this.fr = fr; this.fc = fc; this.tr = tr; this.tc = tc;
    this.piece = piece;          // moving piece, for example "wP"
    this.cap = cap || null;      // captured piece, for en passant the captured pawn
    this.promo = null;           // "Q", "R", "B" or "N" when a pawn promotes
    this.ep = false;             // true for an en passant capture
    this.castle = null;          // "k" (king side) or "q" (queen side)
    this.score = 0;              // scratch value used for move ordering
  }

  function addPromotions(moves, base) {
    for (var i = 0; i < PROMO_TYPES.length; i++) {
      var m = new Move(base.fr, base.fc, base.tr, base.tc, base.piece, base.cap);
      m.promo = PROMO_TYPES[i];
      moves.push(m);
    }
  }

  function Position(fen) { this.load(fen || START_FEN); }

  Position.prototype.load = function (fen) {
    var parts = String(fen).trim().split(/\s+/);
    var rows = parts[0].split("/");
    if (rows.length !== 8) throw new Error("Bad FEN: need 8 ranks");
    var board = [], r, c, i;
    for (r = 0; r < 8; r++) {
      var row = [];
      for (i = 0; i < rows[r].length; i++) {
        var ch = rows[r][i];
        if (ch >= "1" && ch <= "8") { for (var k = 0; k < +ch; k++) row.push(null); }
        else if ("KQRBNPkqrbnp".indexOf(ch) >= 0) row.push((ch === ch.toUpperCase() ? "w" : "b") + ch.toUpperCase());
        else throw new Error("Bad FEN piece: " + ch);
      }
      if (row.length !== 8) throw new Error("Bad FEN: rank " + (8 - r) + " is not 8 squares");
      board.push(row);
    }
    this.board = board;
    this.turn = parts[1] === "b" ? "b" : "w";
    var cs = parts[2] || "-", cr = 0;
    if (cs.indexOf("K") >= 0) cr |= WK;
    if (cs.indexOf("Q") >= 0) cr |= WQ;
    if (cs.indexOf("k") >= 0) cr |= BK;
    if (cs.indexOf("q") >= 0) cr |= BQ;
    this.castling = cr;
    this.ep = null;
    if (parts[3] && parts[3] !== "-") {
      this.ep = { r: 8 - parseInt(parts[3][1], 10), c: FILES.indexOf(parts[3][0]) };
    }
    this.halfmove = parseInt(parts[4] || "0", 10) || 0;
    this.fullmove = parseInt(parts[5] || "1", 10) || 1;
    this.kings = { w: null, b: null };
    for (r = 0; r < 8; r++) for (c = 0; c < 8; c++) {
      if (board[r][c] === "wK") this.kings.w = [r, c];
      if (board[r][c] === "bK") this.kings.b = [r, c];
    }
    if (!this.kings.w || !this.kings.b) throw new Error("Bad FEN: both kings are required");
    this.stack = [];
  };

  Position.prototype.fen = function () {
    var rows = [], r, c;
    for (r = 0; r < 8; r++) {
      var s = "", empty = 0;
      for (c = 0; c < 8; c++) {
        var p = this.board[r][c];
        if (!p) empty++;
        else {
          if (empty) { s += empty; empty = 0; }
          s += p[0] === "w" ? p[1] : p[1].toLowerCase();
        }
      }
      if (empty) s += empty;
      rows.push(s);
    }
    var cs = (this.castling & WK ? "K" : "") + (this.castling & WQ ? "Q" : "") +
             (this.castling & BK ? "k" : "") + (this.castling & BQ ? "q" : "");
    return rows.join("/") + " " + this.turn + " " + (cs || "-") + " " +
           (this.ep ? sqName(this.ep.r, this.ep.c) : "-") + " " + this.halfmove + " " + this.fullmove;
  };

  Position.prototype.clone = function () { return new Position(this.fen()); };

  /* ---------- attacks ---------- */

  Position.prototype.isAttacked = function (r, c, by) {
    var b = this.board, i, d, nr, nc, p;

    var pr = by === "w" ? r + 1 : r - 1; // a white pawn attacks upward, so it sits one row below the target
    if (pr >= 0 && pr < 8) {
      if (c > 0 && b[pr][c - 1] === by + "P") return true;
      if (c < 7 && b[pr][c + 1] === by + "P") return true;
    }
    for (i = 0; i < 8; i++) {
      nr = r + KNIGHT_JUMPS[i][0]; nc = c + KNIGHT_JUMPS[i][1];
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr][nc] === by + "N") return true;
    }
    for (i = 0; i < 8; i++) {
      nr = r + KING_STEPS[i][0]; nc = c + KING_STEPS[i][1];
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr][nc] === by + "K") return true;
    }
    for (i = 0; i < 4; i++) {
      d = ROOK_DIRS[i]; nr = r + d[0]; nc = c + d[1];
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        p = b[nr][nc];
        if (p !== null) { if (p[0] === by && (p[1] === "R" || p[1] === "Q")) return true; break; }
        nr += d[0]; nc += d[1];
      }
    }
    for (i = 0; i < 4; i++) {
      d = BISHOP_DIRS[i]; nr = r + d[0]; nc = c + d[1];
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        p = b[nr][nc];
        if (p !== null) { if (p[0] === by && (p[1] === "B" || p[1] === "Q")) return true; break; }
        nr += d[0]; nc += d[1];
      }
    }
    return false;
  };

  Position.prototype.inCheck = function (color) {
    var k = this.kings[color];
    return this.isAttacked(k[0], k[1], other(color));
  };

  /* ---------- move generation ---------- */

  Position.prototype._gen = function (r, c, moves, tactical) {
    var b = this.board, p = b[r][c], color = p[0], type = p[1];
    var i, d, nr, nc, t, m;

    if (type === "P") {
      var dir = color === "w" ? -1 : 1;
      var startRow = color === "w" ? 6 : 1;
      var lastRow = color === "w" ? 0 : 7;
      nr = r + dir;
      if (nr < 0 || nr > 7) return;
      if (b[nr][c] === null) {
        if (nr === lastRow) addPromotions(moves, new Move(r, c, nr, c, p, null));
        else if (!tactical) {
          moves.push(new Move(r, c, nr, c, p, null));
          if (r === startRow && b[r + 2 * dir][c] === null) moves.push(new Move(r, c, r + 2 * dir, c, p, null));
        }
      }
      for (var dc = -1; dc <= 1; dc += 2) {
        nc = c + dc;
        if (nc < 0 || nc > 7) continue;
        t = b[nr][nc];
        if (t !== null) {
          if (t[0] !== color) {
            m = new Move(r, c, nr, nc, p, t);
            if (nr === lastRow) addPromotions(moves, m); else moves.push(m);
          }
        } else if (this.ep && this.ep.r === nr && this.ep.c === nc) {
          m = new Move(r, c, nr, nc, p, other(color) + "P");
          m.ep = true;
          moves.push(m);
        }
      }
      return;
    }

    if (type === "N" || type === "K") {
      var steps = type === "N" ? KNIGHT_JUMPS : KING_STEPS;
      for (i = 0; i < 8; i++) {
        nr = r + steps[i][0]; nc = c + steps[i][1];
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
        t = b[nr][nc];
        if (t === null) { if (!tactical) moves.push(new Move(r, c, nr, nc, p, null)); }
        else if (t[0] !== color) moves.push(new Move(r, c, nr, nc, p, t));
      }
      if (type === "K" && !tactical) this._genCastling(r, c, color, moves);
      return;
    }

    var dirs = type === "R" ? ROOK_DIRS : type === "B" ? BISHOP_DIRS : QUEEN_DIRS;
    for (i = 0; i < dirs.length; i++) {
      d = dirs[i]; nr = r + d[0]; nc = c + d[1];
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        t = b[nr][nc];
        if (t === null) { if (!tactical) moves.push(new Move(r, c, nr, nc, p, null)); }
        else { if (t[0] !== color) moves.push(new Move(r, c, nr, nc, p, t)); break; }
        nr += d[0]; nc += d[1];
      }
    }
  };

  Position.prototype._genCastling = function (r, c, color, moves) {
    var home = color === "w" ? 7 : 0;
    if (r !== home || c !== 4) return;
    var kBit = color === "w" ? WK : BK, qBit = color === "w" ? WQ : BQ;
    if (!(this.castling & (kBit | qBit))) return;
    var enemy = other(color), b = this.board, m;
    if (this.isAttacked(home, 4, enemy)) return;
    if ((this.castling & kBit) && b[home][7] === color + "R" && b[home][5] === null && b[home][6] === null &&
        !this.isAttacked(home, 5, enemy) && !this.isAttacked(home, 6, enemy)) {
      m = new Move(home, 4, home, 6, color + "K", null); m.castle = "k"; moves.push(m);
    }
    if ((this.castling & qBit) && b[home][0] === color + "R" && b[home][1] === null && b[home][2] === null &&
        b[home][3] === null && !this.isAttacked(home, 3, enemy) && !this.isAttacked(home, 2, enemy)) {
      m = new Move(home, 4, home, 2, color + "K", null); m.castle = "q"; moves.push(m);
    }
  };

  // Pseudo-legal moves for one colour (the king may be left in check). tactical = captures and promotions only.
  Position.prototype.pseudoMoves = function (color, tactical) {
    var moves = [], b = this.board;
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
      var p = b[r][c];
      if (p !== null && p[0] === color) this._gen(r, c, moves, tactical);
    }
    return moves;
  };

  /* ---------- make / unmake ---------- */

  Position.prototype.make = function (m) {
    var b = this.board, color = this.turn;
    var st = { m: m, castling: this.castling, ep: this.ep, half: this.halfmove, full: this.fullmove, king: null };
    var piece = b[m.fr][m.fc];

    if (m.ep) b[m.fr][m.tc] = null;
    b[m.tr][m.tc] = m.promo ? color + m.promo : piece;
    b[m.fr][m.fc] = null;
    if (m.castle === "k") { b[m.fr][5] = b[m.fr][7]; b[m.fr][7] = null; }
    else if (m.castle === "q") { b[m.fr][3] = b[m.fr][0]; b[m.fr][0] = null; }

    if (piece[1] === "K") { st.king = this.kings[color]; this.kings[color] = [m.tr, m.tc]; }

    this.castling &= ~(rightsLostAt(m.fr, m.fc) | rightsLostAt(m.tr, m.tc));
    this.ep = (piece[1] === "P" && (m.tr - m.fr === 2 || m.fr - m.tr === 2)) ? { r: (m.fr + m.tr) / 2, c: m.fc } : null;
    this.halfmove = (piece[1] === "P" || m.cap) ? 0 : this.halfmove + 1;
    if (color === "b") this.fullmove++;
    this.turn = other(color);
    this.stack.push(st);
  };

  Position.prototype.unmake = function () {
    var st = this.stack.pop(), m = st.m, b = this.board;
    var color = other(this.turn);
    this.turn = color;

    b[m.fr][m.fc] = m.promo ? color + "P" : b[m.tr][m.tc];
    b[m.tr][m.tc] = null;
    if (m.ep) b[m.fr][m.tc] = m.cap;
    else if (m.cap) b[m.tr][m.tc] = m.cap;
    if (m.castle === "k") { b[m.fr][7] = b[m.fr][5]; b[m.fr][5] = null; }
    else if (m.castle === "q") { b[m.fr][0] = b[m.fr][3]; b[m.fr][3] = null; }

    if (st.king) this.kings[color] = st.king;
    this.castling = st.castling; this.ep = st.ep; this.halfmove = st.half; this.fullmove = st.full;
  };

  /* ---------- legality ---------- */

  // Fully legal moves for the side to move. tactical = captures and promotions only.
  Position.prototype.legalMoves = function (tactical) {
    var color = this.turn, enemy = other(color);
    var pseudo = this.pseudoMoves(color, tactical), out = [];
    for (var i = 0; i < pseudo.length; i++) {
      var m = pseudo[i];
      this.make(m);
      var k = this.kings[color];
      var ok = !this.isAttacked(k[0], k[1], enemy);
      this.unmake();
      if (ok) out.push(m);
    }
    return out;
  };

  Position.prototype.hasLegalMove = function () {
    var color = this.turn, enemy = other(color), pseudo = this.pseudoMoves(color, false);
    for (var i = 0; i < pseudo.length; i++) {
      this.make(pseudo[i]);
      var k = this.kings[color];
      var ok = !this.isAttacked(k[0], k[1], enemy);
      this.unmake();
      if (ok) return true;
    }
    return false;
  };

  Position.prototype.findMove = function (fr, fc, tr, tc, promo, legal) {
    legal = legal || this.legalMoves();
    for (var i = 0; i < legal.length; i++) {
      var m = legal[i];
      if (m.fr === fr && m.fc === fc && m.tr === tr && m.tc === tc && (m.promo || null) === (promo || null)) return m;
    }
    return null;
  };

  /* ---------- notation ---------- */

  // Standard algebraic notation. Call before make(m). Pass the legal move list to skip regenerating it.
  Position.prototype.san = function (m, legal) {
    var s;
    if (m.castle) s = m.castle === "k" ? "O-O" : "O-O-O";
    else {
      var type = m.piece[1];
      s = "";
      if (type === "P") {
        if (m.cap) s += FILES[m.fc];
      } else {
        s += type;
        legal = legal || this.legalMoves();
        var rivals = legal.filter(function (o) {
          return o !== m && o.piece === m.piece && o.tr === m.tr && o.tc === m.tc;
        });
        if (rivals.length) {
          var sameFile = rivals.some(function (o) { return o.fc === m.fc; });
          var sameRank = rivals.some(function (o) { return o.fr === m.fr; });
          if (!sameFile) s += FILES[m.fc];
          else if (!sameRank) s += (8 - m.fr);
          else s += FILES[m.fc] + (8 - m.fr);
        }
      }
      if (m.cap) s += "x";
      s += sqName(m.tr, m.tc);
      if (m.promo) s += "=" + m.promo;
    }
    this.make(m);
    if (this.inCheck(this.turn)) s += this.hasLegalMove() ? "+" : "#";
    this.unmake();
    return s;
  };

  /* ---------- draws and keys ---------- */

  Position.prototype.insufficientMaterial = function () {
    var minors = [];
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
      var p = this.board[r][c];
      if (!p || p[1] === "K") continue;
      if (p[1] === "P" || p[1] === "R" || p[1] === "Q") return false;
      minors.push({ t: p[1], shade: (r + c) % 2 });
    }
    if (minors.length <= 1) return true;
    return minors.every(function (x) { return x.t === "B" && x.shade === minors[0].shade; });
  };

  // Identifies a position for repetition counting (board, side to move, castling, usable en passant).
  Position.prototype.key = function () {
    var s = "", b = this.board;
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) s += b[r][c] === null ? "." : b[r][c];
    s += this.turn + this.castling;
    if (this.ep) {
      var pr = this.turn === "w" ? this.ep.r + 1 : this.ep.r - 1, me = this.turn + "P";
      if ((this.ep.c > 0 && b[pr][this.ep.c - 1] === me) || (this.ep.c < 7 && b[pr][this.ep.c + 1] === me)) {
        s += FILES[this.ep.c];
      }
    }
    return s;
  };

  Position.prototype.perft = function (depth) {
    if (depth === 0) return 1;
    var moves = this.legalMoves();
    if (depth === 1) return moves.length;
    var n = 0;
    for (var i = 0; i < moves.length; i++) {
      this.make(moves[i]);
      n += this.perft(depth - 1);
      this.unmake();
    }
    return n;
  };

  var api = {
    Position: Position, Move: Move, START_FEN: START_FEN, FILES: FILES,
    other: other, sqName: sqName
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChessEngine = api;
})(typeof window !== "undefined" ? window : this);
