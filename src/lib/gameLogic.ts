/**
 * Type representing the players and empty cells.
 */
export type Player = 'X' | 'O' | null;

/**
 * Type representing the AI difficulty.
 */
export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * Checks the current board state for a winner or a tie.
 * @param board The current state of the 3x3 board.
 * @returns 'X' if human wins, 'O' if AI wins, 'tie' if the board is full with no winner, or null if the game is ongoing.
 */
export function checkWinner(board: Player[]): 'X' | 'O' | 'tie' | null {
	const winPatterns = [
		[0, 1, 2], // top row
		[3, 4, 5], // middle row
		[6, 7, 8], // bottom row
		[0, 3, 6], // left column
		[1, 4, 7], // middle column
		[2, 5, 8], // right column
		[0, 4, 8], // diagonal 1
		[2, 4, 6]  // diagonal 2
	];

	for (const pattern of winPatterns) {
		const [a, b, c] = pattern;
		if (board[a] && board[a] === board[b] && board[a] === board[c]) {
			return board[a] as 'X' | 'O';
		}
	}

	if (!board.includes(null)) {
		return 'tie';
	}

	return null;
}

/**
 * Minimax algorithm to evaluate the board and find the best possible score for a given move.
 * It simulates all possible future moves to determine the optimal strategy.
 * 
 * @param board The current board state.
 * @param depth The current depth of the recursive tree (used to prefer faster wins).
 * @param isMaximizing True if it is the AI's turn ('O'), false if it is the human's turn ('X').
 * @returns The evaluation score of the board state.
 */
function minimax(board: Player[], depth: number, isMaximizing: boolean): number {
	const result = checkWinner(board);

	// Base cases: if someone wins or it's a tie, return the evaluated score
	if (result === 'O') return 10 - depth; // AI wins, prefer faster wins (smaller depth)
	if (result === 'X') return depth - 10; // Human wins, prefer slower losses
	if (result === 'tie') return 0;        // Draw is neutral

	if (isMaximizing) {
		let bestScore = -Infinity;
		for (let i = 0; i < 9; i++) {
			if (board[i] === null) {
				board[i] = 'O'; // Try AI move
				const score = minimax(board, depth + 1, false);
				board[i] = null; // Undo move
				bestScore = Math.max(score, bestScore);
			}
		}
		return bestScore;
	} else {
		let bestScore = Infinity;
		for (let i = 0; i < 9; i++) {
			if (board[i] === null) {
				board[i] = 'X'; // Try human move
				const score = minimax(board, depth + 1, true);
				board[i] = null; // Undo move
				bestScore = Math.min(score, bestScore);
			}
		}
		return bestScore;
	}
}

/**
 * Finds a random available move on the board.
 */
function getRandomMove(board: Player[]): number {
	const availableMoves: number[] = [];
	for (let i = 0; i < 9; i++) {
		if (board[i] === null) {
			availableMoves.push(i);
		}
	}
	if (availableMoves.length === 0) return -1;
	return availableMoves[Math.floor(Math.random() * availableMoves.length)];
}

/**
 * Determines the best move for the AI ('O') using the Minimax algorithm.
 * @param board The current state of the board.
 * @returns The index (0-8) of the best move for the AI.
 */
function getBestMove(board: Player[]): number {
	let bestScore = -Infinity;
	let move = -1;

	for (let i = 0; i < 9; i++) {
		if (board[i] === null) {
			board[i] = 'O'; // Try move
			const score = minimax(board, 0, false);
			board[i] = null; // Undo move

			if (score > bestScore) {
				bestScore = score;
				move = i;
			}
		}
	}

	return move;
}

/**
 * Determines the AI's move based on the selected difficulty level.
 * @param board The current state of the board.
 * @param difficulty 'easy', 'medium', or 'hard'.
 * @returns The index (0-8) of the chosen move.
 */
export function getAIMove(board: Player[], difficulty: Difficulty): number {
	if (difficulty === 'easy') {
		// Easy: Always random move
		return getRandomMove(board);
	} else if (difficulty === 'medium') {
		// Medium: 40% random move, 60% optimal move
		if (Math.random() < 0.4) {
			return getRandomMove(board);
		} else {
			return getBestMove(board);
		}
	} else {
		// Hard: Always optimal Minimax move
		return getBestMove(board);
	}
}
