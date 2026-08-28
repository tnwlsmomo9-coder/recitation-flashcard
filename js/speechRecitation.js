function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported() {
  return typeof getSpeechRecognitionConstructor() === "function";
}

export function normalizeRecitationText(text) {
  return Array.from(String(text || "").normalize("NFC"))
    .filter(char => /[\uac00-\ud7a30-9]/.test(char))
    .join("");
}

function getEditDistance(expected, actual) {
  const previous = new Uint16Array(actual.length + 1);
  const current = new Uint16Array(actual.length + 1);

  for (let j = 0; j <= actual.length; j += 1) previous[j] = j;

  for (let i = 1; i <= expected.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= actual.length; j += 1) {
      current[j] = expected[i - 1] === actual[j - 1]
        ? previous[j - 1]
        : Math.min(previous[j - 1], previous[j], current[j - 1]) + 1;
    }
    previous.set(current);
  }

  return previous[actual.length];
}

function getReviewIndices(expected, actual) {
  const rows = expected.length + 1;
  const cols = actual.length + 1;
  const distances = Array.from({ length: rows }, () => new Uint16Array(cols));

  for (let i = 0; i < rows; i += 1) distances[i][0] = i;
  for (let j = 0; j < cols; j += 1) distances[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      distances[i][j] = expected[i - 1] === actual[j - 1]
        ? distances[i - 1][j - 1]
        : Math.min(distances[i - 1][j - 1], distances[i - 1][j], distances[i][j - 1]) + 1;
    }
  }

  const reviewIndices = new Set();
  let i = expected.length;
  let j = actual.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && expected[i - 1] === actual[j - 1]) {
      i -= 1;
      j -= 1;
      continue;
    }

    const substitution = i > 0 && j > 0 ? distances[i - 1][j - 1] : Number.POSITIVE_INFINITY;
    const deletion = i > 0 ? distances[i - 1][j] : Number.POSITIVE_INFINITY;
    const insertion = j > 0 ? distances[i][j - 1] : Number.POSITIVE_INFINITY;
    const minimum = Math.min(substitution, deletion, insertion);

    if (substitution === minimum) {
      reviewIndices.add(i - 1);
      i -= 1;
      j -= 1;
    } else if (deletion === minimum) {
      reviewIndices.add(i - 1);
      i -= 1;
    } else {
      // 인식 결과에만 내용이 추가된 경우에는 가장 가까운 원문 위치를
      // 표시해 사용자가 문맥을 확인할 수 있게 한다.
      if (expected.length > 0) reviewIndices.add(Math.min(i, expected.length - 1));
      j -= 1;
    }
  }

  return reviewIndices;
}

function getReviewSegments(originalText, recognizedText) {
  const originalCharacters = Array.from(String(originalText || ""));
  const normalizedCharacters = [];
  const normalizedToOriginal = [];
  originalCharacters.forEach((char, originalIndex) => {
    const normalized = char.normalize("NFC");
    if (!/[\uac00-\ud7a30-9]/.test(normalized)) return;
    normalizedCharacters.push(normalized);
    normalizedToOriginal.push(originalIndex);
  });

  const recognized = Array.from(normalizeRecitationText(recognizedText));
  const reviewNormalizedIndices = getReviewIndices(normalizedCharacters, recognized);
  const reviewOriginalIndices = new Set(
    [...reviewNormalizedIndices].map(index => normalizedToOriginal[index]).filter(Number.isInteger)
  );

  // 문자 단위 차이를 그대로 여러 군데 칠하지 않고, 해당 문자가 포함된
  // 원문 어절 전체를 한 번만 강조한다. 띄어쓰기와 문장부호는 원문 그대로다.
  const reviewWordIndices = new Set();
  let wordIndex = -1;
  let insideWord = false;
  const characterWordIndices = originalCharacters.map(char => {
    if (/\s/.test(char)) {
      insideWord = false;
      return -1;
    }
    if (!insideWord) {
      wordIndex += 1;
      insideWord = true;
    }
    return wordIndex;
  });
  reviewOriginalIndices.forEach(index => {
    const containingWord = characterWordIndices[index];
    if (containingWord >= 0) reviewWordIndices.add(containingWord);
  });

  const segments = [];
  originalCharacters.forEach((char, index) => {
    const needsReview = reviewWordIndices.has(characterWordIndices[index]);
    const previous = segments[segments.length - 1];
    if (previous && previous.needsReview === needsReview) previous.text += char;
    else segments.push({ text: char, needsReview });
  });
  return segments;
}

export function compareRecitation(expectedText, recognizedText) {
  const expected = normalizeRecitationText(expectedText);
  const recognized = normalizeRecitationText(recognizedText);
  const longestLength = Math.max(expected.length, recognized.length);
  const distance = longestLength > 0 ? getEditDistance(expected, recognized) : 0;
  const score = longestLength > 0 ? Math.max(0, 1 - distance / longestLength) : 0;

  let recommendation = "learning";
  if (score >= 0.9) recommendation = "memorized";
  else if (score >= 0.65) recommendation = "partial";

  return {
    score,
    recommendation,
    distance,
    reviewSegments: getReviewSegments(expectedText, recognizedText)
  };
}

export function getSpeechErrorMessage(errorCode) {
  if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
    return "마이크 권한을 허용한 뒤 다시 시도해 주세요.";
  }
  if (errorCode === "audio-capture") return "사용할 수 있는 마이크를 찾지 못했어요.";
  if (errorCode === "network") return "음성 인식 네트워크에 연결하지 못했어요.";
  if (errorCode === "no-speech") return "음성이 들리지 않았어요. 다시 암송해 주세요.";
  if (errorCode === "language-not-supported" || errorCode === "language-unavailable") {
    return "이 기기에서는 한국어 음성 인식을 사용할 수 없어요.";
  }
  return "음성 인식을 완료하지 못했어요. 다시 시도해 주세요.";
}

export function startSpeechRecognition({ onStart, onResult, onError, onEnd }) {
  const SpeechRecognitionConstructor = getSpeechRecognitionConstructor();
  if (typeof SpeechRecognitionConstructor !== "function") return null;

  const recognition = new SpeechRecognitionConstructor();
  let completed = false;
  let intentionallyAborted = false;

  recognition.lang = "ko-KR";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 3;

  recognition.onstart = () => onStart?.();
  recognition.onresult = event => {
    if (completed || intentionallyAborted) return;
    const result = event.results[event.resultIndex] || event.results[event.results.length - 1];
    const alternatives = Array.from(result || []).map(item => item.transcript.trim()).filter(Boolean);
    completed = true;
    onResult?.(alternatives);
  };
  recognition.onerror = event => {
    if (completed || intentionallyAborted || event.error === "aborted") return;
    completed = true;
    onError?.(getSpeechErrorMessage(event.error));
  };
  recognition.onend = () => {
    if (!completed && !intentionallyAborted) {
      completed = true;
      onError?.(getSpeechErrorMessage("no-speech"));
    }
    onEnd?.();
  };

  recognition.start();

  return {
    abort() {
      if (intentionallyAborted) return;
      intentionallyAborted = true;
      try {
        recognition.abort();
      } catch (_) {
        // 이미 브라우저에서 종료한 세션은 별도 처리가 필요 없다.
      }
    }
  };
}
