(() => {
  const isWebOrigin = window.location.protocol === "http:" || window.location.protocol === "https:";
  const isLocalPreview = isWebOrigin && ["localhost", "127.0.0.1"].includes(window.location.hostname) && window.location.port && window.location.port !== "5000";
  const DEFAULT_API_BASE = isLocalPreview ? "http://127.0.0.1:5000" : (isWebOrigin ? window.location.origin : "http://127.0.0.1:5000");
  const API_BASE = window.CHESS_API_BASE || DEFAULT_API_BASE;
  const authScreen = document.getElementById("auth-screen");
  const homeScreen = document.getElementById("home-screen");
  const practiceScreen = document.getElementById("practice-screen");
  const dashboardScreen = document.getElementById("player-dashboard");
  const onlineScreen = document.getElementById("online-screen");
  const authForm = document.getElementById("auth-form");
  const authMessage = document.getElementById("auth-message");
  const authSubmit = document.getElementById("auth-submit");
  const loginTab = document.getElementById("auth-login-tab");
  const registerTab = document.getElementById("auth-register-tab");
  let authMode = "login";
  let currentUser = null;
  let autoSaveTimer = null;
  let autosaveInFlight = false;
  let autosaveQueue = Promise.resolve(true);
  let savedGameId = null;
  let currentGameKey = null;
  let aiThinking = false;
  let hintThinking = false;
  window.practiceMode = false;
  const PRACTICE_STATE_PREFIX = "chess_practice_state_";

  window.apiFetch = async (path, options = {}) => {
    const token = localStorage.getItem("chess_access_token");
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${API_BASE}${path}`, {...options, headers});
    if (response.status === 401 && token && !path.startsWith("/login") && !path.startsWith("/register")) {
      localStorage.removeItem("chess_access_token");
      currentUser = null;
      showAuth("Your session expired. Please log in again.");
    }
    return response;
  };

  function setAuthMode(mode) {
    authMode = mode;
    loginTab.classList.toggle("active", mode === "login");
    registerTab.classList.toggle("active", mode === "register");
    authSubmit.textContent = mode === "login" ? "Log in" : "Create account";
    document.getElementById("auth-password").autocomplete = mode === "login" ? "current-password" : "new-password";
    authMessage.textContent = "";
  }
  loginTab.addEventListener("click", () => setAuthMode("login"));
  registerTab.addEventListener("click", () => setAuthMode("register"));

  function showOnly(screen) {
    [authScreen, homeScreen, practiceScreen, dashboardScreen, onlineScreen].forEach(el => { if (el) el.hidden = el !== screen; });
    window.scrollTo({top: 0, behavior: "instant"});
  }
  function showAuth(message = "") {
    window.practiceMode = false;
    window.multiplayerMode = false;
    showOnly(authScreen);
    authMessage.textContent = message;
  }
  function showHome() {
    window.practiceMode = false;
    window.multiplayerMode = false;
    showOnly(homeScreen);
  }
  window.showAccountHome = showHome;
  window.getCurrentChessUser = () => currentUser;
  function createGameKey() {
    try { if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID(); } catch (_) {}
    return `cg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  }
  function practiceStateKey(user = currentUser) {
    return user ? `${PRACTICE_STATE_PREFIX}${user.id}` : null;
  }
  function readPracticeState(user = currentUser) {
    const key = practiceStateKey(user);
    if (!key) return null;
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (_) { return null; }
  }
  function savePracticeState(active = window.practiceMode) {
    if (!currentUser || !window.chess || !Array.isArray(window.movesList)) return;
    const key = practiceStateKey();
    if (!key) return;
    const payload = {
      active: Boolean(active),
      savedGameId,
      gameKey: currentGameKey,
      moves: window.movesList.slice(),
      historyIndex: Number.isInteger(window.historyIndex) ? window.historyIndex : window.movesList.length,
      savedAt: Date.now()
    };
    try { localStorage.setItem(key, JSON.stringify(payload)); } catch (error) { console.warn("Could not persist the current board locally.", error); }
  }
  function restorePracticeState() {
    const state = readPracticeState();
    if (!state || !Array.isArray(state.moves)) return false;
    if (typeof window.startFreshPracticeGame === "function") window.startFreshPracticeGame(false);
    const game = window.chess;
    if (!game) return false;
    const replayedMoves = [];
    const positions = [game.fen()];
    for (const san of state.moves) {
      const move = game.move(san);
      if (!move) break;
      replayedMoves.push(move.san);
      positions.push(game.fen());
    }
    // Existing project state is represented as one SAN move per history position.
    window.movesList.splice(0, window.movesList.length, ...replayedMoves);
    const positionHistory = window.positionHistory;
    positionHistory.splice(0, positionHistory.length, ...positions);
    const lastIndex = Math.max(0, positions.length - 1);
    const desiredIndex = Number.isInteger(state.historyIndex) ? state.historyIndex : lastIndex;
    window.historyIndex = Math.max(0, Math.min(lastIndex, desiredIndex));
    // Keep chess.js move/repetition history intact when restoring the current end position.
    if (window.historyIndex !== lastIndex) game.load(positions[window.historyIndex]);
    savedGameId = state.savedGameId || null;
    currentGameKey = state.gameKey || createGameKey();
    if (typeof window.updateGameUI === "function") window.updateGameUI();
    return true;
  }
  function enterPractice() {
    if (!currentUser) return showAuth();
    window.practiceMode = true;
    showOnly(practiceScreen);
    const restored = restorePracticeState();
    if (!restored && typeof window.startFreshPracticeGame === "function") window.startFreshPracticeGame();
    savePracticeState(true);
    if (window.chess?.turn() === "b" && !window.chess.game_over()) window.requestStrongAIMove?.();
  }
  function currentMovesPayload() {
    const allMoves = (window.movesList || []).slice(0, window.historyIndex === undefined ? undefined : window.historyIndex);
    const result = [];
    for (let i = 0; i < allMoves.length; i += 2) result.push({move_number: Math.floor(i / 2) + 1, player_move: allMoves[i] || "", ai_move: allMoves[i + 1] || ""});
    return result;
  }
  window.accountAutoSave = function() {
    if (!currentUser || !window.practiceMode) return;
    savePracticeState(true);
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
      const saved = await persistGame(false);
      if (!saved && window.practiceMode) setPracticeStatus("Sync paused. Your game is kept on this device; it will try again after your next move.", "error");
    }, 220);
  };
  window.flushPracticeSave = async function() {
    clearTimeout(autoSaveTimer);
    return await persistGame(true);
  };
  function persistGame(finalSave = false) {
    if (!currentUser || !window.practiceMode) return Promise.resolve(false);
    if (!(window.movesList || []).length && !savedGameId) return Promise.resolve(false);

    // Queue writes so two fast moves or a manual Save cannot race and create duplicate games.
    const job = autosaveQueue.catch(() => false).then(async () => {
      if (!currentUser || !window.practiceMode) return false;
      if (!(window.movesList || []).length && !savedGameId) return false;
      autosaveInFlight = true;
      try {
        const response = await window.apiFetch("/games/autosave", {
          method: "POST",
          body: JSON.stringify({
            game_id: savedGameId,
            game_key: currentGameKey || (currentGameKey = createGameKey()),
            result: typeof getGameResult === "function" ? getGameResult() : "In Progress",
            moves: currentMovesPayload()
          })
        });
        const data = await response.json();
        if (!response.ok || !data.success || !data.game_id) throw new Error(data.message || "Game save failed");
        savedGameId = data.game_id;
        savePracticeState(window.practiceMode);
        window.dispatchEvent(new CustomEvent("chess-game-saved", {detail: {gameId: savedGameId, result: data.result}}));
        return true;
      } catch (error) {
        console.error("Game save error:", error);
        return false;
      } finally {
        autosaveInFlight = false;
      }
    });
    autosaveQueue = job;
    return job;
  }


  // Lightweight browser-based chess AI. It uses legal moves from chess.js,
  // material evaluation, center control, move ordering, and alpha-beta search.
  // No separate chess engine or executable needs to be installed.
  function evaluatePositionForBlack() {
    const values = {p: 100, n: 320, b: 335, r: 500, q: 900, k: 0};
    const board = window.chess.board();
    let score = 0;
    let whiteMaterial = 0;
    let blackMaterial = 0;
    let pieces = 0;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col];
        if (!piece) continue;
        pieces++;
        const val = values[piece.type] || 0;
        const sign = piece.color === "b" ? 1 : -1;
        score += sign * val;
        if (piece.color === "w") whiteMaterial += val;
        else blackMaterial += val;

        // Encourage pieces to influence the center and develop off the back rank.
        const fileDistance = Math.abs(3.5 - col);
        const rankDistance = Math.abs(3.5 - row);
        const centerBonus = Math.round((7 - fileDistance - rankDistance) * (piece.type === "p" ? 1.8 : 2.2));
        score += sign * centerBonus;
        if (piece.type === "n" || piece.type === "b") {
          const homeRank = piece.color === "w" ? 7 : 0;
          if (row !== homeRank) score += sign * 8;
        }
      }
    }

    // In simplified positions, favor king activity and passed-pawn advancement.
    if (pieces <= 12) {
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const piece = board[row][col];
          if (!piece) continue;
          const sign = piece.color === "b" ? 1 : -1;
          if (piece.type === "k") {
            score += sign * Math.round((7 - Math.abs(3.5-col) - Math.abs(3.5-row)) * 5);
          }
          if (piece.type === "p") {
            const advance = piece.color === "b" ? row : 7-row;
            score += sign * advance * 5;
          }
        }
      }
    }
    return score;
  }

  function orderedLegalMoves() {
    const moves = window.chess.moves({verbose: true});
    const values = {p: 100, n: 320, b: 335, r: 500, q: 900, k: 20000};
    return moves.sort((a, b) => {
      const score = m => (m.captured ? 10 * (values[m.captured] || 0) - (values[m.piece] || 0) : 0) + (m.promotion ? 800 : 0) + (m.san && m.san.includes("+") ? 40 : 0);
      return score(b) - score(a);
    });
  }

  function minimax(depth, alpha, beta) {
    const game = window.chess;
    if (game.game_over()) {
      if (game.in_checkmate()) return game.turn() === "b" ? -100000 - depth : 100000 + depth;
      return 0;
    }
    if (depth <= 0) return evaluatePositionForBlack();

    const maximizing = game.turn() === "b";
    let best = maximizing ? -Infinity : Infinity;
    const moves = orderedLegalMoves();
    for (const move of moves) {
      game.move({from: move.from, to: move.to, promotion: move.promotion || "q"});
      const score = minimax(depth - 1, alpha, beta);
      game.undo();
      if (maximizing) {
        best = Math.max(best, score);
        alpha = Math.max(alpha, best);
      } else {
        best = Math.min(best, score);
        beta = Math.min(beta, best);
      }
      if (beta <= alpha) break;
    }
    return best;
  }

  async function findBestMoveForCurrentTurn() {
    if (!window.chess || window.chess.game_over()) return null;
    const game = window.chess;
    const maximizing = game.turn() === "b";
    const candidates = orderedLegalMoves();
    let bestMove = null;
    let bestScore = maximizing ? -Infinity : Infinity;
    const searchDepth = 2;
    for (const candidate of candidates) {
      game.move({from: candidate.from, to: candidate.to, promotion: candidate.promotion || "q"});
      const score = minimax(searchDepth, -Infinity, Infinity);
      game.undo();
      if ((maximizing && score > bestScore) || (!maximizing && score < bestScore)) {
        bestScore = score;
        bestMove = candidate;
      }
    }
    return bestMove;
  }

  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  async function animateAIMove(from, to) {
    const fromSquare = document.querySelector(`[data-square="${from}"]`);
    const toSquare = document.querySelector(`[data-square="${to}"]`);
    const sourceImg = fromSquare?.querySelector(".piece");
    if (!fromSquare || !toSquare || !sourceImg) {
      if (typeof window.updateGameUI === "function") window.updateGameUI();
      return;
    }

    const startRect = sourceImg.getBoundingClientRect();
    const movingImg = sourceImg.cloneNode(true);
    movingImg.classList.remove("dragging");
    movingImg.style.position = "fixed";
    movingImg.style.left = `${startRect.left}px`;
    movingImg.style.top = `${startRect.top}px`;
    movingImg.style.width = `${startRect.width}px`;
    movingImg.style.height = `${startRect.height}px`;
    movingImg.style.margin = "0";
    movingImg.style.zIndex = "10000";
    movingImg.style.pointerEvents = "none";
    movingImg.style.transition = "left 230ms cubic-bezier(.2,.7,.2,1), top 230ms cubic-bezier(.2,.7,.2,1)";
    document.body.appendChild(movingImg);
    const previousPointerEvents = document.getElementById("board").style.pointerEvents;
    document.getElementById("board").style.pointerEvents = "none";

    // The logical position is already updated before the tween begins.
    if (typeof window.updateGameUI === "function") window.updateGameUI();
    const destinationImg = toSquare.querySelector(".piece");
    if (destinationImg) destinationImg.style.visibility = "hidden";
    const endRect = toSquare.getBoundingClientRect();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
      movingImg.style.left = `${endRect.left + (endRect.width - startRect.width) / 2}px`;
      movingImg.style.top = `${endRect.top + (endRect.height - startRect.height) / 2}px`;
      setTimeout(resolve, 245);
    })));
    destinationImg?.style.removeProperty("visibility");
    movingImg.remove();
    document.getElementById("board").style.pointerEvents = previousPointerEvents;
  }

  window.requestStrongAIMove = async function() {
    if (!window.practiceMode || aiThinking || !window.chess || window.chess.game_over() || window.chess.turn() !== "b") return;
    aiThinking = true;
    const hintStatus = document.getElementById("hint-status");
    if (hintStatus) hintStatus.textContent = "AI is thinking…";
    try {
      // Yield to the browser so the player's move and status can paint first.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await wait(120);
      const bestMove = await findBestMoveForCurrentTurn();
      if (!bestMove || !window.practiceMode || window.chess.turn() !== "b") return;
      const move = window.chess.move({from: bestMove.from, to: bestMove.to, promotion: bestMove.promotion || "q"});
      if (!move) return;
      window.movesList.push(move.san);
      window.positionHistory.push(window.chess.fen());
      window.historyIndex = window.positionHistory.length - 1;
      await animateAIMove(bestMove.from, bestMove.to);
      if (typeof window.accountAutoSave === "function") window.accountAutoSave();
      if (hintStatus) hintStatus.textContent = "";
      if (window.chess.game_over()) await persistGame(true);
    } catch (error) {
      console.error("Built-in chess AI error:", error);
      if (hintStatus) hintStatus.textContent = "The AI couldn't complete that move. Try again.";
    } finally {
      aiThinking = false;
    }
  };

  function setPracticeStatus(message, kind = "info") {
    const status = document.getElementById("hint-status");
    if (!status) return;
    status.textContent = message || "";
    status.dataset.kind = kind;
  }

  const hintButton = document.getElementById("hint-button");
  hintButton?.addEventListener("click", async () => {
    const hintStatus = document.getElementById("hint-status");
    const boardRoot = document.getElementById("board");
    boardRoot?.querySelectorAll(".hint-from, .hint-to").forEach(square => square.classList.remove("hint-from", "hint-to"));
    if (!window.practiceMode || !window.chess) return;
    if (aiThinking || hintThinking || window.chess.turn() !== "w") {
      if (hintStatus) hintStatus.textContent = "Wait until it’s your turn to get a hint.";
      return;
    }
    if (window.chess.game_over()) {
      if (hintStatus) hintStatus.textContent = "This game is over. Start a new game to continue.";
      return;
    }
    hintThinking = true;
    hintButton.disabled = true;
    hintButton.textContent = "Finding…";
    if (hintStatus) hintStatus.textContent = "Finding the strongest move in this position…";
    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const bestMove = await findBestMoveForCurrentTurn();
      if (!bestMove) throw new Error("No legal move available");
      const fromSquare = document.querySelector(`[data-square="${bestMove.from}"]`);
      const toSquare = document.querySelector(`[data-square="${bestMove.to}"]`);
      fromSquare?.classList.add("hint-from");
      toSquare?.classList.add("hint-to");
      const bestMoveText = document.getElementById("best-move");
      if (bestMoveText) bestMoveText.textContent = bestMove.san;
      if (hintStatus) hintStatus.textContent = `Highlighted on the board: ${bestMove.from} → ${bestMove.to}`;
    } catch (error) {
      console.error("Hint search error:", error);
      if (hintStatus) hintStatus.textContent = "No hint is available for this position.";
    } finally {
      hintThinking = false;
      hintButton.disabled = false;
      hintButton.textContent = "Hint";
    }
  });


  function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value ?? "—"; }

  async function loadDashboard() {
    showOnly(dashboardScreen);
    setText("dashboard-username", currentUser.username);
    setText("dash-rating", 1200);
    setText("dash-rating-change", "Starting rating");
    setText("dash-games", 0);
    setText("dash-winrate", "0%");
    setText("dash-record", "0 wins · 0 draws · 0 losses");
    setText("dash-streak", "0");
    renderRatingChart([]);
    renderRecentGames([]);
    try {
      const response = await window.apiFetch("/dashboard");
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load dashboard");
      setText("dash-rating", data.rating);
      setText("dash-rating-change", data.rating_change >= 0 ? `↑ ${data.rating_change} points since start` : `↓ ${Math.abs(data.rating_change)} points since start`);
      setText("dash-games", data.games_played);
      setText("dash-winrate", `${data.win_rate ?? 0}%`);
      setText("dash-record", `${data.wins} wins · ${data.draws} draws · ${data.losses} losses`);
      setText("dash-streak", `${data.current_streak} ${data.streak_type || ""}`.trim());
      renderRatingChart(data.rating_history || []);
      renderRecentGames(data.recent_games || []);
    } catch (error) {
      console.warn("Dashboard data could not be refreshed.", error);
      setText("dash-rating", 1200);
      setText("dash-games", 0);
      setText("dash-winrate", "0%");
      setText("dash-record", "0 wins · 0 draws · 0 losses");
      setText("dash-streak", "0");
      renderRatingChart([]);
      renderRecentGames([]);
    }
  }
  function renderRatingChart(points) {
    const root = document.getElementById("rating-chart");
    if (!points.length) { root.innerHTML = '<p class="empty-state">Play your first game to start tracking your rating.</p>'; return; }
    const vals = points.map(p => p.rating);
    const min = Math.min(...vals, 1000), max = Math.max(...vals, 1600), span = Math.max(100, max - min);
    root.innerHTML = points.slice(-20).map((p, i, arr) => {
      const height = Math.max(8, 35 + ((p.rating - min) / span) * 115);
      return `<div class="rating-point" title="Game ${p.game_number}: ${p.rating} rating"><span>${p.rating}</span><i style="height:${height}px"></i><span>${p.game_number}</span></div>`;
    }).join("");
  }
  function renderRecentGames(games) {
    const root = document.getElementById("dashboard-recent-games");
    if (!games.length) { root.innerHTML = '<p class="empty-state">No games played yet.</p>'; return; }
    root.innerHTML = games.map(g => `<div class="recent-game"><div><strong>Game #${g.id}</strong><small>${escapeHtml(g.date || "Date unavailable")} · ${g.move_count} plies</small></div><span class="recent-result ${g.outcome.toLowerCase()}">${escapeHtml(g.outcome)}</span></div>`).join("");
  }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

  authForm.addEventListener("submit", async event => {
    event.preventDefault();
    const username = document.getElementById("auth-username").value.trim();
    const password = document.getElementById("auth-password").value;
    authSubmit.disabled = true;
    authMessage.textContent = authMode === "login" ? "Logging in…" : "Creating your account…";
    try {
      const response = await fetch(`${API_BASE}/${authMode}`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Authentication failed");
      localStorage.setItem("chess_access_token", data.token);
      currentUser = data.user;
      setText("portal-welcome", `Hey, ${currentUser.username}`);
      setText("dashboard-username", currentUser.username);
      setText("online-username", `@${currentUser.username}`);
      document.getElementById("auth-password").value = "";
      showHome();
    } catch (error) { authMessage.textContent = error instanceof TypeError ? "We couldn’t complete that request. Please try again." : error.message; }
    finally { authSubmit.disabled = false; }
  });
  async function verifySession() {
    const token = localStorage.getItem("chess_access_token");
    if (!token) return showAuth();
    try {
      const response = await window.apiFetch("/me");
      const data = await response.json();
      if (!response.ok || !data.success) {
        localStorage.removeItem("chess_access_token");
        return showAuth("Your session ended. Please log in again.");
      }
      currentUser = data.user;
      setText("portal-welcome", `Hey, ${currentUser.username}`);
      setText("dashboard-username", currentUser.username);
      setText("online-username", `@${currentUser.username}`);
      const savedState = readPracticeState();
      if (savedState?.active) {
        window.practiceMode = true;
        showOnly(practiceScreen);
        const restored = restorePracticeState();
        if (!restored && typeof window.startFreshPracticeGame === "function") window.startFreshPracticeGame();
        savePracticeState(true);
        if (window.chess?.turn() === "b" && !window.chess.game_over()) window.requestStrongAIMove?.();
        // Reconcile any move that was stored locally just before a refresh.
        window.accountAutoSave?.();
      } else {
        showHome();
      }
    } catch (error) {
      // A temporary network failure should not erase a still-valid sign-in token.
      if (!localStorage.getItem("chess_access_token")) return showAuth();
      showAuth("Unable to reconnect right now. Your sign-in is kept; refresh to try again.");
    }
  }
  async function logout() {
    if (currentUser && window.practiceMode) {
      clearTimeout(autoSaveTimer);
      const saved = await persistGame(true);
      savePracticeState(!saved);
      window.practiceMode = false;
    }
    try { await window.apiFetch("/logout", {method:"POST"}); } catch (_) {}
    localStorage.removeItem("chess_access_token"); currentUser = null; savedGameId = null; window.practiceMode = false; showAuth();
  }
  document.getElementById("practice-card").addEventListener("click", enterPractice);
  window.showOnlineScreen = function() {
    if (!currentUser) return showAuth();
    window.practiceMode = false;
    window.multiplayerMode = false;
    showOnly(onlineScreen);
    setText("online-username", `@${currentUser.username}`);
    window.loadOnlineHub?.();
  };
  document.getElementById("online-card")?.addEventListener("click", () => window.showOnlineScreen());
  let historyReturnScreen = homeScreen;
  window.openHistory = async function(returnScreen = homeScreen) {
    historyReturnScreen = returnScreen;
    if (window.practiceMode) {
      clearTimeout(autoSaveTimer);
      const saved = await persistGame(true);
      savePracticeState(!saved);
    }
    window.practiceMode = false;
    showOnly(practiceScreen);
    document.getElementById("history-overlay")?.classList.add("show");
    if (typeof window.loadSavedGames === "function") await window.loadSavedGames();
  };
  document.getElementById("history-card").addEventListener("click", () => window.openHistory(homeScreen));
  document.getElementById("dashboard-card").addEventListener("click", loadDashboard);
  document.getElementById("home-button").addEventListener("click", async () => {
    if (window.multiplayerMode && typeof window.exitMultiplayerBoard === "function") {
      window.exitMultiplayerBoard();
      return;
    }
    if (window.practiceMode) {
      clearTimeout(autoSaveTimer);
      const saved = await persistGame(true);
      savePracticeState(!saved);
      window.practiceMode = false;
    }
    showHome();
  });
  document.querySelectorAll("[data-go-home]").forEach(el => el.addEventListener("click", async () => {
    if (window.practiceMode) {
      clearTimeout(autoSaveTimer);
      const saved = await persistGame(true);
      savePracticeState(!saved);
    }
    if (window.multiplayerMode && typeof window.exitMultiplayerBoard === "function") window.exitMultiplayerBoard();
    else showHome();
  }));
  document.getElementById("logout-button").addEventListener("click", logout);
  document.getElementById("dashboard-logout").addEventListener("click", logout);
  document.getElementById("online-logout")?.addEventListener("click", logout);
  document.getElementById("header-new-game")?.addEventListener("click", () => window.handlePracticeNewGame?.());
  document.getElementById("dashboard-history").addEventListener("click", () => window.openHistory(dashboardScreen));
  document.getElementById("close-history")?.addEventListener("click", () => {
    document.getElementById("history-overlay")?.classList.remove("show");
    showOnly(historyReturnScreen || homeScreen);
  });

  // Expose state needed by the existing board script without changing its board implementation.
  Object.defineProperty(window, "chess", {configurable:true,get:() => typeof chess !== "undefined" ? chess : undefined});
  Object.defineProperty(window, "movesList", {configurable:true,get:() => typeof movesList !== "undefined" ? movesList : []});
  Object.defineProperty(window, "positionHistory", {configurable:true,get:() => typeof positionHistory !== "undefined" ? positionHistory : []});
  Object.defineProperty(window, "historyIndex", {configurable:true,get:() => typeof historyIndex !== "undefined" ? historyIndex : 0,set: value => { if (typeof historyIndex !== "undefined") historyIndex = value; }});
  Object.defineProperty(window, "startFreshPracticeGame", {configurable:true,value:(persist = true) => {
    if (typeof chess !== "undefined") chess.reset();
    if (typeof movesList !== "undefined") movesList.length = 0;
    if (typeof positionHistory !== "undefined") { positionHistory.length = 0; positionHistory.push(chess.fen()); }
    if (typeof historyIndex !== "undefined") historyIndex = 0;
    savedGameId = null;
    currentGameKey = createGameKey();
    if (typeof selectedSquare !== "undefined") selectedSquare = null;
    document.getElementById("checkmate-overlay")?.classList.remove("show");
    document.getElementById("hint-status")?.replaceChildren();
    const gameStatus = document.getElementById("game-status");
    if (gameStatus) { gameStatus.textContent = ""; delete gameStatus.dataset.kind; }
    document.querySelectorAll(".hint-from, .hint-to").forEach(el => el.classList.remove("hint-from", "hint-to"));
    if (typeof updateGameUI === "function") updateGameUI();
    if (persist && currentUser) savePracticeState(true);
  }});

  window.handlePracticeNewGame = async function() {
    if (!currentUser) return showAuth();
    clearTimeout(autoSaveTimer);
    // Finish saving the current game before starting a separate one.
    if (window.practiceMode && ((window.movesList || []).length > 0 || savedGameId)) {
      clearTimeout(autoSaveTimer);
      const saved = await persistGame(true);
      while (autosaveInFlight) await wait(30);
      if (!saved) {
        setPracticeStatus("The current game could not sync yet. Try Save again before starting a new game.", "error");
        return;
      }
    }
    savedGameId = null;
    aiThinking = false;
    window.practiceMode = true;
    showOnly(practiceScreen);
    window.startFreshPracticeGame(true);
    savePracticeState(true);
  };

  window.savePracticeGameNow = async function() {
    if (!currentUser || !window.practiceMode) return;
    if (!(window.movesList || []).length) {
      setPracticeStatus("Make your first move before saving.", "info");
      return;
    }
    savePracticeState(true);
    clearTimeout(autoSaveTimer);
    setPracticeStatus("Saving game…", "info");
    const saved = await persistGame(true);
    if (saved) {
      setPracticeStatus("Game saved to your account. It will appear in History and Player Dashboard.", "success");
    } else {
      setPracticeStatus("Could not sync the game right now. Your current position is kept on this device; try Save again.", "error");
    }
  };


  window.addEventListener("pagehide", () => {
    if (currentUser && window.practiceMode) savePracticeState(true);
  });
  window.addEventListener("beforeunload", () => {
    if (currentUser && window.practiceMode) savePracticeState(true);
  });
  verifySession();
})();
