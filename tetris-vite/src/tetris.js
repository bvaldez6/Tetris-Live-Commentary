// ─────────────────────────────────────────────────────────────────
// src/tetris.js — Game engine
//
// Owns: board state, piece movement, collision, line clears, scoring,
//       drawing to canvas.
//
// Does NOT know about commentary or Ollama.
// Communicates outward via callbacks passed to initTetris().
// ─────────────────────────────────────────────────────────────────

const COLS = 10, ROWS = 20, CELL = 20;

const PIECES = {
  I: { shape: [[1,1,1,1]],         color: '#00cfcf' },
  O: { shape: [[1,1],[1,1]],       color: '#cfcf00' },
  T: { shape: [[0,1,0],[1,1,1]],   color: '#cf00cf' },
  S: { shape: [[0,1,1],[1,1,0]],   color: '#00cf00' },
  Z: { shape: [[1,1,0],[0,1,1]],   color: '#cf0000' },
  J: { shape: [[1,0,0],[1,1,1]],   color: '#0000cf' },
  L: { shape: [[0,0,1],[1,1,1]],   color: '#cf7700' },
};
const PIECE_NAMES = Object.keys(PIECES);

const COMMENT_EVERY = 3;

// ── Module-level state ──
let board, current, nextType;
let score, lines, level;
let gameOver, paused, running;
let movesSinceComment;
let dropTimer, dropInterval;
let bCtx, nCtx;
let onCommentaryTrigger = () => {};
let onStatsUpdate       = () => {};

// ─────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────

export function initTetris(boardCanvas, nextCanvas, commentaryCallback, statsCallback) {
  bCtx = boardCanvas.getContext('2d');
  nCtx = nextCanvas.getContext('2d');
  onCommentaryTrigger = commentaryCallback;
  onStatsUpdate       = statsCallback;
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  drawBoard();
  registerKeys();
}

export function startTetrisGame() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  score = 0; lines = 0; level = 1;
  gameOver = false; paused = false; running = true;
  movesSinceComment = 0;
  clearInterval(dropTimer);
  nextType = randomPiece();
  spawnPiece();
  dropInterval = getDropInterval();
  dropTimer = setInterval(tick, dropInterval);
  onStatsUpdate(getStats());
  drawBoard();
  drawNext();
  onCommentaryTrigger('game_start');
}

export function toggleTetrisPause() {
  if (!running) return;
  paused = !paused;
  if (!paused) dropTimer = setInterval(tick, dropInterval);
  else clearInterval(dropTimer);
}

// Called by commentary.js (via main.js) to snapshot board state for a prompt
export function getBoardState() {
  return {
    binary:       board.map(row => row.map(c => c !== 0 ? 1 : 0)),
    currentPiece: current ? current.type : null,
    nextPiece:    nextType || null,
    score, lines, level,
  };
}

// ─────────────────────────────────────────────
// INTERNAL — Game loop
// ─────────────────────────────────────────────

function tick() {
  if (!running || paused || gameOver) return;
  if (!moveDown()) lockPiece();
  drawBoard();
}

function moveDown() {
  if (!collides(current.shape, current.x, current.y + 1)) {
    current.y++;
    return true;
  }
  return false;
}

function lockPiece() {
  current.shape.forEach((row, dr) => {
    row.forEach((v, dc) => {
      if (v) board[current.y + dr][current.x + dc] = current.color;
    });
  });
  const cleared = clearLines();
  updateScore(cleared);
  movesSinceComment++;
  if (movesSinceComment >= COMMENT_EVERY) {
    movesSinceComment = 0;
    onCommentaryTrigger(cleared > 0 ? `${cleared}_line_clear` : 'piece_placed');
  }
  spawnPiece();
  onStatsUpdate(getStats());
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(c => c !== 0)) {
      board.splice(r, 1);
      board.unshift(Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  return cleared;
}

function updateScore(cleared) {
  const pts = [0, 100, 300, 500, 800];
  score += (pts[cleared] || 0) * level;
  lines += cleared;
  level = Math.floor(lines / 10) + 1;
  dropInterval = getDropInterval();
  clearInterval(dropTimer);
  if (running && !paused) dropTimer = setInterval(tick, dropInterval);
}

// ─────────────────────────────────────────────
// INTERNAL — Movement / Rotation
// ─────────────────────────────────────────────

function collides(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c, ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx] !== 0) return true;
    }
  }
  return false;
}

function rotate(shape) {
  const rows = shape.length, cols = shape[0].length;
  return Array.from({ length: cols }, (_, c) =>
    Array.from({ length: rows }, (_, r) => shape[rows - 1 - r][c])
  );
}

function tryMove(dx, dy) {
  if (!running || paused || gameOver) return;
  if (!collides(current.shape, current.x + dx, current.y + dy)) {
    current.x += dx; current.y += dy;
    drawBoard();
  }
}

function tryRotate() {
  if (!running || paused || gameOver) return;
  const rotated = rotate(current.shape);
  if      (!collides(rotated, current.x,     current.y)) { current.shape = rotated; }
  else if (!collides(rotated, current.x + 1, current.y)) { current.shape = rotated; current.x++; }
  else if (!collides(rotated, current.x - 1, current.y)) { current.shape = rotated; current.x--; }
  drawBoard();
}

function hardDrop() {
  if (!running || paused || gameOver) return;
  while (!collides(current.shape, current.x, current.y + 1)) current.y++;
  lockPiece();
  drawBoard();
}

function registerKeys() {
  document.addEventListener('keydown', e => {
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)) e.preventDefault();
    switch (e.code) {
      case 'ArrowLeft':  tryMove(-1, 0); break;
      case 'ArrowRight': tryMove(1, 0);  break;
      case 'ArrowDown':  tryMove(0, 1);  break;
      case 'ArrowUp':    tryRotate();    break;
      case 'Space':      hardDrop();     break;
    }
  });
}

// ─────────────────────────────────────────────
// INTERNAL — Helpers
// ─────────────────────────────────────────────

function randomPiece() {
  return PIECE_NAMES[Math.floor(Math.random() * PIECE_NAMES.length)];
}

function spawnPiece() {
  const type = nextType;
  nextType = randomPiece();
  const p = PIECES[type];
  current = {
    type,
    shape: p.shape.map(r => [...r]),
    color: p.color,
    x: Math.floor((COLS - p.shape[0].length) / 2),
    y: 0,
  };
  if (collides(current.shape, current.x, current.y)) {
    gameOver = true; running = false;
    clearInterval(dropTimer);
    onCommentaryTrigger('game_over');
    document.getElementById('gameOverMsg').style.display = 'block';
  }
  drawNext();
}

function getDropInterval() {
  return Math.max(100, 800 - (level - 1) * 70);
}

function getStats() {
  const enc = encodeBoard();
  return { score, lines, level, maxColHeight: enc.maxColHeight, holes: enc.holes };
}

function encodeBoard() {
  const binary = board.map(row => row.map(c => c !== 0 ? 1 : 0));
  const colHeights = [];
  for (let c = 0; c < COLS; c++) {
    let h = 0;
    for (let r = 0; r < ROWS; r++) {
      if (binary[r][c] === 1) { h = ROWS - r; break; }
    }
    colHeights.push(h);
  }
  const maxColHeight = Math.max(...colHeights);
  let holes = 0;
  for (let c = 0; c < COLS; c++) {
    let foundFilled = false;
    for (let r = 0; r < ROWS; r++) {
      if (binary[r][c] === 1) foundFilled = true;
      else if (foundFilled) holes++;
    }
  }
  return { binary, colHeights, maxColHeight, holes };
}

// ─────────────────────────────────────────────
// INTERNAL — Drawing
// ─────────────────────────────────────────────

function drawBoard() {
  bCtx.fillStyle = '#111';
  bCtx.fillRect(0, 0, COLS * CELL, ROWS * CELL);

  board.forEach((row, r) => {
    row.forEach((color, c) => {
      if (color) {
        bCtx.fillStyle = color;
        bCtx.fillRect(c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2);
      }
    });
  });

  if (current && !gameOver) {
    // Ghost
    let ghostY = current.y;
    while (!collides(current.shape, current.x, ghostY + 1)) ghostY++;
    bCtx.fillStyle = 'rgba(255,255,255,0.15)';
    current.shape.forEach((row, dr) => {
      row.forEach((v, dc) => {
        if (v && ghostY + dr !== current.y + dr)
          bCtx.fillRect((current.x + dc) * CELL + 1, (ghostY + dr) * CELL + 1, CELL - 2, CELL - 2);
      });
    });
    // Active piece
    bCtx.fillStyle = current.color;
    current.shape.forEach((row, dr) => {
      row.forEach((v, dc) => {
        if (v) bCtx.fillRect((current.x + dc) * CELL + 1, (current.y + dr) * CELL + 1, CELL - 2, CELL - 2);
      });
    });
  }

  bCtx.strokeStyle = '#222';
  bCtx.lineWidth = 0.5;
  for (let r = 0; r <= ROWS; r++) {
    bCtx.beginPath(); bCtx.moveTo(0, r * CELL); bCtx.lineTo(COLS * CELL, r * CELL); bCtx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    bCtx.beginPath(); bCtx.moveTo(c * CELL, 0); bCtx.lineTo(c * CELL, ROWS * CELL); bCtx.stroke();
  }
}

function drawNext() {
  nCtx.fillStyle = '#111';
  nCtx.fillRect(0, 0, 80, 80);
  if (!nextType) return;
  const p = PIECES[nextType];
  const s = p.shape;
  const ox = Math.floor((4 - s[0].length) / 2);
  const oy = Math.floor((4 - s.length) / 2);
  nCtx.fillStyle = p.color;
  s.forEach((row, r) => row.forEach((v, c) => {
    if (v) nCtx.fillRect((ox + c) * 20 + 1, (oy + r) * 20 + 1, 18, 18);
  }));
}
