const KEY_LAST_VERSE = "srp:lastVerseId";
const KEY_STATUS = "srp:verseStatus";

export const DEFAULT_STATUS = "learning";

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
