// ─────────────────────────────────────────────────────────────────
// src/commentary.js — LLM commentary module
//
// Owns: prompt building, Ollama API calls, queue/latest mode logic,
//       updating commentary DOM elements.
//
// Does NOT know about Tetris game internals.
// Gets board state via the callback passed to initCommentary().
// ─────────────────────────────────────────────────────────────────

const ESPORTS_SYSTEM =
  `You are an energetic esports broadcast commentator for a live Tetris tournament. ` +
  `Be dramatic and exciting. Comment on what's actually happening — do not repeat the ` +
  `raw numbers directly, interpret them naturally as a commentator would. Keep it to 1-3 sentences.`;

// ── Module state ──
let commentMode     = 'latest';
let commentaryBusy  = false;
let pendingEvent    = null;
let commentQueue    = [];
let commentaryCount = 0;
let getGameState    = () => ({});

// ─────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────

export function initCommentary(gameStateCallback) {
  getGameState = gameStateCallback;
}

export function resetCommentary() {
  commentaryBusy  = false;
  pendingEvent    = null;
  commentQueue    = [];
  commentaryCount = 0;
  updateQueueStatus();
}

export function setCommentMode(val) {
  commentMode  = val;
  pendingEvent = null;
  commentQueue = [];
  updateQueueStatus();
}

export function triggerCommentary(event) {
  if (commentMode === 'queue') {
    const snapshot = buildPrompt(event);
    commentQueue.push({ ...snapshot, event });
    updateQueueStatus();
    if (!commentaryBusy) processQueue();
  } else {
    if (commentaryBusy) {
      pendingEvent = event;
      updateQueueStatus();
      return;
    }
    runCommentary(buildPrompt(event), event);
  }
}

export async function testConnection() {
  const st = document.getElementById('olStatus');
  st.textContent = 'Testing...'; st.className = '';
  try {
    const url   = document.getElementById('olUrl').value.replace(/\/$/, '');
    const model = document.getElementById('olModel').value.trim();
    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, stream: false,
        messages: [
          { role: 'system', content: 'Reply only with the word CONNECTED.' },
          { role: 'user',   content: 'Test.' },
        ],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    let r = (d.message?.content || d.response || '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    st.textContent = `✓ Connected! Model said: "${r.slice(0, 60)}"`;
    st.className = 'ok';
  } catch (e) {
    st.textContent = `✗ Error: ${e.message}`;
    st.className = 'err';
  }
}

// ─────────────────────────────────────────────
// INTERNAL — Prompt builder
// ─────────────────────────────────────────────

function buildPrompt(event) {
  const state = getGameState();
  const enc   = encodeBinary(state.binary);

  const gridLines = state.binary.map((row, i) =>
    `r${String(i).padStart(2, '0')}: ${row.join(' ')}`
  ).join('\n');

  const prompt =
    `[EVENT]: ${event}\n\n` +
    `[RAW BOARD — 0=empty 1=filled, row 0=top row 19=floor]\n${gridLines}\n\n` +
    `[ENCODED SUMMARY]\n` +
    `current_piece: ${state.currentPiece || 'unknown'}-piece\n` +
    `next_piece: ${state.nextPiece || 'unknown'}-piece\n` +
    `score: ${state.score}\n` +
    `lines_cleared: ${state.lines}\n` +
    `level: ${state.level}\n` +
    `max_col_height: ${enc.maxColHeight}/20\n` +
    `holes: ${enc.holes}\n` +
    `col_heights: [${enc.colHeights.join(',')}]\n\n` +
    `[TASK] Generate live esports Tetris commentary based on the above state. ` +
    `Do not just read out the numbers — interpret them dramatically as a commentator. 1-3 sentences.`;

  return { prompt, system: ESPORTS_SYSTEM };
}

function encodeBinary(binary) {
  const ROWS = 20, COLS = 10;
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
  return { colHeights, maxColHeight, holes };
}

// ─────────────────────────────────────────────
// INTERNAL — Queue
// ─────────────────────────────────────────────

async function processQueue() {
  if (commentQueue.length === 0) { updateQueueStatus(); return; }
  const { prompt, system, event } = commentQueue.shift();
  await runCommentary({ prompt, system }, event);
  processQueue();
}

// ─────────────────────────────────────────────
// INTERNAL — Ollama fetch + DOM update
// ─────────────────────────────────────────────

async function runCommentary({ prompt, system }, event) {
  commentaryBusy = true;
  updateQueueStatus();

  const box = document.getElementById('commentaryBox');
  box.textContent = 'Generating commentary...';
  box.className = 'loading';
  document.getElementById('promptDebug').value = `[SYSTEM]\n${system}\n\n${prompt}`;

  try {
    const url   = document.getElementById('olUrl').value.replace(/\/$/, '');
    const model = document.getElementById('olModel').value.trim();
    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, stream: false,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const d = await res.json();
    let text = (d.message?.content || d.response || '').trim();
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    box.textContent = text;
    box.className = '';
    commentaryCount++;
    document.getElementById('moveCount').textContent =
      `Commentary #${commentaryCount} | event: ${event}` +
      (commentMode === 'queue' && commentQueue.length > 0 ? ` | ${commentQueue.length} queued` : '');
    addToHistory(event, text);
  } catch (e) {
    box.textContent = `⚠ ${e.message} — is Ollama running?`;
    box.className = '';
  }

  commentaryBusy = false;

  if (commentMode === 'latest' && pendingEvent !== null) {
    const evt = pendingEvent;
    pendingEvent = null;
    runCommentary(buildPrompt(evt), evt);
  }

  updateQueueStatus();
}

// ─────────────────────────────────────────────
// INTERNAL — DOM helpers
// ─────────────────────────────────────────────

function updateQueueStatus() {
  const el = document.getElementById('queueStatus');
  if (commentMode === 'queue') {
    el.textContent = commentaryBusy
      ? `Queue: ${commentQueue.length} waiting | generating...`
      : `Queue: ${commentQueue.length} waiting | idle`;
  } else {
    el.textContent = commentaryBusy
      ? `Generating...${pendingEvent ? ' (1 pending — will use latest board when done)' : ''}`
      : 'Idle';
  }
}

function addToHistory(event, text) {
  const log = document.getElementById('historyLog');
  if (log.textContent === '(none yet)') log.innerHTML = '';
  const entry = document.createElement('div');
  entry.className = 'history-entry';
  entry.textContent = `[${event}] ${text}`;
  log.insertBefore(entry, log.firstChild);
}
