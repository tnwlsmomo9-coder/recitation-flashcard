import { BOOKS, findVerseById, getAllVerseIds, getBookVerseIds, getLessonVerseIds } from "./data.js";
import { getLastVerseId, setLastVerseId, getStatusMap, getVerseStatus, setVerseStatus, getAutoAdvance, setAutoAdvance, getVerseFontSize, setVerseFontSize } from "./storage.js";
import { toInitials } from "./initials.js";
import { getMaskIndices, MASK_STAGE_COUNT, splitIntoWords } from "./practice.js";
import { initStartHero, restartStartHero } from "./startHero.js";

const STATUS_LABEL = { memorized: "✓ 암기 완료", partial: "◐ 부분 암기", learning: "○ 더 익히기" };
// 한 과 안에서 몇 번째 말씀인지 표시하는 원문자 — 과 번호와는 별개의 표시다.
const VERSE_ORDINAL_MARKS = ["❶", "❷", "❸", "❹"];
const FONT_SIZE_STEPS = [18, 20, 22, 24, 26];
const LINE_HEIGHT_SCALE_STEPS = [1, 0.97, 0.94, 0.9, 0.86];

function clampToFontStep(size) {
  return FONT_SIZE_STEPS.reduce((closest, step) => (Math.abs(step - size) < Math.abs(closest - size) ? step : closest), FONT_SIZE_STEPS[0]);
}

const state = {
  activeBookTab: 1,
  mode: "sequential",
  queue: [],
  queueIndex: 0,
  pendingScope: "currentBook",
  pendingCustomIds: new Set(),
  // 말씀구절 선택 화면에서 현재 펼쳐져 있는 권(한 번에 하나만 펼쳐진다). null이면 전부 접힘.
  pendingCustomOpenBook: null,
  tocFilter: "all",
  tocStatusFilterVisible: false,
  tocSearch: "",
  // 목차에서 특정 말씀으로 들어가기 직전의 스크롤 위치. "‹ 목차"로
  // 돌아왔을 때 이 위치로 복원한다.
  tocScrollY: 0,
  practiceMode: "full",
  lineByLineStep: 1,
  progressiveStage: 0,
  progressiveDone: false,
  revealedHints: new Set(),
  initialsStage: "letters",
  showRecitationHint: false,
  autoAdvance: true,
  autoAdvanceTimer: null,
  verseFontSize: clampToFontStep(getVerseFontSize()),
  writingProgress: 0,
  writingSegmentStart: 0,
  writingCompleted: false,
  writingMethod: "visible",
  writingChecked: false,
  randomRevealed: false,
  singleVerseCheck: false,
  // 암송점검(여러 구절) 중에 말씀익히기로 잠깐 넘어갔을 때, 그 여러 구절
  // 세션(큐+위치)을 잠시 담아둔다 — 다시 암송점검으로 돌아오면 이걸 복원해
  // 1구절로 좁아지지 않고 원래 세션이 이어지게 한다. null이면 복원할
  // 세션이 없다는 뜻(이 경우 암송점검 토글은 현재 구절 하나만 확인한다).
  pausedRandomSession: null
};

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function renderLessonVerseRef(ref) {
  const separatorIndex = ref.lastIndexOf(" ");
  if (separatorIndex === -1) return escapeHtml(ref);
  const bookName = escapeHtml(ref.slice(0, separatorIndex));
  const chapterAndVerse = escapeHtml(ref.slice(separatorIndex + 1));
  return `<span class="lesson-ref-book">${bookName}</span> <span class="lesson-ref-passage">${chapterAndVerse}</span>`;
}

function renderVerseTextWithEmphasis(text) {
  const html = text
    .split(" ")
    .map(word => {
      if (word.length === 0) return word;
      const first = escapeHtml(word[0]);
      const rest = escapeHtml(word.slice(1));
      return `<span class="first-char">${first}</span>${rest}`;
    })
    .join(" ");
  return `<div class="verse-text-inner">${html}</div>`;
}

function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(`screen-${name}`).classList.add("active");
}

/* ---------- 시작 화면 ---------- */
function continueLearning() {
  const lastId = getLastVerseId();
  if (!lastId) return;
  const found = findVerseById(lastId);
  if (!found) return;
  const { book } = found;
  state.activeBookTab = book.id;
  state.mode = "sequential";
  state.singleVerseCheck = false;
  state.pausedRandomSession = null;
  state.queue = getBookVerseIds(book.id);
  state.queueIndex = state.queue.indexOf(lastId);
  resetPracticeState();
  updateModeButtons();
  showScreen("card");
  renderCard();
}

/* ---------- 목차 화면 ---------- */
function renderToc() {
  renderBookTabs();
  renderStatusFilterVisibility();
  renderLessonList();
}

function selectBookTab(bookIdOrAll) {
  if (state.activeBookTab === bookIdOrAll) {
    state.tocStatusFilterVisible = !state.tocStatusFilterVisible;
  } else {
    state.activeBookTab = bookIdOrAll;
    state.tocStatusFilterVisible = true;
  }
  renderBookTabs();
  renderStatusFilterVisibility();
  renderLessonList();
}

function renderStatusFilterVisibility() {
  const filterEl = document.getElementById("status-filter");
  filterEl.classList.toggle("visible", state.tocStatusFilterVisible);
  filterEl.setAttribute("aria-hidden", String(!state.tocStatusFilterVisible));
}

function renderBookTabs() {
  const container = document.getElementById("book-tabs");
  container.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  const allActive = state.activeBookTab === "all";
  allBtn.className = "book-tab" + (allActive ? " active" : "");
  allBtn.setAttribute("aria-pressed", String(allActive));
  allBtn.setAttribute("aria-expanded", String(allActive && state.tocStatusFilterVisible));
  allBtn.setAttribute("aria-controls", "status-filter");
  allBtn.textContent = "전체";
  allBtn.addEventListener("click", () => selectBookTab("all"));
  container.appendChild(allBtn);

  BOOKS.forEach(book => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isActive = book.id === state.activeBookTab;
    btn.className = "book-tab" + (isActive ? " active" : "");
    btn.setAttribute("aria-pressed", String(isActive));
    btn.setAttribute("aria-expanded", String(isActive && state.tocStatusFilterVisible));
    btn.setAttribute("aria-controls", "status-filter");
    btn.textContent = book.title;
    btn.addEventListener("click", () => selectBookTab(book.id));
    container.appendChild(btn);
  });
}

function lessonMatchesFilter(lesson, statusMap, filter) {
  if (filter === "all") return true;
  return lesson.verses.some(v => (statusMap[v.id] || "learning") === filter);
}

function lessonMatchesSearch(lesson, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  if (`${lesson.id}과`.includes(q)) return true;
  if (lesson.title.toLowerCase().includes(q)) return true;
  return lesson.verses.some(v => v.ref.toLowerCase().includes(q) || v.text.toLowerCase().includes(q));
}

function renderLessonList() {
  const list = document.getElementById("lesson-list");
  list.innerHTML = "";
  const statusMap = getStatusMap();
  const lastVerseId = getLastVerseId();

  const query = state.tocSearch.trim();
  // 검색어가 있으면 지금 어느 권 탭을 보고 있든 상관없이 전체 권에서 찾는다.
  const showAllBooks = state.activeBookTab === "all" || query.length > 0;
  const lessonsWithBook = showAllBooks
    ? BOOKS.flatMap(b => b.lessons.map(lesson => ({ book: b, lesson })))
    : (() => {
        const book = BOOKS.find(b => b.id === state.activeBookTab);
        return book.lessons.map(lesson => ({ book, lesson }));
      })();

  const visibleLessons = lessonsWithBook.filter(({ lesson }) =>
    lessonMatchesFilter(lesson, statusMap, state.tocFilter) && lessonMatchesSearch(lesson, query)
  );

  if (visibleLessons.length === 0) {
    const li = document.createElement("li");
    li.className = "lesson-empty type-body";
    li.textContent = query ? "검색 결과가 없어요" : "해당하는 구절이 없습니다.";
    list.appendChild(li);
    return;
  }

  visibleLessons.forEach(({ book, lesson }) => {
    const li = document.createElement("li");
    li.className = "lesson-item";

    const lessonNumberLabel = showAllBooks ? `${book.title} ${lesson.id}과` : `${lesson.id}과`;
    const titleZone = document.createElement("button");
    titleZone.type = "button";
    titleZone.className = "lesson-title-zone";
    titleZone.setAttribute("aria-label", `${lessonNumberLabel} ${lesson.title}, 이 과 전체 학습`);
    titleZone.innerHTML = `
      <span class="lesson-heading">
        <span class="lesson-number type-caption">${lessonNumberLabel}</span>
        <span class="lesson-title">${lesson.title}</span>
      </span>
      <span class="lesson-enter-all" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m9 18 6-6-6-6"></path>
        </svg>
      </span>
    `;
    titleZone.addEventListener("click", () => enterLesson(book.id, lesson.id));
    li.appendChild(titleZone);

    lesson.verses.forEach((v, i) => {
      const status = statusMap[v.id] || "learning";
      const verseZone = document.createElement("button");
      verseZone.type = "button";
      verseZone.className = "lesson-verse-zone" + (v.id === lastVerseId ? " last-closed" : "");
      verseZone.innerHTML = `
        <span class="lesson-verse-ordinal">${VERSE_ORDINAL_MARKS[i] || ""}</span>
        <span class="lesson-verse-ref">${renderLessonVerseRef(v.ref)}</span>
        <span class="status-dot status-${status}">${STATUS_LABEL[status]}</span>
      `;
      verseZone.addEventListener("click", () => enterLesson(book.id, lesson.id, i));
      li.appendChild(verseZone);
    });

    list.appendChild(li);
  });

}

function enterLesson(bookId, lessonId, verseIndex = 0) {
  state.tocScrollY = window.scrollY;
  state.activeBookTab = bookId;
  state.mode = "sequential";
  state.singleVerseCheck = false;
  state.pausedRandomSession = null;
  state.queue = getBookVerseIds(bookId);
  const targetVerseId = getLessonVerseIds(bookId, lessonId)[verseIndex];
  state.queueIndex = state.queue.indexOf(targetVerseId);
  resetPracticeState();
  updateModeButtons();
  showScreen("card");
  renderCard();
}

/* ---------- 암송 학습 화면 ---------- */
function resetPracticeState() {
  clearTimeout(state.autoAdvanceTimer);
  state.practiceMode = "full";
  state.lineByLineStep = 1;
  state.progressiveStage = 0;
  state.progressiveDone = false;
  state.revealedHints = new Set();
  state.initialsStage = "letters";
  state.showRecitationHint = false;
  state.randomRevealed = false;
}

function updateModeButtons() {
  const seqBtn = document.getElementById("btn-mode-sequential");
  const writingBtn = document.getElementById("btn-mode-writing");
  const isSequential = state.mode === "sequential";
  seqBtn.classList.toggle("active", isSequential);
  writingBtn.classList.remove("active");
  seqBtn.setAttribute("aria-pressed", String(isSequential));
  writingBtn.setAttribute("aria-pressed", "false");
}

function switchToSequential() {
  const currentVerseId = state.queue[state.queueIndex];
  const found = findVerseById(currentVerseId);
  if (!found) return;
  // 여러 구절짜리 암송점검(단일 구절 확인이 아닌) 세션을 두고 말씀익히기로
  // 넘어가는 것이면, 나중에 암송점검으로 되돌아왔을 때 이어갈 수 있게
  // 그 세션(큐+위치)을 잠시 담아둔다.
  if (state.mode === "random" && !state.singleVerseCheck) {
    state.pausedRandomSession = { queue: state.queue.slice(), queueIndex: state.queueIndex };
  }
  const { book } = found;
  state.activeBookTab = book.id;
  state.mode = "sequential";
  state.singleVerseCheck = false;
  state.queue = getBookVerseIds(book.id);
  state.queueIndex = state.queue.indexOf(currentVerseId);
  resetPracticeState();
  updateModeButtons();
  renderCard();
}

function renderLineByLineHtml(verse) {
  const chunks = splitIntoWords(verse.text);
  const step = Math.min(state.lineByLineStep, chunks.length);
  const isDone = step >= chunks.length;

  if (isDone) {
    return `<div class="verse-text-inner">${escapeHtml(verse.text)}</div>`;
  }

  const shownChunks = chunks.slice(0, step);
  // 방금 새로 나온 마지막 조각에만 등장 효과를 주고, 이전에 이미 보이던
  // 조각들은 다시 렌더링돼도 애니메이션이 재생되지 않게 한다. 각 조각은
  // white-space:nowrap이라 화면 폭 때문에 어절 내부가 서로 다른 줄로
  // 쪼개지지 않고, 조각과 조각 사이에서만 줄바꿈된다.
  const flow = shownChunks
    .map((chunk, i) => {
      const cls = i === shownChunks.length - 1 ? "lbl-chunk lbl-chunk-new" : "lbl-chunk";
      return `<span class="${cls}">${escapeHtml(chunk)}</span>`;
    })
    .join(" ");

  return `
    <button type="button" class="lbl-tap-area" data-action="lbl-next">
      <span class="lbl-flow">${flow}</span>
      <span class="lbl-hint">눌러서 이어 보기</span>
    </button>
  `;
}

function renderProgressiveHtml(verse) {
  if (state.progressiveDone) {
    return `
      <div class="prog-done">
        <div class="practice-feedback prog-done-heading">빈칸 연습을 마쳤어요</div>
        <div class="practice-actions">
          <button type="button" class="btn btn-outline btn-chip" data-action="prog-restart">빈칸 다시 연습</button>
        </div>
      </div>
    `;
  }

  const words = verse.text.split(" ").filter(w => w.length > 0);
  const stage = state.progressiveStage;
  const maskIndices = getMaskIndices(verse, stage);

  const wordSpans = words.map((word, i) => {
    if (!maskIndices.has(i)) {
      return `<span class="word">${escapeHtml(word)}</span>`;
    }
    if (state.revealedHints.has(i)) {
      return `<button type="button" class="word revealed" data-action="toggle-reveal" data-idx="${i}">${escapeHtml(word)}</button>`;
    }
    return `<button type="button" class="blank" data-action="toggle-reveal" data-idx="${i}" aria-label="가려진 단어 확인">?</button>`;
  });

  return `<div class="prog-text">${wordSpans.join(" ")}</div>`;
}

function renderInitialsHtml(verse) {
  if (state.initialsStage === "hidden") {
    return `
      <div class="initials-check">
        <div class="practice-feedback">말씀을 모두 떠올리며 암송해보세요</div>
        <div class="practice-actions">
          <button type="button" class="btn btn-primary btn-chip" data-action="initials-reveal">전체 본문 확인</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="initials-text">${escapeHtml(toInitials(verse.text))}</div>
    <div class="practice-actions">
      <button type="button" class="btn btn-outline btn-chip" data-action="initials-check">확인하기</button>
    </div>
  `;
}

function renderPracticePanel(verseId, verse) {
  document.querySelectorAll(".practice-tab").forEach(tab => {
    const isActive = tab.dataset.mode === state.practiceMode;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-pressed", String(isActive));
  });

  const cardText = document.getElementById("card-text");
  const body = document.getElementById("practice-body");
  const tabs = document.getElementById("practice-tabs");
  const fontControl = document.querySelector(".font-size-control");
  const tapHint = document.getElementById("verse-tap-hint");
  const verseCard = document.getElementById("verse-card");
  const statusPanel = document.getElementById("status-panel");
  const statusBadge = document.getElementById("card-status-badge");
  const autoAdvanceRow = document.querySelector(".auto-advance-row");

  const isRandom = state.mode === "random";
  const modeToggle = document.querySelector("#screen-card .mode-toggle");
  const recitationModeLabel = document.getElementById("recitation-mode-label");
  const backButton = document.getElementById("btn-back-toc");
  modeToggle.style.display = isRandom ? "none" : "flex";
  recitationModeLabel.hidden = !isRandom;
  backButton.textContent = isRandom ? "‹ 암송 범위" : "‹ 목차";
  const isCollapsed = isRandom && !state.randomRevealed;
  // 나눠보기/빈칸암기는 단계적으로 훑어보는 연습일 뿐이라 암송 상태 확인
  // 칩을 두지 않는다 — 상태 기록은 전체 탭과, 첫 글자 끝의 완전 암송
  // 확인 흐름에서만 하도록 남겨둔다. 현재 상태를 보여주는 배지
  // (card-status-badge)는 실행 UI가 아니라 그대로 둔다.
  const hideStatusCheck = state.practiceMode === "lineByLine" || state.practiceMode === "progressive";
  verseCard.classList.toggle("collapsed", isCollapsed);
  tapHint.style.display = isCollapsed ? "flex" : "none";
  fontControl.style.display = isRandom ? "none" : "flex";
  tabs.style.display = isRandom ? "none" : "flex";
  statusPanel.style.display = isCollapsed || hideStatusCheck ? "none" : "flex";
  statusBadge.style.display = isCollapsed ? "none" : "";
  autoAdvanceRow.style.display = isCollapsed || state.singleVerseCheck || hideStatusCheck ? "none" : "flex";

  if (isCollapsed) {
    cardText.style.display = "none";
    body.style.display = "none";
    body.innerHTML = "";
    return;
  }

  const isFull = isRandom || state.practiceMode === "full";
  cardText.style.display = isFull ? "" : "none";
  // "첫 글자" 탭의 전체 본문 확인(→ 전체 탭 이동) 경로로 왔을 때만, 전체
  // 탭 아래에 암송 상태 기록 안내를 보여준다. 전체 탭을 직접 눌러
  // 들어왔을 때는 보이지 않는다(practice-tabs 클릭 시 항상 꺼짐).
  const showRecitationHint = state.practiceMode === "full" && !isRandom && state.showRecitationHint;
  body.style.display = isFull ? (showRecitationHint ? "flex" : "none") : "flex";
  // 이 안내 문구는 한 줄뿐이라, 다른 연습 모드용으로 큰 min-height/여백을
  // 그대로 쓰면 말씀 본문·상태 기록 영역과의 간격이 불필요하게 커진다.
  body.classList.toggle("practice-body-compact", showRecitationHint);

  if (isFull) {
    body.innerHTML = showRecitationHint
      ? `<div class="practice-feedback">아래에서 암송 상태를 기록해보세요</div>`
      : "";
    return;
  }

  if (state.practiceMode === "lineByLine") {
    body.innerHTML = renderLineByLineHtml(verse);
  } else if (state.practiceMode === "progressive") {
    body.innerHTML = renderProgressiveHtml(verse);
  } else {
    body.innerHTML = renderInitialsHtml(verse);
  }
}

function applyVerseFontSize() {
  const size = `${state.verseFontSize}px`;
  const stepIndex = FONT_SIZE_STEPS.indexOf(state.verseFontSize);
  const lhScale = LINE_HEIGHT_SCALE_STEPS[stepIndex] ?? 1;
  const cardText = document.getElementById("card-text");
  const practiceBody = document.getElementById("practice-body");
  cardText.style.fontSize = size;
  cardText.style.setProperty("--lh-scale", lhScale);
  practiceBody.style.fontSize = size;
  practiceBody.style.setProperty("--lh-scale", lhScale);
  document.getElementById("btn-font-decrease").disabled = state.verseFontSize <= FONT_SIZE_STEPS[0];
  document.getElementById("btn-font-increase").disabled = state.verseFontSize >= FONT_SIZE_STEPS[FONT_SIZE_STEPS.length - 1];
}

function renderCard() {
  const verseId = state.queue[state.queueIndex];
  const found = findVerseById(verseId);
  if (!found) return;
  const { book, lesson, verse } = found;

  document.getElementById("card-meta").textContent = `${book.title} · ${lesson.id}과`;
  // 과 번호와는 별개로, 한 과 안에서 몇 번째 말씀인지 원문자로 구분해 붙인다
  // (예: "그리스도 안의 생활 ❶" / "그리스도 안의 생활 ❷").
  const verseOrdinal = VERSE_ORDINAL_MARKS[lesson.verses.indexOf(verse)] || "";
  document.getElementById("card-title").textContent = verseOrdinal ? `${lesson.title} ${verseOrdinal}` : lesson.title;
  document.getElementById("card-ref").textContent = verse.ref;
  document.getElementById("card-text").innerHTML = renderVerseTextWithEmphasis(verse.text);
  applyVerseFontSize();

  const rawStatus = getStatusMap()[verseId];
  document.getElementById("card-status-badge").textContent = rawStatus ? STATUS_LABEL[rawStatus] : "";
  document.querySelectorAll(".status-chip").forEach(chip => {
    const isActive = chip.dataset.status === rawStatus;
    chip.classList.toggle("active", isActive);
    chip.setAttribute("aria-pressed", String(isActive));
  });

  const prevBtn = document.getElementById("btn-prev");
  const nextBtn = document.getElementById("btn-next");
  if (state.singleVerseCheck) {
    prevBtn.disabled = false;
    nextBtn.style.display = "none";
  } else if (state.mode === "sequential") {
    nextBtn.style.display = "";
    prevBtn.disabled = state.queueIndex === 0;
    const isLastBook = BOOKS.findIndex(b => b.id === state.activeBookTab) === BOOKS.length - 1;
    nextBtn.disabled = state.queueIndex === state.queue.length - 1 && isLastBook;
  } else {
    nextBtn.style.display = "";
    prevBtn.disabled = false;
    nextBtn.disabled = false;
  }
  document.getElementById("pager-count").textContent = `${state.queueIndex + 1} / ${state.queue.length}`;

  renderPracticePanel(verseId, verse);

  setLastVerseId(verseId);
}

/* ---------- 필사하기 화면 ---------- */
function normalizeWritingText(text) {
  return text.replace(/[^\uac00-\ud7a30-9]/g, "");
}

function getComparableCharacters(text) {
  return Array.from(text)
    .map((char, index) => ({ char, index }))
    .filter(item => /[\uac00-\ud7a30-9]/.test(item.char));
}

function getWritingComparison(original, draft) {
  const expected = getComparableCharacters(original);
  const actual = getComparableCharacters(draft);
  const rows = expected.length + 1;
  const cols = actual.length + 1;
  const lengths = Array.from({ length: rows }, () => new Uint16Array(cols));

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      lengths[i][j] = expected[i - 1].char === actual[j - 1].char
        ? lengths[i - 1][j - 1] + 1
        : Math.max(lengths[i - 1][j], lengths[i][j - 1]);
    }
  }

  const operations = [];
  let i = expected.length;
  let j = actual.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && expected[i - 1].char === actual[j - 1].char) {
      operations.push({ type: "match", expected: expected[i - 1], actual: actual[j - 1] });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || lengths[i][j - 1] > lengths[i - 1][j])) {
      operations.push({ type: "extra", actual: actual[j - 1] });
      j -= 1;
    } else {
      operations.push({ type: "missing", expected: expected[i - 1] });
      i -= 1;
    }
  }
  operations.reverse();

  const extraIndices = new Set();
  const missingExpectedIndices = new Set();
  operations.forEach(operation => {
    if (operation.type === "missing") {
      missingExpectedIndices.add(operation.expected.index);
      return;
    }
    if (operation.type === "extra") extraIndices.add(operation.actual.index);
  });

  const draftCharacters = Array.from(draft);
  const reviewedHtml = draftCharacters.map((char, index) => {
    const escaped = escapeHtml(char);
    const rendered = extraIndices.has(index)
      ? `<mark class="writing-extra" aria-label="틀리거나 추가된 내용">${escaped}</mark>`
      : escaped;
    return rendered;
  }).join("");

  const originalReviewedHtml = Array.from(original).map((char, index) => {
    const escaped = escapeHtml(char);
    return missingExpectedIndices.has(index)
      ? `<mark class="writing-original-mismatch" aria-label="틀리거나 빠진 원문">${escaped}</mark>`
      : escaped;
  }).join("");

  return {
    reviewedHtml,
    originalReviewedHtml,
    hasDifferences: operations.some(operation => operation.type !== "match")
  };
}

function resizeWritingInput() {
  const input = document.getElementById("writing-input");
  input.style.height = "auto";
  const maxHeight = Number.parseFloat(getComputedStyle(input).maxHeight);
  const nextHeight = Number.isFinite(maxHeight) ? Math.min(input.scrollHeight, maxHeight) : input.scrollHeight;
  input.style.height = `${nextHeight}px`;
  input.style.overflowY = Number.isFinite(maxHeight) && input.scrollHeight > maxHeight ? "auto" : "hidden";
}

function getWritingChunks(verse) {
  return Array.isArray(verse.memorizationChunks) && verse.memorizationChunks.length > 0
    ? verse.memorizationChunks
    : [verse.text];
}

function renderWritingOriginal(verse) {
  const chunks = getWritingChunks(verse);
  const progress = Math.min(state.writingProgress, chunks.length);
  document.getElementById("writing-original").innerHTML = chunks
    .map((chunk, index) => {
      const classes = ["writing-chunk"];
      if (index < progress) classes.push("completed");
      if (!state.writingCompleted && index === progress) classes.push("current");
      return `<span class="${classes.join(" ")}">${escapeHtml(chunk)}</span>`;
    })
    .join(" ");
}

function renderWriting() {
  const verseId = state.queue[state.queueIndex];
  const found = findVerseById(verseId);
  if (!found) return;
  const { book, lesson, verse } = found;
  const verseOrdinal = VERSE_ORDINAL_MARKS[lesson.verses.indexOf(verse)] || "";

  document.getElementById("writing-meta").textContent = `${book.title} · ${lesson.id}과`;
  document.getElementById("writing-title").textContent = verseOrdinal ? `${lesson.title} ${verseOrdinal}` : lesson.title;
  document.getElementById("writing-ref").textContent = verse.ref;
  const visibleMethod = state.writingMethod === "visible";
  document.querySelectorAll(".writing-method-btn").forEach(btn => {
    const active = btn.id === (visibleMethod ? "btn-writing-visible" : "btn-writing-recall");
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });

  const original = document.getElementById("writing-original");
  original.hidden = !visibleMethod;
  if (visibleMethod) renderWritingOriginal(verse);

  const input = document.getElementById("writing-input");
  document.getElementById("writing-input-label").textContent = "말씀 필사";
  input.value = "";
  input.hidden = false;
  input.readOnly = false;
  input.placeholder = visibleMethod ? "강조된 구간을 그대로 입력해 보세요" : "기억나는 말씀 전체를 입력해 보세요";
  resizeWritingInput();

  const feedback = document.getElementById("writing-feedback");
  feedback.textContent = state.writingCompleted ? "필사를 완료했어요." : "";
  feedback.classList.toggle("success", state.writingCompleted);
  feedback.classList.remove("error");
  document.getElementById("btn-writing-check").style.display = visibleMethod ? "none" : "block";
  document.getElementById("btn-writing-retry").style.display = "none";
  const reviewed = document.getElementById("writing-reviewed");
  reviewed.hidden = true;
  reviewed.innerHTML = "";
  const answerOriginal = document.getElementById("writing-answer-original");
  answerOriginal.hidden = true;
  answerOriginal.textContent = "";

  const prevBtn = document.getElementById("btn-writing-prev");
  const nextBtn = document.getElementById("btn-writing-next");
  if (state.mode === "sequential") {
    prevBtn.disabled = state.queueIndex === 0;
    const isLastBook = BOOKS.findIndex(bookItem => bookItem.id === state.activeBookTab) === BOOKS.length - 1;
    nextBtn.disabled = state.queueIndex === state.queue.length - 1 && isLastBook;
  } else {
    prevBtn.disabled = false;
    nextBtn.disabled = false;
  }
  document.getElementById("writing-pager-count").textContent = `${state.queueIndex + 1} / ${state.queue.length}`;
  setLastVerseId(verseId);
}

function resetWritingAttempt() {
  state.writingProgress = 0;
  state.writingSegmentStart = 0;
  state.writingCompleted = false;
  state.writingChecked = false;
  const input = document.getElementById("writing-input");
  if (input) {
    input.value = "";
    resizeWritingInput();
  }
  const feedback = document.getElementById("writing-feedback");
  if (feedback) {
    feedback.textContent = "";
    feedback.classList.remove("success", "error");
  }
  const reviewed = document.getElementById("writing-reviewed");
  if (reviewed) {
    reviewed.hidden = true;
    reviewed.innerHTML = "";
  }
  const answerOriginal = document.getElementById("writing-answer-original");
  if (answerOriginal) {
    answerOriginal.hidden = true;
    answerOriginal.textContent = "";
  }
}

function resetWritingState() {
  state.writingMethod = "visible";
  resetWritingAttempt();
}

function enterWriting() {
  if (!state.queue[state.queueIndex]) return;
  resetWritingState();
  showScreen("writing");
  renderWriting();
}

function exitWriting() {
  resetWritingState();
  showScreen("card");
  if (state.mode === "sequential") {
    updateModeButtons();
    renderCard();
  } else {
    switchToSequential();
  }
}

function exitWritingToToc() {
  resetWritingState();
  state.mode = "sequential";
  state.singleVerseCheck = false;
  state.pausedRandomSession = null;
  showScreen("toc");
  renderToc();
  requestAnimationFrame(() => window.scrollTo(0, state.tocScrollY));
}

function checkCurrentWritingChunk() {
  if (state.writingMethod !== "visible") return false;
  const verseId = state.queue[state.queueIndex];
  const found = findVerseById(verseId);
  if (!found) return false;
  const chunks = getWritingChunks(found.verse);
  const input = document.getElementById("writing-input");
  const feedback = document.getElementById("writing-feedback");
  const progress = state.writingProgress;

  if (progress >= chunks.length) {
    return false;
  }

  const currentChunk = chunks[progress];
  const segmentStart = Math.min(state.writingSegmentStart, input.value.length);
  const currentInput = input.value.slice(segmentStart);
  const isMatch = normalizeWritingText(currentChunk) === normalizeWritingText(currentInput) && normalizeWritingText(currentInput).length > 0;

  if (!isMatch) return false;

  const nextProgress = progress + 1;
  const completed = nextProgress >= chunks.length;
  state.writingProgress = nextProgress;
  state.writingSegmentStart = input.value.length;
  state.writingCompleted = completed;
  renderWritingOriginal(found.verse);
  feedback.textContent = completed ? "필사를 완료했어요." : "";
  feedback.classList.toggle("success", completed);
  feedback.classList.remove("error");
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  return true;
}

function selectWritingMethod(method) {
  if (state.writingMethod === method) return;
  state.writingMethod = method;
  resetWritingAttempt();
  renderWriting();
  document.getElementById("writing-input").focus();
}

function checkRecallWriting() {
  if (state.writingMethod !== "recall" || state.writingChecked) return;
  const found = findVerseById(state.queue[state.queueIndex]);
  if (!found) return;
  const input = document.getElementById("writing-input");
  const draft = input.value;
  const completed = normalizeWritingText(found.verse.text) === normalizeWritingText(draft) && normalizeWritingText(draft).length > 0;
  const comparisonResult = getWritingComparison(found.verse.text, draft);

  state.writingChecked = true;
  state.writingCompleted = completed;
  input.hidden = true;
  document.getElementById("btn-writing-check").style.display = "none";
  document.getElementById("btn-writing-retry").style.display = "block";

  const feedback = document.getElementById("writing-feedback");
  feedback.textContent = completed ? "필사를 완료했어요." : "원문과 다른 부분을 확인해 보세요.";
  feedback.classList.toggle("success", completed);
  feedback.classList.toggle("error", !completed);

  const reviewed = document.getElementById("writing-reviewed");
  document.getElementById("writing-input-label").textContent = "내가 쓴 말씀";
  reviewed.hidden = false;
  reviewed.innerHTML = comparisonResult.reviewedHtml || "<span class=\"writing-empty-answer\">입력한 내용이 없어요.</span>";

  const answerOriginal = document.getElementById("writing-answer-original");
  answerOriginal.hidden = false;
  answerOriginal.innerHTML = `<div class="writing-answer-label">원문 전체</div><div class="writing-answer-text">${comparisonResult.originalReviewedHtml}</div>`;
}

function retryRecallWriting() {
  if (state.writingMethod !== "recall") return;
  resetWritingAttempt();
  renderWriting();
  document.getElementById("writing-input").focus();
}

function goNext() {
  if (state.mode === "random") {
    state.queueIndex += 1;
    if (state.queueIndex >= state.queue.length) {
      state.queue = shuffle(state.queue.slice());
      state.queueIndex = 0;
    }
  } else if (state.queueIndex >= state.queue.length - 1) {
    const nextBook = BOOKS[BOOKS.findIndex(b => b.id === state.activeBookTab) + 1];
    if (nextBook) {
      state.activeBookTab = nextBook.id;
      state.queue = getBookVerseIds(nextBook.id);
      state.queueIndex = 0;
    }
  } else {
    state.queueIndex += 1;
  }
  resetPracticeState();
  renderCard();
}

function goPrev() {
  if (state.singleVerseCheck) {
    const currentVerseId = state.queue[state.queueIndex];
    const found = findVerseById(currentVerseId);
    if (!found) return;
    const { book } = found;
    state.activeBookTab = book.id;
    state.mode = "sequential";
    state.singleVerseCheck = false;
    state.queue = getBookVerseIds(book.id);
    const idx = state.queue.indexOf(currentVerseId);
    state.queueIndex = Math.max(idx - 1, 0);
    resetPracticeState();
    updateModeButtons();
    renderCard();
    return;
  }
  if (state.mode === "random") {
    state.queueIndex = (state.queueIndex - 1 + state.queue.length) % state.queue.length;
  } else {
    state.queueIndex = Math.max(state.queueIndex - 1, 0);
  }
  resetPracticeState();
  renderCard();
}

/* ---------- 랜덤 범위 선택 모달 ---------- */
let modalTriggerEl = null;
let modalKeydownHandler = null;

function getFocusableElements(container) {
  return Array.from(
    container.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
  ).filter(el => el.offsetParent !== null);
}

function openRangeModal() {
  modalTriggerEl = document.activeElement;
  const overlay = document.getElementById("modal-range");
  const sheet = overlay.querySelector(".modal-sheet");
  overlay.classList.add("visible");
  document.body.classList.add("modal-open");
  // 모달을 다시 열 때는 항상 범위 목록 화면부터 보여준다 — 지난번에
  // 말씀구절 선택 화면에 있다가 닫았어도 재진입 시 목록부터 시작한다.
  hideCustomPickerScreen();
  selectScope(state.pendingScope);

  const focusables = getFocusableElements(sheet);
  (focusables[0] || sheet).focus();

  modalKeydownHandler = e => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeRangeModal();
      return;
    }
    if (e.key !== "Tab") return;
    const items = getFocusableElements(sheet);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener("keydown", modalKeydownHandler);
}

function closeRangeModal() {
  document.getElementById("modal-range").classList.remove("visible");
  document.body.classList.remove("modal-open");
  if (modalKeydownHandler) {
    document.removeEventListener("keydown", modalKeydownHandler);
    modalKeydownHandler = null;
  }
  if (modalTriggerEl) {
    modalTriggerEl.focus();
    modalTriggerEl = null;
  }
}

function selectScope(scope) {
  state.pendingScope = scope;
  document.querySelectorAll(".range-option").forEach(btn => {
    const isSelected = btn.dataset.scope === scope;
    btn.classList.toggle("selected", isSelected);
    btn.setAttribute("aria-pressed", String(isSelected));
  });
}

// "말씀구절 선택"을 누르면 같은 바텀시트 안에서 범위 목록 대신 권 탭 +
// 구절 체크리스트 화면으로 전환한다. "← 범위 선택"으로 돌아가도
// 펼쳐둔 권과 체크 상태(state.pendingCustomOpenBook/pendingCustomIds)는
// 그대로 남는다 — 다시 들어오면 이어서 보인다.
function showCustomPickerScreen() {
  if (state.pendingCustomOpenBook == null) {
    const activeBookExists = BOOKS.some(book => book.id === state.activeBookTab);
    state.pendingCustomOpenBook = activeBookExists ? state.activeBookTab : BOOKS[0].id;
  }
  document.getElementById("range-option-list").style.display = "none";
  document.getElementById("custom-picker-screen").classList.add("visible");
  document.getElementById("modal-range-title").style.display = "none";
  document.getElementById("btn-picker-back").style.display = "";
  renderCustomPicker();
}

function hideCustomPickerScreen() {
  document.getElementById("custom-picker-screen").classList.remove("visible");
  document.getElementById("range-option-list").style.display = "";
  document.getElementById("modal-range-title").style.display = "";
  document.getElementById("btn-picker-back").style.display = "none";
}

// "이 범위로 시작" 버튼은 말씀구절 선택 화면 안에 있으므로 화면 자체가
// 숨겨지면 함께 숨겨진다 — 여기서는 그 화면이 보이는 동안, 하나 이상
// 골랐을 때만 나타나게 개수만 확인한다.
function updateApplyRangeButton() {
  const actions = document.querySelector(".modal-actions");
  const btn = document.getElementById("btn-apply-range");
  const count = state.pendingCustomIds.size;
  if (count > 0) {
    actions.style.display = "flex";
    btn.textContent = `이 범위로 시작 (${count}/${getAllVerseIds().length})`;
  } else {
    actions.style.display = "none";
  }
}

function renderCustomPicker() {
  renderCustomPickerTabs();
  renderCustomPickerPanel();
  updateApplyRangeButton();
}

function renderCustomPickerTabs() {
  const container = document.getElementById("custom-picker-tabs");
  container.innerHTML = "";
  BOOKS.forEach(book => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isActive = state.pendingCustomOpenBook === book.id;
    btn.className = "book-tab" + (isActive ? " active" : "");
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(isActive));
    btn.setAttribute("aria-pressed", String(isActive));
    btn.textContent = book.title;
    btn.addEventListener("click", () => {
      state.pendingCustomOpenBook = book.id;
      renderCustomPicker();
    });
    container.appendChild(btn);
  });
}

function renderCustomPickerPanel() {
  const panel = document.getElementById("custom-picker-panel");
  const toolbar = document.getElementById("custom-picker-toolbar");
  const list = document.getElementById("custom-picker-list");
  toolbar.innerHTML = "";
  list.innerHTML = "";

  const bookId = state.pendingCustomOpenBook;
  panel.classList.toggle("open", bookId != null);
  if (bookId == null) return;

  const verseIds = getBookVerseIds(bookId);
  const checkedCount = verseIds.filter(id => state.pendingCustomIds.has(id)).length;
  const allChecked = checkedCount === verseIds.length;

  const selectAllBtn = document.createElement("button");
  selectAllBtn.type = "button";
  selectAllBtn.className = "custom-picker-select-all";
  selectAllBtn.textContent = allChecked ? "전체 해제" : "전체 선택";
  selectAllBtn.addEventListener("click", () => {
    verseIds.forEach(id => {
      if (allChecked) {
        state.pendingCustomIds.delete(id);
      } else {
        state.pendingCustomIds.add(id);
      }
    });
    renderCustomPickerPanel();
    updateApplyRangeButton();
  });
  const countLabel = document.createElement("span");
  countLabel.className = "custom-picker-count-label";
  countLabel.textContent = `${checkedCount}개 선택`;
  toolbar.appendChild(selectAllBtn);
  toolbar.appendChild(countLabel);

  const book = BOOKS.find(b => b.id === bookId);
  book.lessons.flatMap(lesson => lesson.verses).forEach(verse => {
    const label = document.createElement("label");
    label.className = "custom-picker-item";
    const isChecked = state.pendingCustomIds.has(verse.id);
    label.classList.toggle("checked", isChecked);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isChecked;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.pendingCustomIds.add(verse.id);
      } else {
        state.pendingCustomIds.delete(verse.id);
      }
      label.classList.toggle("checked", checkbox.checked);
      // 전체선택 버튼 라벨·개수 표시를 갱신한다(패널을 접지는 않음).
      renderCustomPickerPanel();
      updateApplyRangeButton();
    });

    const span = document.createElement("span");
    span.textContent = verse.ref;

    label.appendChild(checkbox);
    label.appendChild(span);
    list.appendChild(label);
  });
}

function applyRange() {
  let ids;
  switch (state.pendingScope) {
    case "currentBook":
      // "전체" 책 탭이 선택된 상태에서는 특정 권이 없으므로 전체 구절로
      // 대체한다 — 안 그러면 getBookVerseIds("all")가 빈 배열을 돌려줘
      // 범위가 없다는 경고만 뜨고, 이전에 남아 있던 상태(예: 말씀익히기
      // 페이지에서 단일 구절 확인으로 들어갔던 state.singleVerseCheck/
      // queue)가 그대로 남아버린다.
      ids = state.activeBookTab === "all" ? getAllVerseIds() : getBookVerseIds(state.activeBookTab);
      break;
    case "all":
      ids = getAllVerseIds();
      break;
    case "learning":
    case "partial":
    case "memorized": {
      const statusMap = getStatusMap();
      ids = getAllVerseIds().filter(id => (statusMap[id] || "learning") === state.pendingScope);
      break;
    }
    case "custom":
      ids = Array.from(state.pendingCustomIds);
      break;
    default:
      ids = [];
  }

  if (!ids || ids.length === 0) {
    alert("선택한 범위에 구절이 없습니다.");
    return;
  }

  state.mode = "random";
  state.singleVerseCheck = false;
  state.pausedRandomSession = null;
  state.queue = shuffle(ids.slice());
  state.queueIndex = 0;
  resetPracticeState();
  closeRangeModal();
  updateModeButtons();
  showScreen("card");
  renderCard();
}

function initAutoAdvanceHelp() {
  const btn = document.getElementById("btn-auto-advance-help");
  const popover = document.getElementById("auto-advance-popover");
  const wrap = document.getElementById("auto-advance-help-wrap");
  if (!btn || !popover || !wrap) return;

  function positionPopover() {
    const btnRect = btn.getBoundingClientRect();
    const margin = 8;
    popover.style.visibility = "hidden";
    popover.classList.add("visible");
    const popRect = popover.getBoundingClientRect();
    let left = btnRect.right - popRect.width;
    left = Math.max(margin, Math.min(left, window.innerWidth - popRect.width - margin));
    let top = btnRect.bottom + margin;
    if (top + popRect.height > window.innerHeight - margin) {
      top = btnRect.top - popRect.height - margin;
    }
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.style.visibility = "";
  }

  let pinned = false;

  function open() {
    positionPopover();
    btn.setAttribute("aria-expanded", "true");
  }
  function close() {
    popover.classList.remove("visible");
    btn.setAttribute("aria-expanded", "false");
  }

  btn.addEventListener("click", e => {
    e.stopPropagation();
    pinned = !pinned;
    if (pinned) open();
    else close();
  });
  wrap.addEventListener("mouseenter", () => {
    if (!pinned) open();
  });
  wrap.addEventListener("mouseleave", () => {
    if (!pinned) close();
  });
  document.addEventListener("click", e => {
    if (!wrap.contains(e.target)) {
      pinned = false;
      close();
    }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      pinned = false;
      close();
    }
  });
}

function enterFromStart() {
  if (getLastVerseId()) {
    continueLearning();
  } else {
    showScreen("toc");
    renderToc();
  }
}

/* ---------- 초기화 ---------- */
function init() {
  const startScreen = document.getElementById("screen-start");
  startScreen.addEventListener("click", enterFromStart);
  startScreen.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      enterFromStart();
    }
  });
  const tocSearchInput = document.getElementById("toc-search-input");
  const tocSearchClear = document.getElementById("toc-search-clear");
  document.querySelector(".toc-search").addEventListener("click", e => {
    if (!e.target.closest("button")) tocSearchInput.focus();
  });
  tocSearchInput.addEventListener("input", e => {
    state.tocSearch = e.target.value;
    tocSearchClear.classList.toggle("visible", e.target.value.length > 0);
    renderLessonList();
  });
  tocSearchClear.addEventListener("click", () => {
    tocSearchInput.value = "";
    state.tocSearch = "";
    tocSearchClear.classList.remove("visible");
    renderLessonList();
    tocSearchInput.focus();
  });

  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.setAttribute("aria-pressed", String(btn.classList.contains("active")));
    btn.addEventListener("click", () => {
      const alreadyActive = btn.classList.contains("active");
      state.tocFilter = alreadyActive ? "all" : btn.dataset.filter;
      document.querySelectorAll(".filter-btn").forEach(b => {
        const isActive = !alreadyActive && b === btn;
        b.classList.toggle("active", isActive);
        b.setAttribute("aria-pressed", String(isActive));
      });
      renderLessonList();
    });
  });
  document.getElementById("btn-toc-random").addEventListener("click", () => {
    state.tocScrollY = window.scrollY;
    openRangeModal();
  });
  document.getElementById("btn-toc-home").addEventListener("click", () => {
    showScreen("start");
    restartStartHero();
  });

  document.getElementById("btn-back-toc").addEventListener("click", () => {
    if (state.mode === "random" && !state.singleVerseCheck) {
      openRangeModal();
      return;
    }
    // 말씀익히기 페이지에서 "현재 구절만" 확인하던 상태(암송점검 토글로
    // 들어간 단일 구절 확인)를 목록으로 나가면서 닫는다 — 안 그러면 이
    // 값이 남아 있다가 목록의 암송점검이 다시 열릴 때 영향을 줄 수 있다.
    state.mode = "sequential";
    state.singleVerseCheck = false;
    state.pausedRandomSession = null;
    showScreen("toc");
    renderToc();
    // 목록 레이아웃이 자리잡은 다음 프레임에 복원해야 스크롤 높이가
    // 아직 확정되지 않은 상태에서 어긋나는 일이 없다.
    requestAnimationFrame(() => window.scrollTo(0, state.tocScrollY));
  });
  document.getElementById("recitation-mode-label").addEventListener("click", () => {
    if (state.mode !== "random") return;
    state.mode = "sequential";
    state.singleVerseCheck = false;
    state.pausedRandomSession = null;
    showScreen("toc");
    renderToc();
    requestAnimationFrame(() => window.scrollTo(0, state.tocScrollY));
  });
  document.getElementById("btn-mode-sequential").addEventListener("click", switchToSequential);
  document.getElementById("btn-mode-writing").addEventListener("click", enterWriting);
  document.getElementById("btn-writing-toc").addEventListener("click", exitWritingToToc);
  document.getElementById("btn-writing-mode-sequential").addEventListener("click", exitWriting);
  document.getElementById("btn-writing-visible").addEventListener("click", () => selectWritingMethod("visible"));
  document.getElementById("btn-writing-recall").addEventListener("click", () => selectWritingMethod("recall"));
  document.getElementById("btn-writing-check").addEventListener("click", checkRecallWriting);
  document.getElementById("btn-writing-retry").addEventListener("click", retryRecallWriting);
  document.getElementById("writing-input").addEventListener("input", e => {
    const verseId = state.queue[state.queueIndex];
    if (!verseId) return;
    const found = findVerseById(verseId);
    if (!found) return;
    const chunks = getWritingChunks(found.verse);
    resizeWritingInput();
    if (state.writingCompleted || state.writingProgress >= chunks.length) return;
    const feedback = document.getElementById("writing-feedback");
    feedback.textContent = "";
    feedback.classList.remove("success", "error");
    if (!e.isComposing) checkCurrentWritingChunk();
  });
  document.getElementById("writing-input").addEventListener("compositionend", checkCurrentWritingChunk);
  window.addEventListener("resize", resizeWritingInput);
  document.getElementById("btn-writing-prev").addEventListener("click", () => {
    resetWritingAttempt();
    goPrev();
    renderWriting();
  });
  document.getElementById("btn-writing-next").addEventListener("click", () => {
    resetWritingAttempt();
    goNext();
    renderWriting();
  });

  const verseCard = document.getElementById("verse-card");
  let touchStartX = 0;
  let touchStartY = 0;
  let isHorizontalSwipe = false;
  let swipeHandled = false;
  let ignoreCardSwipe = false;
  const SWIPE_THRESHOLD = 50;

  verseCard.addEventListener("touchstart", e => {
    ignoreCardSwipe = e.touches.length !== 1 || Boolean(e.target.closest("button, input, textarea, select, a, label, [contenteditable]"));
    if (ignoreCardSwipe) return;
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    isHorizontalSwipe = false;
  }, { passive: true });

  verseCard.addEventListener("touchmove", e => {
    if (ignoreCardSwipe) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      isHorizontalSwipe = true;
    }
  }, { passive: true });

  verseCard.addEventListener("touchend", e => {
    if (ignoreCardSwipe || !isHorizontalSwipe) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    swipeHandled = true;
    if (dx < 0) {
      if (!document.getElementById("btn-next").disabled) goNext();
    } else {
      if (!document.getElementById("btn-prev").disabled) goPrev();
    }
  });

  verseCard.addEventListener("click", () => {
    if (swipeHandled) {
      swipeHandled = false;
      return;
    }
    if (state.mode === "random") {
      state.randomRevealed = !state.randomRevealed;
      renderCard();
    }
  });

  document.getElementById("practice-tabs").addEventListener("click", e => {
    const btn = e.target.closest(".practice-tab");
    if (!btn) return;
    e.stopPropagation();
    const mode = btn.dataset.mode;
    state.practiceMode = mode;
    // 탭을 직접 눌러 들어온 것이므로("이 루트"가 아니므로) 첫 글자→전체
    // 확인 경로에서만 뜨는 암송 상태 기록 안내는 끈다.
    state.showRecitationHint = false;
    if (mode === "lineByLine") {
      state.lineByLineStep = 1;
    } else if (mode === "progressive") {
      state.progressiveStage = 0;
      state.progressiveDone = false;
      state.revealedHints = new Set();
    } else if (mode === "initials") {
      state.initialsStage = "letters";
    }
    renderCard();
  });

  document.getElementById("practice-body").addEventListener("click", e => {
    const target = e.target.closest("[data-action]");
    if (!target) return;
    e.stopPropagation();
    const action = target.dataset.action;
    if (action === "lbl-next") {
      state.lineByLineStep += 1;
    } else if (action === "toggle-reveal") {
      const idx = Number(target.dataset.idx);
      if (state.revealedHints.has(idx)) {
        state.revealedHints.delete(idx);
      } else {
        state.revealedHints.add(idx);
        const found = findVerseById(state.queue[state.queueIndex]);
        if (found) {
          const maskIndices = getMaskIndices(found.verse, state.progressiveStage);
          const allRevealed = maskIndices.size > 0 && [...maskIndices].every(i => state.revealedHints.has(i));
          if (allRevealed) {
            if (state.progressiveStage >= MASK_STAGE_COUNT - 1) {
              state.progressiveDone = true;
            } else {
              state.progressiveStage += 1;
            }
          }
        }
      }
    } else if (action === "prog-restart") {
      state.progressiveStage = 0;
      state.progressiveDone = false;
      state.revealedHints = new Set();
    } else if (action === "initials-check") {
      state.initialsStage = "hidden";
    } else if (action === "initials-reveal") {
      // 첫 글자 탭에서 "전체 본문 확인"을 누르면 전체 탭으로 넘어가고,
      // 이 경로로 왔을 때만 전체 탭 아래에 암송 상태 기록 안내가 뜬다.
      state.practiceMode = "full";
      state.initialsStage = "letters";
      state.showRecitationHint = true;
    }
    renderCard();
  });

  document.getElementById("btn-prev").addEventListener("click", e => {
    e.stopPropagation();
    goPrev();
  });
  document.getElementById("btn-next").addEventListener("click", e => {
    e.stopPropagation();
    goNext();
  });

  document.querySelectorAll(".status-chip").forEach(chip => {
    chip.addEventListener("click", e => {
      // status-chip은 verse-card 안에 있어서, 막지 않으면 클릭이 verseCard의
      // 뒤집기(random 모드 collapse/reveal 토글) 리스너까지 버블링돼 상태를
      // 고른 직후 카드가 도로 뒤집혀 버린다.
      e.stopPropagation();
      setVerseStatus(state.queue[state.queueIndex], chip.dataset.status);
      renderCard();
      if (state.autoAdvance) {
        clearTimeout(state.autoAdvanceTimer);
        state.autoAdvanceTimer = setTimeout(() => goNext(), 300);
      }
    });
  });

  const autoAdvanceChk = document.getElementById("chk-auto-advance");
  state.autoAdvance = getAutoAdvance();
  autoAdvanceChk.checked = state.autoAdvance;
  autoAdvanceChk.addEventListener("change", () => {
    state.autoAdvance = autoAdvanceChk.checked;
    setAutoAdvance(state.autoAdvance);
  });

  initAutoAdvanceHelp();

  document.getElementById("btn-font-decrease").addEventListener("click", e => {
    // font-size-control도 verse-card 안에 있어 같은 이유로 버블링을 막는다.
    e.stopPropagation();
    const idx = FONT_SIZE_STEPS.indexOf(state.verseFontSize);
    state.verseFontSize = FONT_SIZE_STEPS[Math.max(idx - 1, 0)];
    setVerseFontSize(state.verseFontSize);
    applyVerseFontSize();
  });
  document.getElementById("btn-font-increase").addEventListener("click", e => {
    e.stopPropagation();
    const idx = FONT_SIZE_STEPS.indexOf(state.verseFontSize);
    state.verseFontSize = FONT_SIZE_STEPS[Math.min(idx + 1, FONT_SIZE_STEPS.length - 1)];
    setVerseFontSize(state.verseFontSize);
    applyVerseFontSize();
  });

  document.querySelectorAll(".range-option").forEach(btn => {
    btn.addEventListener("click", () => {
      selectScope(btn.dataset.scope);
      if (btn.dataset.scope === "custom") {
        showCustomPickerScreen();
      } else {
        applyRange();
      }
    });
  });
  document.getElementById("btn-picker-back").addEventListener("click", hideCustomPickerScreen);
  document.getElementById("btn-apply-range").addEventListener("click", applyRange);
  document.getElementById("btn-close-modal").addEventListener("click", closeRangeModal);
  document.getElementById("modal-range").addEventListener("click", e => {
    if (e.target.id === "modal-range") closeRangeModal();
  });

  // PWA를 백그라운드로 보내도(홈으로 나가기/앱 전환 등) 웹뷰가 그대로
  // 살아 있다가 다시 열리면 나갈 때 보이던 화면이 그대로 이어서
  // 보인다 — 암송 화면(카드)에 있다가 나가면 다음에 열었을 때 목록
  // 대신 그 화면이 바로 보이는 문제. 백그라운드로 가는 시점에 목차로
  // 미리 전환해 둬서, 다시 열었을 때는 항상 목록부터 보이게 한다(어느
  // 말씀을 보고 있었는지는 목록의 연한보라색 표시로 확인할 수 있다).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    const cardActive = document.getElementById("screen-card").classList.contains("active");
    const writingActive = document.getElementById("screen-writing").classList.contains("active");
    if (!cardActive && !writingActive) return;
    if (writingActive) resetWritingState();
    showScreen("toc");
    renderToc();
  });

  initStartHero();
}

init();
