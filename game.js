import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIGURATION & CONSTANTS ---
const TOTAL_LEVELS = 10;
const MAX_TIME_SECONDS = 300; // 5 Minutes total
const SCORE_FILE = path.join(__dirname, 'highscores.json');

// ANSI Colors for Visuals (No external libraries needed)
const C = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    bgRed: "\x1b[41m",
};

// --- STATE MANAGEMENT ---
const state = {
    level: 1,
    energy: 100, // Percentage
    startTime: Date.now(),
    endTime: 0,
    isGameOver: false,
    message: "Welcome to the paradox. Choose wisely.",
    history: [] // To show last few moves
};

// Bottle Physics (Hidden from player mostly)
let bottle = {
    lockedDir: 'CW', // or 'ACW'
    requiredForce: 0,
    maxCapacity: 0,  // If force > this, bottle breaks
    currentTightness: 0, // Errors add to this
    isOpen: false
};

// --- INPUT HANDLER ---
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (query) => new Promise((resolve) => rl.question(query, resolve));

// --- HELPER FUNCTIONS ---

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function clearScreen() {
    process.stdout.write('\x1b[2J\x1b[0f');
}

function loadHighScores() {
    if (!fs.existsSync(SCORE_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(SCORE_FILE, 'utf8'));
    } catch (e) { return []; }
}

function saveHighScore(score) {
    const scores = loadHighScores();
    scores.push({ date: new Date().toISOString().split('T')[0], score: score, time: getTimeElapsed() });
    scores.sort((a, b) => b.score - a.score); // Descending
    fs.writeFileSync(SCORE_FILE, JSON.stringify(scores.slice(0, 5), null, 2)); // Keep top 5
}

function getProgressBar(current, max, width = 20, color = C.green) {
    const percent = Math.max(0, Math.min(1, current / max));
    const fill = Math.floor(width * percent);
    const bar = "█".repeat(fill) + "-".repeat(width - fill);
    return `${color}[${bar}] ${Math.floor(percent * 100)}%${C.reset}`;
}

function generateBottle(level) {
    // Difficulty scales with level
    const baseForce = 20 + (level * 5); 
    const randomness = Math.floor(Math.random() * 20);
    
    bottle.lockedDir = Math.random() > 0.5 ? 'CW' : 'ACW';
    bottle.requiredForce = baseForce + randomness;
    
    // Twist: Capacity gets closer to required force as levels go up (Riskier)
    // Level 1: Capacity is 200% of required. Level 10: Capacity is 120% of required.
    const safetyMargin = 2.0 - (level * 0.08); 
    bottle.maxCapacity = Math.floor(bottle.requiredForce * safetyMargin);
    
    bottle.currentTightness = 0;
    bottle.isOpen = false;
}

function getTimeElapsed() {
    return Math.floor((Date.now() - state.startTime) / 1000);
}

function renderInterface() {
    clearScreen();
    const timeUsed = getTimeElapsed();
    const timeLeft = MAX_TIME_SECONDS - timeUsed;
    
    // Header
    console.log(`${C.cyan}=================================================${C.reset}`);
    console.log(`${C.bright}           THE TORQUE PARADOX - LEVEL ${state.level}/${TOTAL_LEVELS}${C.reset}`);
    console.log(`${C.cyan}=================================================${C.reset}`);
    
    // Stats
    console.log(`Time Left: ${timeLeft < 60 ? C.red : C.green}${timeLeft}s${C.reset} | Score Multiplier: x${state.level}`);
    console.log(`Energy:    ${getProgressBar(state.energy, 100, 20, state.energy < 30 ? C.red : C.green)}`);
    console.log("");

    // Bottle Art
    const tightnessVisual = bottle.currentTightness > 0 ? `${C.red}(JAMMED +${bottle.currentTightness})${C.reset}` : `${C.green}(NEUTRAL)${C.reset}`;
    
    console.log(`       ${C.yellow}_____${C.reset}`);
    console.log(`      ${C.yellow}[:::::]${C.reset}  <-- THE CAP ${tightnessVisual}`);
    console.log(`      ${C.white}|     |${C.reset}`);
    console.log(`      ${C.white}|     |${C.reset}  Status: ${bottle.isOpen ? C.green + "OPEN" + C.reset : C.red + "LOCKED" + C.reset}`);
    console.log(`      ${C.white}|_____|${C.reset}`);
    console.log("");

    // Message Log
    console.log(`${C.bright}LOG:${C.reset}`);
    state.history.slice(-3).forEach(log => console.log(` > ${log}`));
    console.log(` > ${C.yellow}${state.message}${C.reset}`);
    console.log(`${C.cyan}-------------------------------------------------${C.reset}`);
    console.log("Commands: 'cw <force>', 'acw <force>' (e.g., 'cw 25')");
}

// --- CORE GAME LOGIC ---

async function processMove(input) {
    const parts = input.trim().toLowerCase().split(' ');
    const dir = parts[0];
    const force = parseInt(parts[1]);

    // Validation
    if ((dir !== 'cw' && dir !== 'acw') || isNaN(force) || force <= 0) {
        state.message = "Invalid command. Use 'cw 10' or 'acw 20'.";
        return;
    }

    // 1. Check Energy Cost (Force = Energy Loss)
    const energyCost = Math.ceil(force / 2); // 50 force = 25 energy lost
    if (state.energy < energyCost) {
        state.isGameOver = true;
        state.message = `${C.bgRed} EXHAUSTED! You passed out before opening the bottle. ${C.reset}`;
        return;
    }
    state.energy -= energyCost;

    // 2. Check Breakage (Too much force)
    if (force > bottle.maxCapacity) {
        state.isGameOver = true;
        state.message = `${C.bgRed} CRACK! You applied ${force}N force. The bottle shattered! ${C.reset}`;
        return;
    }

    // 3. Physics Logic
    const attemptDir = dir.toUpperCase();
    
    // LOGIC: If we rotate in the LOCKED direction (Bad)
    if (attemptDir === bottle.lockedDir) {
        bottle.currentTightness += force;
        state.history.push(`${C.red}Applied ${force}N ${attemptDir}... It feels stuck.${C.reset}`);
        state.message = "Mistake! The cap didn't budge and feels tighter now.";
    } 
    // LOGIC: If we rotate in the OPEN direction (Good)
    else {
        // First, we must overcome the JAM (currentTightness)
        if (bottle.currentTightness > 0) {
            if (force >= bottle.currentTightness) {
                // Jam cleared, remaining force applies to opening
                const remainingForce = force - bottle.currentTightness;
                bottle.currentTightness = 0;
                
                if (remainingForce >= bottle.requiredForce) {
                    bottle.isOpen = true;
                    state.message = "SUCCESS! The jamming cleared and the cap flew off!";
                } else {
                    state.message = "You cleared the jam, but need more force to open it.";
                }
            } else {
                // Force reduced the jam, but didn't clear it
                bottle.currentTightness -= force;
                state.message = `The cap is loosening... Jam reduced by ${force}.`;
            }
        } else {
            // No jam, pure opening attempt
            if (force >= bottle.requiredForce) {
                bottle.isOpen = true;
                state.message = "POP! The bottle opens smoothly.";
            } else {
                state.message = "Correct direction, but force was too weak.";
            }
        }
        state.history.push(`${C.green}Applied ${force}N ${attemptDir}...${C.reset}`);
    }
}

async function runGame() {
    clearScreen();
    console.log(C.yellow + "Initializing The Torque Paradox..." + C.reset);
    await sleep(1500);

    // Setup the prompt so readline knows what to redraw
    rl.setPrompt(`${C.bright}Action > ${C.reset}`);

    // START THE BACKGROUND UI TICKER
    const UI_TICKER = setInterval(() => {
        if (!state.isGameOver && bottle.requiredForce !== 0) {
            renderInterface();
            // Redraw the prompt and whatever the user is currently typing
            rl.prompt(true); 
        }
    }, 1000);

    while (!state.isGameOver && state.level <= TOTAL_LEVELS) {
        // Level Setup
        if (!bottle.isOpen && bottle.requiredForce === 0) {
            generateBottle(state.level);
            state.energy = Math.min(100, state.energy + 20);
            state.message = `Level ${state.level} Started. Unknown config. Good luck.`;
        }

        // Force an immediate render before asking for input
        renderInterface(); 
        
        // Time Check
        if (getTimeElapsed() >= MAX_TIME_SECONDS) {
            state.isGameOver = true;
            state.message = `${C.bgRed} TIME'S UP! The bomb... err, bottle remained closed. ${C.reset}`;
            break;
        }

        // Wait for input using the prompt we set earlier
        const answer = await new Promise((resolve) => {
            rl.prompt();
            rl.once('line', resolve);
        });

        await processMove(answer);

        // Level Completion Check
        if (bottle.isOpen) {
            renderInterface();
            console.log(`${C.green}>>> LEVEL ${state.level} COMPLETE! <<<${C.reset}`);
            await sleep(2000);
            state.level++;
            state.history = []; 
            bottle.requiredForce = 0; 
            bottle.isOpen = false;
        }
    }

    // STOP THE TICKER WHEN GAME ENDS
    clearInterval(UI_TICKER);

    // --- GAME OVER SEQUENCE ---
    // (Keep your existing Game Over code down here...)
    clearScreen();
    if (state.level > TOTAL_LEVELS) {
        const timeLeft = MAX_TIME_SECONDS - getTimeElapsed();
        const totalScore = (timeLeft * 10) + state.energy;
        console.log(`${C.green}CONGRATULATIONS! YOU OPENED ALL BOTTLES!${C.reset}`);
        console.log(`Final Score: ${totalScore}`);
        saveHighScore(totalScore);
    } else {
        console.log(`${C.red}GAME OVER${C.reset}`);
        console.log(`Reason: ${state.message}`);
        console.log(`You reached Level ${state.level}`);
    }

    console.log(`\n${C.yellow}--- HIGH SCORES ---${C.reset}`);
    const scores = loadHighScores();
    scores.forEach((s, i) => console.log(`${i+1}. Score: ${s.score} | Time: ${s.time}s | Date: ${s.date}`));
    
    console.log("\nPress any key to exit...");
    await new Promise(resolve => rl.once('line', resolve));
    process.exit(0);
}

// Start
runGame();