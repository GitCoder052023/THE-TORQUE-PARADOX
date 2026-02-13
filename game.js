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
    process.stdout.write('\x1b[H\x1b[J');
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
    
    console.log(`       ${C.yellow}_____${C.reset}`);
    console.log(`      ${C.yellow}[:::::]${C.reset}  <-- THE CAP`);
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

// --- INTRO & RULES ---

async function showIntroAndRules() {
    clearScreen();
    console.log(`${C.cyan}${'='.repeat(60)}${C.reset}`);
    console.log(`${C.bright}${C.yellow}        WELCOME TO THE TORQUE PARADOX${C.reset}`);
    console.log(`${C.cyan}${'='.repeat(60)}${C.reset}\n`);

    console.log(`${C.bright}THE STORY:${C.reset}`);
    console.log(`You are trapped in a mysterious facility. Before you sit 10 sealed`);
    console.log(`bottles, each one a puzzle. Your only way out is to open them all`);
    console.log(`before your energy runs out and time expires. But beware—each bottle`);
    console.log(`has its own twisted physics, and one wrong move could shatter`);
    console.log(`everything.\n`);

    console.log(`${C.bright}THE OBJECTIVE:${C.reset}`);
    console.log(`Open all ${TOTAL_LEVELS} bottles within ${MAX_TIME_SECONDS} seconds using strategic force.`);
    console.log(`Higher score = faster times + remaining energy.\n`);

    console.log(`${C.bright}HOW BOTTLES WORK:${C.reset}`);
    console.log(`• Each bottle has a CAP that's locked in one direction: CW or ACW`);
    console.log(`• Your goal: twist it in the OPPOSITE direction to open it`);
    console.log(`• If you twist the WRONG way, you TIGHTEN the cap (bad!)`);
    console.log(`• Applying force in the RIGHT direction clears the jam and opens it\n`);

    console.log(`${C.bright}ENERGY & FORCE:${C.reset}`);
    console.log(`• You start each level with 100% energy`);
    console.log(`• Every action costs energy: Force ÷ 2 = Energy lost`);
    console.log(`  Example: Applying 50N costs 25 energy`);
    console.log(`• If energy hits 0%, you collapse before opening the bottle → GAME OVER`);
    console.log(`• Completing a level restores +20 energy (max 100%)\n`);

    console.log(`${C.bright}THE CATCH (BREAKAGE):${C.reset}`);
    console.log(`• Each bottle has a breaking point (max capacity)`);
    console.log(`• Apply TOO MUCH force and it shatters → GAME OVER`);
    console.log(`• Early levels are forgiving, but later levels are TIGHT`);
    console.log(`• You must balance power with precision\n`);

    console.log(`${C.bright}DIFFICULTY PROGRESSION:${C.reset}`);
    console.log(`• Level 1-3: Easier. More safety margin before breakage`);
    console.log(`• Level 4-7: Moderate. The danger increases`);
    console.log(`• Level 8-10: BRUTAL. Breakage capacity nearly equals force needed`);
    console.log(`• You MUST be precise or the bottle shatters\n`);

    console.log(`${C.bright}COMMANDS:${C.reset}`);
    console.log(`• 'cw <force>'   - Twist clockwise with N newtons of force`);
    console.log(`• 'acw <force>'  - Twist counter-clockwise with N newtons of force`);
    console.log(`  Example: 'cw 25' or 'acw 30'\n`);

    console.log(`${C.bright}STRATEGY TIPS:${C.reset}`);
    console.log(`• Watch the LOG messages—they tell you what's happening`);
    console.log(`• If a bottle gets jammed, you'll need extra force to clear it`);
    console.log(`• Start with moderate force; increase gradually if resistance rises`);
    console.log(`• Time is precious—don't waste energy on wrong directions`);
    console.log(`• Sometimes a single powerful move beats multiple weak ones\n`);

    console.log(`${C.cyan}${'='.repeat(60)}${C.reset}`);
    console.log(`${C.bright}${C.green}Ready to open the bottles? Press ENTER to begin...${C.reset}`);
    console.log(`${C.cyan}${'='.repeat(60)}${C.reset}\n`);

    await ask("");
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
        state.history.push(`${C.green}Applied ${force}N.${C.reset}`);
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
                }
            } else {
                // Force reduced the jam, but didn't clear it
                bottle.currentTightness -= force;
            }
        } else {
            // No jam, pure opening attempt
            if (force >= bottle.requiredForce) {
                bottle.isOpen = true;
                state.message = "POP! The bottle opens smoothly.";
            }
        }
        state.history.push(`${C.green}Applied ${force}N ${attemptDir}...${C.reset}`);
    }
}

async function runGame() {
    await showIntroAndRules();
    
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
            state.message = `Level ${state.level} Started. Good luck.`;
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