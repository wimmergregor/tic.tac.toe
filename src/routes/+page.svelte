<script lang="ts">
	import { checkWinner, getAIMove, type Player, type Difficulty } from '$lib/gameLogic';
	import {
		detectNewLines,
		checkExtendedGameOver,
		getExtendedAIMove,
		DEFAULT_EXTENDED_CONFIG,
		type ExtendedResult,
		type ScoredLine
	} from '$lib/extendedGameLogic';

	/** Visual definition for each player slot (P0 = human, P1-P4 = AI). */
	const PLAYER_DEFS = [
		{ id: 'P0', symbol: 'X', label: 'You',  color: '#22d3ee', ring: 'rgba(34,211,238,0.5)',  glow: '0 0 12px rgba(34,211,238,0.6)'  },
		{ id: 'P1', symbol: '●', label: 'AI 1', color: '#fb7185', ring: 'rgba(251,113,133,0.5)', glow: '0 0 12px rgba(251,113,133,0.6)' },
		{ id: 'P2', symbol: '▲', label: 'AI 2', color: '#fbbf24', ring: 'rgba(251,191,36,0.5)',  glow: '0 0 12px rgba(251,191,36,0.6)'  },
		{ id: 'P3', symbol: '◆', label: 'AI 3', color: '#a78bfa', ring: 'rgba(167,139,250,0.5)', glow: '0 0 12px rgba(167,139,250,0.6)' },
		{ id: 'P4', symbol: '★', label: 'AI 4', color: '#86efac', ring: 'rgba(134,239,172,0.5)', glow: '0 0 12px rgba(134,239,172,0.6)' },
	] as const;

	/** Lookup helper: get player definition by ID string. */
	function getPlayerDef(id: string) {
		return PLAYER_DEFS.find((p) => p.id === id) ?? PLAYER_DEFS[0];
	}

	type GameMode = '1p' | '2p' | 'extended';
	type Theme = 'midnight' | 'emerald' | 'sunset';

	// ─── Settings ───────────────────────────────────────────────────────────────
	let gameMode = $state<GameMode>('1p');
	let difficulty = $state<Difficulty>('hard');
	let currentTheme = $state<Theme>('midnight');
	let extGridSize = $state(DEFAULT_EXTENDED_CONFIG.gridSize);
	let extTargetScore = $state(DEFAULT_EXTENDED_CONFIG.targetScore);
	let extConnectN = $state(DEFAULT_EXTENDED_CONFIG.connectN);
	/** Number of AI opponents in Extended mode (1–4). */
	let extNumAI = $state(1);
	let extEnableMultiConnections = $state(false);

	// ─── Classic game state ─────────────────────────────────────────────────────
	let board = $state<Player[]>(Array(9).fill(null));
	let currentPlayer = $state<'X' | 'O'>('X');
	let isAITurn = $derived(gameMode === '1p' && currentPlayer === 'O');
	let winner = $derived(checkWinner(board));
	let isGameOver = $derived(winner !== null);

	// ─── Extended game state ────────────────────────────────────────────────────
	let extBoard = $state<(string | null)[]>(Array(DEFAULT_EXTENDED_CONFIG.gridSize * DEFAULT_EXTENDED_CONFIG.gridSize).fill(null));
	/** Index into PLAYER_DEFS — whose turn it is (0 = human). */
	let extCurrentPlayerIdx = $state(0);
	/** Score keyed by player ID ('P0'…'P4'). */
	let extScores = $state<Record<string, number>>({ P0: 0, P1: 0, P2: 0, P3: 0, P4: 0 });
	let extScoredLines = $state<Map<string, ScoredLine>>(new Map());
	let extHighlightedCells = $state<Map<number, string>>(new Map());
	let extResult = $state<ExtendedResult>({ status: 'ongoing' });
	let extIsAITurn = $state(false);
	let extScoreFlash = $state<{ playerId: string; id: number } | null>(null);
	let extFlashCounter = 0;

	// ─── Reset helpers ──────────────────────────────────────────────────────────
	function resetGame() {
		board = Array(9).fill(null);
		currentPlayer = 'X';
	}

	function resetExtended() {
		extBoard = Array(extGridSize * extGridSize).fill(null);
		extCurrentPlayerIdx = 0;
		extScores = { P0: 0, P1: 0, P2: 0, P3: 0, P4: 0 };
		extScoredLines = new Map();
		extHighlightedCells = new Map();
		extResult = { status: 'ongoing' };
		extIsAITurn = false;
		extScoreFlash = null;
	}

	function changeMode(mode: GameMode) {
		gameMode = mode;
		resetGame();
		resetExtended();
	}

	// ─── Classic move handler ───────────────────────────────────────────────────
	function handleMove(index: number) {
		if (board[index] !== null || isGameOver || isAITurn) return;
		board[index] = currentPlayer;
		if (checkWinner(board) !== null) return;
		currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
		if (gameMode === '1p' && currentPlayer === 'O') {
			setTimeout(() => {
				const ai = getAIMove(board, difficulty);
				if (ai !== -1) {
					board[ai] = 'O';
					if (checkWinner(board) === null) currentPlayer = 'X';
				}
			}, 500);
		}
	}

	// ─── Extended move handler ──────────────────────────────────────────────────
	function handleExtMove(index: number) {
		if (extBoard[index] !== null || extResult.status !== 'ongoing' || extIsAITurn || extCurrentPlayerIdx !== 0) return;
		placeExtMark(index);
	}

	function placeExtMark(index: number) {
		const playerId = PLAYER_DEFS[extCurrentPlayerIdx].id;
		extBoard[index] = playerId;

		const newLines = detectNewLines(extBoard, extGridSize, extConnectN, extScoredLines, extEnableMultiConnections);
		const newMap = new Map(extScoredLines);
		const newHighlights = new Map(extHighlightedCells);
		const newScores = { ...extScores };
		for (const line of newLines) {
			newMap.set(line.key, line);
			for (const cell of line.cells) newHighlights.set(cell, line.player);
			newScores[line.player] = (newScores[line.player] ?? 0) + 1;
			triggerFlash(line.player);
		}
		extScoredLines = newMap;
		extHighlightedCells = newHighlights;
		extScores = newScores;

		const numPlayers = extNumAI + 1;
		const activeIds = PLAYER_DEFS.slice(0, numPlayers).map((p) => p.id);
		const activeScores: Record<string, number> = {};
		for (const id of activeIds) activeScores[id] = newScores[id] ?? 0;

		const result = checkExtendedGameOver(activeScores, extTargetScore, extBoard);
		if (result.status !== 'ongoing') {
			extResult = result;
			extIsAITurn = false;
			return;
		}

		const nextIdx = (extCurrentPlayerIdx + 1) % numPlayers;
		extCurrentPlayerIdx = nextIdx;

		if (nextIdx > 0) {
			extIsAITurn = true;
			const capturedIds = [...activeIds];
			setTimeout(() => {
				const ai = getExtendedAIMove(
					extBoard, extGridSize, extConnectN,
					PLAYER_DEFS[nextIdx].id, capturedIds,
					difficulty, extScoredLines, extEnableMultiConnections
				);
				if (ai !== -1) placeExtMark(ai);
				else extIsAITurn = false;
			}, 400);
		} else {
			extIsAITurn = false;
		}
	}

	function triggerFlash(playerId: string) {
		extScoreFlash = { playerId, id: extFlashCounter++ };
		setTimeout(() => { extScoreFlash = null; }, 900);
	}

	// ─── Cell sizing for extended grid ─────────────────────────────────────────
	let cellPx = $derived(Math.max(28, Math.floor(560 / extGridSize)));
	let cellFontSize = $derived(Math.max(10, Math.floor(cellPx * 0.52)));

	// ─── Themes ─────────────────────────────────────────────────────────────────
	const themes = {
		midnight: {
			bg: 'from-slate-900 via-indigo-950 to-slate-900',
			title: 'from-cyan-400 to-indigo-400',
			xColor: 'text-cyan-400', xDrop: 'drop-shadow-[0_0_10px_rgba(34,211,238,0.6)]',
			oColor: 'text-rose-400', oDrop: 'drop-shadow-[0_0_10px_rgba(251,113,133,0.6)]',
			btnBase: 'bg-indigo-600 hover:bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.4)]',
			panelBg: 'bg-slate-800/40 border-slate-700/50',
			btnActive: 'bg-indigo-500/20 text-indigo-300 border-indigo-500',
			thinkingText: 'text-indigo-300', thinkingSpinner: 'text-indigo-400',
			xRing: 'rgba(34,211,238,0.45)', oRing: 'rgba(251,113,133,0.45)'
		},
		emerald: {
			bg: 'from-emerald-950 via-teal-950 to-emerald-950',
			title: 'from-lime-400 to-emerald-400',
			xColor: 'text-lime-400', xDrop: 'drop-shadow-[0_0_10px_rgba(163,230,53,0.6)]',
			oColor: 'text-emerald-400', oDrop: 'drop-shadow-[0_0_10px_rgba(52,211,153,0.6)]',
			btnBase: 'bg-emerald-600 hover:bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)]',
			panelBg: 'bg-emerald-900/40 border-emerald-800/50',
			btnActive: 'bg-emerald-500/20 text-emerald-300 border-emerald-500',
			thinkingText: 'text-emerald-300', thinkingSpinner: 'text-emerald-400',
			xRing: 'rgba(163,230,53,0.45)', oRing: 'rgba(52,211,153,0.45)'
		},
		sunset: {
			bg: 'from-orange-950 via-rose-950 to-amber-950',
			title: 'from-amber-400 to-orange-400',
			xColor: 'text-amber-400', xDrop: 'drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]',
			oColor: 'text-orange-400', oDrop: 'drop-shadow-[0_0_10px_rgba(251,146,60,0.6)]',
			btnBase: 'bg-orange-600 hover:bg-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.4)]',
			panelBg: 'bg-orange-900/40 border-orange-800/50',
			btnActive: 'bg-orange-500/20 text-orange-300 border-orange-500',
			thinkingText: 'text-orange-300', thinkingSpinner: 'text-orange-400',
			xRing: 'rgba(251,191,36,0.45)', oRing: 'rgba(251,146,60,0.45)'
		}
	};
	let t = $derived(themes[currentTheme]);
</script>

<main class="min-h-screen bg-gradient-to-br {t.bg} text-slate-100 flex flex-col items-center justify-center p-4 font-sans transition-colors duration-700">
	<div class="max-w-4xl w-full flex flex-col items-center">

		<!-- Header -->
		<div class="text-center mb-5">
			<h1 class="text-4xl md:text-5xl font-extrabold tracking-tight mb-1 text-transparent bg-clip-text bg-gradient-to-r {t.title} transition-all duration-700">
				Tic-Tac-Toe
			</h1>
			{#if gameMode === 'extended'}
				<p class="text-white/40 text-sm font-medium tracking-widest uppercase">Extended Grid Mode</p>
			{/if}
		</div>

		<!-- Settings Bar -->
		<div class="flex flex-wrap justify-center gap-3 mb-6 {t.panelBg} p-3 rounded-2xl border backdrop-blur-md shadow-lg transition-colors duration-700">
			<!-- Mode -->
			<div class="flex flex-col gap-1.5">
				<span class="text-xs font-semibold uppercase tracking-wider text-slate-400">Mode</span>
				<div class="flex bg-black/20 rounded-lg p-1 border border-white/5">
					<button class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors {gameMode === '1p' ? t.btnActive : 'text-slate-400 hover:text-slate-200'}" onclick={() => changeMode('1p')}>1 Player</button>
					<button class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors {gameMode === '2p' ? t.btnActive : 'text-slate-400 hover:text-slate-200'}" onclick={() => changeMode('2p')}>2 Player</button>
					<button class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors {gameMode === 'extended' ? t.btnActive : 'text-slate-400 hover:text-slate-200'}" onclick={() => changeMode('extended')}>Extended</button>
				</div>
			</div>

			<!-- Difficulty (1P and Extended modes) -->
			{#if gameMode !== '2p'}
				<div class="flex flex-col gap-1.5 animate-fade-in">
					<span class="text-xs font-semibold uppercase tracking-wider text-slate-400">Difficulty</span>
					<div class="flex bg-black/20 rounded-lg p-1 border border-white/5">
						<button class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors {difficulty === 'easy' ? t.btnActive : 'text-slate-400 hover:text-slate-200'}" onclick={() => difficulty = 'easy'}>Easy</button>
						<button class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors {difficulty === 'medium' ? t.btnActive : 'text-slate-400 hover:text-slate-200'}" onclick={() => difficulty = 'medium'}>Medium</button>
						<button class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors {difficulty === 'hard' ? t.btnActive : 'text-slate-400 hover:text-slate-200'}" onclick={() => difficulty = 'hard'}>Hard</button>
					</div>
				</div>
			{/if}

			<!-- Extended config controls -->
			{#if gameMode === 'extended'}
				<div class="flex flex-col gap-1.5 animate-fade-in">
					<span class="text-xs font-semibold uppercase tracking-wider text-slate-400">Grid: {extGridSize}×{extGridSize}</span>
					<input type="range" min="5" max="15" bind:value={extGridSize} oninput={resetExtended}
						class="w-28 accent-white/60 cursor-pointer h-6" />
				</div>
				<div class="flex flex-col gap-1.5 animate-fade-in">
					<span class="text-xs font-semibold uppercase tracking-wider text-slate-400">Target: {extTargetScore} pts</span>
					<input type="range" min="3" max="20" bind:value={extTargetScore} oninput={resetExtended}
						class="w-28 accent-white/60 cursor-pointer h-6" />
				</div>
				<div class="flex flex-col gap-1.5 animate-fade-in">
					<span class="text-xs font-semibold uppercase tracking-wider text-slate-400">Connect: {extConnectN}</span>
					<input type="range" min="3" max="5" bind:value={extConnectN} oninput={resetExtended}
						class="w-20 accent-white/60 cursor-pointer h-6" />
				</div>
				<div class="flex flex-col gap-1.5 animate-fade-in items-center justify-center">
					<span class="text-xs font-semibold uppercase tracking-wider text-slate-400">Multi-Connections</span>
					<label class="relative inline-flex items-center cursor-pointer mt-1">
						<input type="checkbox" bind:checked={extEnableMultiConnections} onchange={resetExtended} class="sr-only peer">
						<div class="w-9 h-5 bg-black/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/80 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500/80"></div>
					</label>
				</div>
			{/if}

			<!-- Theme -->
			<div class="flex flex-col gap-1.5">
				<span class="text-xs font-semibold uppercase tracking-wider text-slate-400">Theme</span>
				<select bind:value={currentTheme} class="bg-black/20 text-slate-200 border border-white/10 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-white/20 cursor-pointer">
					<option value="midnight" class="bg-slate-900">Midnight</option>
					<option value="emerald" class="bg-emerald-950">Emerald</option>
					<option value="sunset" class="bg-orange-950">Sunset</option>
				</select>
			</div>
		</div>

		<!-- ══════════════════ EXTENDED MODE ══════════════════ -->
		{#if gameMode === 'extended'}
			<!-- Scoreboard -->
			<div class="flex items-center gap-6 mb-5 w-full justify-center relative">
				<!-- Player X score -->
				<div class="flex flex-col items-center gap-1">
					<span class="text-xs font-bold uppercase tracking-widest {t.xColor}">Player X</span>
					<div class="relative">
						<span class="text-5xl font-black {t.xColor} {t.xDrop} tabular-nums">{extScores['P0'] ?? 0}</span>
						{#if extScoreFlash?.playerId === 'P0'}
							<span class="score-flash {t.xColor}" style="left:100%">+1</span>
						{/if}
					</div>
					<div class="w-32 h-1.5 rounded-full bg-black/30 overflow-hidden">
						<div class="h-full rounded-full {t.xColor} bg-current transition-all duration-500"
							style="width:{Math.min(100,((extScores['P0'] ?? 0)/extTargetScore)*100)}%"></div>
					</div>
					<span class="text-white/30 text-xs">of {extTargetScore}</span>
				</div>

				<!-- vs divider -->
				<div class="text-white/20 font-black text-2xl select-none">VS</div>

				<!-- Player O score -->
				<div class="flex flex-col items-center gap-1">
					<span class="text-xs font-bold uppercase tracking-widest {t.oColor}">AI (O)</span>
					<div class="relative">
						<span class="text-5xl font-black {t.oColor} {t.oDrop} tabular-nums">{extScores['P1'] ?? 0}</span>
						{#if extScoreFlash?.playerId === 'P1'}
							<span class="score-flash {t.oColor}" style="left:100%">+1</span>
						{/if}
					</div>
					<div class="w-32 h-1.5 rounded-full bg-black/30 overflow-hidden">
						<div class="h-full rounded-full {t.oColor} bg-current transition-all duration-500"
							style="width:{Math.min(100,((extScores['P1'] ?? 0)/extTargetScore)*100)}%"></div>
					</div>
					<span class="text-white/30 text-xs">of {extTargetScore}</span>
				</div>
			</div>

			<!-- Status -->
			<div class="h-10 mb-3 flex items-center justify-center">
				{#if extResult.status !== 'ongoing'}
					{@const w = extResult.status === 'target_reached' ? extResult.winner : (extResult.status === 'board_full' ? extResult.winner : null)}
					{#if w === 'P0'}
						<div class="status-banner bg-emerald-500/20 text-emerald-400 border border-emerald-500/50">🎉 You win!</div>
					{:else if w && w !== 'tie'}
						<div class="status-banner bg-rose-500/20 text-rose-400 border border-rose-500/50">💀 {getPlayerDef(w).label} wins!</div>
					{:else}
						<div class="status-banner bg-amber-500/20 text-amber-400 border border-amber-500/50">🤝 It's a draw!</div>
					{/if}
				{:else if extIsAITurn}
					<div class="{t.thinkingText} animate-pulse text-base font-semibold flex items-center gap-2">
						<svg class="animate-spin h-4 w-4 {t.thinkingSpinner}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						AI is thinking...
					</div>
				{:else}
					<div class="text-white/70 text-base font-semibold">Your turn, Player X!</div>
				{/if}
			</div>

			<!-- Extended Board -->
			<div class="glass-panel rounded-2xl shadow-2xl border border-white/5 p-3 mb-6 overflow-auto max-w-full relative">
				<div
					class="grid"
					style="grid-template-columns: repeat({extGridSize}, {cellPx}px); gap: 2px;"
				>
					{#each extBoard as cell, index}
						{@const highlight = extHighlightedCells.get(index)}
						{@const hlDef = highlight ? getPlayerDef(highlight) : null}
						{@const cellDef = cell ? getPlayerDef(cell) : null}
						<button
							class="ext-cell flex items-center justify-center rounded-md transition-all duration-200
								{cell === null && extResult.status === 'ongoing' && !extIsAITurn && extCurrentPlayerIdx === 0 ? 'hover:bg-white/15 cursor-pointer active:scale-90' : 'cursor-default'}
								{cell ? 'bg-black/40' : 'bg-black/20'}"
							style="width:{cellPx}px; height:{cellPx}px; font-size:{cellFontSize}px;
								{hlDef ? `box-shadow: inset 0 0 0 2px ${hlDef.ring}, 0 0 8px ${hlDef.ring};` : ''}"
							onclick={() => handleExtMove(index)}
							aria-label="Cell {index}"
							disabled={cell !== null || extResult.status !== 'ongoing' || extIsAITurn || extCurrentPlayerIdx !== 0}
						>
							{#if cellDef}
								<span class="font-black mark-appear leading-none" style="color:{cellDef.color}; filter:drop-shadow({cellDef.glow});">{cellDef.symbol}</span>
							{/if}
						</button>
					{/each}
				</div>

				{#if extResult.status !== 'ongoing'}
					<div class="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-2xl flex items-center justify-center z-10 animate-fade-in">
						<button class="px-8 py-4 text-white font-bold rounded-xl transition-all duration-300 hover:scale-105 active:scale-95 text-xl {t.btnBase}" onclick={resetExtended}>
							Play Again
						</button>
					</div>
				{/if}
			</div>

			<!-- Legend -->
			<p class="text-white/30 text-xs mb-6 text-center">
				Form {extConnectN}-in-a-row to score a point. First to {extTargetScore} wins!<br/>
				Highlighted cells are part of completed lines.
			</p>

			{#if extResult.status === 'ongoing'}
				<button class="mb-8 px-6 py-2 bg-black/30 hover:bg-black/50 text-white/60 rounded-lg transition-colors border border-white/10 hover:text-white text-sm" onclick={resetExtended}>
					Restart
				</button>
			{/if}

		<!-- ══════════════════ CLASSIC MODE ══════════════════ -->
		{:else}
			<!-- Status -->
			<div class="h-14 mb-4 flex items-center justify-center w-full">
				{#if winner === 'X'}
					<div class="status-banner bg-emerald-500/20 text-emerald-400 border border-emerald-500/50">🎉 {gameMode === '1p' ? 'You won!' : 'Player X wins!'}</div>
				{:else if winner === 'O'}
					<div class="status-banner bg-rose-500/20 text-rose-400 border border-rose-500/50">💀 {gameMode === '1p' ? 'The AI claims victory!' : 'Player O wins!'}</div>
				{:else if winner === 'tie'}
					<div class="status-banner bg-amber-500/20 text-amber-400 border border-amber-500/50">🤝 It's a draw!</div>
				{:else if isAITurn}
					<div class="{t.thinkingText} animate-pulse text-xl font-semibold flex items-center gap-2">
						<svg class="animate-spin h-5 w-5 {t.thinkingSpinner}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						AI is thinking...
					</div>
				{:else}
					<div class="text-white/80 text-xl font-semibold">{gameMode === '1p' ? 'Your turn!' : `Player ${currentPlayer}'s Turn`}</div>
				{/if}
			</div>

			<!-- Classic Board -->
			<div class="glass-panel p-6 md:p-8 rounded-3xl shadow-2xl relative mb-10 border border-white/5">
				<div class="grid grid-cols-3 grid-rows-3 gap-3 md:gap-4 w-72 h-72 md:w-96 md:h-96">
					{#each board as cell, index}
						<button
							class="cell flex items-center justify-center w-full h-full rounded-2xl text-6xl md:text-7xl shadow-inner transition-all duration-300
								{cell === null && !isGameOver && !isAITurn ? 'hover:bg-white/10 cursor-pointer active:scale-95' : 'cursor-default'}
								{cell ? 'bg-black/40' : 'bg-black/20'}"
							onclick={() => handleMove(index)}
							aria-label="Cell {index}"
							disabled={cell !== null || isGameOver || isAITurn}
						>
							{#if cell === 'X'}
								<span class="{t.xColor} {t.xDrop} mark-appear transition-colors duration-700">X</span>
							{:else if cell === 'O'}
								<span class="{t.oColor} {t.oDrop} mark-appear transition-colors duration-700">O</span>
							{/if}
						</button>
					{/each}
				</div>
				{#if isGameOver}
					<div class="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-3xl flex items-center justify-center z-10 animate-fade-in">
						<button class="px-8 py-4 text-white font-bold rounded-xl transition-all duration-300 hover:scale-105 active:scale-95 text-xl {t.btnBase}" onclick={resetGame}>
							Play Again
						</button>
					</div>
				{/if}
			</div>

			{#if !isGameOver}
				<button class="mb-10 px-6 py-2 bg-black/30 hover:bg-black/50 text-white/70 rounded-lg transition-colors border border-white/10 hover:text-white" onclick={resetGame}>
					Restart Game
				</button>
			{/if}
		{/if}

	</div>
</main>

<style>
	:global(body) { margin: 0; background-color: #0f172a; }

	.glass-panel {
		background: rgba(0,0,0,0.2);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
	}

	.status-banner {
		padding: 0.6rem 1.4rem;
		border-radius: 9999px;
		font-weight: 600;
		font-size: 1.05rem;
		animation: slideDown 0.3s ease-out forwards;
	}

	.mark-appear { animation: popIn 0.25s cubic-bezier(0.175,0.885,0.32,1.275) forwards; }
	.animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }

	/* Floating +1 score flash */
	.score-flash {
		position: absolute;
		top: -8px;
		font-size: 1rem;
		font-weight: 900;
		animation: scoreFloat 0.9s ease-out forwards;
		pointer-events: none;
		white-space: nowrap;
	}

	.ext-cell { transition: background 0.15s, box-shadow 0.2s; }

	@keyframes popIn {
		0% { transform: scale(0.5); opacity: 0; }
		100% { transform: scale(1); opacity: 1; }
	}
	@keyframes slideDown {
		0% { transform: translateY(-10px); opacity: 0; }
		100% { transform: translateY(0); opacity: 1; }
	}
	@keyframes fadeIn {
		0% { opacity: 0; }
		100% { opacity: 1; }
	}
	@keyframes scoreFloat {
		0%   { transform: translateY(0); opacity: 1; }
		100% { transform: translateY(-32px); opacity: 0; }
	}
</style>
