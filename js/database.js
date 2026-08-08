window.WordLeague = window.WordLeague || {};

WordLeague.DataStore = (() => {
  const { Storage, Config, ProfileConfig } = WordLeague;
  let client = null;
  let lastCloudError = null;

  function isCloudConfigured() {
    return Boolean(
      Config &&
      Config.SUPABASE_URL &&
      Config.SUPABASE_PUBLISHABLE_KEY &&
      !Config.SUPABASE_URL.includes("PASTE_YOUR") &&
      !Config.SUPABASE_PUBLISHABLE_KEY.includes("PASTE_YOUR")
    );
  }

  function getClient() {
    if (!isCloudConfigured()) return null;
    if (!client) {
      if (!window.supabase || typeof window.supabase.createClient !== "function") {
        throw new Error("Supabase browser library did not load.");
      }
      client = window.supabase.createClient(
        Config.SUPABASE_URL,
        Config.SUPABASE_PUBLISHABLE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        }
      );
    }
    return client;
  }

  function playerId(player) {
    return player.toLowerCase();
  }

  function displayName(id) {
    return WordLeague.PLAYERS.find((name) => name.toLowerCase() === id) || id;
  }

  function gameToRow(game) {
    return {
      player_id: playerId(game.player),
      puzzle_date: game.dateKey,
      puzzle_version: game.puzzleVersion,
      guesses: game.guesses,
      completed: Boolean(game.completed),
      won: Boolean(game.won),
      started_at: game.startedAt || game.updatedAt || new Date().toISOString(),
      completed_at: game.completedAt || null,
      updated_at: game.updatedAt || new Date().toISOString()
    };
  }

  function rowToGame(row) {
    return {
      player: displayName(row.player_id),
      dateKey: row.puzzle_date,
      puzzleVersion: row.puzzle_version,
      guesses: Array.isArray(row.guesses) ? row.guesses : [],
      completed: Boolean(row.completed),
      won: Boolean(row.won),
      startedAt: row.started_at || null,
      completedAt: row.completed_at || null,
      updatedAt: row.updated_at || null
    };
  }

  function rowToProfile(row) {
    return {
      player: displayName(row.id),
      id: row.id,
      displayName: row.display_name || displayName(row.id),
      avatarType: row.avatar_type || "none",
      avatarValue: row.avatar_value || null,
      avatarUpdatedAt: row.avatar_updated_at || null
    };
  }

  function defaultProfiles() {
    return WordLeague.PLAYERS.map((player) => ({
      player,
      id: playerId(player),
      displayName: player,
      avatarType: "none",
      avatarValue: null,
      avatarUpdatedAt: null
    }));
  }

  function timestamp(game) {
    const value = Date.parse(game?.updatedAt || game?.completedAt || game?.startedAt || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function newestGame(a, b) {
    if (!a) return b;
    if (!b) return a;
    return timestamp(a) >= timestamp(b) ? a : b;
  }

  async function fetchRemoteGame(player, dateKey) {
    const db = getClient();
    const { data, error } = await db
      .from("game_sessions")
      .select("player_id,puzzle_date,puzzle_version,guesses,completed,won,started_at,completed_at,updated_at")
      .eq("player_id", playerId(player))
      .eq("puzzle_date", dateKey)
      .eq("puzzle_version", WordLeague.PUZZLE_VERSION)
      .maybeSingle();

    if (error) throw error;
    return data ? rowToGame(data) : null;
  }

  async function upsertRemote(game) {
    const db = getClient();
    const { error } = await db
      .from("game_sessions")
      .upsert(gameToRow(game), {
        onConflict: "player_id,puzzle_date,puzzle_version"
      });

    if (error) throw error;
  }

  async function loadGame(player, dateKey) {
    const local = Storage.loadGame(player, dateKey);
    if (!isCloudConfigured()) return local;

    try {
      const remote = await fetchRemoteGame(player, dateKey);
      const chosen = newestGame(local, remote);

      if (chosen) {
        Storage.saveGame(chosen);
        if (chosen === local && (!remote || timestamp(local) > timestamp(remote))) {
          await upsertRemote(local);
        }
      }

      lastCloudError = null;
      return chosen;
    } catch (error) {
      lastCloudError = error;
      console.error("Cloud load failed; using local cache.", error);
      return local;
    }
  }

  async function saveGame(game) {
    game.updatedAt = new Date().toISOString();
    if (!game.startedAt) game.startedAt = game.updatedAt;
    Storage.saveGame(game);

    if (!isCloudConfigured()) return { cloud: false, ok: true };

    try {
      await upsertRemote(game);
      lastCloudError = null;
      return { cloud: true, ok: true };
    } catch (error) {
      lastCloudError = error;
      console.error("Cloud save failed; game remains cached locally.", error);
      return { cloud: true, ok: false, error };
    }
  }

  function mergeGames(remoteGames, localGames) {
    const byKey = new Map();
    [...remoteGames, ...localGames].forEach((game) => {
      const key = `${game.player}|${game.dateKey}|${game.puzzleVersion}`;
      byKey.set(key, newestGame(byKey.get(key), game));
    });
    return [...byKey.values()];
  }

  async function getAllGames() {
    const local = Storage.getAllGames();
    if (!isCloudConfigured()) return local;

    try {
      const db = getClient();
      const { data, error } = await db
        .from("game_sessions")
        .select("player_id,puzzle_date,puzzle_version,guesses,completed,won,started_at,completed_at,updated_at")
        .eq("puzzle_version", WordLeague.PUZZLE_VERSION)
        .order("puzzle_date", { ascending: true });

      if (error) throw error;
      const remote = (data || []).map(rowToGame);
      remote.forEach(Storage.saveGame);
      lastCloudError = null;
      return mergeGames(remote, local);
    } catch (error) {
      lastCloudError = error;
      console.error("Cloud stats load failed; using local cache.", error);
      return local;
    }
  }

  async function getGamesForDate(dateKey) {
    const local = Storage.getAllGames().filter((game) => game.dateKey === dateKey);
    if (!isCloudConfigured()) return local;

    try {
      const db = getClient();
      const { data, error } = await db
        .from("game_sessions")
        .select("player_id,puzzle_date,puzzle_version,guesses,completed,won,started_at,completed_at,updated_at")
        .eq("puzzle_version", WordLeague.PUZZLE_VERSION)
        .eq("puzzle_date", dateKey);

      if (error) throw error;
      const remote = (data || []).map(rowToGame);
      remote.forEach(Storage.saveGame);
      lastCloudError = null;
      return mergeGames(remote, local);
    } catch (error) {
      lastCloudError = error;
      console.error("Cloud today load failed; using local cache.", error);
      return local;
    }
  }

  async function getProfiles() {
    const local = Storage.getProfiles();
    const localByPlayer = new Map(local.map((profile) => [profile.player, profile]));
    const fallback = defaultProfiles().map((profile) => localByPlayer.get(profile.player) || profile);

    if (!isCloudConfigured()) return fallback;

    try {
      const db = getClient();
      const { data, error } = await db
        .from("players")
        .select("id,display_name,avatar_type,avatar_value,avatar_updated_at")
        .order("sort_order", { ascending: true });

      if (error) throw error;
      const profiles = (data || []).map(rowToProfile);
      Storage.saveProfiles(profiles);
      lastCloudError = null;
      return profiles.length ? profiles : fallback;
    } catch (error) {
      lastCloudError = error;
      console.error("Cloud profile load failed; using local profile cache.", error);
      return fallback;
    }
  }

  async function saveProfileAvatar(player, avatarType, avatarValue) {
    if (!["none", "preset", "upload"].includes(avatarType)) {
      throw new Error("Invalid avatar type.");
    }

    if (avatarType === "none") avatarValue = null;
    if (avatarType === "upload") {
      if (!/^data:image\/(webp|jpeg|png);base64,/i.test(avatarValue || "")) {
        throw new Error("Uploaded profile picture is not in a supported image format.");
      }
      if (avatarValue.length > ProfileConfig.MAX_UPLOAD_DATA_URL_LENGTH) {
        throw new Error("Uploaded profile picture is still too large after resizing.");
      }
    }

    if (avatarType === "preset") {
      const preset = ProfileConfig.presetByFilename(avatarValue);
      if (!preset || !preset.enabled) throw new Error("That preset picture is not available yet.");
    }

    const profile = {
      player,
      id: playerId(player),
      displayName: player,
      avatarType,
      avatarValue,
      avatarUpdatedAt: new Date().toISOString()
    };
    Storage.saveProfile(profile);

    if (!isCloudConfigured()) return { cloud: false, ok: true, profile };

    try {
      const db = getClient();
      const { data, error } = await db
        .from("players")
        .update({
          avatar_type: avatarType,
          avatar_value: avatarValue
        })
        .eq("id", playerId(player))
        .select("id,display_name,avatar_type,avatar_value,avatar_updated_at")
        .single();

      if (error) throw error;
      const saved = rowToProfile(data);
      Storage.saveProfile(saved);
      lastCloudError = null;
      return { cloud: true, ok: true, profile: saved };
    } catch (error) {
      lastCloudError = error;
      console.error("Cloud profile save failed; profile remains cached locally.", error);
      return { cloud: true, ok: false, error, profile };
    }
  }

  function status() {
    if (!isCloudConfigured()) {
      return { mode: "local", ok: true, text: "Local mode — Supabase not configured yet" };
    }
    if (lastCloudError) {
      return { mode: "cloud", ok: false, text: "Cloud unavailable — saved locally for now" };
    }
    return { mode: "cloud", ok: true, text: "Cloud sync connected" };
  }

  return {
    isCloudConfigured,
    loadGame,
    saveGame,
    getAllGames,
    getGamesForDate,
    getProfiles,
    saveProfileAvatar,
    status
  };
})();
