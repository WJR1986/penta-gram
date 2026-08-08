window.WordLeague = window.WordLeague || {};

WordLeague.ProfileConfig = (() => {
  const PRESET_COUNT = 20;
  const PRESET_DIR = "assets/avatars/";

  // The 20 slots are prepared now, but deliberately disabled until real images
  // are added. When you have sourced them, place files named avatar-01.webp
  // through avatar-20.webp in assets/avatars/ and change enabled to true.
  const presets = Array.from({ length: PRESET_COUNT }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return {
      id: `avatar-${number}`,
      filename: `avatar-${number}.webp`,
      label: `Preset ${number}`,
      enabled: false
    };
  });

  function initials(name) {
    return String(name || "?")
      .trim()
      .split(/\s+/)
      .map((part) => part[0] || "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
  }

  function presetByFilename(filename) {
    return presets.find((item) => item.filename === filename) || null;
  }

  function avatarUrl(profile) {
    if (!profile) return null;
    if (profile.avatarType === "upload" && /^data:image\/(webp|jpeg|png);base64,/i.test(profile.avatarValue || "")) {
      return profile.avatarValue;
    }
    if (profile.avatarType === "preset") {
      const preset = presetByFilename(profile.avatarValue);
      if (preset && preset.enabled) return `${PRESET_DIR}${preset.filename}`;
    }
    return null;
  }

  return {
    presets,
    initials,
    avatarUrl,
    presetByFilename,
    MAX_UPLOAD_DATA_URL_LENGTH: 180000,
    OUTPUT_SIZE: 256
  };
})();
