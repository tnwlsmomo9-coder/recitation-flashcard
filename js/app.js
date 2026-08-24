import { BOOKS, findVerseById, getAllVerseIds, getBookVerseIds, getLessonVerseIds } from "./data.js";
import { getLastVerseId, setLastVerseId, getStatusMap, getVerseStatus, setVerseStatus, getAutoAdvance, setAutoAdvance, getVerseFontSize, setVerseFontSize } from "./storage.js";
import { toInitials } from "./initials.js";
import { getMemorizationChunks, getMaskIndices, MASK_STAGE_COUNT } from "./practice.js";
import { initStartHero } from "./startHero.js";

const STATUS_SYMBOL = { memorized: "✓", partial: "◐", learning: "○" };
const STATUS_LABEL = { memorized: "✓ 암기 완료", partial: "◐ 부분 암기", learning: "○ 더 익히기" };
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
  tocFilter: "all",
  practiceMode: "full",
  lineByLineStep: 1,
  progressiveStage: 0,
  progressiveDone: false,
  revealedHints: new Set(),
  autoAdvance: true,
  autoAdvanceTimer: null,
  verseFontSize: clampToFontStep(getVerseFontSize()),
  randomRevealed: false,
  singleVerseCheck: false
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
function renderStart() {
  document.getElementById("btn-continue-start").style.display = getLastVerseId() ? "block" : "none";
}

function continueLearning() {
  const lastId = getLastVerseId();
  if (!lastId) return;
  const found = findVerseById(lastId);
  if (!found) return;
  const { book } = found;
  state.activeBookTab = book.id;
  state.mode = "sequential";
  state.singleVerseCheck = false;
  state.queue = getBookVerseIds(book.id);
  state.queueIndex = state.queue.indexOf(lastId);
  resetPracticeState();
  updateModeButtons();
  showScreen("card");
  renderCard();
}

/* ---------- 목차 화면 ---------- */
function renderToc() {
  renderContinueBanner();
  renderBookTabs();
  renderLessonList();
}

function renderContinueBanner() {
  document.getElementById("continue-banner").classList.toggle("visible", !!getLastVerseId());
}

function renderBookTabs() {
  const container = document.getElementById("book-tabs");
  container.innerHTML = "";
  BOOKS.forEach(book => {
    const btn = document.createElement("button");
    btn.className = "book-tab" + (book.id === state.activeBookTab ? " active" : "");
    btn.textContent = book.title;
    btn.addEventListener("click", () => {
      state.activeBookTab = book.id;
      const filterEl = document.getElementById("status-filter");
      filterEl.dataset.book = book.id;
      filterEl.classList.add("visible");
      state.tocFilter = "all";
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      renderBookTabs();
      renderLessonList();
    });
    container.appendChild(btn);
  });
}

function lessonMatchesFilter(lesson, statusMap, filter) {
  if (filter === "all") return true;
  return lesson.verses.some(v => (statusMap[v.id] || "learning") === filter);
}

function renderLessonList() {
  const list = document.getElementById("lesson-list");
  list.innerHTML = "";
  const book = BOOKS.find(b => b.id === state.activeBookTab);
  const statusMap = getStatusMap();

  const visibleLessons = book.lessons.filter(lesson => lessonMatchesFilter(lesson, statusMap, state.tocFilter));

  if (visibleLessons.length === 0) {
    const li = document.createElement("li");
    li.className = "lesson-empty type-body";
    li.textContent = "해당하는 구절이 없습니다.";
    list.appendChild(li);
    return;
  }

  visibleLessons.forEach(lesson => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "lesson-item";
    const statusDots = lesson.verses
      .map(v => {
        const status = statusMap[v.id] || "learning";
        return `<span class="status-dot status-${status}">${STATUS_SYMBOL[status]}</span>`;
      })
      .join("");
    const refs = lesson.verses.map(v => v.ref).join(" · ");
    btn.innerHTML = `
      <div class="lesson-main">
        <div class="lesson-heading">
          <span class="lesson-number type-caption">${lesson.id}과</span>
          <span class="lesson-title">${lesson.title}</span>
        </div>
        <div class="lesson-refs type-caption">${refs}</div>
      </div>
      <span class="lesson-status">${statusDots}</span>
    `;
    btn.addEventListener("click", () => enterLesson(book.id, lesson.id));
    li.appendChild(btn);
    list.appendChild(li);
  });
}

function enterLesson(bookId, lessonId) {
  state.activeBookTab = bookId;
  state.mode = "sequential";
  state.singleVerseCheck = false;
  state.queue = getBookVerseIds(bookId);
  const firstVerseId = getLessonVerseIds(bookId, lessonId)[0];
  state.queueIndex = state.queue.indexOf(firstVerseId);
  resetPracticeState();
  updateModeButtons();
  showScreen("card");
  renderCard();
}

function checkCurrentVerse() {
  const currentVerseId = state.queue[state.queueIndex];
  if (!currentVerseId) return;
  state.mode = "random";
  state.singleVerseCheck = true;
  state.queue = [currentVerseId];
  state.queueIndex = 0;
  resetPracticeState();
  updateModeButtons();
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
  state.randomRevealed = false;
}

function updateModeButtons() {
  const seqBtn = document.getElementById("btn-mode-sequential");
  const randBtn = document.getElementById("btn-mode-random");
  seqBtn.classList.toggle("active", state.mode === "sequential");
  randBtn.classList.toggle("active", state.mode === "random");
}

function switchToSequential() {
  const currentVerseId = state.queue[state.queueIndex];
  const found = findVerseById(currentVerseId);
  if (!found) return;
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
  const chunks = getMemorizationChunks(verse);
  const step = Math.min(state.lineByLineStep, chunks.length);
  const isDone = step >= chunks.length;

  if (isDone) {
    return `<div class="verse-text-inner">${escapeHtml(verse.text)}</div>`;
  }

  const shown = chunks.slice(0, step).join(" ");
  return `
    <div class="lbl-tap-area" data-action="lbl-next">
      <div class="lbl-flow">${escapeHtml(shown)}</div>
      <div class="lbl-hint">눌러서 이어 보기</div>
    </div>
  `;
}

function renderProgressiveHtml(verse) {
  if (state.progressiveDone) {
    return `
      <div class="prog-done">
        <div class="practice-feedback prog-done-heading">여기까지 기억했어요</div>
        <div class="lbl-text">${escapeHtml(verse.text)}</div>
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
      return `<span class="word revealed" data-action="toggle-reveal" data-idx="${i}">${escapeHtml(word)}</span>`;
    }
    return `<span class="blank" data-action="toggle-reveal" data-idx="${i}">?</span>`;
  });

  return `<div class="prog-text">${wordSpans.join(" ")}</div>`;
}

function renderInitialsHtml(verse) {
  return `<div class="initials-text">${escapeHtml(toInitials(verse.text))}</div>`;
}

function renderPracticePanel(verseId, verse) {
  document.querySelectorAll(".practice-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.mode === state.practiceMode);
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
  const isCollapsed = isRandom && !state.randomRevealed;
  verseCard.classList.toggle("collapsed", isCollapsed);
  tapHint.style.display = isCollapsed ? "flex" : "none";
  fontControl.style.display = isCollapsed ? "none" : "flex";
  tabs.style.display = isCollapsed || isRandom ? "none" : "flex";
  statusPanel.style.display = isCollapsed ? "none" : "flex";
  statusBadge.style.display = isCollapsed ? "none" : "";
  autoAdvanceRow.style.display = isCollapsed || state.singleVerseCheck ? "none" : "flex";

  if (isCollapsed) {
    cardText.style.display = "none";
    body.style.display = "none";
    body.innerHTML = "";
    return;
  }

  const isFull = isRandom || state.practiceMode === "full";
  cardText.style.display = isFull ? "" : "none";
  body.style.display = isFull ? "none" : "flex";

  if (isFull) {
    body.innerHTML = "";
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
  document.getElementById("card-title").textContent = lesson.title;
  document.getElementById("card-ref").textContent = verse.ref;
  document.getElementById("card-text").innerHTML = renderVerseTextWithEmphasis(verse.text);
  applyVerseFontSize();

  const rawStatus = getStatusMap()[verseId];
  document.getElementById("card-status-badge").textContent = rawStatus ? STATUS_LABEL[rawStatus] : "";
  document.querySelectorAll(".status-chip").forEach(chip => {
    chip.classList.toggle("active", chip.dataset.status === rawStatus);
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
function openRangeModal() {
  document.getElementById("modal-range").classList.add("visible");
  selectScope(state.pendingScope);
}

function closeRangeModal() {
  document.getElementById("modal-range").classList.remove("visible");
}

function selectScope(scope) {
  state.pendingScope = scope;
  document.querySelectorAll(".range-option").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.scope === scope);
  });
  const customList = document.getElementById("custom-picker-list");
  const isCustom = scope === "custom";
  document.querySelector(".modal-actions").style.display = isCustom ? "flex" : "none";
  if (isCustom) {
    customList.classList.add("visible");
    renderCustomPicker();
  } else {
    customList.classList.remove("visible");
  }
}

function renderCustomPicker() {
  const container = document.getElementById("custom-picker-list");
  container.innerHTML = "";
  BOOKS.forEach(book => {
    book.lessons.forEach(lesson => {
      lesson.verses.forEach(verse => {
        const label = document.createElement("label");
        label.className = "custom-picker-item";
        const isChecked = state.pendingCustomIds.has(verse.id);
        label.classList.toggle("checked", isChecked);
        label.title = `${book.title} ${lesson.id}과 ${verse.id.split("-")[2]} · ${verse.ref}`;

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
        });

        const span = document.createElement("span");
        span.textContent = `${book.id}-${lesson.id}${verse.id.split("-")[2]}`;

        label.appendChild(checkbox);
        label.appendChild(span);
        container.appendChild(label);
      });
    });
  });
}

function applyRange() {
  let ids;
  switch (state.pendingScope) {
    case "currentBook":
      ids = getBookVerseIds(state.activeBookTab);
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

/* ---------- 초기화 ---------- */
function init() {
  document.getElementById("btn-continue-start").addEventListener("click", continueLearning);
  document.getElementById("btn-start").addEventListener("click", () => {
    showScreen("toc");
    renderToc();
  });
  document.getElementById("btn-continue-toc").addEventListener("click", continueLearning);

  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.tocFilter = btn.dataset.filter;
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.toggle("active", b === btn));
      renderLessonList();
    });
  });
  document.getElementById("btn-toc-random").addEventListener("click", openRangeModal);

  document.getElementById("btn-back-toc").addEventListener("click", () => {
    showScreen("toc");
    renderToc();
  });
  document.getElementById("btn-mode-sequential").addEventListener("click", switchToSequential);
  document.getElementById("btn-mode-random").addEventListener("click", checkCurrentVerse);

  const verseCard = document.getElementById("verse-card");
  let touchStartX = 0;
  let touchStartY = 0;
  let isHorizontalSwipe = false;
  let swipeHandled = false;
  const SWIPE_THRESHOLD = 50;

  verseCard.addEventListener("touchstart", e => {
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    isHorizontalSwipe = false;
  }, { passive: true });

  verseCard.addEventListener("touchmove", e => {
    const t = e.touches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      isHorizontalSwipe = true;
    }
  }, { passive: true });

  verseCard.addEventListener("touchend", e => {
    if (!isHorizontalSwipe) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    swipeHandled = true;
    if (dx < 0) {
      goNext();
    } else {
      goPrev();
    }
  });

  verseCard.addEventListener("click", () => {
    if (swipeHandled) {
      swipeHandled = false;
      return;
    }
    if (state.mode === "random" && !state.randomRevealed) {
      state.randomRevealed = true;
      renderCard();
    }
  });

  document.getElementById("practice-tabs").addEventListener("click", e => {
    const btn = e.target.closest(".practice-tab");
    if (!btn) return;
    const mode = btn.dataset.mode;
    state.practiceMode = mode;
    if (mode === "lineByLine") {
      state.lineByLineStep = 1;
    } else if (mode === "progressive") {
      state.progressiveStage = 0;
      state.progressiveDone = false;
      state.revealedHints = new Set();
    }
    renderCard();
  });

  document.getElementById("practice-body").addEventListener("click", e => {
    const target = e.target.closest("[data-action]");
    if (!target) return;
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
    }
    renderCard();
  });

  document.getElementById("btn-prev").addEventListener("click", () => goPrev());
  document.getElementById("btn-next").addEventListener("click", () => goNext());

  document.querySelectorAll(".status-chip").forEach(chip => {
    chip.addEventListener("click", () => {
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

  document.getElementById("btn-font-decrease").addEventListener("click", () => {
    const idx = FONT_SIZE_STEPS.indexOf(state.verseFontSize);
    state.verseFontSize = FONT_SIZE_STEPS[Math.max(idx - 1, 0)];
    setVerseFontSize(state.verseFontSize);
    applyVerseFontSize();
  });
  document.getElementById("btn-font-increase").addEventListener("click", () => {
    const idx = FONT_SIZE_STEPS.indexOf(state.verseFontSize);
    state.verseFontSize = FONT_SIZE_STEPS[Math.min(idx + 1, FONT_SIZE_STEPS.length - 1)];
    setVerseFontSize(state.verseFontSize);
    applyVerseFontSize();
  });

  document.querySelectorAll(".range-option").forEach(btn => {
    btn.addEventListener("click", () => {
      selectScope(btn.dataset.scope);
      if (btn.dataset.scope !== "custom") {
        applyRange();
      }
    });
  });
  document.getElementById("btn-apply-range").addEventListener("click", applyRange);
  document.getElementById("btn-close-modal").addEventListener("click", closeRangeModal);

  renderStart();
  initStartHero();
}

init();
