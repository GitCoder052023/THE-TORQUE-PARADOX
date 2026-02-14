# 🧪 The Torque Paradox

<p align="center">
<strong>A High-Stakes Physics Puzzle for the Command Line</strong>
</p>

<p align="center">
<a href="[https://nodejs.org/](https://www.google.com/search?q=https://nodejs.org/)">
<img src="[https://img.shields.io/badge/Runtime-Node.js-green?style=flat-square&logo=node.js](https://www.google.com/search?q=https://img.shields.io/badge/Runtime-Node.js-green%3Fstyle%3Dflat-square%26logo%3Dnode.js)" alt="Node.js">
</a>
<a href="#">
<img src="[https://img.shields.io/badge/Dependencies-Zero-blue?style=flat-square](https://www.google.com/search?q=https://img.shields.io/badge/Dependencies-Zero-blue%3Fstyle%3Dflat-square)" alt="Zero Dependencies">
</a>
<a href="#">
<img src="[https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square](https://www.google.com/search?q=https://img.shields.io/badge/License-MIT-lightgrey%3Fstyle%3Dflat-square)" alt="License">
</a>
</p>

<p align="center">
You are trapped in a mysterious facility. Before you sit 10 sealed bottles, each a puzzle. Your only way out is to open them all before your energy fades or time expires.
</p>

---

## 📖 Table of Contents

* [About the Game](https://www.google.com/search?q=%23-about-the-game)
* [Features](https://www.google.com/search?q=%23-features)
* [Installation & Setup](https://www.google.com/search?q=%23-installation--setup)
* [How to Play](https://www.google.com/search?q=%23-how-to-play)
* [Controls](https://www.google.com/search?q=%23-controls)
* [Mechanics & Scoring](https://www.google.com/search?q=%23-mechanics--scoring)
* [Project Structure](https://www.google.com/search?q=%23-project-structure)

---

## 🕹 About the Game

**The Torque Paradox** is a pure Node.js CLI (Command Line Interface) game that simulates physics-based puzzles. Players must apply specific amounts of force to open bottles without shattering them.

The game features a hidden physics engine that tracks **torque direction**, **material stress**, and **cap tightness**. It is not a guessing game; it is a game of risk management, logic, and precision.

---

## ✨ Features

* **Zero Dependencies:** Built entirely with standard Node.js libraries (`fs`, `readline`, `path`).
* **Persistent Scoring:** Local JSON save system tracks your personal bests, time splits, and energy efficiency.
* **Dynamic Physics:** Bottles have randomized "locking" directions, breaking points, and friction coefficients.
* **Risk/Reward System:** Higher force opens bottles faster but increases the risk of immediate shattering (Game Over).
* **Rich CLI Visuals:** Uses ANSI escape codes for a colorful, immersive terminal experience.

---

## 🚀 Installation & Setup

Since this game uses **ES Modules** (`import` syntax), you need to configure your environment slightly.

### Prerequisites

* Node.js (v14.0.0 or higher recommended)

### Steps

1. **Clone the repository** (or download the source):
```bash
git clone https://github.com/GitCoder052023/THE-TORQUE-PARADOX.git
cd THE-TORQUE-PARADOX

```


1. **Run the Game**:
```bash
node game.js

```


*(Note: Replace `game.js` with whatever filename you saved the code as).*

---

## 🎮 How to Play

### The Objective

Open **10 Bottles** within **300 Seconds** (5 Minutes).

### The HUD

```text
Time:   04:32 / 05:00
Energy: [██████████----------] 50%

      _____
     [:::::]  <-- THE CAP
     |     |
     |     |  Status: LOCKED
     |_____|

```

### The Rules

1. **Direction Matters:** Every cap is locked either **Clockwise (CW)** or **Anti-Clockwise (ACW)**. You must twist in the *opposite* direction to open it.
2. **Manage Energy:** Every Newton of force you apply costs energy. If you hit 0% energy, you faint.
3. **Avoid Breakage:** Every bottle has a maximum force capacity. Exceed it, and the bottle shatters.
4. **Jamming:** Twisting the wrong way tightens the cap, requiring even *more* force to unlock it later.

---

## ⌨ Controls

The game uses a text parser. Type your command and press `ENTER`.

| Command | Syntax | Description |
| --- | --- | --- |
| **Clockwise** | `cw <amount>` | Twist clockwise with specific force.<br>

<br>*Example: `cw 25*` |
| **Anti-Clockwise** | `acw <amount>` | Twist anti-clockwise with specific force.<br>

<br>*Example: `acw 30*` |

---

## 📊 Mechanics & Scoring

### Scoring Formula

Your final score is calculated based on speed and efficiency.


### Physics Engine

* **Level Scaling:** As you progress from Level 1 to 10, the "Safety Margin" decreases. In Level 1, the bottle is strong. In Level 10, the breaking point is terrifyingly close to the force required to open it.
* **Energy Recovery:** Completing a level restores **+20% Energy**.

---

## 📂 Project Structure

```text
torque-paradox/
├── personalscores.json  # Auto-generated file storing high scores
├── game.js              # Main game logic (Source code)
├── package.json         # Configuration (for ES Module support)
└── README.md            # Documentation

```

---

<p align="center">
Made with ☕ and Node.js
</p>