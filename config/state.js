export const state = {
    level: 1,
    energy: 100, // Percentage
    startTime: Date.now(),
    endTime: 0,
    isGameOver: false,
    message: "Welcome to the paradox. Choose wisely.",
    history: [] // To show last few moves
};