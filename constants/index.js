import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIGURATION & CONSTANTS ---
export const TOTAL_LEVELS = 10;
export const MAX_TIME_SECONDS = 300; // 5 Minutes total
export const SCORE_FILE = path.join(__dirname, 'highscores.json');