[README (1).md](https://github.com/user-attachments/files/26598067/README.1.md)
# Tetris Live Commentary — Setup Guide
Valdez · Tarango · Andrade · Spring 2026

---

## What this is
A playable Tetris game that sends the current board state to a local LLM (via Ollama)
and generates live esports-style commentary every 3 piece placements.

---

## Step 1 — Install Node.js

Download and install Node.js (LTS version) from:
    https://nodejs.org

This gives you both `node` and `npm`, which are needed to run the project.
To verify it installed correctly, open a terminal and run:

    node --version
    npm --version

Both should print a version number.

---

## Step 2 — Install Ollama

Download and install Ollama from:
    https://ollama.com

Available for Windows, Mac, and Linux.
You can also open the Ollama app after installing to manage models from there.

---

## Step 3 — Download a model

Open a terminal (Command Prompt or PowerShell on Windows) and run:

    ollama pull deepseek-r1:8b

This downloads the DeepSeek R1 8B model (~5 GB). You can use a different model
if you prefer — just make sure to enter its name in the Model field in the game.

Other models that work well:
    ollama pull llama3
    ollama pull phi3
    ollama pull mistral

Smaller models = faster responses, especially on CPU-only machines.

---

## Step 4 — Start Ollama with CORS enabled

This step is REQUIRED. Without it the browser cannot talk to Ollama.

On Windows (Command Prompt):

    set OLLAMA_ORIGINS=* && ollama serve

On Mac / Linux (Terminal):

    OLLAMA_ORIGINS="*" ollama serve

Leave this terminal window open while you play.

---

## Step 5 — Install project dependencies

This only needs to be done once. In a new terminal, navigate to the project folder
(the tetris-vite folder from the zip) and run:

    cd tetris-vite
    npm install

This downloads Vite and any other dependencies into a node_modules/ folder.
It may take a minute. You only need to do this once.

---

## Step 6 — Run the game

In the same terminal, run:

    npm run dev

You should see output like:

    VITE v5.x.x  ready in Xms
    ➜  Local:   http://localhost:5173/

Open that URL in your browser. The game will load automatically.
Keep this terminal open while playing — closing it stops the dev server.

---

## Step 7 — Configure and play

1. In the Ollama URL field enter:   http://127.0.0.1:11434
2. In the Model field enter:        deepseek-r1:8b
   (or whatever model you pulled in Step 3)
3. Click "Test Connection" — you should see a green success message.
4. Click "New Game" and start playing!

Controls:
    Arrow Left / Right  — move piece
    Arrow Up            — rotate
    Arrow Down          — soft drop
    Space               — hard drop

Commentary fires:
    - Once at game start
    - Every 3 piece placements after that
    - Once on game over

---

## Troubleshooting

"Failed to fetch" error
    → Make sure Ollama is running (Step 4)
    → Make sure you used OLLAMA_ORIGINS=* before ollama serve
    → Make sure the URL in the game is http://127.0.0.1:11434 (not localhost)

Model not found error
    → Run: ollama pull deepseek-r1:8b  (or your chosen model)
    → Make sure the model name in the game matches exactly what you pulled

Slow commentary
    → Normal on CPU-only machines — deepseek-r1:8b can take 20-60 seconds
    → Try a smaller/faster model: ollama pull phi3

npm install fails
    → Make sure Node.js is installed: node --version
    → Make sure you are inside the tetris-vite folder when running npm install

Game does not load at localhost:5173
    → Make sure npm run dev is still running in your terminal
    → Try a different browser

---

## Building for submission / deployment

If you want a self-contained folder you can zip and submit or upload:

    npm run build

This creates a dist/ folder with everything bundled. You can zip that folder
and open dist/index.html directly, or host it anywhere.

---

## Project structure

    tetris-vite/
    ├── index.html          ← HTML shell
    ├── package.json        ← project config and dependencies
    ├── vite.config.js      ← Vite build config
    └── src/
        ├── main.js         ← entry point, wires the two modules together
        ├── tetris.js       ← game engine (board, pieces, movement, drawing)
        ├── commentary.js   ← LLM module (prompt building, Ollama calls, queue logic)
        └── style.css       ← all styles

---

## How the pipeline works

1. Game State     — pure 0/1 board matrix (20 rows x 10 cols), active piece type, next piece
2. State Encoder  — computes colHeights, holes, maxColHeight from the 0/1 board
3. Prompt Builder — combines raw board + encoded summary into a structured prompt
4. Ollama LLM    — generates commentary from the prompt
5. Output         — displayed in the commentary box, logged in history

The raw 0/1 grid AND the encoded summary are both sent to the LLM so it has
full spatial context plus pre-computed features to work from.
