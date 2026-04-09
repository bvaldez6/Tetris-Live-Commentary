// ─────────────────────────────────────────────────────────────────
// src/main.js — Entry point / wiring
//
// The only file that imports from both modules.
// Passes callbacks so tetris.js and commentary.js never import each other.
// ─────────────────────────────────────────────────────────────────

import { initTetris, startTetrisGame, toggleTetrisPause, getBoardState } from './tetris.js';
import { initCommentary, resetCommentary, triggerCommentary, testConnection, setCommentMode } from './commentary.js';

// ── Canvas elements ──
const boardCanvas = document.getElementById('boardCanvas');
const nextCanvas  = document.getElementById('nextCanvas');

// Give commentary a way to read the game board
initCommentary(() => getBoardState());

// Give the game engine its two outbound callbacks
initTetris(
  boardCanvas,
  nextCanvas,
  (event) => triggerCommentary(event),   // game → commentary
  (stats)  => {                          // game → stats UI
    document.getElementById('statScore').textContent  = stats.score;
    document.getElementById('statLines').textContent  = stats.lines;
    document.getElementById('statLevel').textContent  = stats.level;
    document.getElementById('statHeight').textContent = stats.maxColHeight;
    document.getElementById('statHoles').textContent  = stats.holes;
  },
);

// ── Button handlers (called from index.html onclick) ──
// Expose on window so the HTML buttons can call them
window.startGame = function () {
  resetCommentary();
  document.getElementById('commentaryBox').textContent = 'Game started — commentary incoming...';
  document.getElementById('historyLog').innerHTML = '(none yet)';
  document.getElementById('moveCount').textContent = '';
  document.getElementById('gameOverMsg').style.display = 'none';
  startTetrisGame();
};

window.togglePause      = () => toggleTetrisPause();
window.testConnection   = () => testConnection();
window.setCommentMode   = (val) => setCommentMode(val);
