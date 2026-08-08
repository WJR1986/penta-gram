window.WordLeague = window.WordLeague || {};

WordLeague.Dictionary = (() => {
  const API_BASE = "https://englishdictionaryapi.com/api/v1/words/";

  async function lookup(word) {
    const clean = String(word || "").trim().toLowerCase();
    if (!/^[a-z]{2,30}$/.test(clean)) {
      throw new Error("Invalid dictionary word.");
    }

    const response = await fetch(`${API_BASE}${encodeURIComponent(clean)}`, {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      if (response.status === 429) throw new Error("Dictionary lookup limit reached. Try again shortly.");
      throw new Error("Dictionary service is unavailable right now.");
    }

    const payload = await response.json();
    const entry = Array.isArray(payload) ? payload[0] : payload;
    if (!entry || typeof entry !== "object") return null;

    const senses = [];
    for (const group of entry.partsOfSpeech || []) {
      for (const sense of group.senses || []) {
        if (!sense?.definition) continue;
        senses.push({
          partOfSpeech: group.partOfSpeech || "",
          definition: sense.definition,
          example: sense.example || null
        });
        if (senses.length >= 3) break;
      }
      if (senses.length >= 3) break;
    }

    return {
      word: entry.word || clean,
      pronunciation: entry.pronunciation?.ipa || null,
      headline: entry.headlineExpansion || null,
      senses,
      sourceUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(clean)}`
    };
  }

  return { lookup };
})();
