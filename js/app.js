window.WordLeague = window.WordLeague || {};

(() => {
  const { PLAYERS, Storage, DataStore, Game, ProfileConfig } = WordLeague;

  const boardEl = document.getElementById("board");
  const keyboardEl = document.getElementById("keyboard");
  const messageEl = document.getElementById("message");
  const playerOverlay = document.getElementById("player-overlay");
  const playerOptions = document.getElementById("player-options");
  const playerBadge = document.getElementById("player-badge");
  const switchPlayerBtn = document.getElementById("switch-player-btn");
  const gameDateEl = document.getElementById("game-date");
  const finishedPanel = document.getElementById("finished-panel");
  const finishedTitle = document.getElementById("finished-title");
  const finishedCopy = document.getElementById("finished-copy");
  const copyResultBtn = document.getElementById("copy-result-btn");
  const todayList = document.getElementById("today-list");
  const leaderboard = document.getElementById("leaderboard");
  const personalStats = document.getElementById("personal-stats");
  const guessDistribution = document.getElementById("guess-distribution");
  const statsPlayerName = document.getElementById("stats-player-name");
  const syncStatus = document.getElementById("sync-status");
  const profileButton = document.getElementById("profile-button");
  const headerAvatar = document.getElementById("header-avatar");
  const statsAvatar = document.getElementById("stats-avatar");
  const profileSummaryName = document.getElementById("profile-summary-name");
  const editProfileBtn = document.getElementById("edit-profile-btn");
  const profileOverlay = document.getElementById("profile-overlay");
  const closeProfileBtn = document.getElementById("close-profile-btn");
  const profilePreview = document.getElementById("profile-preview");
  const profileMessage = document.getElementById("profile-message");
  const presetAvatarGrid = document.getElementById("preset-avatar-grid");
  const avatarFileInput = document.getElementById("avatar-file-input");
  const chooseAvatarFileBtn = document.getElementById("choose-avatar-file-btn");
  const saveAvatarBtn = document.getElementById("save-avatar-btn");
  const removeAvatarBtn = document.getElementById("remove-avatar-btn");

  let currentPlayer = null;
  let game = null;
  let currentInput = "";
  let profilesByPlayer = new Map();
  let pendingAvatar = null;

  async function init() {
    renderPlayerOptions();
    renderKeyboard();
    bindPhysicalKeyboard();
    bindTabs();

    switchPlayerBtn.addEventListener("click", () => showPlayerOverlay(true));
    copyResultBtn.addEventListener("click", copyResult);
    profileButton.addEventListener("click", openProfile);
    editProfileBtn.addEventListener("click", openProfile);
    closeProfileBtn.addEventListener("click", () => showProfileOverlay(false));
    chooseAvatarFileBtn.addEventListener("click", () => avatarFileInput.click());
    avatarFileInput.addEventListener("change", handleAvatarFile);
    saveAvatarBtn.addEventListener("click", savePendingAvatar);
    removeAvatarBtn.addEventListener("click", removeAvatar);
    profileOverlay.addEventListener("click", (event) => {
      if (event.target === profileOverlay) showProfileOverlay(false);
    });

    gameDateEl.textContent = Game.prettyUkDate().toUpperCase();
    updateSyncStatus();

    const savedPlayer = Storage.getSelectedPlayer();
    if (PLAYERS.includes(savedPlayer)) {
      await selectPlayer(savedPlayer);
    } else {
      showPlayerOverlay(true);
    }
  }

  function renderPlayerOptions() {
    playerOptions.innerHTML = "";
    PLAYERS.forEach((player) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "player-option";
      button.textContent = player;
      button.addEventListener("click", () => selectPlayer(player));
      playerOptions.appendChild(button);
    });
  }

  async function selectPlayer(player) {
    currentPlayer = player;
    Storage.setSelectedPlayer(player);
    playerBadge.textContent = player;
    playerBadge.title = player;
    statsPlayerName.textContent = `${player}'s stats`;
    profileSummaryName.textContent = player;
    currentInput = "";

    await refreshProfiles();
    renderCurrentProfile();

    const dateKey = Game.ukDateKey();
    showMessage("Loading today's game…", false);
    game = await DataStore.loadGame(player, dateKey) || Game.newGame(player, dateKey);

    // Creates the shared row immediately once Supabase is configured. An empty
    // row still appears as "Not played" until the first guess is submitted.
    await DataStore.saveGame(game);

    showPlayerOverlay(false);
    clearMessage();
    renderGame();
    await refreshSharedViews();
    updateSyncStatus();
  }

  function showPlayerOverlay(show) {
    playerOverlay.classList.toggle("hidden", !show);
  }

  function renderGame() {
    renderBoard();
    renderKeyboardStates();
    renderFinishedPanel();
  }

  async function refreshSharedViews() {
    await refreshProfiles();
    await Promise.all([renderToday(), renderStats()]);
    renderCurrentProfile();
    updateSyncStatus();
  }

  function renderBoard() {
    boardEl.innerHTML = "";

    for (let row = 0; row < Game.MAX_GUESSES; row += 1) {
      const rowEl = document.createElement("div");
      rowEl.className = "board-row";

      const savedGuess = game.guesses[row];
      const isCurrentRow = row === game.guesses.length && !game.completed;

      for (let col = 0; col < Game.WORD_LENGTH; col += 1) {
        const tile = document.createElement("div");
        tile.className = "tile";

        if (savedGuess) {
          tile.textContent = savedGuess.word[col];
          tile.classList.add(savedGuess.evaluation[col]);
        } else if (isCurrentRow && currentInput[col]) {
          tile.textContent = currentInput[col];
          tile.classList.add("filled");
        }

        rowEl.appendChild(tile);
      }

      boardEl.appendChild(rowEl);
    }
  }

  function renderKeyboard() {
    keyboardEl.innerHTML = "";
    const rows = [
      ["Q","W","E","R","T","Y","U","I","O","P"],
      ["A","S","D","F","G","H","J","K","L"],
      ["ENTER","Z","X","C","V","B","N","M","BACK"]
    ];

    rows.forEach((letters) => {
      const rowEl = document.createElement("div");
      rowEl.className = "keyboard-row";

      letters.forEach((letter) => {
        const key = document.createElement("button");
        key.type = "button";
        key.className = "key";
        if (letter === "ENTER" || letter === "BACK") key.classList.add("wide");
        key.dataset.key = letter;
        key.textContent = letter === "BACK" ? "⌫" : letter;
        key.setAttribute("aria-label", letter === "BACK" ? "Backspace" : letter);
        key.addEventListener("click", () => handleKey(letter));
        rowEl.appendChild(key);
      });

      keyboardEl.appendChild(rowEl);
    });
  }

  function renderKeyboardStates() {
    const priority = { absent: 1, present: 2, correct: 3 };
    const states = {};

    game.guesses.forEach((guess) => {
      [...guess.word].forEach((letter, index) => {
        const next = guess.evaluation[index];
        const current = states[letter];
        if (!current || priority[next] > priority[current]) states[letter] = next;
      });
    });

    keyboardEl.querySelectorAll(".key").forEach((key) => {
      key.classList.remove("absent", "present", "correct");
      const state = states[key.dataset.key];
      if (state) key.classList.add(state);
    });
  }

  function bindPhysicalKeyboard() {
    document.addEventListener("keydown", (event) => {
      if (!playerOverlay.classList.contains("hidden") || !profileOverlay.classList.contains("hidden")) return;

      if (event.key === "Enter") handleKey("ENTER");
      else if (event.key === "Backspace") handleKey("BACK");
      else if (/^[a-zA-Z]$/.test(event.key)) handleKey(event.key.toUpperCase());
    });
  }

  function handleKey(key) {
    if (!game || game.completed) return;

    if (key === "ENTER") {
      submitCurrentGuess();
      return;
    }

    if (key === "BACK") {
      currentInput = currentInput.slice(0, -1);
      renderBoard();
      return;
    }

    if (/^[A-Z]$/.test(key) && currentInput.length < Game.WORD_LENGTH) {
      currentInput += key;
      clearMessage();
      renderBoard();
    }
  }

  async function submitCurrentGuess() {
    const result = Game.submitGuess(game, currentInput);
    if (!result.ok) {
      showMessage(result.message, true);
      return;
    }

    currentInput = "";
    renderGame();

    const saveResult = await DataStore.saveGame(game);
    updateSyncStatus();

    if (game.completed) {
      if (game.won) showMessage(`Nice — ${game.guesses.length}/6.`, false);
      else showMessage(`The word was ${result.answer}.`, false);
    } else if (saveResult.cloud && !saveResult.ok) {
      showMessage("Guess saved on this PC; cloud sync will retry later.", true);
    } else {
      clearMessage();
    }

    await refreshSharedViews();
  }

  function renderFinishedPanel() {
    if (!game.completed) {
      finishedPanel.classList.add("hidden");
      return;
    }

    finishedPanel.classList.remove("hidden");
    const answer = Game.answerForDate(game.dateKey);
    finishedTitle.textContent = game.won ? `${Game.resultLabel(game)} — well played` : "Game over";
    finishedCopy.textContent = game.won
      ? `Today's word was ${answer}.`
      : `Today's word was ${answer}. Better luck tomorrow.`;
  }

  async function copyResult() {
    const text = Game.shareGrid(game);
    try {
      await navigator.clipboard.writeText(text);
      showMessage("Result copied.", false);
    } catch {
      showMessage("Could not copy automatically on this browser.", true);
    }
  }

  async function renderToday() {
    if (!currentPlayer) return;

    const dateKey = Game.ukDateKey();
    const todayGames = await DataStore.getGamesForDate(dateKey);
    const byPlayer = new Map(todayGames.map((item) => [item.player, item]));
    const ownGame = byPlayer.get(currentPlayer) || game;
    const revealScores = ownGame && ownGame.completed;

    todayList.innerHTML = "";
    PLAYERS.forEach((player) => {
      const playerGame = byPlayer.get(player);
      const card = document.createElement("div");
      card.className = "status-card";

      const name = document.createElement("div");
      name.className = "status-name player-line";
      const avatar = document.createElement("div");
      avatar.className = "avatar avatar-medium";
      renderAvatar(avatar, player);
      const nameCopy = document.createElement("div");
      nameCopy.className = "player-line-copy";
      nameCopy.textContent = player;
      name.append(avatar, nameCopy);

      const value = document.createElement("div");
      value.className = "status-value";

      if (!playerGame || playerGame.guesses.length === 0) {
        value.textContent = "Not played";
      } else if (!playerGame.completed) {
        value.textContent = "Playing";
      } else if (revealScores || player === currentPlayer) {
        value.textContent = Game.resultLabel(playerGame);
      } else {
        value.textContent = "Finished";
      }

      card.append(name, value);
      todayList.appendChild(card);
    });
  }

  async function refreshProfiles() {
    const profiles = await DataStore.getProfiles();
    profilesByPlayer = new Map(profiles.map((profile) => [profile.player, profile]));
  }

  function getProfile(player) {
    return profilesByPlayer.get(player) || {
      player,
      displayName: player,
      avatarType: "none",
      avatarValue: null
    };
  }

  function renderAvatar(element, player, overrideProfile = null) {
    if (!element) return;
    const profile = overrideProfile || getProfile(player);
    const url = ProfileConfig.avatarUrl(profile);
    element.replaceChildren();

    if (url) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.addEventListener("error", () => {
        element.replaceChildren();
        element.textContent = ProfileConfig.initials(player);
      }, { once: true });
      element.appendChild(img);
    } else {
      element.textContent = ProfileConfig.initials(player);
    }
  }

  function renderCurrentProfile() {
    if (!currentPlayer) return;
    renderAvatar(headerAvatar, currentPlayer);
    renderAvatar(statsAvatar, currentPlayer);
    profileSummaryName.textContent = currentPlayer;
  }

  function showProfileOverlay(show) {
    profileOverlay.classList.toggle("hidden", !show);
  }

  function openProfile() {
    if (!currentPlayer) return;
    pendingAvatar = null;
    avatarFileInput.value = "";
    saveAvatarBtn.disabled = true;
    profileMessage.textContent = "";
    profileMessage.style.color = "var(--muted)";
    renderPresetOptions();
    renderAvatar(profilePreview, currentPlayer);
    showProfileOverlay(true);
  }

  function renderPresetOptions() {
    presetAvatarGrid.innerHTML = "";
    const current = getProfile(currentPlayer);

    ProfileConfig.presets.forEach((preset, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "preset-avatar-option";
      button.title = preset.enabled ? preset.label : `${preset.label} — image not added yet`;
      button.disabled = !preset.enabled;
      if (current.avatarType === "preset" && current.avatarValue === preset.filename) {
        button.classList.add("is-selected");
      }

      if (preset.enabled) {
        const img = document.createElement("img");
        img.src = `assets/avatars/${preset.filename}`;
        img.alt = preset.label;
        button.appendChild(img);
        button.addEventListener("click", () => {
          pendingAvatar = { type: "preset", value: preset.filename };
          presetAvatarGrid.querySelectorAll(".preset-avatar-option").forEach((item) => item.classList.remove("is-selected"));
          button.classList.add("is-selected");
          renderAvatar(profilePreview, currentPlayer, {
            player: currentPlayer,
            avatarType: "preset",
            avatarValue: preset.filename
          });
          saveAvatarBtn.disabled = false;
          setProfileMessage("Ready to save this preset.", false);
        });
      } else {
        button.textContent = String(index + 1).padStart(2, "0");
      }

      presetAvatarGrid.appendChild(button);
    });
  }

  function setProfileMessage(text, isError) {
    profileMessage.textContent = text;
    profileMessage.style.color = isError ? "var(--danger)" : "var(--muted)";
  }

  async function handleAvatarFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setProfileMessage("Preparing picture…", false);
      const dataUrl = await prepareAvatarDataUrl(file);
      pendingAvatar = { type: "upload", value: dataUrl };
      renderAvatar(profilePreview, currentPlayer, {
        player: currentPlayer,
        avatarType: "upload",
        avatarValue: dataUrl
      });
      saveAvatarBtn.disabled = false;
      setProfileMessage("Picture resized and ready to save.", false);
    } catch (error) {
      pendingAvatar = null;
      saveAvatarBtn.disabled = true;
      setProfileMessage(error.message || "Could not prepare that image.", true);
    }
  }

  function loadBrowserImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read that image file."));
      };
      image.src = url;
    });
  }

  async function prepareAvatarDataUrl(file) {
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowed.has(file.type)) {
      throw new Error("Please choose a JPEG, PNG or WebP image.");
    }
    if (file.size > 12 * 1024 * 1024) {
      throw new Error("Please choose an image smaller than 12 MB.");
    }

    const image = await loadBrowserImage(file);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) throw new Error("That image has no readable dimensions.");

    const side = Math.min(sourceWidth, sourceHeight);
    const sx = Math.floor((sourceWidth - side) / 2);
    const sy = Math.floor((sourceHeight - side) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = ProfileConfig.OUTPUT_SIZE;
    canvas.height = ProfileConfig.OUTPUT_SIZE;
    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(image, sx, sy, side, side, 0, 0, canvas.width, canvas.height);

    let quality = 0.82;
    let dataUrl = canvas.toDataURL("image/webp", quality);
    while (dataUrl.length > ProfileConfig.MAX_UPLOAD_DATA_URL_LENGTH && quality > 0.42) {
      quality -= 0.08;
      dataUrl = canvas.toDataURL("image/webp", quality);
    }

    // Some older browsers may fall back to PNG when WebP export is unavailable.
    if (dataUrl.length > ProfileConfig.MAX_UPLOAD_DATA_URL_LENGTH) {
      quality = 0.78;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
      while (dataUrl.length > ProfileConfig.MAX_UPLOAD_DATA_URL_LENGTH && quality > 0.38) {
        quality -= 0.08;
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }
    }

    if (dataUrl.length > ProfileConfig.MAX_UPLOAD_DATA_URL_LENGTH) {
      throw new Error("That picture could not be compressed small enough. Try a simpler or smaller image.");
    }
    return dataUrl;
  }

  async function savePendingAvatar() {
    if (!pendingAvatar || !currentPlayer) return;
    saveAvatarBtn.disabled = true;
    setProfileMessage("Saving picture…", false);

    const result = await DataStore.saveProfileAvatar(currentPlayer, pendingAvatar.type, pendingAvatar.value);
    profilesByPlayer.set(currentPlayer, result.profile);
    renderCurrentProfile();
    renderAvatar(profilePreview, currentPlayer);
    pendingAvatar = null;

    if (result.cloud && !result.ok) {
      setProfileMessage("Saved on this PC, but cloud profile sync failed for now.", true);
    } else {
      setProfileMessage(result.cloud ? "Profile picture saved and synced." : "Profile picture saved on this PC.", false);
    }

    await refreshSharedViews();
  }

  async function removeAvatar() {
    if (!currentPlayer) return;
    pendingAvatar = null;
    saveAvatarBtn.disabled = true;
    const result = await DataStore.saveProfileAvatar(currentPlayer, "none", null);
    profilesByPlayer.set(currentPlayer, result.profile);
    renderCurrentProfile();
    renderAvatar(profilePreview, currentPlayer);
    renderPresetOptions();

    if (result.cloud && !result.ok) {
      setProfileMessage("Initials restored locally, but cloud profile sync failed for now.", true);
    } else {
      setProfileMessage("Using initials instead of a picture.", false);
    }

    await refreshSharedViews();
  }

  function dateOrdinal(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
  }

  function dateFromOrdinal(value) {
    const date = new Date(value * 86400000);
    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
  }

  function previousDate(dateKey) {
    return dateFromOrdinal(dateOrdinal(dateKey) - 1);
  }

  function calculatePlayerStats(player, allGames) {
    const games = allGames
      .filter((item) => item.player === player && item.completed)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

    const wins = games.filter((item) => item.won);
    const average = wins.length
      ? wins.reduce((sum, item) => sum + item.guesses.length, 0) / wins.length
      : null;

    const distribution = [0, 0, 0, 0, 0, 0];
    wins.forEach((item) => {
      const index = item.guesses.length - 1;
      if (index >= 0 && index < 6) distribution[index] += 1;
    });

    let maxStreak = 0;
    let running = 0;
    let previousWinningDay = null;

    games.forEach((item) => {
      if (!item.won) {
        running = 0;
        previousWinningDay = null;
        return;
      }

      const day = dateOrdinal(item.dateKey);
      if (previousWinningDay !== null && day === previousWinningDay + 1) {
        running += 1;
      } else {
        running = 1;
      }
      previousWinningDay = day;
      maxStreak = Math.max(maxStreak, running);
    });

    const completedByDate = new Map(games.map((item) => [item.dateKey, item]));
    const today = Game.ukDateKey();
    const todayGame = completedByDate.get(today);
    let cursor;
    let currentStreak = 0;

    if (todayGame) {
      if (!todayGame.won) {
        cursor = null;
      } else {
        cursor = today;
      }
    } else {
      cursor = previousDate(today);
    }

    while (cursor) {
      const item = completedByDate.get(cursor);
      if (!item || !item.won) break;
      currentStreak += 1;
      cursor = previousDate(cursor);
    }

    return {
      played: games.length,
      wins: wins.length,
      winPercent: games.length ? Math.round((wins.length / games.length) * 100) : 0,
      average,
      currentStreak,
      maxStreak,
      distribution
    };
  }

  function renderPersonalStats(stats) {
    personalStats.innerHTML = `
      <div class="stat-box"><strong>${stats.played}</strong><span>Played</span></div>
      <div class="stat-box"><strong>${stats.winPercent}</strong><span>Win %</span></div>
      <div class="stat-box"><strong>${stats.currentStreak}</strong><span>Current streak</span></div>
      <div class="stat-box"><strong>${stats.maxStreak}</strong><span>Max streak</span></div>
      <div class="stat-box wide-stat"><strong>${stats.average === null ? "—" : stats.average.toFixed(2)}</strong><span>Average guesses (wins)</span></div>
    `;
  }

  function renderGuessDistribution(stats) {
    const max = Math.max(1, ...stats.distribution);
    guessDistribution.innerHTML = "";

    stats.distribution.forEach((count, index) => {
      const row = document.createElement("div");
      row.className = "distribution-row";
      const width = count === 0 ? 8 : Math.max(12, (count / max) * 100);
      row.innerHTML = `
        <div class="distribution-number">${index + 1}</div>
        <div class="distribution-track">
          <div class="distribution-bar" style="width:${width}%">${count}</div>
        </div>
      `;
      guessDistribution.appendChild(row);
    });
  }

  function renderLeaderboardRows(rows) {
    leaderboard.innerHTML = `
      <div class="leader-row header">
        <div>#</div><div>Player</div><div class="leader-stat">Win %</div><div class="leader-stat">Avg</div><div class="leader-stat">Streak</div>
      </div>
    `;

    rows.forEach((row, index) => {
      const el = document.createElement("div");
      el.className = "leader-row";
      el.innerHTML = `
        <div class="leader-rank">${index + 1}</div>
        <div class="leader-name-wrap">
          <div class="avatar avatar-medium" data-leader-avatar></div>
          <div class="leader-name-copy"><strong>${row.player}</strong><br><span class="subtle">${row.wins}/${row.played} wins</span></div>
        </div>
        <div class="leader-stat">${row.winPercent}%</div>
        <div class="leader-stat">${row.average === null ? "—" : row.average.toFixed(2)}</div>
        <div class="leader-stat">${row.currentStreak}</div>
      `;
      renderAvatar(el.querySelector("[data-leader-avatar]"), row.player);
      leaderboard.appendChild(el);
    });
  }

  async function renderStats() {
    if (!currentPlayer) return;
    const allGames = await DataStore.getAllGames();

    const rows = PLAYERS.map((player) => ({
      player,
      ...calculatePlayerStats(player, allGames)
    })).sort((a, b) => {
      if (b.winPercent !== a.winPercent) return b.winPercent - a.winPercent;
      if (a.average === null && b.average !== null) return 1;
      if (a.average !== null && b.average === null) return -1;
      if (a.average !== null && b.average !== null && a.average !== b.average) return a.average - b.average;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.player.localeCompare(b.player);
    });

    const own = rows.find((row) => row.player === currentPlayer);
    renderPersonalStats(own);
    renderGuessDistribution(own);
    renderLeaderboardRows(rows);
  }

  function bindTabs() {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", async () => {
        document.querySelectorAll(".tab").forEach((item) => item.classList.remove("is-active"));
        document.querySelectorAll(".view").forEach((view) => view.classList.remove("is-active"));

        tab.classList.add("is-active");
        document.getElementById(`view-${tab.dataset.view}`).classList.add("is-active");

        if (tab.dataset.view === "today") await renderToday();
        if (tab.dataset.view === "stats") await renderStats();
        updateSyncStatus();
      });
    });
  }

  function updateSyncStatus() {
    const status = DataStore.status();
    syncStatus.textContent = status.text;
    syncStatus.classList.toggle("sync-error", !status.ok);
    syncStatus.classList.toggle("sync-cloud", status.mode === "cloud" && status.ok);
  }

  function showMessage(text, isError) {
    messageEl.textContent = text;
    messageEl.style.color = isError ? "var(--danger)" : "var(--text)";
  }

  function clearMessage() {
    messageEl.textContent = "";
  }

  init();
})();
