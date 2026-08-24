function splitWords(text) {
  return text.split(" ").filter(w => w.length > 0);
}

const HARD_END_RE = /(다|라)$/;

// 흔한 연결/나열 어미: 원래 이 뒤에 쉼표가 오는 경우가 많은 지점(자연스러운 구 경계 후보)
const SOFT_BREAK_SUFFIXES = [
  "으므로", "거니와", "고는", "거든", "든지", "나니", "이요", "으니",
  "며", "고", "니", "면", "되", "요"
];

// 언어적 신호(어미/쉼표)가 한동안 없을 때만 적용되는 안전장치. 1차 분할 기준이 아니라
// "너무 길어지는 것"을 막는 상한선이며, 화면 폭이나 글자 수가 아닌 단어 수 기준이다.
const MAX_CHUNK_WORDS_FALLBACK = 6;
const MIN_CHUNK_WORDS = 2;

function endsWithSoftBreak(word) {
  return SOFT_BREAK_SUFFIXES.some(suf => word.endsWith(suf));
}

// 화면 줄바꿈/CSS와 무관하게, 쉼표·문장 종결어미·연결어미 같은 언어적 신호를 우선으로
// 암송하기 좋은 짧은 의미 단위(구)로 나눈다. 공백 토큰 단위로만 다루므로 조사/어절
// 중간이 잘리는 일은 없다.
export function autoChunk(text) {
  const words = splitWords(text);
  const chunks = [];
  let current = [];

  words.forEach((word, i) => {
    current.push(word);
    const isLast = i === words.length - 1;
    if (isLast) return;

    const hasComma = word.includes(",");
    const isSemanticBreak = hasComma || HARD_END_RE.test(word) || endsWithSoftBreak(word);
    const isTooLong = current.length >= MAX_CHUNK_WORDS_FALLBACK;

    if (current.length >= MIN_CHUNK_WORDS && (isSemanticBreak || isTooLong)) {
      chunks.push(current.join(" "));
      current = [];
    }
  });

  if (current.length > 0) {
    chunks.push(current.join(" "));
  }
  return chunks;
}

export function getMemorizationChunks(verse) {
  if (verse.memorizationChunks && verse.memorizationChunks.length > 0) {
    return verse.memorizationChunks;
  }
  return autoChunk(verse.text);
}

// 의미가 약한 접속어/부사 — 자동 우선순위 계산 시 감점 대상(핵심 명사·동사보다 나중에 가림)
const WEAK_FUNCTION_WORDS = [
  "그리고", "그러나", "그러므로", "그런즉", "또한", "오직", "다만",
  "또", "곧", "즉", "이는", "그런데", "이제", "이미", "혹은"
];

// 어절 하나에 우선순위 점수를 매긴다: 길수록(핵심 명사·동사+어미일 가능성이 높을수록) 우선,
// 조사만 붙은 매우 짧은 어절/약한 접속어는 감점, 구절 안에서 반복되는 표현은 가점.
function scoreWord(word, occurrenceCount) {
  let score = word.length;
  if (WEAK_FUNCTION_WORDS.includes(word)) score -= 8;
  if (word.length <= 1) score -= 8;
  if (occurrenceCount > 1) score += 3;
  return score;
}

// hidePriority 항목(여러 단어로 된 구일 수 있음)이 text의 공백 토큰 시퀀스 안에서
// 연속 부분열로 정확히 일치하는 위치를 찾는다.
function resolvePhraseWordIndices(words, phrase) {
  const phraseWords = splitWords(phrase);
  if (phraseWords.length === 0) return [];
  for (let start = 0; start <= words.length - phraseWords.length; start++) {
    if (phraseWords.every((pw, k) => words[start + k] === pw)) {
      return Array.from({ length: phraseWords.length }, (_, k) => start + k);
    }
  }
  return [];
}

// "가릴 우선순위" 순서(앞쪽일수록 먼저 가려짐)를 만든다. hidePriority가 있으면 그 항목들을
// 나열된 순서대로 최우선 배치하고, 남은 단어는 자동 점수 규칙으로 정렬해 이어붙인다.
// 화면 폭/랜덤과 무관한 결정적 순서라 재렌더링해도 항상 동일하다.
function buildPriorityOrder(verse) {
  const words = splitWords(verse.text);
  const used = new Set();
  const order = [];

  (verse.hidePriority || []).forEach(phrase => {
    resolvePhraseWordIndices(words, phrase).forEach(i => {
      if (!used.has(i)) {
        used.add(i);
        order.push(i);
      }
    });
  });

  const occurrences = new Map();
  words.forEach(w => occurrences.set(w, (occurrences.get(w) || 0) + 1));

  const remaining = words
    .map((word, i) => ({ i, word }))
    .filter(({ i }) => !used.has(i));
  remaining.sort((a, b) => scoreWord(b.word, occurrences.get(b.word)) - scoreWord(a.word, occurrences.get(a.word)));
  remaining.forEach(({ i }) => order.push(i));

  return order;
}

const MASK_RATIOS = [0.25, 0.45, 0.7];
export const MASK_STAGE_COUNT = MASK_RATIOS.length;

export function getMaskIndices(verse, stageIndex) {
  const order = buildPriorityOrder(verse);
  const n = order.length;
  const ratio = MASK_RATIOS[Math.min(stageIndex, MASK_RATIOS.length - 1)];
  const count = n <= 1 ? 0 : Math.min(n - 1, Math.max(1, Math.round(n * ratio)));
  return new Set(order.slice(0, count));
}
