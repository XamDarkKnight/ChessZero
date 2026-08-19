const PIECES = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟"
};

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

const PIECE_VALUES = {
  P: 100,
  N: 320,
  B: 330,
  R: 500,
  Q: 900,
  K: 20000
};

let board;
let turn;
let selected;
let legalMoves;
let history;
let flipped;
let gameOver;
let moveLog;
let fullMoveNumber;
let enPassantTarget;
let castlingRights;

let showSuggestions = true;
let lastCheckToastTurn = null;

let socket = null;
let roomId = null;
let networkPlayerColor = null;
let isOnline = false;
let isRoomOwner = false;
let connectedPlayers = 0;
let pendingSocketActions = [];
const DEFAULT_NETWORK_SERVER =
  "wss://chesszero-server-f5hucjcug2crbbe2.southafricanorth-01.azurewebsites.net/ws";

/* =========================================================
   ULTIMATE GAME MODE SETTINGS
========================================================= */

let gameMode = "friend";
// friend = two players, one laptop, no timer
// blitz  = two players, one laptop, timed
// bot    = player vs bot, timed

let humanColor = "w";
let robotColor = "b";
let robotEnabled = true;
let robotThinking = false;
let robotMoveTimeout = null;

let selectedBotId = "lebron";
let robotDifficulty = "easy";

/* =========================================================
   BLITZ TIMER SETTINGS
========================================================= */

let gameStarted = true;
let initialTimeMs = 5 * 60 * 1000;
let whiteTimeLeft = initialTimeMs;
let blackTimeLeft = initialTimeMs;
let activeTimerColor = null;
let timerInterval = null;
let lastTickTime = null;

/* =========================================================
   BOT PROFILES
========================================================= */

const BOT_PROFILES = [
  {
    id: "lebron",
    name: "LeBron James Bot",
    title: "Rookie Power Player",
    level: "Beginner",
    difficulty: "easy",
    thinkTime: 520,
    topMoves: 8,
    blunderChance: 0.35,
    captureWeight: 1.2,
    checkWeight: 70,
    mateWeight: 100000,
    centerWeight: 0.7,
    castleWeight: 35,
    randomness: 90,
    searchDepth: 0
  },
  {
    id: "serena",
    name: "Serena Williams Bot",
    title: "Competitive Fighter",
    level: "Easy+",
    difficulty: "easy",
    thinkTime: 620,
    topMoves: 6,
    blunderChance: 0.25,
    captureWeight: 1.45,
    checkWeight: 90,
    mateWeight: 100000,
    centerWeight: 0.9,
    castleWeight: 45,
    randomness: 70,
    searchDepth: 0
  },
  {
    id: "presidential",
    name: "Presidential Strategist Bot",
    title: "Calm Decision Maker",
    level: "Easy+",
    difficulty: "easy",
    thinkTime: 700,
    topMoves: 6,
    blunderChance: 0.22,
    captureWeight: 1.5,
    checkWeight: 95,
    mateWeight: 100000,
    centerWeight: 0.95,
    castleWeight: 55,
    randomness: 65,
    searchDepth: 0
  },
  {
    id: "tal",
    name: "Mikhail Tal Bot",
    title: "The Attacker",
    level: "Medium",
    difficulty: "normal",
    thinkTime: 760,
    topMoves: 4,
    blunderChance: 0.12,
    captureWeight: 2.15,
    checkWeight: 165,
    mateWeight: 100000,
    centerWeight: 1.1,
    castleWeight: 35,
    randomness: 45,
    searchDepth: 0
  },
  {
    id: "judit",
    name: "Judit Polgar Bot",
    title: "Tactical Hunter",
    level: "Strong",
    difficulty: "normal",
    thinkTime: 850,
    topMoves: 3,
    blunderChance: 0.08,
    captureWeight: 2.25,
    checkWeight: 185,
    mateWeight: 100000,
    centerWeight: 1.25,
    castleWeight: 65,
    randomness: 35,
    searchDepth: 0
  },
  {
    id: "anand",
    name: "Viswanathan Anand Bot",
    title: "Speed Legend",
    level: "Strong",
    difficulty: "hard",
    thinkTime: 650,
    topMoves: 2,
    blunderChance: 0.05,
    captureWeight: 2.35,
    checkWeight: 195,
    mateWeight: 100000,
    centerWeight: 1.25,
    castleWeight: 75,
    randomness: 25,
    searchDepth: 1
  },
  {
    id: "gukesh",
    name: "Gukesh Bot",
    title: "Young Champion",
    level: "Very Strong",
    difficulty: "hard",
    thinkTime: 900,
    topMoves: 2,
    blunderChance: 0.04,
    captureWeight: 2.45,
    checkWeight: 215,
    mateWeight: 100000,
    centerWeight: 1.35,
    castleWeight: 80,
    randomness: 18,
    searchDepth: 1
  },
  {
    id: "hikaru",
    name: "Hikaru Nakamura Bot",
    title: "Blitz Monster",
    level: "Elite",
    difficulty: "hard",
    thinkTime: 500,
    topMoves: 2,
    blunderChance: 0.035,
    captureWeight: 2.55,
    checkWeight: 225,
    mateWeight: 100000,
    centerWeight: 1.35,
    castleWeight: 80,
    randomness: 15,
    searchDepth: 1
  },
  {
    id: "caruana",
    name: "Fabiano Caruana Bot",
    title: "Deep Calculator",
    level: "Elite",
    difficulty: "hard",
    thinkTime: 1050,
    topMoves: 1,
    blunderChance: 0.02,
    captureWeight: 2.65,
    checkWeight: 235,
    mateWeight: 100000,
    centerWeight: 1.45,
    castleWeight: 90,
    randomness: 10,
    searchDepth: 1
  },
  {
    id: "kasparov",
    name: "Garry Kasparov Bot",
    title: "Legend Boss",
    level: "Legend",
    difficulty: "hard",
    thinkTime: 1150,
    topMoves: 1,
    blunderChance: 0.015,
    captureWeight: 2.85,
    checkWeight: 250,
    mateWeight: 100000,
    centerWeight: 1.55,
    castleWeight: 95,
    randomness: 8,
    searchDepth: 1
  },
  {
    id: "magnus",
    name: "Magnus Carlsen Bot",
    title: "Final Boss",
    level: "World Boss",
    difficulty: "hard",
    thinkTime: 1200,
    topMoves: 1,
    blunderChance: 0.01,
    captureWeight: 3,
    checkWeight: 265,
    mateWeight: 100000,
    centerWeight: 1.6,
    castleWeight: 100,
    randomness: 5,
    searchDepth: 1
  }
];

function getSelectedBot() {
  return BOT_PROFILES.find(bot => bot.id === selectedBotId) || BOT_PROFILES[0];
}

function isBotMode() {
  return gameMode === "bot";
}

function isTimedMode() {
  return gameMode === "blitz" || gameMode === "bot";
}

/* =========================================================
   NEW GAME / START MATCH
========================================================= */

function newGame() {
  if (isOnline && roomId && socket && socket.readyState === WebSocket.OPEN) {
    sendNetworkMessage({
      type: "resetRoom",
      roomId,
      state: getNetworkState()
    });
    updateNetworkMessage("Resetting online game...");
    return;
  }

  stopTimerLoop();
  clearRobotMoveTimeout();

  initialTimeMs = getChosenTimeMs();
  resetGameState(initialTimeMs);

  gameStarted = !isTimedMode();
  activeTimerColor = gameStarted && isTimedMode() ? turn : null;
  lastTickTime = gameStarted && isTimedMode() ? Date.now() : null;

  const overlay = document.getElementById("endOverlay");
  if (overlay) overlay.style.display = "none";

  updateGameText();
  updateModePanels();
  render();

  if (gameStarted && isTimedMode()) {
    startTimerLoop();
  }
}

function resetGameState(timeMs) {
  board = [
    ["bR","bN","bB","bQ","bK","bB","bN","bR"],
    ["bP","bP","bP","bP","bP","bP","bP","bP"],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    ["wP","wP","wP","wP","wP","wP","wP","wP"],
    ["wR","wN","wB","wQ","wK","wB","wN","wR"]
  ];

  turn = "w";
  selected = null;
  legalMoves = [];
  history = [];
  flipped = false;
  gameOver = false;
  moveLog = [];
  fullMoveNumber = 1;
  enPassantTarget = null;
  robotThinking = false;

  whiteTimeLeft = timeMs;
  blackTimeLeft = timeMs;

  castlingRights = {
    w: { kingSide: true, queenSide: true },
    b: { kingSide: true, queenSide: true }
  };
}

function startMatch() {
  stopTimerLoop();
  clearRobotMoveTimeout();

  initialTimeMs = getChosenTimeMs();
  resetGameState(initialTimeMs);

  gameStarted = true;
  activeTimerColor = isTimedMode() ? turn : null;
  lastTickTime = isTimedMode() ? Date.now() : null;

  const overlay = document.getElementById("endOverlay");
  if (overlay) overlay.style.display = "none";

  updateGameText();
  render();

  if (isTimedMode()) {
    startTimerLoop();
  }

  if (isBotMode() && turn === robotColor) {
    scheduleRobotMove();
  }
}

/* =========================================================
   TEXT / STATUS
========================================================= */

function updateGameText() {
  const title = document.querySelector(".panel h1");
  const subtitle = document.querySelector(".subtitle");

  if (gameMode === "friend") {
    if (title) title.textContent = "Ultimate Chess — Friend Mode";
    if (subtitle) subtitle.textContent = "Two players, one laptop. Legal chess moves only.";
  }

  if (gameMode === "blitz") {
    if (title) title.textContent = "Ultimate Chess — Blitz Mode";
    if (subtitle) subtitle.textContent = "Two players, one laptop. Choose time, then start the blitz match.";
  }

  if (gameMode === "bot") {
    const bot = getSelectedBot();

    if (title) title.textContent = "Ultimate Chess — Bot Arena";
    if (subtitle) {
      subtitle.textContent =
        `You are White. ${bot.name} is Black. Choose a bot, choose time, then start the match.`;
    }
  }
}

function renderStatus() {
  const status = document.getElementById("status");
  if (!status) return;

  if (gameOver) return;

  if (!gameStarted) {
    if (gameMode === "friend") {
      status.textContent = "Friend mode ready. White to move.";
    } else if (gameMode === "blitz") {
      status.textContent = "Choose blitz time, then press Start Match.";
    } else {
      status.textContent = "Choose your bot and blitz time, then press Start Match.";
    }

    return;
  }

  if (isOnline && connectedPlayers < 2) {
    status.textContent = "Waiting for opponent to join...";
    return;
  }

  if (isBotMode() && robotThinking && turn === robotColor) {
    status.textContent = `${getSelectedBot().name} is thinking...`;
    return;
  }

  if (isBotMode()) {
    if (turn === humanColor) {
      status.textContent = isInCheck(turn) ? "Your move — CHECK!" : "Your move.";
      if (isInCheck(turn)) showCheckToastOnce(turn);
    } else {
      status.textContent = isInCheck(turn)
        ? `${getSelectedBot().name} to move — CHECK!`
        : `${getSelectedBot().name} to move.`;

      if (isInCheck(turn)) showCheckToastOnce(turn);
    }

    return;
  }

  const side = turn === "w" ? "White" : "Black";
  const networkSuffix = isOnline ? ` (${networkPlayerColor === turn ? "Your move" : "Opponent's move"})` : "";

  if (isInCheck(turn)) {
    status.textContent = `${side} to move — CHECK!${networkSuffix}`;
    showCheckToast();
  } else {
    status.textContent = `${side} to move.${networkSuffix}`;
  }
}

function showCheckToastOnce(color) {
  const checkKey = `${fullMoveNumber}-${color}`;

  if (lastCheckToastTurn === checkKey) return;

  lastCheckToastTurn = checkKey;
  showCheckToast();
}

/* =========================================================
   RENDER BOARD
========================================================= */

function render() {
  const el = document.getElementById("board");
  if (!el) return;

  el.innerHTML = "";

  const currentKingInCheck = isInCheck(turn);

  for (let i = 0; i < 64; i++) {
    let displayR = Math.floor(i / 8);
    let displayC = i % 8;

    let r = displayR;
    let c = displayC;

    if (flipped) {
      r = 7 - displayR;
      c = 7 - displayC;
    }

    const sq = document.createElement("div");
    sq.className = "sq " + ((r + c) % 2 ? "dark" : "light");
    sq.setAttribute("role", "gridcell");
sq.setAttribute("aria-label", buildSquareLabel(r, c));
sq.tabIndex = 0;

sq.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    clickSquare(r, c);
  }
});

    if (selected && selected.r === r && selected.c === c) {
      sq.classList.add("selected");
    }

    const moveHere = legalMoves.find(move => move.r === r && move.c === c);

    if (showSuggestions && moveHere) {
      if (board[r][c] || moveHere.enPassant) {
        sq.classList.add("capture");
      } else {
        sq.classList.add("legal");
      }
    }

    const piece = board[r][c];

    if (piece === turn + "K" && currentKingInCheck) {
      sq.classList.add("check");
    }

    if (piece) {
      const pieceSpan = document.createElement("span");
      pieceSpan.className = "piece " + (piece[0] === "w" ? "white-piece" : "black-piece");
      pieceSpan.textContent = PIECES[piece];

      pieceSpan.style.transform = "translateY(-1px)";
      pieceSpan.style.filter = "drop-shadow(2px 5px 2px rgba(0,0,0,0.35))";
      pieceSpan.style.fontSize = "1em";

      sq.appendChild(pieceSpan);
    }

    sq.onclick = () => clickSquare(r, c);
    el.appendChild(sq);
  }

  renderStatus();
  renderMoveHistory();
  updateSuggestionButton();
  updateTimerDisplays();
  updateBotInfoCard();
}

/* =========================================================
   CLICK HANDLER
========================================================= */

function clickSquare(r, c) {
  if (gameOver) return;

  if (!gameStarted) {
    const status = document.getElementById("status");
    if (status) status.textContent = "Press Start Match before making a move.";
    return;
  }

  if (isOnline) {
    if (connectedPlayers < 2) {
      const status = document.getElementById("status");
      if (status) status.textContent = "Waiting for opponent to join.";
      return;
    }

    if (turn !== networkPlayerColor) {
      const status = document.getElementById("status");
      if (status) status.textContent = "Waiting for your opponent's move.";
      return;
    }
  }

  if (isTimedMode()) {
    syncActiveClock();
    if (gameOver) return;
  }

  if (isBotMode() && robotThinking) return;
  if (isBotMode() && turn === robotColor) return;

  const piece = board[r][c];

  if (selected) {
    const move = legalMoves.find(m => m.r === r && m.c === c);

    if (move) {
      if (isOnline) {
        makeMove(selected.r, selected.c, r, c, move);
        sendNetworkMove(selected.r, selected.c, r, c, move);
        selected = null;
        legalMoves = [];
        render();
        return;
      }

      makeMove(selected.r, selected.c, r, c, move);
      selected = null;
      legalMoves = [];
      render();
      return;
    }

    if (piece && piece[0] === turn) {
      selected = { r, c };
      legalMoves = getLegalMoves(r, c);
      render();
      return;
    }

    selected = null;
    legalMoves = [];
    render();
    return;
  }

  if (piece && piece[0] === turn) {
    selected = { r, c };
    legalMoves = getLegalMoves(r, c);
    render();
  }
}

/* =========================================================
   MAKE MOVE
========================================================= */

function makeMove(fr, fc, tr, tc, moveData) {
  if (!gameStarted || gameOver) return;

  if (isTimedMode()) {
    syncActiveClock();
    if (gameOver) return;
  }

  const piece = board[fr][fc];
  if (!piece) return;

  const color = piece[0];
  const enemy = color === "w" ? "b" : "w";

  const capturedPiece = moveData.enPassant ? board[fr][tc] : board[tr][tc];

  history.push({
    board: copyBoard(board),
    turn,
    selected,
    legalMoves: legalMoves.map(m => ({ ...m })),
    flipped,
    gameOver,
    moveLog: [...moveLog],
    fullMoveNumber,
    enPassantTarget: enPassantTarget ? { ...enPassantTarget } : null,
    showSuggestions,
    gameMode,
    selectedBotId,
    robotDifficulty,
    gameStarted,
    whiteTimeLeft,
    blackTimeLeft,
    activeTimerColor,
    initialTimeMs,
    castlingRights: JSON.parse(JSON.stringify(castlingRights))
  });

  board[tr][tc] = piece;
  board[fr][fc] = null;

  if (moveData.enPassant) {
    board[fr][tc] = null;
  }

  if (moveData.castle === "kingSide") {
    board[fr][5] = board[fr][7];
    board[fr][7] = null;
  }

  if (moveData.castle === "queenSide") {
    board[fr][3] = board[fr][0];
    board[fr][0] = null;
  }

  if (piece[1] === "K") {
    castlingRights[color].kingSide = false;
    castlingRights[color].queenSide = false;
  }

  if (piece === "wR" && fr === 7 && fc === 0) castlingRights.w.queenSide = false;
  if (piece === "wR" && fr === 7 && fc === 7) castlingRights.w.kingSide = false;
  if (piece === "bR" && fr === 0 && fc === 0) castlingRights.b.queenSide = false;
  if (piece === "bR" && fr === 0 && fc === 7) castlingRights.b.kingSide = false;

  if (capturedPiece === "wR" && tr === 7 && tc === 0) castlingRights.w.queenSide = false;
  if (capturedPiece === "wR" && tr === 7 && tc === 7) castlingRights.w.kingSide = false;
  if (capturedPiece === "bR" && tr === 0 && tc === 0) castlingRights.b.queenSide = false;
  if (capturedPiece === "bR" && tr === 0 && tc === 7) castlingRights.b.kingSide = false;

  enPassantTarget = null;

  if (piece[1] === "P" && Math.abs(tr - fr) === 2) {
    enPassantTarget = {
      r: (fr + tr) / 2,
      c: fc,
      pawnR: tr,
      pawnC: tc,
      color
    };
  }

  let promotion = null;

  if (piece === "wP" && tr === 0) {
    promotion = isBotMode() && color === robotColor ? "wQ" : choosePromotion("w");
    board[tr][tc] = promotion;
  }

  if (piece === "bP" && tr === 7) {
    promotion = isBotMode() && color === robotColor ? "bQ" : choosePromotion("b");
    board[tr][tc] = promotion;
  }

  turn = enemy;

  const enemyInCheck = isInCheck(enemy);
  const enemyHasMoves = hasAnyLegalMoves(enemy);

  let resultSuffix = "";

  if (enemyInCheck && !enemyHasMoves) {
    gameOver = true;
    resultSuffix = "#";
    stopTimerLoop();
    clearRobotMoveTimeout();

    if (isBotMode()) {
      const winner = color === humanColor ? "You win!" : `${getSelectedBot().name} wins!`;
      showEndScreen("CHECKMATE", winner);
    } else {
      showEndScreen("CHECKMATE", `${color === "w" ? "White" : "Black"} wins!`);
    }
  } else if (!enemyInCheck && !enemyHasMoves) {
    gameOver = true;
    resultSuffix = "½";
    stopTimerLoop();
    clearRobotMoveTimeout();
    showEndScreen("STALEMATE", "Draw! No legal moves.");
  } else if (enemyInCheck) {
    resultSuffix = "+";
    showCheckToast();
  }

  moveLog.push({
    number: fullMoveNumber,
    color,
    text: buildMoveText(fr, fc, tr, tc, piece, capturedPiece, moveData, promotion, resultSuffix)
  });

  if (color === "b") fullMoveNumber++;

  if (gameOver) {
    updateTimerDisplays();
    return;
  }

  if (isTimedMode()) {
    switchClockTo(turn);
  }

  if (isBotMode() && turn === robotColor) {
    scheduleRobotMove();
  }
}

/* =========================================================
   MOVE TEXT / HISTORY
========================================================= */

function buildMoveText(fr, fc, tr, tc, piece, captured, moveData, promotion, suffix) {
  if (moveData.castle === "kingSide") return "O-O" + suffix;
  if (moveData.castle === "queenSide") return "O-O-O" + suffix;

  const pieceName = piece[1] === "P" ? "" : piece[1];
  const from = toSquareName(fr, fc);
  const to = toSquareName(tr, tc);
  const captureMark = captured || moveData.enPassant ? "x" : "-";
  const promoText = promotion ? "=" + promotion[1] : "";

  return `${pieceName}${from}${captureMark}${to}${promoText}${suffix}`;
}

function renderMoveHistory() {
  const movesEl = document.getElementById("moves");
  if (!movesEl) return;

  movesEl.innerHTML = "";

  moveLog.forEach(move => {
    const div = document.createElement("div");
    div.className = "move";

    let side;

    if (isBotMode()) {
      side = move.color === humanColor ? "You" : getSelectedBot().name;
    } else {
      side = move.color === "w" ? "White" : "Black";
    }

    const dots = move.color === "w" ? "." : "...";
    div.textContent = `${move.number}${dots} ${side}: ${move.text}`;
    movesEl.appendChild(div);
  });

  movesEl.scrollTop = movesEl.scrollHeight;
}

/* =========================================================
   LEGAL MOVES
========================================================= */

function getLegalMoves(r, c) {
  const piece = board[r][c];
  if (!piece) return [];

  const pseudoMoves = getPseudoMoves(r, c);
  const color = piece[0];

  return pseudoMoves.filter(move => {
    return !wouldLeaveKingInCheck(r, c, move.r, move.c, move, color);
  });
}

function getPseudoMoves(r, c) {
  const piece = board[r][c];
  if (!piece) return [];

  const color = piece[0];
  const type = piece[1];

  if (type === "P") return getPawnMoves(r, c, color);
  if (type === "R") return getRookMoves(r, c, color);
  if (type === "N") return getKnightMoves(r, c, color);
  if (type === "B") return getBishopMoves(r, c, color);
  if (type === "Q") return getQueenMoves(r, c, color);
  if (type === "K") return getKingMoves(r, c, color);

  return [];
}

/* =========================================================
   PAWN MOVES
========================================================= */

function getPawnMoves(r, c, color) {
  const moves = [];
  const direction = color === "w" ? -1 : 1;
  const startRow = color === "w" ? 6 : 1;

  const oneStep = r + direction;
  const twoStep = r + direction * 2;

  if (isInside(oneStep, c) && board[oneStep][c] === null) {
    moves.push({ r: oneStep, c });

    if (
      r === startRow &&
      isInside(twoStep, c) &&
      board[twoStep][c] === null
    ) {
      moves.push({ r: twoStep, c });
    }
  }

  for (const dc of [-1, 1]) {
    const nr = r + direction;
    const nc = c + dc;

    if (!isInside(nr, nc)) continue;

    if (board[nr][nc] && board[nr][nc][0] !== color) {
      moves.push({ r: nr, c: nc });
    }

    if (
      enPassantTarget &&
      enPassantTarget.r === nr &&
      enPassantTarget.c === nc &&
      enPassantTarget.color !== color
    ) {
      moves.push({ r: nr, c: nc, enPassant: true });
    }
  }

  return moves;
}

/* =========================================================
   ROOK / BISHOP / QUEEN MOVES
========================================================= */

function getRookMoves(r, c, color) {
  return getSlidingMoves(r, c, color, [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
  ]);
}

function getBishopMoves(r, c, color) {
  return getSlidingMoves(r, c, color, [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1]
  ]);
}

function getQueenMoves(r, c, color) {
  return getSlidingMoves(r, c, color, [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1]
  ]);
}

function getSlidingMoves(r, c, color, directions) {
  const moves = [];

  for (const [dr, dc] of directions) {
    let nr = r + dr;
    let nc = c + dc;

    while (isInside(nr, nc)) {
      if (board[nr][nc] === null) {
        moves.push({ r: nr, c: nc });
      } else {
        if (board[nr][nc][0] !== color) {
          moves.push({ r: nr, c: nc });
        }

        break;
      }

      nr += dr;
      nc += dc;
    }
  }

  return moves;
}

/* =========================================================
   KNIGHT MOVES
========================================================= */

function getKnightMoves(r, c, color) {
  const moves = [];

  const jumps = [
    [-2, -1], [-2, 1],
    [-1, -2], [-1, 2],
    [1, -2], [1, 2],
    [2, -1], [2, 1]
  ];

  for (const [dr, dc] of jumps) {
    const nr = r + dr;
    const nc = c + dc;

    if (!isInside(nr, nc)) continue;

    if (!board[nr][nc] || board[nr][nc][0] !== color) {
      moves.push({ r: nr, c: nc });
    }
  }

  return moves;
}

/* =========================================================
   KING MOVES + CASTLING
========================================================= */

function getKingMoves(r, c, color) {
  const moves = [];

  const directions = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1]
  ];

  for (const [dr, dc] of directions) {
    const nr = r + dr;
    const nc = c + dc;

    if (!isInside(nr, nc)) continue;

    if (!board[nr][nc] || board[nr][nc][0] !== color) {
      moves.push({ r: nr, c: nc });
    }
  }

  const enemy = color === "w" ? "b" : "w";
  const homeRow = color === "w" ? 7 : 0;

  if (r === homeRow && c === 4 && !isInCheck(color)) {
    if (
      castlingRights[color].kingSide &&
      board[homeRow][7] === color + "R" &&
      board[homeRow][5] === null &&
      board[homeRow][6] === null &&
      !isSquareAttacked(homeRow, 5, enemy) &&
      !isSquareAttacked(homeRow, 6, enemy)
    ) {
      moves.push({ r: homeRow, c: 6, castle: "kingSide" });
    }

    if (
      castlingRights[color].queenSide &&
      board[homeRow][0] === color + "R" &&
      board[homeRow][1] === null &&
      board[homeRow][2] === null &&
      board[homeRow][3] === null &&
      !isSquareAttacked(homeRow, 3, enemy) &&
      !isSquareAttacked(homeRow, 2, enemy)
    ) {
      moves.push({ r: homeRow, c: 2, castle: "queenSide" });
    }
  }

  return moves;
}

/* =========================================================
   CHECK / CHECKMATE / STALEMATE LOGIC
========================================================= */

function isInCheck(color) {
  const king = findKing(color);
  if (!king) return false;

  const enemy = color === "w" ? "b" : "w";
  return isSquareAttacked(king.r, king.c, enemy);
}

function findKing(color) {
  const king = color + "K";

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === king) {
        return { r, c };
      }
    }
  }

  return null;
}

function hasAnyLegalMoves(color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] && board[r][c][0] === color) {
        if (getLegalMoves(r, c).length > 0) {
          return true;
        }
      }
    }
  }

  return false;
}

function isSquareAttacked(r, c, byColor) {
  const pawnDir = byColor === "w" ? -1 : 1;

  for (const dc of [-1, 1]) {
    const pr = r - pawnDir;
    const pc = c - dc;

    if (isInside(pr, pc) && board[pr][pc] === byColor + "P") {
      return true;
    }
  }

  const knightJumps = [
    [-2, -1], [-2, 1],
    [-1, -2], [-1, 2],
    [1, -2], [1, 2],
    [2, -1], [2, 1]
  ];

  for (const [dr, dc] of knightJumps) {
    const nr = r + dr;
    const nc = c + dc;

    if (isInside(nr, nc) && board[nr][nc] === byColor + "N") {
      return true;
    }
  }

  const diagonalDirections = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1]
  ];

  for (const [dr, dc] of diagonalDirections) {
    let nr = r + dr;
    let nc = c + dc;

    while (isInside(nr, nc)) {
      const piece = board[nr][nc];

      if (piece) {
        if (
          piece[0] === byColor &&
          (piece[1] === "B" || piece[1] === "Q")
        ) {
          return true;
        }

        break;
      }

      nr += dr;
      nc += dc;
    }
  }

  const straightDirections = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
  ];

  for (const [dr, dc] of straightDirections) {
    let nr = r + dr;
    let nc = c + dc;

    while (isInside(nr, nc)) {
      const piece = board[nr][nc];

      if (piece) {
        if (
          piece[0] === byColor &&
          (piece[1] === "R" || piece[1] === "Q")
        ) {
          return true;
        }

        break;
      }

      nr += dr;
      nc += dc;
    }
  }

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;

      const nr = r + dr;
      const nc = c + dc;

      if (isInside(nr, nc) && board[nr][nc] === byColor + "K") {
        return true;
      }
    }
  }

  return false;
}

/* =========================================================
   TEMPORARY MOVE / KING SAFETY
========================================================= */

function wouldLeaveKingInCheck(fr, fc, tr, tc, moveData, color) {
  const undo = makeTemporaryMove(fr, fc, tr, tc, moveData);
  const illegal = isInCheck(color);
  undo();

  return illegal;
}

function makeTemporaryMove(fr, fc, tr, tc, moveData) {
  const movingPiece = board[fr][fc];
  const targetPiece = board[tr][tc];

  let enPassantCaptured = null;
  let rookFrom = null;
  let rookTo = null;
  let rookPiece = null;

  board[tr][tc] = movingPiece;
  board[fr][fc] = null;

  if (moveData.enPassant) {
    enPassantCaptured = board[fr][tc];
    board[fr][tc] = null;
  }

  if (moveData.castle === "kingSide") {
    rookFrom = { r: fr, c: 7 };
    rookTo = { r: fr, c: 5 };
    rookPiece = board[rookFrom.r][rookFrom.c];

    board[rookTo.r][rookTo.c] = rookPiece;
    board[rookFrom.r][rookFrom.c] = null;
  }

  if (moveData.castle === "queenSide") {
    rookFrom = { r: fr, c: 0 };
    rookTo = { r: fr, c: 3 };
    rookPiece = board[rookFrom.r][rookFrom.c];

    board[rookTo.r][rookTo.c] = rookPiece;
    board[rookFrom.r][rookFrom.c] = null;
  }

  return function undoTemporaryMove() {
    board[fr][fc] = movingPiece;
    board[tr][tc] = targetPiece;

    if (moveData.enPassant) {
      board[fr][tc] = enPassantCaptured;
    }

    if (moveData.castle) {
      board[rookFrom.r][rookFrom.c] = rookPiece;
      board[rookTo.r][rookTo.c] = null;
    }
  };
}

/* =========================================================
   BOT AI
========================================================= */

function clearRobotMoveTimeout() {
  if (robotMoveTimeout) {
    clearTimeout(robotMoveTimeout);
    robotMoveTimeout = null;
  }

  robotThinking = false;
}

function scheduleRobotMove() {
  if (!isBotMode() || !robotEnabled || gameOver || turn !== robotColor || !gameStarted) return;
  if (robotThinking) return;

  const bot = getSelectedBot();

  robotThinking = true;
  selected = null;
  legalMoves = [];
  render();

  robotMoveTimeout = setTimeout(() => {
    robotMoveTimeout = null;
    makeRobotMove();
  }, bot.thinkTime);
}

function makeRobotMove() {
  if (!isBotMode() || !robotEnabled || gameOver || turn !== robotColor || !gameStarted) {
    robotThinking = false;
    render();
    return;
  }

  if (isTimedMode()) {
    syncActiveClock();
  }

  if (gameOver) {
    robotThinking = false;
    render();
    return;
  }

  const chosenMove = chooseRobotMove(robotColor);

  robotThinking = false;

  if (!chosenMove) {
    render();
    return;
  }

  makeMove(
    chosenMove.fr,
    chosenMove.fc,
    chosenMove.tr,
    chosenMove.tc,
    chosenMove.moveData
  );

  selected = null;
  legalMoves = [];
  render();
}

function chooseRobotMove(color) {
  const bot = getSelectedBot();
  robotDifficulty = bot.difficulty;

  const allMoves = getAllLegalMovesForColor(color);

  if (allMoves.length === 0) return null;

  if (Math.random() < bot.blunderChance) {
    return allMoves[Math.floor(Math.random() * allMoves.length)];
  }

  const scoredMoves = allMoves.map(move => ({
    ...move,
    score: scoreRobotMove(move, color, bot)
  }));

  scoredMoves.sort((a, b) => b.score - a.score);

  const poolSize = Math.max(1, Math.min(bot.topMoves, scoredMoves.length));
  const pool = scoredMoves.slice(0, poolSize);

  return pool[Math.floor(Math.random() * pool.length)];
}

function getAllLegalMovesForColor(color) {
  const moves = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];

      if (piece && piece[0] === color) {
        const legal = getLegalMoves(r, c);

        legal.forEach(move => {
          moves.push({
            fr: r,
            fc: c,
            tr: move.r,
            tc: move.c,
            piece,
            moveData: move
          });
        });
      }
    }
  }

  return moves;
}

function scoreRobotMove(move, color, bot) {
  const enemy = color === "w" ? "b" : "w";
  const movingPiece = board[move.fr][move.fc];

  const targetPiece = move.moveData.enPassant
    ? board[move.fr][move.tc]
    : board[move.tr][move.tc];

  let score = 0;

  if (targetPiece) {
    score += PIECE_VALUES[targetPiece[1]] * bot.captureWeight;
    score -= PIECE_VALUES[movingPiece[1]] * 0.08;
  }

  if (move.moveData.castle) {
    score += bot.castleWeight;
  }

  if (movingPiece[1] === "P") {
    if (movingPiece[0] === "w" && move.tr === 0) score += 900;
    if (movingPiece[0] === "b" && move.tr === 7) score += 900;
  }

  score += centerControlBonus(move.tr, move.tc) * bot.centerWeight;

  const undo = makeTemporaryMove(
    move.fr,
    move.fc,
    move.tr,
    move.tc,
    move.moveData
  );

  score += evaluateBoardForColor(color);

  if (isInCheck(enemy)) {
    score += bot.checkWeight;
  }

  if (isInCheck(enemy) && !hasAnyLegalMoves(enemy)) {
    score += bot.mateWeight;
  }

  if (isInCheck(color)) {
    score -= 100000;
  }

  if (isSquareAttacked(move.tr, move.tc, enemy)) {
    score -= PIECE_VALUES[movingPiece[1]] * 0.25;
  }

  if (bot.searchDepth >= 1) {
    score -= getOpponentBestReplyPenalty(enemy, color);
  }

  undo();

  score += Math.random() * bot.randomness;

  return score;
}

function getOpponentBestReplyPenalty(enemyColor, botColor) {
  const enemyMoves = getAllLegalMovesForColor(enemyColor);

  if (enemyMoves.length === 0) return 0;

  let worstThreat = 0;

  for (const move of enemyMoves) {
    const movingPiece = board[move.fr][move.fc];

    const targetPiece = move.moveData.enPassant
      ? board[move.fr][move.tc]
      : board[move.tr][move.tc];

    let threat = 0;

    if (targetPiece && targetPiece[0] === botColor) {
      threat += PIECE_VALUES[targetPiece[1]] * 1.1;
      threat -= PIECE_VALUES[movingPiece[1]] * 0.05;
    }

    const undo = makeTemporaryMove(move.fr, move.fc, move.tr, move.tc, move.moveData);

    if (isInCheck(botColor)) {
      threat += 120;
    }

    if (isInCheck(botColor) && !hasAnyLegalMoves(botColor)) {
      threat += 100000;
    }

    undo();

    if (threat > worstThreat) {
      worstThreat = threat;
    }
  }

  return worstThreat * 0.45;
}

function evaluateBoardForColor(color) {
  let score = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];

      if (!piece) continue;

      const value = PIECE_VALUES[piece[1]] || 0;

      if (piece[0] === color) {
        score += value;
      } else {
        score -= value;
      }
    }
  }

  return score;
}

function centerControlBonus(r, c) {
  const centerSquares = [
    [3, 3], [3, 4],
    [4, 3], [4, 4]
  ];

  const nearCenterSquares = [
    [2, 2], [2, 3], [2, 4], [2, 5],
    [3, 2],                 [3, 5],
    [4, 2],                 [4, 5],
    [5, 2], [5, 3], [5, 4], [5, 5]
  ];

  if (centerSquares.some(([cr, cc]) => cr === r && cc === c)) {
    return 35;
  }

  if (nearCenterSquares.some(([cr, cc]) => cr === r && cc === c)) {
    return 15;
  }

  return 0;
}

/* =========================================================
   BLITZ TIMER LOGIC
========================================================= */

function startTimerLoop() {
  stopTimerLoop();

  timerInterval = setInterval(() => {
    syncActiveClock();
    updateTimerDisplays();
  }, 100);
}

function stopTimerLoop() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function switchClockTo(color) {
  activeTimerColor = color;
  lastTickTime = Date.now();
  updateTimerDisplays();
}

function syncActiveClock() {
  if (!isTimedMode() || !gameStarted || gameOver || !activeTimerColor || !lastTickTime) return;

  const now = Date.now();
  const elapsed = now - lastTickTime;
  lastTickTime = now;

  if (activeTimerColor === "w") {
    whiteTimeLeft -= elapsed;

    if (whiteTimeLeft <= 0) {
      whiteTimeLeft = 0;
      handleTimeOut("w");
    }
  } else {
    blackTimeLeft -= elapsed;

    if (blackTimeLeft <= 0) {
      blackTimeLeft = 0;
      handleTimeOut("b");
    }
  }
}

function handleTimeOut(color) {
  if (gameOver) return;

  gameOver = true;
  stopTimerLoop();
  clearRobotMoveTimeout();

  selected = null;
  legalMoves = [];

  let loser;
  let winner;

  if (isBotMode()) {
    loser = color === "w" ? "You" : getSelectedBot().name;
    winner = color === "w" ? getSelectedBot().name : "You";
  } else {
    loser = color === "w" ? "White" : "Black";
    winner = color === "w" ? "Black" : "White";
  }

  showEndScreen("TIME OUT", `${loser} ran out of time. ${winner} wins!`);

  const status = document.getElementById("status");
  if (status) status.textContent = `TIME OUT: ${winner} wins!`;

  updateTimerDisplays();
}

function updateTimerDisplays() {
  const timerPanel = document.getElementById("timerPanel");
  const whiteClock = document.getElementById("whiteClock");
  const blackClock = document.getElementById("blackClock");
  const blackClockLabel = document.getElementById("blackClockLabel");

  if (timerPanel) {
    timerPanel.style.display = isTimedMode() ? "grid" : "none";
  }

  if (blackClockLabel) {
    blackClockLabel.textContent = isBotMode() ? getSelectedBot().name : "Black";
  }

  if (whiteClock) {
    whiteClock.textContent = formatTime(whiteTimeLeft);
    whiteClock.style.borderColor =
      isTimedMode() && gameStarted && !gameOver && activeTimerColor === "w" ? "#e2271e" : "#ddd";
    whiteClock.style.color =
      whiteTimeLeft <= 10000 ? "#e2271e" : "#111";
  }

  if (blackClock) {
    blackClock.textContent = formatTime(blackTimeLeft);
    blackClock.style.borderColor =
      isTimedMode() && gameStarted && !gameOver && activeTimerColor === "b" ? "#e2271e" : "#ddd";
    blackClock.style.color =
      blackTimeLeft <= 10000 ? "#e2271e" : "#fff";
  }
}

function formatTime(ms) {
  ms = Math.max(0, Math.floor(ms));

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (ms < 10000) {
    const tenths = Math.floor((ms % 1000) / 100);
    return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getChosenTimeMs() {
  const customInput = document.getElementById("customTimeInput");
  const timeSelect = document.getElementById("timeSelect");

  let minutes = 5;

  if (customInput && customInput.value.trim() !== "") {
    const customValue = parseFloat(customInput.value);

    if (!isNaN(customValue) && customValue > 0) {
      minutes = customValue;
    }
  } else if (timeSelect) {
    minutes = parseFloat(timeSelect.value);
  }

  minutes = Math.min(Math.max(minutes, 0.25), 180);

  return minutes * 60 * 1000;
}

/* =========================================================
   PROMOTION
========================================================= */

function choosePromotion(color) {
  let choice = prompt("Promote pawn to: Q, R, B, or N", "Q");

  if (!choice) choice = "Q";

  choice = choice.toUpperCase();

  if (!["Q", "R", "B", "N"].includes(choice)) {
    choice = "Q";
  }

  return color + choice;
}

/* =========================================================
   UNDO
========================================================= */

function undoMove() {
  stopTimerLoop();
  clearRobotMoveTimeout();

  if (history.length === 0) {
    alert("No moves to undo.");
    return;
  }

  let undoSteps = 1;

  // In bot mode, if the bot has just replied, undo both bot move and your move.
  if (isBotMode() && turn === humanColor && history.length >= 2) {
    undoSteps = 2;
  }

  let previous = null;

  for (let i = 0; i < undoSteps; i++) {
    previous = history.pop();
    if (!previous) break;
  }

  if (!previous) return;

  restoreState(previous);

  const overlay = document.getElementById("endOverlay");
  if (overlay) overlay.style.display = "none";

  render();

  if (isTimedMode() && gameStarted && !gameOver) {
    lastTickTime = Date.now();
    startTimerLoop();
  }
}

function restoreState(previous) {
  board = previous.board;
  turn = previous.turn;
  selected = null;
  legalMoves = [];
  flipped = previous.flipped;
  gameOver = previous.gameOver;
  moveLog = previous.moveLog;
  fullMoveNumber = previous.fullMoveNumber;
  enPassantTarget = previous.enPassantTarget;
  castlingRights = previous.castlingRights;

  if (typeof previous.showSuggestions === "boolean") {
    showSuggestions = previous.showSuggestions;
  }

  if (previous.gameMode) {
    gameMode = previous.gameMode;
  }

  if (previous.selectedBotId) {
    selectedBotId = previous.selectedBotId;
  }

  if (previous.robotDifficulty) {
    robotDifficulty = previous.robotDifficulty;
  }

  if (typeof previous.gameStarted === "boolean") {
    gameStarted = previous.gameStarted;
  }

  if (typeof previous.whiteTimeLeft === "number") {
    whiteTimeLeft = previous.whiteTimeLeft;
  }

  if (typeof previous.blackTimeLeft === "number") {
    blackTimeLeft = previous.blackTimeLeft;
  }

  if (typeof previous.initialTimeMs === "number") {
    initialTimeMs = previous.initialTimeMs;
  }

  activeTimerColor = previous.activeTimerColor || (isTimedMode() ? turn : null);
  lastTickTime = Date.now();
  robotThinking = false;

  updateGameText();
  updateModePanels();
}

/* =========================================================
   FLIP BOARD
========================================================= */

function flipBoard() {
  flipped = !flipped;
  render();
}

/* =========================================================
   SUGGESTION TOGGLE
========================================================= */

function toggleSuggestions() {
  showSuggestions = !showSuggestions;
  render();
}

function setupSuggestionToggle() {
  const controls = document.querySelector(".controls");
  if (!controls) return;

  if (document.getElementById("suggestionToggle")) return;

  const btn = document.createElement("button");
  btn.id = "suggestionToggle";
  btn.className = "ctrl";
  btn.type = "button";
  btn.onclick = toggleSuggestions;

  controls.appendChild(btn);
  updateSuggestionButton();
}

function updateSuggestionButton() {
  const btn = document.getElementById("suggestionToggle");
  if (!btn) return;

  btn.textContent = showSuggestions ? "Suggestions: ON" : "Suggestions: OFF";
  btn.title = showSuggestions
    ? "Click to hide move suggestions"
    : "Click to show move suggestions";

  if (showSuggestions) {
    btn.style.background = "#14963c";
    btn.style.boxShadow =
      "0 6px 0 #0d5f26, 0 10px 16px rgba(20, 150, 60, 0.25)";
  } else {
    btn.style.background = "#525458";
    btn.style.boxShadow =
      "0 6px 0 #303236, 0 10px 16px rgba(0, 0, 0, 0.2)";
  }
}

/* =========================================================
   ULTIMATE UI CONTROLS
========================================================= */

function setupUltimateControls() {
  const panel = document.querySelector(".panel");
  const controls = document.querySelector(".controls");

  if (!panel || !controls) return;

  if (!document.getElementById("ultimatePanel")) {
    const ultimatePanel = document.createElement("div");
    ultimatePanel.id = "ultimatePanel";

    ultimatePanel.style.background = "#f4f2ef";
    ultimatePanel.style.borderRadius = "14px";
    ultimatePanel.style.padding = "14px";
    ultimatePanel.style.margin = "12px 0";
    ultimatePanel.style.border = "1px solid rgba(82,84,88,0.15)";
    ultimatePanel.style.boxShadow = "inset 0 0 0 1px rgba(255,255,255,0.5)";

    ultimatePanel.innerHTML = `
      <label for="modeSelect">
        Choose game mode
      </label>

      <select id="modeSelect" class="theme-select">
        <option value="friend">Friend Mode — 2 Players</option>
        <option value="blitz">Blitz Mode — 2 Players Timed</option>
        <option value="bot">Bot Arena — You vs Bot Timed</option>
      </select>

      <div id="botSelectWrap" style="margin-top:12px;">
        <label for="botSelect" style="display:block;font-weight:900;margin-bottom:6px;">
          Choose your bot opponent
        </label>

        <select id="botSelect" class="theme-select"></select>

        <div id="botInfoCard" style="
          margin-top:10px;
          padding:10px;
          background:#fff;
          border-radius:10px;
          border-left:6px solid #e2271e;
          font-weight:900;
          line-height:1.4;
        "></div>
      </div>

      <div id="timeSelectWrap" style="margin-top:12px;">
        <label for="timeSelect" style="display:block;font-weight:900;margin-bottom:6px;">
          Choose blitz time
        </label>

        <select id="timeSelect" class="theme-select">
          <option value="1">1 minute</option>
          <option value="3">3 minutes</option>
          <option value="5" selected>5 minutes</option>
          <option value="10">10 minutes</option>
          <option value="15">15 minutes</option>
          <option value="30">30 minutes</option>
        </select>

        <label for="customTimeInput" style="display:block;font-weight:900;margin-top:10px;margin-bottom:6px;">
          Or custom minutes
        </label>

        <input id="customTimeInput" type="number" min="0.25" max="180" step="0.25" placeholder="Example: 2.5" style="
          width:100%;
          padding:10px;
          border:2px solid #ddd;
          border-radius:10px;
          font-weight:900;
          font-family:inherit;
        ">
      </div>
    `;

    const status = document.getElementById("status");

    if (status) {
      panel.insertBefore(ultimatePanel, status);
    } else {
      panel.prepend(ultimatePanel);
    }
  }

  setupModeSelect();
  setupBotSelectOptions();
  setupTimerDisplayPanel();

  if (!document.getElementById("startMatchBtn")) {
    const startBtn = document.createElement("button");
    startBtn.id = "startMatchBtn";
    startBtn.className = "ctrl danger";
    startBtn.type = "button";
    startBtn.textContent = "Start Match";
    startBtn.onclick = startMatch;

    controls.appendChild(startBtn);
  }

  updateModePanels();
  updateBotInfoCard();
}

function setupModeSelect() {
  const modeSelect = document.getElementById("modeSelect");
  if (!modeSelect) return;

  modeSelect.value = gameMode;

  modeSelect.addEventListener("change", function () {
    gameMode = this.value;
    newGame();
  });
}

function setupBotSelectOptions() {
  const botSelect = document.getElementById("botSelect");
  if (!botSelect) return;

  botSelect.innerHTML = "";

  BOT_PROFILES.forEach(bot => {
    const option = document.createElement("option");
    option.value = bot.id;
    option.textContent = `${bot.name} — ${bot.level}`;
    botSelect.appendChild(option);
  });

  botSelect.value = selectedBotId;

  botSelect.addEventListener("change", function () {
    selectedBotId = this.value;
    robotDifficulty = getSelectedBot().difficulty;
    newGame();
  });
}

function setupTimerDisplayPanel() {
  const panel = document.querySelector(".panel");
  if (!panel) return;

  if (document.getElementById("timerPanel")) return;

  const timerPanel = document.createElement("div");
  timerPanel.id = "timerPanel";

  timerPanel.style.display = "grid";
  timerPanel.style.gridTemplateColumns = "1fr 1fr";
  timerPanel.style.gap = "10px";
  timerPanel.style.margin = "14px 0";

  timerPanel.innerHTML = `
    <div style="
      background:#fff;
      border:3px solid #ddd;
      border-radius:12px;
      padding:12px;
      text-align:center;
      box-shadow: inset 0 0 0 1px rgba(0,0,0,0.04);
    ">
      <div id="whiteClockLabel" style="font-weight:900;color:#525458;margin-bottom:5px;">White</div>
      <div id="whiteClock" style="
        font-size:34px;
        font-weight:900;
        font-family:Consolas, Monaco, monospace;
      ">5:00</div>
    </div>

    <div style="
      background:#111;
      color:#fff;
      border:3px solid #ddd;
      border-radius:12px;
      padding:12px;
      text-align:center;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
    ">
      <div id="blackClockLabel" style="font-weight:900;color:#f7f5f2;margin-bottom:5px;">Black</div>
      <div id="blackClock" style="
        font-size:34px;
        font-weight:900;
        font-family:Consolas, Monaco, monospace;
      ">5:00</div>
    </div>
  `;

  const status = document.getElementById("status");

  if (status) {
    panel.insertBefore(timerPanel, status);
  } else {
    panel.prepend(timerPanel);
  }
}

function updateModePanels() {
  const botWrap = document.getElementById("botSelectWrap");
  const timeWrap = document.getElementById("timeSelectWrap");
  const startBtn = document.getElementById("startMatchBtn");
  const modeSelect = document.getElementById("modeSelect");

  if (modeSelect) modeSelect.value = gameMode;

  if (botWrap) {
    botWrap.style.display = isBotMode() ? "block" : "none";
  }

  if (timeWrap) {
    timeWrap.style.display = isTimedMode() ? "block" : "none";
  }

  if (startBtn) {
    startBtn.style.display = isTimedMode() ? "inline-block" : "none";

    if (gameMode === "blitz") {
      startBtn.textContent = "Start Blitz";
    } else if (gameMode === "bot") {
      startBtn.textContent = "Start Bot Match";
    }
  }

  updateTimerDisplays();
}

function updateBotInfoCard() {
  const card = document.getElementById("botInfoCard");
  const blackClockLabel = document.getElementById("blackClockLabel");
  const whiteClockLabel = document.getElementById("whiteClockLabel");

  if (whiteClockLabel) {
    whiteClockLabel.textContent = isBotMode() ? "You" : "White";
  }

  if (blackClockLabel) {
    blackClockLabel.textContent = isBotMode() ? getSelectedBot().name : "Black";
  }

  if (!card) return;

  const bot = getSelectedBot();

  card.innerHTML = `
    <div>${bot.name}</div>
    <div style="color:#525458;font-size:13px;">${bot.title}</div>
    <div style="margin-top:4px;color:#e2271e;">Level: ${bot.level}</div>
  `;
}

/* =========================================================
   THEME CHANGER
========================================================= */

function setupThemeChanger() {
  const themeSelect = document.getElementById("themeSelect");

  document.body.classList.add("theme-classic");

  if (!themeSelect) return;

  themeSelect.addEventListener("change", function () {
    document.body.classList.remove(
      "theme-classic",
      "theme-ice",
      "theme-forest",
      "theme-midnight",
      "theme-royal"
    );

    document.body.classList.add("theme-" + this.value);
  });
}

function getNetworkServerUrl() {
  const serverInput = document.getElementById("networkServer");
  return serverInput && serverInput.value.trim()
    ? serverInput.value.trim()
    : DEFAULT_NETWORK_SERVER;
}

function setupNetworkControls() {
  const roomInput = document.getElementById("roomIdInput");
  const serverInput = document.getElementById("networkServer");
  const createBtn = document.getElementById("createRoomBtn");
  const joinBtn = document.getElementById("joinRoomBtn");
  const leaveBtn = document.getElementById("leaveRoomBtn");

  if (!roomInput || !serverInput || !createBtn || !joinBtn || !leaveBtn) return;

  createBtn.onclick = () => {
    createRoom();
  };

  joinBtn.onclick = () => {
    const roomCode = roomInput.value.trim();
    if (!roomCode) {
      updateNetworkMessage("Enter a room code first.");
      return;
    }
    joinRoom(roomCode);
  };

  leaveBtn.onclick = leaveRoom;

  if (!serverInput.value.trim()) {
    serverInput.value = DEFAULT_NETWORK_SERVER;
  }

  updateNetworkStatus();
}

function updateNetworkMessage(message) {
  const share = document.getElementById("roomShare");
  if (!share) return;
  share.textContent = message;
}

function updateNetworkStatus() {
  const statusEl = document.getElementById("networkStatus");
  const leaveBtn = document.getElementById("leaveRoomBtn");
  if (!statusEl || !leaveBtn) return;

  if (isOnline) {
    const player = networkPlayerColor ? networkPlayerColor.toUpperCase() : "N/A";
    statusEl.textContent = `Online room ${roomId} as ${player} — ${connectedPlayers}/2 connected.`;
    leaveBtn.disabled = false;
  } else {
    statusEl.textContent = "Offline mode. Enter a room code and connect.";
    leaveBtn.disabled = true;
  }
}

function connectSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  const url = getNetworkServerUrl();
  socket = new WebSocket(url);

  socket.addEventListener("open", () => {
    updateNetworkMessage("Connected to server.");
    processPendingNetworkActions();
    updateNetworkStatus();
  });

  socket.addEventListener("close", () => {
    isOnline = false;
    roomId = null;
    networkPlayerColor = null;
    connectedPlayers = 0;
    socket = null;
    updateNetworkMessage("Disconnected from server.");
    updateNetworkStatus();
    render();
  });

  socket.addEventListener("error", () => {
    updateNetworkMessage("Unable to connect. Check the server URL.");
    updateNetworkStatus();
  });

  socket.addEventListener("message", event => {
    try {
      const msg = JSON.parse(event.data);
      handleNetworkMessage(msg);
    } catch (error) {
      console.error("Invalid network message", error, event.data);
    }
  });
}

function processPendingNetworkActions() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  pendingSocketActions.forEach(message => socket.send(JSON.stringify(message)));
  pendingSocketActions = [];
}

function sendNetworkMessage(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    pendingSocketActions.push(message);
    connectSocket();
    return;
  }
  socket.send(JSON.stringify(message));
}

function createRoom() {
  connectSocket();
  sendNetworkMessage({
    type: "createRoom",
    state: getNetworkState()
  });
  updateNetworkMessage("Creating room...");
}

function joinRoom(roomCode) {
  connectSocket();
  sendNetworkMessage({ type: "joinRoom", roomId: roomCode });
  updateNetworkMessage(`Joining room ${roomCode}...`);
}

function leaveRoom() {
  if (socket) {
    socket.close();
  }
  isOnline = false;
  roomId = null;
  networkPlayerColor = null;
  connectedPlayers = 0;
  updateNetworkMessage("Left room.");
  updateNetworkStatus();
  render();
}

function getNetworkState() {
  return {
    board: copyBoard(board),
    turn,
    fullMoveNumber,
    moveLog: [...moveLog],
    gameOver,
    gameStarted,
    whiteTimeLeft,
    blackTimeLeft,
    activeTimerColor,
    castlingRights: JSON.parse(JSON.stringify(castlingRights)),
    enPassantTarget: enPassantTarget ? { ...enPassantTarget } : null
  };
}

function applyNetworkState(state) {
  if (!state) return;

  board = state.board;
  turn = state.turn;
  fullMoveNumber = state.fullMoveNumber;
  moveLog = state.moveLog || [];
  gameOver = state.gameOver;
  gameStarted = state.gameStarted;
  whiteTimeLeft = state.whiteTimeLeft;
  blackTimeLeft = state.blackTimeLeft;
  activeTimerColor = state.activeTimerColor;
  castlingRights = state.castlingRights || {
    w: { kingSide: true, queenSide: true },
    b: { kingSide: true, queenSide: true }
  };
  enPassantTarget = state.enPassantTarget || null;
  selected = null;
  legalMoves = [];
  render();
}

function sendNetworkMove(fr, fc, tr, tc, moveData) {
  if (!isOnline || !roomId) return;

  sendNetworkMessage({
    type: "move",
    roomId,
    from: { r: fr, c: fc },
    to: { r: tr, c: tc },
    moveData,
    state: getNetworkState()
  });

  updateNetworkMessage("Move sent. Waiting for opponent...");
}

function handleNetworkMessage(msg) {
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case "roomCreated":
      roomId = msg.roomId;
      isOnline = true;
      isRoomOwner = true;
      networkPlayerColor = "w";
      connectedPlayers = msg.players || 1;
      updateNetworkStatus();
      updateNetworkMessage(`Room ${roomId} created. Share the code with your opponent.`);
      if (msg.state) applyNetworkState(msg.state);
      break;

    case "roomJoined":
      roomId = msg.roomId;
      isOnline = true;
      isRoomOwner = false;
      networkPlayerColor = "b";
      connectedPlayers = msg.players || 2;
      updateNetworkStatus();
      updateNetworkMessage(`Joined room ${roomId}. You are Black.`);
      if (msg.state) applyNetworkState(msg.state);
      break;

    case "roomUpdate":
      roomId = msg.roomId || roomId;
      isOnline = true;
      connectedPlayers = msg.players || connectedPlayers;
      updateNetworkStatus();
      if (msg.state) applyNetworkState(msg.state);
      if (msg.message) updateNetworkMessage(msg.message);
      break;

    case "error":
      updateNetworkMessage(msg.message || "Network error occurred.");
      break;

    default:
      console.warn("Unknown network message type:", msg.type);
  }
}

/* =========================================================
   CHECK TOAST + END SCREEN
========================================================= */

function showCheckToast() {
  const toast = document.getElementById("checkToast");
  if (!toast) return;

  toast.classList.remove("show");
  void toast.offsetWidth;
  toast.classList.add("show");
}

function showEndScreen(title, message) {
  const overlay = document.getElementById("endOverlay");
  const titleEl = document.getElementById("endTitle");
  const messageEl = document.getElementById("endMessage");
  const status = document.getElementById("status");

  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;
  if (overlay) overlay.style.display = "flex";
  if (status) status.textContent = `${title}: ${message}`;
}

/* =========================================================
   HELPERS
========================================================= */

function copyBoard(currentBoard) {
  return currentBoard.map(row => [...row]);
}

function isInside(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function toSquareName(r, c) {
  return files[c] + (8 - r);
}

function buildSquareLabel(r, c) {
  const squareName = toSquareName(r, c);
  const piece = board[r][c];

  if (!piece) {
    return `${squareName}, empty`;
  }

  const colorName = piece[0] === "w" ? "White" : "Black";

  const pieceNames = {
    K: "King",
    Q: "Queen",
    R: "Rook",
    B: "Bishop",
    N: "Knight",
    P: "Pawn"
  };

  return `${squareName}, ${colorName} ${pieceNames[piece[1]]}`;
}

/* =========================================================
   MAKE FUNCTIONS GLOBAL FOR HTML BUTTONS
========================================================= */

window.newGame = newGame;
window.undoMove = undoMove;
window.flipBoard = flipBoard;
window.toggleSuggestions = toggleSuggestions;
window.startMatch = startMatch;

/* =========================================================
   START GAME
========================================================= */

setupThemeChanger();
setupUltimateControls();
setupNetworkControls();
setupSuggestionToggle();
newGame();
