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
    magenta: "\x1b[35m",
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
    remainingTime: MAX_TIME_SECONDS, // Tracks remaining time (decremented per action)
    isGameOver: false,
    message: "Welcome to the paradox. Choose wisely.",
    history: [], // To show last few moves
    playerId: DEFAULT_PLAYER_ID, // Current player's ID
    lastRecoveryTick: 0 // For tracking energy recovery
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

async function printSlowly(text, delay = 30) {
    return new Promise((resolve) => {
        let i = 0;
        const interval = setInterval(() => {
            if (i < text.length) {
                process.stdout.write(text[i]);
                i++;
            } else {
                clearInterval(interval);
                resolve();
            }
        }, delay);
    });
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

/**
 * Smart input parser - detects direction, time, and force
 * from messy, case-insensitive, unordered input
 * 
 * Returns: { direction: 'CW'|'ACW', time: number, force: number, valid: boolean }
 */
function parseSmartInput(input) {
    const result = {
        direction: null,
        time: null,
        force: null,
        valid: false,
        error: ""
    };

    // Convert to uppercase for direction matching, keep original for number extraction
    const upperInput = input.toUpperCase();

    // --- DETECT DIRECTION (CW or ACW, case-insensitive) ---
    if (upperInput.includes('ACW')) {
        result.direction = 'ACW';
    } else if (upperInput.includes('CW')) {
        result.direction = 'CW';
    } else {
        result.error = "Direction not found. Use CW or ACW.";
        return result;
    }

    // --- DETECT TIME (number followed by 'S', case-insensitive) ---
    // Regex: capture number before 's' or 'S'
    const timeMatch = input.match(/(\d+)\s*[sS]/);
    if (timeMatch) {
        result.time = parseInt(timeMatch[1], 10);
    } else {
        result.error = "Time not found. Use format: 20S";
        return result;
    }

    // --- DETECT FORCE (number followed by 'N', case-insensitive) ---
    // Regex: capture number before 'n' or 'N'
    const forceMatch = input.match(/(\d+)\s*[nN]/);
    if (forceMatch) {
        result.force = parseInt(forceMatch[1], 10);
    } else {
        result.error = "Force not found. Use format: 10N";
        return result;
    }

    // --- VALIDATION ---
    if (result.time <= 0) {
        result.error = "Time must be greater than 0.";
        return result;
    }
    if (result.force <= 0) {
        result.error = "Force must be greater than 0.";
        return result;
    }
    if (result.time > state.remainingTime) {
        result.error = `Not enough time remaining. You have ${state.remainingTime}s left.`;
        return result;
    }

    result.valid = true;
    return result;
}

/**
 * Calculate energy loss with inverse proportional physics
 * Energy loss is inversely proportional to both time and force
 * Formula: Base energy loss / (time * force scaling factor)
 * 
 * Longer times = less punishment per second
 * Higher forces = more punishment overall
 */
function calculateEnergyLoss(time, force) {
    // Base calculation: force has primary impact
    // Inverse time scaling: more time = less penalty
    const timeScalingFactor = Math.max(0.5, time / 10); // Diminishing returns on time
    const baseEnergyLoss = Math.ceil(force / 2); // Original formula as base
    const scaledEnergyLoss = Math.ceil(baseEnergyLoss / timeScalingFactor);
    
    // Additional penalty for high forces with short times (dangerous moves)
    const dangerPenalty = force > 50 && time < 5 ? Math.ceil(force / 10) : 0;
    
    return scaledEnergyLoss + dangerPenalty;
}

/**
 * Update energy recovery - 1% per second
 * Called during UI ticker updates
 */
function updateEnergyRecovery(currentTime) {
    if (state.lastRecoveryTick === 0) {
        state.lastRecoveryTick = currentTime;
        return;
    }

    const secondsElapsed = currentTime - state.lastRecoveryTick;
    if (secondsElapsed >= 1) {
        const recoveryAmount = 1; // 1% per second
        state.energy = Math.min(100, state.energy + recoveryAmount);
        state.lastRecoveryTick = currentTime;
    }
}

function renderInterface() {
    clearScreen();
    const timeUsed = getTimeElapsed();
    
    // Header
    console.log(`${C.cyan}=================================================${C.reset}`);
    console.log(`${C.bright}           THE TORQUE PARADOX - LEVEL ${state.level}/${TOTAL_LEVELS}${C.reset}`);
    console.log(`${C.cyan}=================================================${C.reset}`);
    
    // Stats with new time system
    const timeColor = state.remainingTime < 60 ? C.red : (state.remainingTime < 120 ? C.yellow : C.green);
    console.log(`Time Used:     ${C.bright}${formatTime(timeUsed)}${C.reset}`);
    console.log(`Time Remaining: ${timeColor}${formatTime(state.remainingTime)}${C.reset}`);
    console.log(`Energy:        ${getProgressBar(state.energy, 100, 20, state.energy < 30 ? C.red : C.green)}`);
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
    console.log("Commands: e.g., 'cw 20s 10n' or '10n acw 20s' (any order, case-insensitive)");
}

// --- INTRO & RULES ---

async function showIntroAndRules() {
    clearScreen();
    
    // --- DRAMATIC TITLE ANIMATION ---
    console.log("");
    
    console.log(`${C.bright}${C.yellow}`);
    await printSlowly("    ████████╗ ██████╗ ██████╗  ██████╗ ██╗   ██╗███████╗", 20);
    console.log(`${C.reset}`);
    await sleep(100);
    
    console.log(`${C.bright}${C.yellow}`);
    await printSlowly("    ╚══██╔══╝██╔═══██╗██╔═══██╗██╔═══██╗██║   ██║██╔════╝", 20);
    console.log(`${C.reset}`);
    await sleep(100);
    
    console.log(`${C.bright}${C.yellow}`);
    await printSlowly("       ██║   ██║   ██║██████╔╝██║   ██║██║   ██║█████╗  ", 20);
    console.log(`${C.reset}`);
    await sleep(100);
    
    console.log(`${C.bright}${C.yellow}`);
    await printSlowly("       ██║   ██║   ██║██╔══██╗██║▄▄ ██║██║   ██║██╔══╝  ", 20);
    console.log(`${C.reset}`);
    await sleep(100);
    
    console.log(`${C.bright}${C.yellow}`);
    await printSlowly("       ██║   ╚██████╔╝██║  ██║╚██████╔╝╚██████╔╝███████╗", 20);
    console.log(`${C.reset}`);
    await sleep(100);
    
    console.log(`${C.bright}${C.yellow}`);
    await printSlowly("       ╚═╝    ╚═════╝ ╚═╝  ╚═╝ ╚══▀▀═╝  ╚═════╝ ╚══════╝", 20);
    console.log(`${C.reset}`);
    await sleep(300);
    
    console.log(`${C.bright}${C.red}`);
    await printSlowly("                     🔓 P A R A D O X 🔓", 25);
    console.log(`${C.reset}`);
    await sleep(400);
    
    console.log("");
    
    // --- STORY SECTION ---
    await sleep(500);
    console.log(`${C.bright}${C.magenta}▶ STORY${C.reset}`);
    console.log(`${C.cyan}${'─'.repeat(70)}${C.reset}`);
    await sleep(200);
    
    const storyLines = [
        `${C.white}You regain consciousness in a cold, sterile room. Your last memory is...`,
        `${C.white}fractured. Before you sit 10 sealed bottles on a metal table, humming`,
        `${C.white}with an ominous energy. A voice echoes through speakers:${C.reset}`,
        ``,
        `${C.bright}${C.yellow}"Open them all, or stay here forever."${C.reset}`,
        ``,
        `${C.white}Time is running out. Energy is running low. One wrong move...${C.reset}`,
        `${C.white}and everything shatters.${C.reset}`
    ];
    
    for (const line of storyLines) {
        console.log(line);
        await sleep(300);
    }
    await sleep(400);
    
    // --- OBJECTIVE SECTION ---
    console.log("");
    console.log(`${C.bright}${C.cyan}▶ OBJECTIVE${C.reset}`);
    console.log(`${C.cyan}${'─'.repeat(70)}${C.reset}`);
    await sleep(200);
    
    const objText = `Open all ${TOTAL_LEVELS} bottles within ${MAX_TIME_SECONDS} seconds.`;
    await printSlowly(`${C.bright}${C.green}${objText}${C.reset}`, 15);
    console.log("");
    await sleep(300);
    console.log(`${C.yellow}⭐ BEAT YOUR PERSONAL BEST ⭐${C.reset}`);
    await sleep(400);
    
    // --- SCORING SECTION ---
    console.log("");
    console.log(`${C.bright}${C.green}▶ SCORING SYSTEM${C.reset}`);
    console.log(`${C.cyan}${'─'.repeat(70)}${C.reset}`);
    console.log(`${C.white}Speed is everything. Your score rewards fast completions:${C.reset}`);
    console.log("");
    console.log(`  ${C.bright}${C.yellow}Formula:${C.reset} (${MAX_TIME_SECONDS}s - Time Used) × 100 + Energy Bonus`);
    console.log(`  ${C.bright}${C.yellow}Example:${C.reset} 120s used, 50 energy left = (300-120)×100 + 500 = ${C.green}18,500 points${C.reset}`);
    await sleep(500);
    
    // --- MECHANICS SECTION ---
    console.log("");
    console.log(`${C.bright}${C.blue}▶ GAME MECHANICS${C.reset}`);
    console.log(`${C.cyan}${'─'.repeat(70)}${C.reset}`);
    
    const mechanics = [
        [
            `${C.bright}${C.yellow}🔧 BOTTLES${C.reset}`,
            `  Each cap is locked CW or ACW. Twist the OPPOSITE direction to open.`,
            `  Wrong direction? The cap tightens. Right direction? Progress!`
        ],
        [
            `${C.bright}${C.yellow}⚡ COMMANDS${C.reset}`,
            `  Format: ${C.green}'cw 20s 10n'${C.reset} (Clockwise, 20 seconds, 10 newtons)`,
            `  Order doesn't matter: ${C.green}'10n acw 20s'${C.reset} works the same`,
            `  Case-insensitive: ${C.green}'CW'${C.reset}, ${C.green}'cw'${C.reset}, ${C.green}'Cw'${C.reset} all work`
        ],
        [
            `${C.bright}${C.yellow}💪 FORCE & TIME${C.reset}`,
            `  Apply force over DURATION (seconds). Long durations = less energy cost.`,
            `  This rewards patience and strategy over pure brute force.`
        ],
        [
            `${C.bright}${C.yellow}🩸 ENERGY${C.reset}`,
            `  Start at 100%. Recover +1% per second passively.`,
            `  Too much energy cost = You collapse (Game Over).`,
            `  Each level clears, you gain +20 energy (capped at 100%).`
        ],
        [
            `${C.bright}${C.yellow}💥 BREAKAGE${C.reset}`,
            `  Apply TOO MUCH force and the bottle SHATTERS → Game Over.`,
            `  Early levels forgiving. Late levels DANGEROUS. Balance power & precision.`
        ]
    ];
    
    for (const section of mechanics) {
        console.log("");
        console.log(section[0]);
        for (let i = 1; i < section.length; i++) {
            console.log(`  ${section[i]}`);
        }
        await sleep(400);
    }
    
    // --- DIFFICULTY PROGRESSION ---
    console.log("");
    console.log(`${C.bright}${C.red}▶ DIFFICULTY PROGRESSION${C.reset}`);
    console.log(`${C.cyan}${'─'.repeat(70)}${C.reset}`);
    
    const difficulties = [
        [`${C.green}Levels 1-3${C.reset}`, `Easy. Safety margins are generous.`],
        [`${C.yellow}Levels 4-7${C.reset}`, `Moderate. Danger increasing...`],
        [`${C.red}Levels 8-10${C.reset}`, `${C.bright}BRUTAL.${C.reset} Capacity nearly equals force needed. Precision required.`]
    ];
    
    for (const [level, desc] of difficulties) {
        console.log(`  ${level}: ${desc}`);
        await sleep(300);
    }
    
    // --- STRATEGY TIPS ---
    console.log("");
    console.log(`${C.bright}${C.magenta}▶ STRATEGY TIPS${C.reset}`);
    console.log(`${C.cyan}${'─'.repeat(70)}${C.reset}`);
    const tips = [
        "Watch the LOG—it tells you what's happening.",
        "Jammed bottles need extra force to clear.",
        "Long durations with moderate force = efficiency.",
        "Energy recovers passively—be patient when needed.",
        "One powerful move often beats multiple weak ones."
    ];
    
    for (const tip of tips) {
        console.log(`  ✓ ${tip}`);
        await sleep(250);
    }
    
    // --- FINAL PROMPT ---
    console.log("");
    console.log(`${C.cyan}${'═'.repeat(70)}${C.reset}`);
    await sleep(400);
    console.log(`${C.bright}${C.bgGreen}${C.black}     🎮 READY TO BEAT YOUR PERSONAL BEST? 🎮     ${C.reset}`);
    console.log(`${C.cyan}${'═'.repeat(70)}${C.reset}`);
    console.log("");
    
    await ask(`${C.bright}${C.yellow}Press ENTER to BEGIN...${C.reset}`);
}

/**
 * Display player's personal best stats
 */
async function displayPersonalBest(playerId) {
    clearScreen();
    const personalBest = getPersonalBest(playerId);

    if (!personalBest) {} else {
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

        await ask("Press ENTER to continue...");
    }
}

// --- CORE GAME LOGIC ---

async function processMove(input) {
    // Use smart parser instead of simple split
    const parsed = parseSmartInput(input);

    if (!parsed.valid) {
        state.message = `${C.red}${parsed.error}${C.reset}`;
        return;
    }

    const direction = parsed.direction;
    const timeApplied = parsed.time;
    const force = parsed.force;

    // 1. Check if we have enough remaining time
    if (timeApplied > state.remainingTime) {
        state.message = `${C.red}Not enough time remaining (${state.remainingTime}s left).${C.reset}`;
        return;
    }

    // 2. Calculate energy cost using inverse proportional formula
    const energyCost = calculateEnergyLoss(timeApplied, force);
    
    if (state.energy < energyCost) {
        state.isGameOver = true;
        state.message = `${C.bgRed} EXHAUSTED! You passed out before opening the bottle. ${C.reset}`;
        return;
    }
    
    // Deduct energy
    state.energy -= energyCost;
    
    // 3. Deduct time from remaining pool
    state.remainingTime -= timeApplied;

    // 4. Check Breakage (Too much force)
    if (force > bottle.maxCapacity) {
        state.isGameOver = true;
        state.message = `${C.bgRed} CRACK! You applied ${force}N force over ${timeApplied}s. The bottle shattered! ${C.reset}`;
        return;
    }

    // 5. Physics Logic
    const attemptDir = direction.toUpperCase();
    
    // LOGIC: If we rotate in the LOCKED direction (Bad)
    if (attemptDir === bottle.lockedDir) {
        bottle.currentTightness += force;
        state.history.push(`${C.red}Applied ${force}N ${attemptDir} for ${timeApplied}s (wrong direction). Bottle tightened!${C.reset}`);
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
                    state.message = `${C.green}SUCCESS! Applied ${force}N for ${timeApplied}s. The jamming cleared and the cap flew off!${C.reset}`;
                } else {
                    state.history.push(`${C.yellow}Applied ${force}N ${attemptDir} for ${timeApplied}s. Jam cleared but more force needed.${C.reset}`);
                }
            } else {
                // Force reduced the jam, but didn't clear it
                bottle.currentTightness -= force;
                state.history.push(`${C.yellow}Applied ${force}N ${attemptDir} for ${timeApplied}s. Jam reduced but not cleared.${C.reset}`);
                return;
            }
        } else {
            // No jam, pure opening attempt
            if (force >= bottle.requiredForce) {
                bottle.isOpen = true;
                state.message = `${C.green}POP! Applied ${force}N for ${timeApplied}s. The bottle opens smoothly.${C.reset}`;
            } else {
                state.history.push(`${C.yellow}Applied ${force}N ${attemptDir} for ${timeApplied}s. Progress made!${C.reset}`);
            }
        }
        if (!bottle.isOpen) {
            state.history.push(`${C.green}Applied ${force}N ${attemptDir} for ${timeApplied}s. Progress made!${C.reset}`);
        }
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
    
    // Show intro and rules
    await showIntroAndRules();
    
    clearScreen();
    console.log(C.yellow + "Initializing The Torque Paradox..." + C.reset);
    await sleep(1500);

    // START THE TIMER
    state.startTime = Date.now();
    state.remainingTime = MAX_TIME_SECONDS;
    state.lastRecoveryTick = getTimeElapsed();

    // Setup the prompt so readline knows what to redraw
    rl.setPrompt(`${C.bright}Action > ${C.reset}`);

    // START THE BACKGROUND UI TICKER
    const UI_TICKER = setInterval(() => {
        if (!state.isGameOver && bottle.requiredForce !== 0) {
            const currentTime = getTimeElapsed();
            updateEnergyRecovery(currentTime);
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
        
        // Time Check (using remaining time now)
        if (state.remainingTime <= 0) {
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
