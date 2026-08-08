window.WordLeague = window.WordLeague || {};

WordLeague.Storage = (() => {
  const SELECTED_PLAYER_KEY = "wordLeague:selectedPlayer";
  const PROFILE_CACHE_KEY = "wordLeague:stage2b:profiles";
  const THEME_KEY = "wordLeague:theme";
  // Stage 2B keeps the same game namespace, so existing Stage 2 games remain.
  const GAME_PREFIX = `wordLeague:stage2:${WordLeague.PUZZLE_VERSION}:`;

  function getSelectedPlayer() {
    return localStorage.getItem(SELECTED_PLAYER_KEY);
  }

  function setSelectedPlayer(player) {
    localStorage.setItem(SELECTED_PLAYER_KEY, player);
  }

  function getTheme() {
    const value = localStorage.getItem(THEME_KEY);
    return value === "dark" || value === "light" ? value : null;
  }

  function setTheme(theme) {
    if (theme === "dark" || theme === "light") {
      localStorage.setItem(THEME_KEY, theme);
    }
  }

  function gameKey(player, dateKey) {
    return `${GAME_PREFIX}${player}:${dateKey}`;
  }

  function loadGame(player, dateKey) {
    const raw = localStorage.getItem(gameKey(player, dateKey));
    if (!raw) return null;

    try {
      const game = JSON.parse(raw);
      if (game.puzzleVersion !== WordLeague.PUZZLE_VERSION) return null;
      return game;
    } catch {
      return null;
    }
  }

  function saveGame(game) {
    localStorage.setItem(gameKey(game.player, game.dateKey), JSON.stringify(game));
  }

  function getAllGames() {
    const games = [];

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(GAME_PREFIX)) continue;

      try {
        const game = JSON.parse(localStorage.getItem(key));
        if (
          game &&
          game.player &&
          game.dateKey &&
          game.puzzleVersion === WordLeague.PUZZLE_VERSION
        ) {
          games.push(game);
        }
      } catch {
        // Ignore malformed local cache data.
      }
    }

    return games;
  }

  function getProfiles() {
    try {
      const raw = localStorage.getItem(PROFILE_CACHE_KEY);
      const profiles = raw ? JSON.parse(raw) : [];
      return Array.isArray(profiles) ? profiles : [];
    } catch {
      return [];
    }
  }

  function saveProfiles(profiles) {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profiles || []));
  }

  function saveProfile(profile) {
    const profiles = getProfiles();
    const next = profiles.filter((item) => item.player !== profile.player);
    next.push(profile);
    saveProfiles(next);
  }

  return {
    getSelectedPlayer,
    setSelectedPlayer,
    getTheme,
    setTheme,
    loadGame,
    saveGame,
    getAllGames,
    getProfiles,
    saveProfiles,
    saveProfile
  };
})();
