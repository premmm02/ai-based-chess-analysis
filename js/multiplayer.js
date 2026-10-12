(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const onlineScreen = $("online-screen");
  const friendsRoot = $("friends-list");
  const matchesRoot = $("online-matches-list");
  const friendMessage = $("friend-message");
  let activeMatchId = null;
  let activeMatch = null;
  let listPollTimer = null;
  let boardPollTimer = null;
  let moveSubmitInFlight = false;
  let lastRenderedPly = -1;

  window.multiplayerMode = false;
  window.multiplayerColor = "w";
  window.multiplayerMatchStatus = "";

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#39;"}[ch]));
  }

  function setMessage(node, message, type = "info") {
    if (!node) return;
    node.textContent = message || "";
    node.dataset.kind = type;
  }

  async function api(path, options = {}) {
    const response = await window.apiFetch(path, options);
    let data;
    try { data = await response.json(); } catch (_) { data = {}; }
    if (!response.ok || data.success === false) {
      throw new Error(data.message || `Request failed (${response.status})`);
    }
    return data;
  }

  function onlineVisible() { return onlineScreen && !onlineScreen.hidden; }

  function startListPolling() {
    if (listPollTimer) clearInterval(listPollTimer);
    listPollTimer = setInterval(() => {
      if (onlineVisible()) refreshMatches(false).catch(() => {});
    }, 2500);
  }

  async function refreshFriends() {
    if (!friendsRoot) return;
    try {
      const data = await api("/friends");
      const friends = data.friends || [];
      if (!friends.length) {
        friendsRoot.innerHTML = '<p class="empty-state">No friends yet. Add someone using their exact username above.</p>';
        return;
      }
      friendsRoot.innerHTML = friends.map(friend => `
        <article class="online-list-item">
          <div class="online-player-avatar">${escapeHtml((friend.username || "?").slice(0,1).toUpperCase())}</div>
          <div class="online-list-copy"><strong>@${escapeHtml(friend.username)}</strong><small>Chess friend</small></div>
          <div class="online-list-actions"><button class="btn btn-primary btn-small" data-challenge="${Number(friend.id)}" type="button">Challenge</button><button class="online-remove" data-remove-friend="${Number(friend.id)}" type="button" aria-label="Remove friend @${escapeHtml(friend.username)}" title="Remove friend">×</button></div>
        </article>`).join("");
    } catch (error) {
      friendsRoot.innerHTML = `<p class="online-error">${escapeHtml(error.message || "Could not load friends.")}</p>`;
    }
  }

  async function refreshMatches(showError = true) {
    if (!matchesRoot) return;
    try {
      const data = await api("/multiplayer/matches");
      const matches = data.matches || [];
      if (!matches.length) {
        matchesRoot.innerHTML = '<p class="empty-state">No pending challenges or active matches.</p>';
        return;
      }
      matchesRoot.innerHTML = matches.map(match => {
        const incoming = match.incoming;
        const friend = match.my_color === "white" ? match.black_username : match.white_username;
        const headline = incoming ? `@${escapeHtml(match.white_username)} challenged you` : (match.status === "pending" ? `Waiting for @${escapeHtml(match.black_username)}` : `vs @${escapeHtml(friend)}`);
        let actions = "";
        if (incoming) {
          actions = `<button class="btn btn-primary btn-small" data-accept="${match.id}" type="button">Accept</button><button class="btn btn-secondary btn-small" data-decline="${match.id}" type="button">Decline</button>`;
        } else if (match.status === "active") {
          actions = `<button class="btn btn-primary btn-small" data-open-match="${match.id}" type="button">Open match</button>`;
        } else {
          actions = '<span class="online-waiting">Challenge sent</span>';
        }
        const statusText = match.status === "active" ? (match.my_turn ? "Your turn" : "Waiting for opponent") : (incoming ? "Incoming challenge" : "Awaiting acceptance");
        return `<article class="online-list-item match-list-item"><div class="online-match-icon">${match.status === "active" ? "♟" : "✉"}</div><div class="online-list-copy"><strong>${headline}</strong><small>Match #${match.id} · ${statusText} · ${match.moves.length} moves</small></div><div class="online-list-actions">${actions}</div></article>`;
      }).join("");
    } catch (error) {
      if (showError) matchesRoot.innerHTML = `<p class="online-error">${escapeHtml(error.message || "Could not load matches.")}</p>`;
    }
  }

  window.loadOnlineHub = async function() {
    await Promise.all([refreshFriends(), refreshMatches()]);
    startListPolling();
  };

  $("friend-add-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const input = $("friend-username");
    const username = input.value.trim();
    const button = $("friend-add-button");
    if (!username) return;
    button.disabled = true;
    setMessage(friendMessage, "Looking up username…");
    try {
      const data = await api("/friends", {method: "POST", body: JSON.stringify({username})});
      input.value = "";
      setMessage(friendMessage, `@${data.friend.username} added to your friends.`, "success");
      await refreshFriends();
    } catch (error) {
      setMessage(friendMessage, error.message || "Could not add this friend.", "error");
    } finally { button.disabled = false; }
  });

  $("refresh-friends")?.addEventListener("click", refreshFriends);
  $("refresh-matches")?.addEventListener("click", () => refreshMatches());

  document.addEventListener("click", async event => {
    const target = event.target.closest("button[data-challenge],button[data-remove-friend],button[data-accept],button[data-decline],button[data-open-match]");
    if (!target) return;
    target.disabled = true;
    try {
      if (target.dataset.challenge) {
        const data = await api("/multiplayer/matches", {method: "POST", body: JSON.stringify({friend_id: Number(target.dataset.challenge)})});
        setMessage(friendMessage, `Challenge sent to @${data.match.black_username}. They'll see it when they open Online Multiplayer.`, "success");
        await refreshMatches();
      } else if (target.dataset.removeFriend) {
        const id = Number(target.dataset.removeFriend);
        await api(`/friends/${id}`, {method: "DELETE"});
        await refreshFriends();
        await refreshMatches();
      } else if (target.dataset.accept) {
        const id = Number(target.dataset.accept);
        const data = await api(`/multiplayer/matches/${id}/respond`, {method: "POST", body: JSON.stringify({accept: true})});
        await refreshMatches();
        await enterMatch(data.match.id);
      } else if (target.dataset.decline) {
        await api(`/multiplayer/matches/${Number(target.dataset.decline)}/respond`, {method: "POST", body: JSON.stringify({accept: false})});
        await refreshMatches();
      } else if (target.dataset.openMatch) {
        await enterMatch(Number(target.dataset.openMatch));
      }
    } catch (error) {
      setMessage(friendMessage, error.message || "That action could not be completed.", "error");
      await refreshMatches(false);
    } finally { target.disabled = false; }
  });

  function setBoardStatus(message, type = "info") {
    const status = $("game-status");
    if (!status) return;
    status.textContent = message || "";
    status.dataset.kind = type;
  }

  function setMultiplayerHeader(match) {
    const title = $("game-header-title");
    if (title) title.textContent = `Online Match #${match.id}`;
    $("hint-button").hidden = true;
    $("save-game").hidden = true;
    $("header-new-game").hidden = true;
    $("resign-online").hidden = match.status !== "active";
  }

  function clearMultiplayerHighlights() {
    document.querySelectorAll(".hint-from,.hint-to").forEach(node => node.classList.remove("hint-from", "hint-to"));
  }

  function applyMatchToBoard(match, force = false) {
    activeMatch = match;
    activeMatchId = match.id;
    window.multiplayerMode = true;
    window.practiceMode = false;
    window.multiplayerColor = match.my_color === "white" ? "w" : "b";
    window.multiplayerMatchStatus = match.status;
    setMultiplayerHeader(match);
    clearMultiplayerHighlights();
    const hintStatus = $("hint-status");
    if (hintStatus) hintStatus.textContent = "";

    const moveCount = (match.moves || []).length;
    const shouldRebuild = force || moveCount !== lastRenderedPly;
    if (shouldRebuild) {
      if (typeof window.startFreshPracticeGame === "function") window.startFreshPracticeGame(false);
      const game = window.chess;
      if (!game) return;
      for (const serverMove of (match.moves || [])) {
        const uci = String(serverMove.uci || "");
        const move = game.move({from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci.slice(4,5) || "q"});
        if (!move) {
          setBoardStatus("This match could not be restored. Please reopen it.", "error");
          return;
        }
        window.movesList.push(move.san);
        window.positionHistory.push(game.fen());
      }
      window.historyIndex = window.positionHistory.length - 1;
      if (typeof window.updateGameUI === "function") window.updateGameUI();
      lastRenderedPly = moveCount;
    }

    if (match.status === "completed") {
      setBoardStatus(`Game finished · ${match.result}`, "success");
      $("resign-online").hidden = true;
      return;
    }
    if (match.status !== "active") {
      setBoardStatus("Waiting for the challenge to be accepted.");
      return;
    }
    const turnSide = window.chess?.turn() === "w" ? "White" : "Black";
    const opponent = match.my_color === "white" ? match.black_username : match.white_username;
    if (match.my_turn) setBoardStatus(`Your turn as ${match.my_color}. You are playing ${turnSide}.`, "success");
    else setBoardStatus(`Waiting for @${opponent} to move. ${turnSide} is to play.`);
  }

  async function fetchMatch(matchId) {
    const data = await api(`/multiplayer/matches/${matchId}`);
    return data.match;
  }

  async function enterMatch(matchId) {
    const match = await fetchMatch(matchId);
    if (match.status === "pending") {
      setMessage(friendMessage, "Accept the challenge before opening the board.", "info");
      return;
    }
    activeMatchId = matchId;
    activeMatch = match;
    lastRenderedPly = -1;
    window.practiceMode = false;
    window.multiplayerMode = true;
    $("practice-screen").hidden = false;
    [$("auth-screen"), $("home-screen"), $("player-dashboard"), onlineScreen].forEach(el => { if (el) el.hidden = true; });
    applyMatchToBoard(match, true);
    startBoardPolling();
  }

  function startBoardPolling() {
    if (boardPollTimer) clearInterval(boardPollTimer);
    boardPollTimer = setInterval(async () => {
      if (!window.multiplayerMode || !activeMatchId || moveSubmitInFlight) return;
      try {
        const match = await fetchMatch(activeMatchId);
        if (!window.multiplayerMode || !activeMatchId || match.id !== activeMatchId) return;
        applyMatchToBoard(match, (match.moves || []).length !== window.movesList.length || match.status !== window.multiplayerMatchStatus);
        if (onlineVisible()) refreshMatches(false).catch(() => {});
      } catch (error) {
        setBoardStatus("Connection interrupted. Reconnecting to the match…", "error");
      }
    }, 1800);
  }

  window.submitMultiplayerMove = async function(move) {
    if (!window.multiplayerMode || !activeMatchId || moveSubmitInFlight || window.multiplayerMatchStatus !== "active") return;
    moveSubmitInFlight = true;
    setBoardStatus("Sending move to your opponent…");
    try {
      const data = await api(`/multiplayer/matches/${activeMatchId}/move`, {
        method: "POST",
        body: JSON.stringify({from: move.from, to: move.to, promotion: move.promotion || "q"})
      });
      applyMatchToBoard(data.match, true);
    } catch (error) {
      setBoardStatus(error.message || "Move could not be sent. Syncing the board…", "error");
      try { applyMatchToBoard(await fetchMatch(activeMatchId), true); } catch (_) {}
    } finally {
      moveSubmitInFlight = false;
      refreshMatches(false).catch(() => {});
    }
  };

  $("resign-online")?.addEventListener("click", async () => {
    if (!window.multiplayerMode || !activeMatchId || window.multiplayerMatchStatus !== "active") return;
    if (!window.confirm("Resign this match? Your opponent will win.")) return;
    try {
      await api(`/multiplayer/matches/${activeMatchId}/resign`, {method: "POST", body: JSON.stringify({})});
      applyMatchToBoard(await fetchMatch(activeMatchId), true);
      refreshMatches(false).catch(() => {});
    } catch (error) { setBoardStatus(error.message || "Could not resign this match.", "error"); }
  });

  window.exitMultiplayerBoard = function() {
    window.multiplayerMode = false;
    activeMatchId = null;
    activeMatch = null;
    lastRenderedPly = -1;
    if (boardPollTimer) clearInterval(boardPollTimer);
    $("resign-online").hidden = true;
    $("hint-button").hidden = false;
    $("save-game").hidden = false;
    $("header-new-game").hidden = false;
    const title = $("game-header-title");
    if (title) title.textContent = "Chess Analysis";
    window.showOnlineScreen?.();
  };

})();
