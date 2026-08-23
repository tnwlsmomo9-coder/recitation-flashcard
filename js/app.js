import { BOOKS, findVerseById, getAllVerseIds, getBookVerseIds, getLessonVerseIds } from "./data.js";
import { getLastVerseId, setLastVerseId, getStatusMap, getVerseStatus, setVerseStatus } from "./storage.js";
import { toInitials } from "./initials.js";

const STATUS_SYMBOL = { memorized: "✓", partial: "◐", learning: "○" };

const state = {
  activeBookTab: 1,
  mode: "sequential",
  queue: [],
  queueIndex: 0,
  showInitials: false,
  isFlipped: false,
  pendingScope: "currentBook",
  pendingCustomIds: new Set(),
  tocFilter: "all"
};

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
  state.queue = getBookVerseIds(book.id);
  state.queueIndex = state.queue.indexOf(lastId);
  state.isFlipped = false;
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
    btn.innerHTML = `
      <span class="lesson-number type-caption">${lesson.id}과</span>
      <span class="lesson-title type-body">${lesson.title}</span>
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
  state.queue = getBookVerseIds(bookId);
  const firstVerseId = getLessonVerseIds(bookId, lessonId)[0];
  state.queueIndex = state.queue.indexOf(firstVerseId);
  state.isFlipped = false;
  updateModeButtons();
  showScreen("card");
  renderCard();
}

/* ---------- 플래시카드 화면 ---------- */
function updateModeButtons() {
  const seqBtn = document.getElementById("btn-mode-sequential");
  const randBtn = document.getElementById("btn-mode-random");
  seqBtn.classList.toggle("btn-tint", state.mode === "sequential");
  seqBtn.classList.toggle("btn-outline", state.mode !== "sequential");
  randBtn.classList.toggle("btn-tint", state.mode === "random");
  randBtn.classList.toggle("btn-outline", state.mode !== "random");
}

function switchToSequential() {
  const currentVerseId = state.queue[state.queueIndex];
  const found = findVerseById(currentVerseId);
  if (!found) return;
  const { book } = found;
  state.activeBookTab = book.id;
  state.mode = "sequential";
  state.queue = getBookVerseIds(book.id);
  state.queueIndex = state.queue.indexOf(currentVerseId);
  state.isFlipped = false;
  updateModeButtons();
  renderCard();
}

function renderCard() {
  const verseId = state.queue[state.queueIndex];
  const found = findVerseById(verseId);
  if (!found) return;
  const { book, lesson, verse } = found;
  const verseLabel = verseId.split("-")[2];

  document.getElementById("front-meta").textContent = `${book.title} · ${lesson.id}과`;
  document.getElementById("front-title").textContent = lesson.title;
  document.getElementById("front-verse-no").textContent = `구절 ${verseLabel}`;

  document.getElementById("back-meta").textContent = `${book.title} · ${lesson.id}과 ${lesson.title}`;
  document.getElementById("back-ref").textContent = verse.ref;
  document.getElementById("back-text").textContent = state.showInitials ? toInitials(verse.text) : verse.text;

  document.getElementById("flashcard").classList.toggle("flipped", state.isFlipped);
  document.getElementById("btn-initials").classList.toggle("on", state.showInitials);

  const status = getVerseStatus(verseId);
  document.querySelectorAll(".status-chip").forEach(chip => {
    chip.classList.toggle("active", chip.dataset.status === status);
  });

  const prevBtn = document.getElementById("btn-prev");
  const nextBtn = document.getElementById("btn-next");
  if (state.mode === "sequential") {
    prevBtn.disabled = state.queueIndex === 0;
    nextBtn.disabled = state.queueIndex === state.queue.length - 1;
  } else {
    prevBtn.disabled = false;
    nextBtn.disabled = false;
  }

  prevBtn.textContent = "←";
  nextBtn.textContent = "→";
  prevBtn.classList.remove("label");
  nextBtn.classList.remove("label");

  if (state.mode === "sequential") {
    const nextId = state.queue[state.queueIndex + 1];
    const nextFound = nextId ? findVerseById(nextId) : null;
    if (nextFound && nextFound.lesson.id !== lesson.id) {
      nextBtn.textContent = `${nextFound.lesson.id}과`;
      nextBtn.classList.add("label");
    }

    const prevId = state.queue[state.queueIndex - 1];
    const prevFound = prevId ? findVerseById(prevId) : null;
    if (prevFound && prevFound.lesson.id !== lesson.id) {
      prevBtn.textContent = `${prevFound.lesson.id}과`;
      prevBtn.classList.add("label");
    }
  }

  setLastVerseId(verseId);
}

function goNext() {
  if (state.mode === "random") {
    state.queueIndex += 1;
    if (state.queueIndex >= state.queue.length) {
      state.queue = shuffle(state.queue.slice());
      state.queueIndex = 0;
    }
  } else {
    state.queueIndex = Math.min(state.queueIndex + 1, state.queue.length - 1);
  }
  state.isFlipped = false;
  renderCard();
}

function goPrev() {
  if (state.mode === "random") {
    state.queueIndex = (state.queueIndex - 1 + state.queue.length) % state.queue.length;
  } else {
    state.queueIndex = Math.max(state.queueIndex - 1, 0);
  }
  state.isFlipped = false;
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
  if (scope === "custom") {
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
  state.queue = shuffle(ids.slice());
  state.queueIndex = 0;
  state.isFlipped = false;
  closeRangeModal();
  updateModeButtons();
  showScreen("card");
  renderCard();
}

/* ---------- 시작 화면 커스텀 커서 / 매그네틱 버튼 ---------- */
function initHeroCursor() {
  const heroSection = document.getElementById("screen-start");
  const cursor = document.getElementById("hero-cursor");
  if (!heroSection || !cursor) return;
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  let mouseX = -100;
  let mouseY = -100;
  let cursorX = -100;
  let cursorY = -100;

  heroSection.addEventListener("mouseenter", () => {
    cursor.style.opacity = "1";
  });
  heroSection.addEventListener("mouseleave", () => {
    cursor.style.opacity = "0";
  });
  heroSection.addEventListener("mousemove", e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  function raf() {
    cursorX += (mouseX - cursorX) * 0.18;
    cursorY += (mouseY - cursorY) * 0.18;
    cursor.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0) translate(-50%, -50%)`;
    requestAnimationFrame(raf);
  }
  raf();

  document.querySelectorAll("#screen-start .btn-hero").forEach(btn => {
    btn.addEventListener("mouseenter", () => cursor.classList.add("cursor-hover"));
    btn.addEventListener("mouseleave", () => {
      cursor.classList.remove("cursor-hover");
      btn.style.transform = "";
    });
    btn.addEventListener("mousemove", e => {
      const rect = btn.getBoundingClientRect();
      const relX = e.clientX - rect.left - rect.width / 2;
      const relY = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = `translate(${relX * 0.15}px, ${relY * 0.25}px)`;
    });
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
  document.getElementById("btn-mode-random").addEventListener("click", openRangeModal);

  const flashcard = document.getElementById("flashcard");
  let touchStartX = 0;
  let touchStartY = 0;
  let isHorizontalSwipe = false;
  let swipeHandled = false;
  const SWIPE_THRESHOLD = 50;

  flashcard.addEventListener("touchstart", e => {
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    isHorizontalSwipe = false;
  }, { passive: true });

  flashcard.addEventListener("touchmove", e => {
    const t = e.touches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      isHorizontalSwipe = true;
    }
  }, { passive: true });

  flashcard.addEventListener("touchend", e => {
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

  flashcard.addEventListener("click", () => {
    if (swipeHandled) {
      swipeHandled = false;
      return;
    }
    state.isFlipped = !state.isFlipped;
    flashcard.classList.toggle("flipped", state.isFlipped);
  });
  document.getElementById("btn-initials").addEventListener("click", e => {
    e.stopPropagation();
    state.showInitials = !state.showInitials;
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
      e.stopPropagation();
      setVerseStatus(state.queue[state.queueIndex], chip.dataset.status);
      renderCard();
    });
  });

  document.querySelectorAll(".range-option").forEach(btn => {
    btn.addEventListener("click", () => selectScope(btn.dataset.scope));
  });
  document.getElementById("btn-apply-range").addEventListener("click", applyRange);
  document.getElementById("btn-close-modal").addEventListener("click", closeRangeModal);

  renderStart();
  initHeroCursor();
}

init();
