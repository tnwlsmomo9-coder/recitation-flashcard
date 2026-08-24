const KEY_LAST_VERSE = "srp:lastVerseId";
const KEY_STATUS = "srp:verseStatus";
const KEY_AUTO_ADVANCE = "srp:autoAdvance";
const KEY_VERSE_FONT_SIZE = "srp:verseFontSize";

export const DEFAULT_STATUS = "learning";
export const DEFAULT_VERSE_FONT_SIZE = 22;

export function getLastVerseId() {
  return localStorage.getItem(KEY_LAST_VERSE);
}

export function setLastVerseId(verseId) {
  localStorage.setItem(KEY_LAST_VERSE, verseId);
}

export function getStatusMap() {
  try {
    const raw = localStorage.getItem(KEY_STATUS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStatusMap(map) {
  localStorage.setItem(KEY_STATUS, JSON.stringify(map));
}

export function getVerseStatus(verseId) {
  const map = getStatusMap();
  return map[verseId] || DEFAULT_STATUS;
}

export function setVerseStatus(verseId, status) {
  const map = getStatusMap();
  map[verseId] = status;
  saveStatusMap(map);
}

export function getAutoAdvance() {
  const raw = localStorage.getItem(KEY_AUTO_ADVANCE);
  return raw === null ? false : raw === "1";
}

export function setAutoAdvance(enabled) {
  localStorage.setItem(KEY_AUTO_ADVANCE, enabled ? "1" : "0");
}

export function getVerseFontSize() {
  const raw = Number(localStorage.getItem(KEY_VERSE_FONT_SIZE));
  return raw > 0 ? raw : DEFAULT_VERSE_FONT_SIZE;
}

export function setVerseFontSize(size) {
  localStorage.setItem(KEY_VERSE_FONT_SIZE, String(size));
}
