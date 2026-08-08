window.WordLeague = window.WordLeague || {};

WordLeague.Game = (() => {
  const MAX_GUESSES = 6;
  const WORD_LENGTH = 5;
  const DAY_MS = 24 * 60 * 60 * 1000;

  function ukDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);

    const get = (type) => parts.find((part) => part.type === type).value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function prettyUkDate(date = new Date()) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function dayNumber(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
  }

  function answerForDate(dateKey) {
    const words = WordLeague.ANSWER_WORDS;
    const offset = dayNumber(dateKey) - dayNumber(WordLeague.PUZZLE_EPOCH);
    const index = ((offset % words.length) + words.length) % words.length;
    return words[index].toUpperCase();
  }

  function isAllowedGuess(word) {
    return WordLeague.ALLOWED_WORDS.has(word.toLowerCase());
  }

  function newGame(player, dateKey = ukDateKey()) {
    return {
      player,
      dateKey,
      puzzleVersion: WordLeague.PUZZLE_VERSION,
      guesses: [],
      completed: false,
      won: false,
      startedAt: new Date().toISOString(),
      completedAt: null,
      updatedAt: new Date().toISOString()
    };
  }

  // Handles repeated letters correctly by consuming exact matches first.
  function evaluateGuess(guess, answer) {
    const result = Array(WORD_LENGTH).fill("absent");
    const remaining = {};

    for (let i = 0; i < WORD_LENGTH; i += 1) {
      if (guess[i] === answer[i]) {
        result[i] = "correct";
      } else {
        remaining[answer[i]] = (remaining[answer[i]] || 0) + 1;
      }
    }

    for (let i = 0; i < WORD_LENGTH; i += 1) {
      if (result[i] === "correct") continue;
      const letter = guess[i];
      if ((remaining[letter] || 0) > 0) {
        result[i] = "present";
        remaining[letter] -= 1;
      }
    }

    return result;
  }

  function submitGuess(game, guess) {
    if (game.completed) {
      return { ok: false, message: "Today's game is already finished." };
    }

    const clean = guess.trim().toUpperCase();
    if (!/^[A-Z]{5}$/.test(clean)) {
      return { ok: false, message: "Enter five letters." };
    }

    if (!isAllowedGuess(clean)) {
      return { ok: false, message: "Not in the UK word list." };
    }

    const answer = answerForDate(game.dateKey);
    const evaluation = evaluateGuess(clean, answer);
    const won = clean === answer;

    game.guesses.push({ word: clean, evaluation });

    if (won || game.guesses.length >= MAX_GUESSES) {
      game.completed = true;
      game.won = won;
      game.completedAt = new Date().toISOString();
    }

    return {
      ok: true,
      game,
      won,
      answer,
      evaluation
    };
  }

  function resultLabel(game) {
    if (!game || !game.completed) return "—";
    return game.won ? `${game.guesses.length}/6` : "X/6";
  }

  function shareGrid(game) {
    const rows = game.guesses.map((guess) =>
      guess.evaluation.map((state) => {
        if (state === "correct") return "🟩";
        if (state === "present") return "🟨";
        return "⬛";
      }).join("")
    );

    return `Word League ${game.dateKey} ${resultLabel(game)}\n\n${rows.join("\n")}`;
  }

  return {
    MAX_GUESSES,
    WORD_LENGTH,
    ukDateKey,
    prettyUkDate,
    answerForDate,
    isAllowedGuess,
    newGame,
    evaluateGuess,
    submitGuess,
    resultLabel,
    shareGrid
  };
})();
