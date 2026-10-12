/* =========================================================
   GAME REPORT — replaces the old Game Review popup
   Uses Lichess Cloud Eval where a cached evaluation exists.
========================================================= */
(() => {
    const $ = (id) => document.getElementById(id);
    const overlay = $('game-report-overlay');
    const closeButtons = [$('close-game-report'), $('close-game-report-top')];
    const runButton = $('run-game-report');
    const reportStatus = $('report-status');
    const reportWarning = $('report-warning');
    const progressWrap = $('report-progress-wrap');
    const progressLabel = $('report-progress-label');
    const progressValue = $('report-progress-value');
    const progressBar = $('report-progress-bar');
    const moveFilter = $('report-move-filter');
    let activeGame = { game: null, moves: null };
    let lastReport = null;
    let analysisToken = 0;

    const categories = [
        { key: 'best', label: 'Best moves', color: '#81b64c' },
        { key: 'good', label: 'Good moves', color: '#a3d168' },
        { key: 'inaccuracy', label: 'Inaccuracies', color: '#f0c52e' },
        { key: 'mistake', label: 'Mistakes', color: '#f29a4a' },
        { key: 'blunder', label: 'Blunders', color: '#ef5350' },
        { key: 'missedWin', label: 'Missed wins', color: '#b56be0' }
    ];
    const phases = ['Opening', 'Middlegame', 'Endgame'];

    function setText(id, value) {
        const el = $(id);
        if (el) el.textContent = value;
    }
    function show(el, yes = true) { if (el) el.hidden = !yes; }
    function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    }
    function openOverlay() {
        if (!overlay) return;
        overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('report-open');
    }
    function closeOverlay() {
        if (!overlay) return;
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('report-open');
    }
    function showSection(name) {
        document.querySelectorAll('.report-section').forEach(section => {
            section.classList.toggle('active', section.id === `report-section-${name}`);
        });
        document.querySelectorAll('.report-nav[data-report-section]').forEach(button => {
            button.classList.toggle('active', button.dataset.reportSection === name);
        });
    }
    function getGameMoves(gameMoves) {
        if (Array.isArray(gameMoves)) return gameMoves.filter(Boolean).map(m => typeof m === 'string' ? m : (m.san || m.move || '')).filter(Boolean);
        if (Array.isArray(window.movesList)) return window.movesList.slice();
        try { return typeof movesList !== 'undefined' && Array.isArray(movesList) ? movesList.slice() : []; }
        catch (_) { return []; }
    }
    function identifyOpening(moves) {
        const prefix = moves.slice(0, 8).join(' ');
        const known = [
            ['e4 e5 Nf3 Nc6 Bb5', 'Ruy Lopez'],
            ['e4 e5 Nf3 Nc6 Bc4', 'Italian Game'],
            ['e4 c5', 'Sicilian Defense'], ['e4 e6', 'French Defense'],
            ['e4 c6', 'Caro-Kann Defense'], ['d4 d5 c4', "Queen's Gambit"],
            ['d4 Nf6', 'Indian Defense'], ['c4', 'English Opening'], ['Nf3', 'Réti Opening'],
            ['e4 e5', 'Open Game'], ['e4', "King's Pawn Game"], ['d4', "Queen's Pawn Game"]
        ];
        for (const [line, name] of known) if (prefix.startsWith(line)) return name;
        return moves.length ? 'Unclassified opening' : 'Starting position';
    }
    function phaseFor(game, ply) {
        const board = game.board();
        let pieces = 0, queens = 0;
        for (const row of board) for (const piece of row) if (piece) {
            pieces++;
            if (piece.type === 'q') queens++;
        }
        if (pieces <= 10 || (queens === 0 && pieces <= 14)) return 'Endgame';
        if (ply <= 20) return 'Opening';
        return 'Middlegame';
    }
    function scoreForSideToMove(evaluation, fen) {
        if (!evaluation) return null;
        if (evaluation.mate !== undefined && evaluation.mate !== null) {
            const turn = fen.split(' ')[1];
            const mateScore = Math.max(900, 1000 - Math.abs(Number(evaluation.mate)) * 10);
            return (Number(evaluation.mate) >= 0 ? 1 : -1) * mateScore * (turn === 'w' ? 1 : -1);
        }
        if (evaluation.cp === undefined || evaluation.cp === null) return null;
        // Cloud Eval centipawn scores are treated as White-perspective scores, consistent with the app's existing eval display.
        return Number(evaluation.cp);
    }
    async function getCloudEval(fen, token) {
        if (token !== analysisToken) throw new Error('Analysis cancelled');
        const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=1`;
        try {
            const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!response.ok) return null;
            const data = await response.json();
            const pv = data && data.pvs && data.pvs[0];
            if (!pv) return null;
            const first = (pv.moves || '').trim().split(/\s+/)[0] || '';
            return { score: scoreForSideToMove(pv, fen), bestUci: first, depth: data.depth || null, mate: pv.mate };
        } catch (error) {
            if (token !== analysisToken) throw new Error('Analysis cancelled');
            return null;
        }
    }
    function accuracyFromLosses(losses) {
        if (!losses.length) return null;
        const avg = losses.reduce((sum, value) => sum + value, 0) / losses.length;
        // Lichess-style estimate from average centipawn loss; not Chess.com accuracy.
        const accuracy = 103.1668 * Math.exp(-0.04354 * (avg / 100)) - 3.1669;
        return Math.max(0, Math.min(100, accuracy));
    }
    function formatAccuracy(value) { return value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`; }
    function formatEval(score) {
        if (score === null || !Number.isFinite(score)) return '—';
        const value = score / 100;
        return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
    }
    function moveUci(move) {
        return move ? `${move.from}${move.to}${move.promotion || ''}` : '';
    }
    function classifyMove(move, before, after, side) {
        if (!before || !after || before.score === null || after.score === null) return 'unrated';
        const loss = side === 'w' ? Math.max(0, before.score - after.score) : Math.max(0, after.score - before.score);
        const beforeAdvantage = side === 'w' ? before.score : -before.score;
        const afterAdvantage = side === 'w' ? after.score : -after.score;
        if (beforeAdvantage >= 300 && afterAdvantage < 100) return 'missedWin';
        if (before.bestUci && moveUci(move) === before.bestUci) return 'best';
        if (loss <= 30) return 'good';
        if (loss <= 80) return 'inaccuracy';
        if (loss <= 180) return 'mistake';
        return 'blunder';
    }
    function setProgress(done, total, label) {
        const percent = total ? Math.round(done / total * 100) : 0;
        setText('report-progress-label', label || 'Analyzing positions…');
        setText('report-progress-value', `${percent}%`);
        if (progressBar) progressBar.style.width = `${percent}%`;
    }
    function blankCounts() { return { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, missedWin: 0, unrated: 0 }; }

    async function analyzeGame(game, sanMoves) {
        const token = ++analysisToken;
        const replay = new Chess();
        const positions = [{ fen: replay.fen(), ply: 0 }];
        const rawMoves = [];
        for (let index = 0; index < sanMoves.length; index++) {
            const beforeFen = replay.fen();
            const side = replay.turn();
            const phase = phaseFor(replay, index + 1);
            let move;
            try { move = replay.move(sanMoves[index], { sloppy: true }); } catch (_) { move = null; }
            if (!move) continue;
            const afterFen = replay.fen();
            rawMoves.push({ ply: rawMoves.length + 1, fullMove: Math.ceil((rawMoves.length + 1) / 2), side, san: move.san, from: move.from, to: move.to, promotion: move.promotion || '', beforeFen, afterFen, phase });
            positions.push({ fen: afterFen, ply: rawMoves.length });
        }
        if (!rawMoves.length) throw new Error('No valid moves were found for this game.');
        const uniqueFens = [...new Set(positions.map(position => position.fen))];
        const evaluations = new Map();
        show(progressWrap, true);
        if (runButton) { runButton.disabled = true; runButton.textContent = 'Analyzing…'; }
        reportStatus.className = 'report-status working';
        reportStatus.textContent = 'Analyzing';
        for (let i = 0; i < uniqueFens.length; i++) {
            if (token !== analysisToken) throw new Error('Analysis cancelled');
            const fen = uniqueFens[i];
            const result = await getCloudEval(fen, token);
            evaluations.set(fen, result);
            setProgress(i + 1, uniqueFens.length, `Checking position ${i + 1} of ${uniqueFens.length}…`);
            if (i < uniqueFens.length - 1) await sleep(110);
        }
        const rows = rawMoves.map(item => {
            const before = evaluations.get(item.beforeFen);
            const after = evaluations.get(item.afterFen);
            const classification = classifyMove(item, before, after, item.side);
            let loss = null;
            if (before && after && before.score !== null && after.score !== null) {
                loss = item.side === 'w' ? Math.max(0, before.score - after.score) : Math.max(0, after.score - before.score);
            }
            let bestMove = '—';
            if (before && before.bestUci && before.bestUci.length >= 4) {
                const uci = before.bestUci;
                bestMove = `${uci.slice(0,2)}–${uci.slice(2,4)}${uci.length > 4 ? `=${uci[4].toUpperCase()}` : ''}`;
            }
            return { ...item, classification, loss, beforeScore: before ? before.score : null, afterScore: after ? after.score : null, bestMove, depth: before ? before.depth : null };
        });
        const sides = { w: { counts: blankCounts(), losses: [], phases: {} }, b: { counts: blankCounts(), losses: [], phases: {} } };
        for (const side of ['w','b']) for (const phase of phases) sides[side].phases[phase] = { counts: blankCounts(), losses: [] };
        rows.forEach(row => {
            const side = sides[row.side];
            const phase = side.phases[row.phase];
            side.counts[row.classification] = (side.counts[row.classification] || 0) + 1;
            phase.counts[row.classification] = (phase.counts[row.classification] || 0) + 1;
            if (row.loss !== null) { side.losses.push(row.loss); phase.losses.push(row.loss); }
        });
        const allEvaluated = [...evaluations.values()].filter(Boolean).length;
        const phaseAccuracies = {};
        for (const phase of phases) phaseAccuracies[phase] = {
            w: accuracyFromLosses(sides.w.phases[phase].losses),
            b: accuracyFromLosses(sides.b.phases[phase].losses),
            wCount: sides.w.phases[phase].losses.length,
            bCount: sides.b.phases[phase].losses.length
        };
        const allScores = rows.filter(row => row.afterScore !== null).map(row => row.afterScore);
        return { game, rows, sides, phaseAccuracies, opening: identifyOpening(sanMoves), positionsTotal: uniqueFens.length, positionsEvaluated: allEvaluated, overall: { w: accuracyFromLosses(sides.w.losses), b: accuracyFromLosses(sides.b.losses) }, result: game && game.result ? game.result : (typeof getGameResult === 'function' ? getGameResult() : 'In progress'), evalScores: allScores };
    }

    function totalCounts(report) {
        const result = blankCounts();
        for (const side of ['w','b']) for (const key of Object.keys(result)) result[key] += report.sides[side].counts[key] || 0;
        return result;
    }
    function renderQuality(report) {
        const counts = totalCounts(report);
        const rated = report.rows.filter(row => row.classification !== 'unrated').length;
        setText('report-rated-count', rated);
        const used = categories.map(item => ({ ...item, count: counts[item.key] || 0 })).filter(item => item.count > 0);
        const total = used.reduce((sum, item) => sum + item.count, 0);
        let start = 0;
        const segments = used.map(item => {
            const end = start + (total ? item.count / total * 100 : 0);
            const segment = `${item.color} ${start}% ${end}%`;
            start = end;
            return segment;
        });
        const donut = $('report-quality-donut');
        if (donut) donut.style.background = total ? `conic-gradient(${segments.join(',')})` : '#45413e';
        const legend = $('report-quality-legend');
        if (legend) legend.innerHTML = used.length ? used.map(item => `<div class="report-legend-row"><span class="report-legend-dot" style="background:${item.color}"></span><span>${item.label}</span><strong>${item.count}</strong><small>${Math.round(item.count / total * 100)}%</small></div>`).join('') : '<p class="report-empty-note">No rated moves were found.</p>';
    }
    function renderPhaseChart(report) {
        const chart = $('report-phase-chart');
        const cards = $('report-phase-cards');
        const makeBar = (label, value, color, count) => `<div class="report-phase-bar-row"><div class="report-phase-bar-label"><span>${label}</span><strong>${formatAccuracy(value)}</strong></div><div class="report-phase-bar-track"><div class="report-phase-bar-fill ${color}" style="width:${value === null ? 0 : value}%"></div></div><small>${count} evaluated moves</small></div>`;
        if (chart) chart.innerHTML = phases.map(phase => `<div class="report-phase-group"><div class="report-phase-title">${phase}</div>${makeBar('White', report.phaseAccuracies[phase].w, 'white-fill', report.phaseAccuracies[phase].wCount)}${makeBar('Black', report.phaseAccuracies[phase].b, 'black-fill', report.phaseAccuracies[phase].bCount)}</div>`).join('');
        if (cards) cards.innerHTML = phases.map(phase => `<article class="report-panel report-phase-card"><div class="report-panel-heading"><div><h3>${phase}</h3><p>Engine-estimated accuracy</p></div></div><div class="report-phase-big-values"><div><span>White</span><strong>${formatAccuracy(report.phaseAccuracies[phase].w)}</strong></div><div><span>Black</span><strong>${formatAccuracy(report.phaseAccuracies[phase].b)}</strong></div></div><div class="report-phase-card-note">White: ${report.phaseAccuracies[phase].wCount} evaluated moves · Black: ${report.phaseAccuracies[phase].bCount} evaluated moves</div></article>`).join('');
    }
    function renderTrend(report) {
        const container = $('report-trend-chart');
        if (!container) return;
        const rows = report.rows.filter(row => row.loss !== null);
        if (rows.length < 2) { container.innerHTML = '<p class="report-empty-note">Not enough evaluated moves to draw a trend.</p>'; return; }
        const values = rows.map(row => Math.max(0, Math.min(100, 100 - row.loss / 15)));
        const w = 600, h = 190, pad = 20;
        const points = values.map((value, index) => `${pad + index * (w - pad * 2) / Math.max(1, values.length - 1)},${h - pad - value / 100 * (h - pad * 2)}`).join(' ');
        container.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Move accuracy trend"><line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" class="report-chart-axis"/><line x1="${pad}" y1="${pad}" x2="${w-pad}" y2="${pad}" class="report-chart-gridline"/><line x1="${pad}" y1="${h/2}" x2="${w-pad}" y2="${h/2}" class="report-chart-gridline"/><polyline points="${pad},${h-pad} ${points} ${w-pad},${h-pad}" class="report-trend-area"/><polyline points="${points}" class="report-trend-line"/>${values.map((value,index)=>{const x=pad+index*(w-pad*2)/Math.max(1,values.length-1);const y=h-pad-value/100*(h-pad*2);return `<circle cx="${x}" cy="${y}" r="3.5" class="report-trend-dot"/>`;}).join('')}</svg><div class="report-trend-caption"><span>First evaluated move</span><span>Later moves →</span></div>`;
    }
    function renderBreakdown(report) {
        const body = $('report-breakdown-body');
        if (!body) return;
        body.innerHTML = categories.map(item => {
            const white = report.sides.w.counts[item.key] || 0;
            const black = report.sides.b.counts[item.key] || 0;
            return `<tr><td><span class="report-table-dot" style="background:${item.color}"></span>${item.label}</td><td>${white}</td><td>${black}</td><td>${white + black}</td></tr>`;
        }).join('') + `<tr><td>Unrated</td><td>${report.sides.w.counts.unrated}</td><td>${report.sides.b.counts.unrated}</td><td>${report.sides.w.counts.unrated + report.sides.b.counts.unrated}</td></tr>`;
    }
    function renderMoves(report) {
        const body = $('report-moves-body');
        if (!body) return;
        const filter = moveFilter ? moveFilter.value : 'all';
        const filtered = report.rows.filter(row => filter === 'all' || (filter === 'white' && row.side === 'w') || (filter === 'black' && row.side === 'b') || (filter === 'errors' && ['inaccuracy','mistake','blunder','missedWin'].includes(row.classification)));
        body.innerHTML = filtered.length ? filtered.map(row => {
            const label = row.classification === 'missedWin' ? 'Missed win' : row.classification === 'unrated' ? 'Unrated' : row.classification.charAt(0).toUpperCase() + row.classification.slice(1);
            const moveNumber = `${row.fullMove}${row.side === 'w' ? '.' : '...'}`;
            return `<tr><td>${moveNumber}</td><td><span class="report-side-pill ${row.side === 'w' ? 'white-side' : 'black-side'}">${row.side === 'w' ? 'White' : 'Black'}</span></td><td class="report-played-move">${esc(row.san)}</td><td><span class="report-classification ${row.classification}">${label}</span></td><td class="report-best-move">${esc(row.bestMove)}</td><td>${row.loss === null ? '—' : `${Math.round(row.loss)} cp`}</td><td>${row.phase}</td></tr>`;
        }).join('') : '<tr><td colspan="7" class="report-empty-cell">No moves match this filter.</td></tr>';
    }
    function renderCoach(report) {
        const container = $('report-coach-insights');
        if (!container) return;
        const counts = totalCounts(report);
        const ideas = [];
        const whiteAcc = report.overall.w, blackAcc = report.overall.b;
        if (whiteAcc !== null && blackAcc !== null) {
            const better = whiteAcc >= blackAcc ? 'White' : 'Black';
            ideas.push({ icon: '✦', title: `${better} was more accurate`, body: `Estimated accuracy: White ${formatAccuracy(whiteAcc)} and Black ${formatAccuracy(blackAcc)}.` });
        }
        if (counts.blunder > 0) ideas.push({ icon: '!', title: 'Review blunders first', body: `${counts.blunder} blunder(s) were detected where the available evaluations showed a large swing. Revisit those positions and look for checks, captures, and threats.` });
        if (counts.missedWin > 0) ideas.push({ icon: '↗', title: 'Convert winning positions', body: `${counts.missedWin} possible missed win(s) were flagged. Check whether a forcing move or a simpler continuation was available.` });
        const errors = counts.inaccuracy + counts.mistake + counts.blunder;
        if (errors > 0) ideas.push({ icon: '◎', title: 'Build a blunder-check habit', body: `Before moving, scan for your opponent's checks, captures, and direct threats. The report flagged ${errors} inaccurate, mistaken, or blunder moves.` });
        if (!ideas.length) ideas.push({ icon: '✓', title: 'Keep building consistency', body: 'No major errors were identified in the evaluated positions. Review the move list to confirm the engine recommendations and keep practicing.' });
        container.innerHTML = ideas.slice(0, 4).map(item => `<div class="report-coach-item"><span class="report-coach-bullet">${item.icon}</span><div><strong>${item.title}</strong><p>${item.body}</p></div></div>`).join('');
    }
    function renderReport(report) {
        const total = totalCounts(report);
        setText('report-total-moves', report.rows.length);
        setText('report-white-accuracy', formatAccuracy(report.overall.w));
        setText('report-black-accuracy', formatAccuracy(report.overall.b));
        setText('report-coverage', `${Math.round(report.positionsEvaluated / Math.max(1, report.positionsTotal) * 100)}%`);
        setText('report-result', report.result || 'In progress');
        setText('report-opening', report.opening);
        setText('report-best-total', total.best);
        setText('report-missed-total', total.missedWin);
        setText('report-subtitle', `${report.game ? `${report.game.player_name || 'White'} vs ${report.game.opponent || 'Black'}` : 'Player vs AI'} · ${report.rows.length} moves`);
        renderQuality(report);
        renderPhaseChart(report);
        renderTrend(report);
        renderBreakdown(report);
        renderMoves(report);
        renderCoach(report);
        const coverage = report.positionsEvaluated / Math.max(1, report.positionsTotal);
        if (coverage < 0.8) {
            reportWarning.textContent = `Only ${report.positionsEvaluated} of ${report.positionsTotal} positions had an available cloud evaluation. Unavailable positions are marked “Unrated,” so the report may be incomplete.`;
            show(reportWarning, true);
        } else {
            reportWarning.textContent = '';
            show(reportWarning, false);
        }
        reportStatus.className = 'report-status';
        reportStatus.textContent = coverage < 0.8 ? 'Partially analyzed' : 'Analysis complete';
        show(progressWrap, false);
        if (runButton) { runButton.disabled = false; runButton.textContent = 'Analyze again'; }
    }

    window.openGameReview = function(game = null, suppliedMoves = null) {
        const sanMoves = getGameMoves(suppliedMoves);
        activeGame = { game, moves: sanMoves };
        lastReport = null;
        setText('report-title', 'Game Report');
        setText('report-subtitle', `${game ? `${game.player_name || 'White'} vs ${game.opponent || 'Black'}` : 'Player vs AI'} · Ready to analyze`);
        setText('report-result', game && game.result ? game.result : (typeof getGameResult === 'function' ? getGameResult() : 'In progress'));
        setText('report-opening', identifyOpening(sanMoves));
        setText('report-total-moves', sanMoves.length);
        setText('report-white-accuracy', '—');
        setText('report-black-accuracy', '—');
        setText('report-coverage', '—');
        setText('report-best-total', '0');
        setText('report-missed-total', '0');
        setText('report-rated-count', '0');
        if (reportStatus) { reportStatus.className = 'report-status'; reportStatus.textContent = 'Not analyzed'; }
        show(reportWarning, false);
        show(progressWrap, false);
        if (runButton) { runButton.disabled = false; runButton.textContent = 'Analyze game'; }
        openOverlay();
        showSection('overview');
        if (!sanMoves.length) {
            reportWarning.textContent = 'Play some moves first, or open a saved game from Game History, then run the report.';
            show(reportWarning, true);
        }
    };

    window.openSavedGameReview = async function(gameId) {
        try {
            const response = await window.apiFetch(`/games/${gameId}`);
            if (!response.ok) throw new Error('Could not load saved game');
            const data = await response.json();
            if (!data.success) throw new Error(data.message || 'Game not found');
            const formattedMoves = [];
            (data.moves || []).forEach(pair => {
                if (pair.player_move) formattedMoves.push(pair.player_move);
                if (pair.ai_move) formattedMoves.push(pair.ai_move);
            });
            window.openGameReview(data.game, formattedMoves);
        } catch (error) {
            console.error('Game Report Error:', error);
            alert('Could not open the saved game report. Make sure python app.py is running.');
        }
    };

    if (runButton) runButton.addEventListener('click', async () => {
        if (!activeGame.moves || !activeGame.moves.length) {
            reportWarning.textContent = 'This game has no moves to analyze yet.';
            show(reportWarning, true);
            return;
        }
        reportWarning.textContent = '';
        show(reportWarning, false);
        try {
            const report = await analyzeGame(activeGame.game, activeGame.moves);
            lastReport = report;
            renderReport(report);
        } catch (error) {
            if (error.message !== 'Analysis cancelled') {
                console.error('Game Report Analysis Error:', error);
                reportWarning.textContent = 'Analysis could not finish. Check your internet connection and try again.';
                show(reportWarning, true);
                reportStatus.className = 'report-status error';
                reportStatus.textContent = 'Analysis failed';
            }
            show(progressWrap, false);
            if (runButton) { runButton.disabled = false; runButton.textContent = 'Try again'; }
        }
    });
    closeButtons.forEach(button => button && button.addEventListener('click', closeOverlay));
    if (overlay) overlay.addEventListener('click', event => { if (event.target === overlay) closeOverlay(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && overlay && overlay.classList.contains('show')) closeOverlay(); });
    document.querySelectorAll('.report-nav[data-report-section]').forEach(button => button.addEventListener('click', () => showSection(button.dataset.reportSection)));
    if (moveFilter) moveFilter.addEventListener('change', () => { if (lastReport) renderMoves(lastReport); });
    const reportButton = $('report-button');
    if (reportButton) reportButton.addEventListener('click', () => window.openGameReview());
})();
