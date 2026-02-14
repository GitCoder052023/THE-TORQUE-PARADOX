import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIGURATION & CONSTANTS ---
const TOTAL_LEVELS = 10;
const MAX_TIME_SECONDS = 300; // 5 Minutes total
const SCORE_FILE = path.join(__dirname, 'personalscores.json');
const DEFAULT_PLAYER_ID = 'player_default'; // Default player ID

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
    bgGreen: "\x1b[42m",
};

// --- STATE MANAGEMENT ---
const state = {
    level: 1,
    energy: 100, // Percentage
    startTime: 0, // Will be set when actual game starts, not in intro
    endTime: 0,
    isGameOver: false,
    message: "Welcome to the paradox. Choose wisely.",
    history: [], // To show last few moves
    playerId: DEFAULT_PLAYER_ID // Current player's ID 
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

/**
 * Load player's personal best scores from JSON file
 * Returns object mapping playerId to their best score object
 * Initializes empty file if not present
 */
function loadPersonalBests() {
    if (!fs.existsSync(SCORE_FILE)) {
        // Initialize with empty object if file doesn't exist
        try {
            fs.writeFileSync(SCORE_FILE, JSON.stringify({}, null, 2));
            return {};
        } catch (e) {
            console.error("Error creating scores file:", e.message);
            return {};
        }
    }
    try {
        const data = JSON.parse(fs.readFileSync(SCORE_FILE, 'utf8'));
        return typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (e) {
        console.error("Error reading scores:", e.message);
        return {};
    }
}

/**
 * Save or update a player's personal best score
 * Time-based scoring: Lesser time = Higher score
 * Score calculation: (MAX_TIME_SECONDS - timeUsed) * 100 + bonus points
 */
function savePersonalBest(playerId, timeUsed, energyRemaining) {
    const personalBests = loadPersonalBests();
    
    // Score Calculation:
    // Primary: Time-based (faster = higher)
    // Bonus: Energy remaining adds bonus points
    const timeScore = (MAX_TIME_SECONDS - timeUsed) * 100;
    const energyBonus = Math.floor(energyRemaining * 10); // Max +1000 points
    const totalScore = timeScore + energyBonus;

    const newScore = {
        playerId: playerId,
        score: totalScore,
        timeUsed: timeUsed,
        energyRemaining: Math.floor(energyRemaining),
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString(),
        timeScore: timeScore,
        energyBonus: energyBonus
    };

    // Check if this is better than their previous best
    const previousBest = personalBests[playerId];
    let isNewPB = true;
    
    if (previousBest && previousBest.score >= totalScore) {
        isNewPB = false;
        console.log(`\n${C.yellow}Personal best not beaten. Your record: ${previousBest.score} points${C.reset}`);
        return { newScore, isNewPB, improvement: 0 };
    }

    const improvement = previousBest ? totalScore - previousBest.score : 0;
    personalBests[playerId] = newScore;
    
    try {
        fs.writeFileSync(SCORE_FILE, JSON.stringify(personalBests, null, 2));
        return { newScore, isNewPB, improvement };
    } catch (e) {
        console.error("Error saving score:", e.message);
        return { newScore, isNewPB, improvement };
    }
}

/**
 * Get a player's personal best score
 */
function getPersonalBest(playerId) {
    const personalBests = loadPersonalBests();
    return personalBests[playerId] || null;
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
    if (state.startTime === 0) return 0; // Timer hasn't started yet
    return Math.floor((Date.now() - state.startTime) / 1000);
}

/**
 * Format time in MM:SS format
 */
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function renderInterface() {
    clearScreen();
    const timeUsed = getTimeElapsed();
    const timeLeft = MAX_TIME_SECONDS - timeUsed;
    
    // Header
    console.log(`${C.cyan}=================================================${C.reset}`);
    console.log(`${C.bright}           THE TORQUE PARADOX - LEVEL ${state.level}/${TOTAL_LEVELS}${C.reset}`);
    console.log(`${C.cyan}=================================================${C.reset}`);
    
    // Stats without player name
    const timeColor = timeLeft < 60 ? C.red : (timeLeft < 120 ? C.yellow : C.green);
    console.log(`Time: ${timeColor}${formatTime(timeUsed)}${C.reset} / ${formatTime(MAX_TIME_SECONDS)}`);
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
    console.log(`${C.bright}BEAT YOUR PERSONAL BEST!${C.reset}\n`);

    console.log(`${C.bright}SCORING SYSTEM:${C.reset}`);
    console.log(`• Your score is based on how FAST you complete the game`);
    console.log(`• Formula: (${MAX_TIME_SECONDS}s - Your Time) × 100 + Energy Bonus`);
    console.log(`• Energy Bonus: Remaining Energy × 10`);
    console.log(`• Example: Complete in 120s with 50 energy = (300-120)×100 + 50×10 = 18,500`);
    console.log(`• Fastest times get the highest scores!`);
    console.log(`• Your personal best score will be saved and tracked.\n`);

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
    console.log(`• Time is precious—be efficient with your moves`);
    console.log(`• Sometimes a single powerful move beats multiple weak ones\n`);

    console.log(`${C.cyan}${'='.repeat(60)}${C.reset}`);
    console.log(`${C.bright}${C.green}Ready to beat your personal best? Press ENTER to begin...${C.reset}`);
    console.log(`${C.cyan}${'='.repeat(60)}${C.reset}\n`);

    await ask("");
}

/**
 * Display player's personal best stats
 */
function displayPersonalBest(playerId) {
    clearScreen();
    const personalBest = getPersonalBest(playerId);

    console.log(`${C.cyan}${'='.repeat(70)}${C.reset}`);
    console.log(`${C.bright}${C.yellow}      YOUR PERSONAL BEST${C.reset}`);
    console.log(`${C.cyan}${'='.repeat(70)}${C.reset}\n`);

    if (!personalBest) {
        console.log(`${C.yellow}No previous record. This is your first run! Go for a great score!${C.reset}\n`);
    } else {
        console.log(`${C.bright}PREVIOUS BEST:${C.reset}`);
        console.log(`${C.cyan}───────────────────────────────────────────────${C.reset}`);
        console.log(`Score:           ${C.bright}${C.green}${personalBest.score}${C.reset} points`);
        console.log(`Time:            ${C.yellow}${formatTime(personalBest.timeUsed)}${C.reset} seconds`);
        console.log(`Time Score:      ${personalBest.timeScore} points`);
        console.log(`Energy Remaining: ${personalBest.energyRemaining}%`);
        console.log(`Energy Bonus:    ${personalBest.energyBonus} points`);
        console.log(`Date Achieved:   ${C.cyan}${personalBest.date}${C.reset}`);
        console.log(`${C.cyan}───────────────────────────────────────────────${C.reset}`);
        console.log(`${C.bright}${C.yellow}Can you beat this? 💪${C.reset}\n`);
    }

    console.log(`${C.cyan}${'='.repeat(70)}${C.reset}\n`);
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

    // 1. Check Energy Cost (Force ÷ 2 = Energy Loss)
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
        state.history.push(`${C.red}Applied ${force}N wrong direction. Bottle tightened!${C.reset}`);
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
                state.history.push(`${C.yellow}Applied ${force}N. Jam reduced but not cleared.${C.reset}`);
                return;
            }
        } else {
            // No jam, pure opening attempt
            if (force >= bottle.requiredForce) {
                bottle.isOpen = true;
                state.message = "POP! The bottle opens smoothly.";
            }
        }
        state.history.push(`${C.green}Applied ${force}N ${attemptDir}. Progress made!${C.reset}`);
    }
}

async function runGame() {
    // Skip name entry - use default player ID
    clearScreen();
    console.log(`${C.cyan}${'='.repeat(60)}${C.reset}`);
    console.log(`${C.bright}${C.yellow}        THE TORQUE PARADOX${C.reset}`);
    console.log(`${C.cyan}${'='.repeat(60)}${C.reset}\n`);
    
    state.playerId = DEFAULT_PLAYER_ID;
    
    // Show personal best
    displayPersonalBest(state.playerId);
    await ask("Press ENTER to continue...");
    
    // Show intro and rules
    await showIntroAndRules();
    
    clearScreen();
    console.log(C.yellow + "Initializing The Torque Paradox..." + C.reset);
    await sleep(1500);

    // START THE TIMER
    state.startTime = Date.now();

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
    
    const timeUsed = getTimeElapsed();
    const energyRemaining = state.energy;
    
    if (state.level > TOTAL_LEVELS) {
        // SUCCESS!
        const timeScore = (MAX_TIME_SECONDS - timeUsed) * 100;
        const energyBonus = Math.floor(energyRemaining * 10);
        const totalScore = timeScore + energyBonus;
        
        console.log(`${C.bgGreen}${C.black}  🎉 CONGRATULATIONS! YOU OPENED ALL BOTTLES! 🎉  ${C.reset}\n`);
        console.log(`${C.bright}${C.cyan}═══════════════════════════════════════════════${C.reset}`);
        console.log(`${C.bright}FINAL STATISTICS:${C.reset}`);
        console.log(`${C.cyan}───────────────────────────────────────────────${C.reset}`);
        console.log(`Time Used:       ${C.yellow}${formatTime(timeUsed)}${C.reset} / ${formatTime(MAX_TIME_SECONDS)}`);
        console.log(`Time Saved:      ${C.green}${formatTime(MAX_TIME_SECONDS - timeUsed)}${C.reset}`);
        console.log(`Energy Remaining: ${C.green}${Math.floor(energyRemaining)}%${C.reset}`);
        console.log(`Time Score:      ${C.bright}${timeScore}${C.reset} points`);
        console.log(`Energy Bonus:    ${C.bright}${energyBonus}${C.reset} points`);
        console.log(`${C.bright}TOTAL SCORE:     ${C.green}${totalScore}${C.reset} points${C.reset}`);
        console.log(`${C.cyan}───────────────────────────────────────────────${C.reset}\n`);
        
        // Save score and check if it's new personal best
        const result = savePersonalBest(state.playerId, timeUsed, energyRemaining);
        
        if (result.isNewPB) {
            console.log(`${C.bright}${C.yellow}🌟 NEW PERSONAL BEST! 🌟${C.reset}`);
            if (result.previousBest) {
                const improvementPercent = ((result.improvement / result.previousBest.score) * 100).toFixed(1);
                console.log(`${C.green}You improved by ${result.improvement} points (${improvementPercent}% better)!${C.reset}\n`);
            } else {
                console.log(`${C.green}This is your first completion. Awesome start!${C.reset}\n`);
            }
        }
    } else {
        // FAILURE
        console.log(`${C.bgRed}${C.white}  GAME OVER - MISSION FAILED  ${C.reset}\n`);
        console.log(`${C.red}Reason: ${state.message}${C.reset}`);
        console.log(`You reached Level ${state.level} in ${formatTime(timeUsed)}`);
        
        // Show personal best for comparison
        const personalBest = getPersonalBest(state.playerId);
        if (personalBest) {
            console.log(`\n${C.yellow}Your personal best: ${personalBest.score} points (${formatTime(personalBest.timeUsed)})${C.reset}`);
        }
    }

    // Display personal best again
    displayPersonalBest(state.playerId);
    
    console.log("Press any key to exit...");
    await new Promise(resolve => rl.once('line', resolve));
    rl.close();
    process.exit(0);
}

// Start
runGame();