import type { Difficulty } from './gameLogic';

// ─── Player Types ────────────────────────────────────────────────────────────────

/**
 * An extended player identifier — a string like 'P0', 'P1', … or null for empty.
 * Using strings (not the classic 'X'|'O') allows any number of players.
 */
export type ExtendedPlayer = string | null;

// ─── Configuration ───────────────────────────────────────────────────────────────

export interface ExtendedConfig {
	/** Width & height of the square grid. */
	gridSize: number;
	/** Points needed to win. */
	targetScore: number;
	/** How many consecutive marks score a point. */
	connectN: number;
}

export const DEFAULT_EXTENDED_CONFIG: ExtendedConfig = {
	gridSize: 10,
	targetScore: 10,
	connectN: 3
};

// ─── Line Detection ──────────────────────────────────────────────────────────────

export interface ScoredLine {
	key: string;
	cells: number[];
	/** The player ID that owns this line (e.g. 'P0', 'P1'). */
	player: string;
}

function toIndex(row: number, col: number, gridSize: number): number {
	return row * gridSize + col;
}

/** The 4 directions we scan. Reverse directions would find the same lines. */
const DIRECTIONS: [number, number][] = [
	[0, 1],  // horizontal
	[1, 0],  // vertical
	[1, 1],  // diagonal ↘
	[1, -1]  // diagonal ↙
];

/**
 * Scans the entire board and returns ALL completed N-in-a-row lines, keyed by
 * a canonical string so the same line is never double-counted.
 */
export function findAllLines(
	board: ExtendedPlayer[],
	gridSize: number,
	connectN: number
): Map<string, ScoredLine> {
	const lines = new Map<string, ScoredLine>();

	for (let row = 0; row < gridSize; row++) {
		for (let col = 0; col < gridSize; col++) {
			const startPlayer = board[toIndex(row, col, gridSize)];
			if (!startPlayer) continue;

			for (const [dr, dc] of DIRECTIONS) {
				const endRow = row + dr * (connectN - 1);
				const endCol = col + dc * (connectN - 1);
				if (endRow < 0 || endRow >= gridSize) continue;
				if (endCol < 0 || endCol >= gridSize) continue;

				const cells: number[] = [];
				let allMatch = true;
				for (let step = 0; step < connectN; step++) {
					const idx = toIndex(row + dr * step, col + dc * step, gridSize);
					if (board[idx] !== startPlayer) { allMatch = false; break; }
					cells.push(idx);
				}

				if (allMatch) {
					const key = [...cells].sort((a, b) => a - b).join(',');
					if (!lines.has(key)) {
						lines.set(key, { key, cells, player: startPlayer });
					}
				}
			}
		}
	}

	return lines;
}

/**
 * Returns only lines formed SINCE the last check, by comparing against the
 * previously-known set of line keys.
 */
export function detectNewLines(
	board: ExtendedPlayer[],
	gridSize: number,
	connectN: number,
	previousLineKeys: Set<string>
): ScoredLine[] {
	const current = findAllLines(board, gridSize, connectN);
	const newLines: ScoredLine[] = [];
	for (const [key, line] of current) {
		if (!previousLineKeys.has(key)) newLines.push(line);
	}
	return newLines;
}

// ─── Game Over ───────────────────────────────────────────────────────────────────

export type ExtendedResult =
	| { status: 'ongoing' }
	| { status: 'target_reached'; winner: string }
	| { status: 'board_full'; winner: string | 'tie'; scores: Record<string, number> };

/**
 * Checks whether the extended game should end.
 * Works with any number of players via the scores Record.
 *
 * @param scores       Map of player ID → current score.
 * @param targetScore  Points needed to win.
 * @param board        Current board state.
 */
export function checkExtendedGameOver(
	scores: Record<string, number>,
	targetScore: number,
	board: ExtendedPlayer[]
): ExtendedResult {
	// Check if any player hit the target
	for (const [playerId, score] of Object.entries(scores)) {
		if (score >= targetScore) return { status: 'target_reached', winner: playerId };
	}

	// Check if board is full
	if (!board.includes(null)) {
		let topScore = -1;
		let topPlayer = 'tie';
		let tied = false;
		for (const [playerId, score] of Object.entries(scores)) {
			if (score > topScore) {
				topScore = score;
				topPlayer = playerId;
				tied = false;
			} else if (score === topScore) {
				tied = true;
			}
		}
		return { status: 'board_full', winner: tied ? 'tie' : topPlayer, scores };
	}

	return { status: 'ongoing' };
}

// ─── AI: Multi-Player Heuristic ──────────────────────────────────────────────────

/**
 * Counts how many new N-in-a-row lines placing `player` at `cellIndex` would complete.
 * Temporarily mutates the board but always restores it.
 */
function countNewLinesIfPlaced(
	board: ExtendedPlayer[],
	cellIndex: number,
	player: string,
	gridSize: number,
	connectN: number,
	knownLineKeys: Set<string>
): number {
	board[cellIndex] = player;
	const count = detectNewLines(board, gridSize, connectN, knownLineKeys)
		.filter((l) => l.player === player).length;
	board[cellIndex] = null;
	return count;
}

/**
 * Counts how many "almost complete" windows (connectN-1 of `player` + 1 empty cell
 * at `cellIndex`) pass through this cell.  Measures offensive potential.
 */
function countNearCompleteLines(
	board: ExtendedPlayer[],
	cellIndex: number,
	player: string,
	gridSize: number,
	connectN: number
): number {
	const row = Math.floor(cellIndex / gridSize);
	const col = cellIndex % gridSize;
	let count = 0;

	for (const [dr, dc] of DIRECTIONS) {
		for (let offset = 0; offset < connectN; offset++) {
			let playerCount = 0, emptyCount = 0, valid = true;
			for (let step = 0; step < connectN; step++) {
				const r = row - dr * offset + dr * step;
				const c = col - dc * offset + dc * step;
				if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) { valid = false; break; }
				const idx = toIndex(r, c, gridSize);
				if (board[idx] === player) playerCount++;
				else if (board[idx] === null) emptyCount++;
				else { valid = false; break; }
			}
			if (valid && playerCount === connectN - 1 && emptyCount === 1) count++;
		}
	}

	return count;
}

/**
 * Scores a candidate cell for a given AI player using a heuristic:
 * - Offensive: lines it would complete for itself (×100)
 * - Defensive: sum of lines each opponent would complete here (×80 each)
 * - Potential: near-complete lines for itself (×10)
 * - Position: slight preference for center cells
 */
function scoreMoveMulti(
	board: ExtendedPlayer[],
	cellIndex: number,
	aiPlayerId: string,
	allPlayerIds: string[],
	gridSize: number,
	connectN: number,
	knownLineKeys: Set<string>
): number {
	const offensive = countNewLinesIfPlaced(board, cellIndex, aiPlayerId, gridSize, connectN, knownLineKeys);

	let defensive = 0;
	for (const pid of allPlayerIds) {
		if (pid === aiPlayerId) continue;
		defensive += countNewLinesIfPlaced(board, cellIndex, pid, gridSize, connectN, knownLineKeys);
	}

	const potential = countNearCompleteLines(board, cellIndex, aiPlayerId, gridSize, connectN);

	// Mild center preference
	const cr = (gridSize - 1) / 2, cc = (gridSize - 1) / 2;
	const dist = Math.abs(Math.floor(cellIndex / gridSize) - cr) + Math.abs((cellIndex % gridSize) - cc);
	const posBonus = Math.max(0, gridSize - dist);

	return offensive * 100 + defensive * 80 + potential * 10 + posBonus * 0.5;
}

/**
 * Picks the best move for an AI player in Extended Grid mode.
 * Supports any number of players — the AI considers all opponents when blocking.
 *
 * @param board         Current board state (ExtendedPlayer[]).
 * @param gridSize      Grid width/height.
 * @param connectN      N-in-a-row needed to score.
 * @param aiPlayerId    This AI's player ID (e.g. 'P1').
 * @param allPlayerIds  All active player IDs in the game.
 * @param difficulty    'easy' | 'medium' | 'hard'.
 * @param knownLineKeys Already-scored line keys (no double-count).
 * @returns Flat cell index to play, or -1 if board is full.
 */
export function getExtendedAIMove(
	board: ExtendedPlayer[],
	gridSize: number,
	connectN: number,
	aiPlayerId: string,
	allPlayerIds: string[],
	difficulty: Difficulty,
	knownLineKeys: Set<string>
): number {
	const empty: number[] = [];
	for (let i = 0; i < board.length; i++) {
		if (board[i] === null) empty.push(i);
	}
	if (empty.length === 0) return -1;

	// Easy: always random
	if (difficulty === 'easy') return empty[Math.floor(Math.random() * empty.length)];

	const scored = empty
		.map((idx) => ({
			index: idx,
			score: scoreMoveMulti(board, idx, aiPlayerId, allPlayerIds, gridSize, connectN, knownLineKeys)
		}))
		.sort((a, b) => b.score - a.score);

	// Medium: 40% random
	if (difficulty === 'medium' && Math.random() < 0.4) {
		return empty[Math.floor(Math.random() * empty.length)];
	}

	return scored[0].index;
}
