import { getAllVerseIds, findVerseById } from "./data.js";

let heroStarted = false;

const DECODE_POOL = "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ0123456789#*%/+-".split("");

function decodeChar(span, finalChar, { tempColor, finalColor, startDelay = 0 } = {}) {
  const steps = 5 + Math.floor(Math.random() * 3);
  const tl = gsap.timeline({ delay: startDelay });

  for (let i = 0; i < steps; i++) {
    tl.to(span, {
      duration: 0.04 + Math.random() * 0.03,
      x: (Math.random() - 0.5) * 6,
      y: (Math.random() - 0.5) * 6,
      scale: 0.75,
      opacity: 0.6 + Math.random() * 0.25,
      color: tempColor,
      ease: "none",
      onStart: () => {
        span.textContent = DECODE_POOL[Math.floor(Math.random() * DECODE_POOL.length)];
      },
    });
  }

  tl.to(span, {
    duration: 0.18,
    x: 0,
    y: 0,
    scale: 1.1,
    opacity: 1,
    color: finalColor,
    ease: "power2.out",
    onStart: () => {
      span.textContent = finalChar;
    },
  }).to(span, {
    duration: 0.1,
    scale: 1,
    ease: "power2.out",
  });

  return tl;
}

// 배경 문구는 한 번에 하나만 보이므로, 매번 직전과 "다른" 구역(zone)을
// 하나 골라 같은 자리가 연달아 반복되지 않게 한다. side-left/right는
// 데스크톱에서 히어로 좌우의 넉넉한 여백을 쓰고, 그 여백이 없는 화면
// (모바일 등)에서는 상/하단 밴드의 가운데 열로 대체된다.
const QUOTE_ZONES = ["top-left", "top-right", "bottom-left", "bottom-right", "side-left", "side-right"];

function pickZone(excludeZone) {
  const options = excludeZone ? QUOTE_ZONES.filter(z => z !== excludeZone) : QUOTE_ZONES;
  return options[Math.floor(Math.random() * options.length)];
}

function getRandomPosition(quoteWidth = 0, zone = "top-left") {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const heroEl = document.querySelector(".start-hero");
  const heroRect = heroEl ? heroEl.getBoundingClientRect() : null;
  const sideMargin = heroRect ? heroRect.left : 0;
  const desktopSideAvailable = heroRect && sideMargin > 80;

  // quoteWidth를 빼고 범위를 잡아야 문구의 오른쪽/왼쪽 끝이 히어로 쪽으로
  // 넘어가지 않는다 — 안 그러면 문구가 넓을 때 "안전 구간" 시작점은
  // 맞아도 끝점이 히어로와 겹칠 수 있다.
  if (zone === "side-left" && desktopSideAvailable) {
    const available = sideMargin - 80 - quoteWidth;
    // 문구가 여백보다 넓으면 억지로 그 좁은 여백에 밀어 넣지 않고(그러면
    // 히어로나 다른 문구와 겹친다) 아래의 상/하단 밴드 배치로 넘어간다.
    if (available >= 40) {
      const y = h * 0.1 + Math.random() * h * 0.8;
      const x = 16 + Math.random() * available;
      return { x, y };
    }
  }
  if (zone === "side-right" && desktopSideAvailable) {
    const rightStart = heroRect.right + 60;
    const available = w - rightStart - 100 - quoteWidth;
    if (available >= 40) {
      const y = h * 0.1 + Math.random() * h * 0.8;
      const x = rightStart + Math.random() * available;
      return { x, y };
    }
  }

  // side 여백을 못 쓰는 상황(그 zone 자체가 side-*인데 여백이 부족하거나,
  // 애초에 top/bottom-* 인 경우)이면 상/하단 밴드를 좌/가운데/우 3열로 나눠
  // side-left→가운데, side-right→가운데(반대쪽 밴드)로 배치한다.
  const isTop = zone === "top-left" || zone === "top-right" || zone === "side-left";
  const topBand = h * 0.14;
  const bottomBandStart = h * 0.8;
  const bottomBand = Math.max(h - bottomBandStart - 40, 40);
  const y = isTop
    ? Math.random() * topBand
    : bottomBandStart + Math.random() * bottomBand;

  const col = zone === "top-left" || zone === "bottom-left" ? 0
    : zone === "top-right" || zone === "bottom-right" ? 2
    : 1;
  const colTotal = (w - 32) / 3;
  const colAvailable = colTotal - quoteWidth;
  // 문구가 커서(글자 크기가 제각각이라 큰 것도 있다) 3분의 1 칸보다 넓으면
  // 그 칸 안에 억지로 넣지 않는다 — 억지로 넣으면 옆 칸 문구와 겹치므로,
  // 이럴 땐 칸 구분을 포기하고 밴드 전체 폭에서 자리를 찾는다.
  if (colAvailable >= 40) {
    const x = 16 + col * colTotal + Math.random() * colAvailable;
    return { x, y };
  }
  const x = 16 + Math.random() * Math.max(w - 32 - quoteWidth, 4);
  return { x, y };
}

function rectsOverlap(a, b, margin = 0) {
  return !(
    a.right + margin <= b.left ||
    b.right + margin <= a.left ||
    a.bottom + margin <= b.top ||
    b.bottom + margin <= a.top
  );
}

// candidateFn이 뽑아준 좌표들을 최대 maxAttempts번 시도해, 이미 배치된 것들
// (히어로 UI + 앞서 배치된 다른 문구)과 겹치지 않는 첫 후보를 쓴다. 시도할수록
// 여유(margin)를 16px→2px로 줄여, 자리가 빠듯한 화면에서도 "조금 더 빡빡하지만
// 안 겹치는" 자리를 찾을 확률을 높인다. 끝까지 못 찾으면 null을 반환한다.
function searchClearPosition(width, height, obstacles, candidateFn, maxAttempts) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { x, y } = candidateFn();
    const clampedX = Math.min(Math.max(x, 4), Math.max(w - width - 4, 4));
    const clampedY = Math.min(Math.max(y, 4), Math.max(h - height - 4, 4));
    const rect = { left: clampedX, top: clampedY, right: clampedX + width, bottom: clampedY + height };
    const margin = Math.max(16 - attempt * 0.3, 2);
    if (!obstacles.some(o => rectsOverlap(rect, o, margin))) {
      return { x: clampedX, y: clampedY, rect };
    }
  }
  return null;
}

// 문구 크기가 제각각(작을 수도 큰 수도 있음)이라, 배정된 zone이 큰 문구에겐
// 너무 좁을 수 있다. 그럴 땐 zone 안에서 겹치지 않는 자리를 못 찾았다고 바로
// 포기하지 않고, zone 선호를 내려놓은 채 화면 전체에서 다시 찾는다 — 그래도
// 못 찾을 때만(화면이 정말 좁을 때) 마지막 후보로 타협해 무한 재시도를 피한다.
function findClearPosition(width, height, obstacles, zone) {
  const w = window.innerWidth;
  const h = window.innerHeight;

  const zoned = searchClearPosition(width, height, obstacles, () => getRandomPosition(width, zone), 60);
  if (zoned) return zoned;

  const free = searchClearPosition(width, height, obstacles, () => ({
    x: Math.random() * Math.max(w - width, 1),
    y: Math.random() * Math.max(h - height, 1),
  }), 80);
  if (free) return free;

  const x = Math.min(Math.max(Math.random() * Math.max(w - width, 1), 4), Math.max(w - width - 4, 4));
  const y = Math.min(Math.max(Math.random() * Math.max(h - height, 1), 4), Math.max(h - height - 4, 4));
  return { x, y, rect: { left: x, top: y, right: x + width, bottom: y + height } };
}

// 64구절 중 하나를 무작위로 고른다. excludeId를 넘기면 바로 직전과 같은
// 구절이 연달아 나오는 것만 피한다(전체적으로는 계속 반복되는 루프이므로
// 언젠가 같은 구절이 다시 나오는 것 자체는 자연스럽다).
function pickNextVerseId(excludeId) {
  const ids = getAllVerseIds();
  let id = ids[Math.floor(Math.random() * ids.length)];
  while (ids.length > 1 && id === excludeId) {
    id = ids[Math.floor(Math.random() * ids.length)];
  }
  return id;
}

// 한 구절 본문을 앞에서부터 2어절씩 끊어 순서대로 배열로 만든다(마지막
// 조각은 어절 수가 홀수면 1어절만 남을 수 있다) — 오버레이로 보여줄 때
// 문장 전체가 아니라 이 조각들을 한 번에 하나씩, 순서대로 내보내기 위함.
function chunkVerseIntoPairs(text) {
  const words = text.split(" ").filter(w => w.length > 0);
  const chunks = [];
  for (let i = 0; i < words.length; i += 2) {
    chunks.push(words.slice(i, i + 2).join(" "));
  }
  return chunks;
}

// 글자를 무작위 자모/기호로 스크램블하지 않고, 각 음절이 제자리(가로 위치는
// 고정)에서 아래쪽에서 위로 올라오며 나타나는 효과. 처음부터 끝까지
// textContent는 최종 글자 그대로다.
function revealQuoteVertical(quote, text, obstacles, zone) {
  quote.innerHTML = "";
  const spans = text.split("").map(ch => {
    const span = document.createElement("span");
    span.className = "quote-char";
    span.textContent = ch === " " ? " " : ch;
    return span;
  });
  spans.forEach(span => quote.appendChild(span));
  gsap.set(spans, { y: 10, opacity: 0 });

  // 문구마다 크기를 제각각으로 둬서(0.8배~1.4배) 배경이 평면적으로 보이지
  // 않게 한다 — 크기를 바꾸면 렌더 너비/높이도 바뀌므로 반드시 아래
  // 충돌판정용 실측(getBoundingClientRect) 전에 적용해야 한다.
  const baseFontSize = parseFloat(getComputedStyle(quote).fontSize);
  const sizeScale = 0.8 + Math.random() * 0.6;
  quote.style.fontSize = `${baseFontSize * sizeScale}px`;

  // white-space:nowrap이라 실제 렌더 너비는 내용에 따라 다르므로, 글자를
  // 채운 지금 시점에 실측해야 정확한 충돌 판정이 가능하다. 아래 "숨쉬기"
  // 애니메이션이 최대 pulseBuffer배까지 커지므로, 충돌 자리 확보는 그
  // 최대 크기 기준으로 하고 실제 글자는 그 여유 공간의 중앙에 놓는다 —
  // 그래야 커졌을 때도 옆 문구나 히어로 영역을 침범하지 않는다.
  const size = quote.getBoundingClientRect();
  const pulseBuffer = 1.15;
  const reserveW = size.width * pulseBuffer;
  const reserveH = size.height * pulseBuffer;
  const { x, y, rect } = findClearPosition(reserveW, reserveH, obstacles, zone);
  obstacles.push(rect);
  const offsetX = (reserveW - size.width) / 2;
  const offsetY = (reserveH - size.height) / 2;
  gsap.set(quote, { x: x + offsetX, y: y + offsetY, opacity: 1, scale: 0.86 });

  // 글자수마다 스태거 총 길이가 달라서, 뒤 tween의 시작 시각은 앞 tween의
  // 스태거를 반영해 직접 계산한 절대 위치로 지정한다 — 체이닝된 .to()의
  // delay에 기대면 stagger가 섞였을 때 GSAP가 다음 tween을 이전 tween
  // "시작" 시점 기준으로 이어붙여 의도와 다른 타이밍이 될 수 있다.
  const enterDuration = 0.32;
  const staggerStep = 0.035;
  const enterEnd = enterDuration + staggerStep * Math.max(spans.length - 1, 0);
  const holdDuration = 1.4;
  const fadeDuration = 0.7;

  const tl = gsap.timeline();
  tl.to(spans, {
    y: 0,
    opacity: 1,
    duration: enterDuration,
    ease: "power2.out",
    stagger: staggerStep,
  }, 0)
    .to(quote, {
      scale: 1,
      duration: enterDuration,
      ease: "power2.out",
    }, 0);

  // 문구마다 절반 정도만 떠 있는 동안 커졌다 작아지는 "숨쉬기"를 하고,
  // 나머지는 등장 크기 그대로 가만히 있는다 — 전부 다 같이 커졌다 작아지면
  // 오히려 다 똑같아 보이므로 일부러 섞는다. peakScale은 위에서 확보한
  // pulseBuffer(1.15배) 여유를 넘지 않게 잡는다.
  if (Math.random() < 0.5) {
    const peakScale = 1.04 + Math.random() * 0.1;
    const troughScale = 0.86 + Math.random() * 0.08;
    tl.to(quote, {
      scale: peakScale,
      duration: holdDuration * 0.4,
      ease: "sine.inOut",
    }, enterEnd)
      .to(quote, {
        scale: troughScale,
        duration: holdDuration * 0.6,
        ease: "sine.inOut",
      }, enterEnd + holdDuration * 0.4);
  }

  tl.to(quote, {
    duration: fadeDuration,
    opacity: 0,
    ease: "power2.in",
  }, enterEnd + holdDuration);

  return enterEnd + holdDuration + fadeDuration;
}

// quotes 배열의 span들을 돌려가며 한 번에 딱 하나씩만 순서대로 재생한다 —
// 여러 구절이 동시에 섞여 보이는 일이 없도록, 하나가 완전히 사라진 뒤
// 짧은 틈을 두고서야 다음 조각이 나타난다. 구절 하나를 통째로 오버레이하지
// 않고 앞에서부터 2어절씩 끊어 그 조각들을 순서대로 내보내다가, 한 구절이
// 끝나면 다른 구절을 무작위로 골라 이어간다 — 랜딩 화면에 머무는 동안
// 계속 반복된다.
function startQuoteLoop(quotes) {
  let cycleIndex = 0;
  let lastZone = null;
  let lastVerseId = null;
  let pendingChunks = [];
  const gapBetweenQuotes = 0.3;

  function playNext() {
    if (pendingChunks.length === 0) {
      const id = pickNextVerseId(lastVerseId);
      lastVerseId = id;
      pendingChunks = chunkVerseIntoPairs(findVerseById(id).verse.text);
    }
    const text = pendingChunks.shift();

    const quote = quotes[cycleIndex % quotes.length];
    cycleIndex++;

    const zone = pickZone(lastZone);
    lastZone = zone;

    // 화면에 동시에 보이는 문구가 이제 이것 하나뿐이므로, 겹침을 피할
    // 대상도 히어로 UI 하나면 충분하다.
    const heroEl = document.querySelector(".start-hero");
    const obstacles = [];
    if (heroEl) {
      const r = heroEl.getBoundingClientRect();
      obstacles.push({ left: r.left - 20, top: r.top - 20, right: r.right + 20, bottom: r.bottom + 20 });
    }

    const lifespan = revealQuoteVertical(quote, text, obstacles, zone);
    gsap.delayedCall(lifespan + gapBetweenQuotes, playNext);
  }

  playNext();
}

function setupCtaCentering() {
  const desktopQuery = window.matchMedia("(min-width: 1024px)");
  const title = document.querySelector(".start-title");
  const cta = document.getElementById("btn-start");
  const link = document.getElementById("btn-continue-start");
  const content = document.querySelector(".start-hero-content");
  if (!title || !cta) return null;

  function apply() {
    if (!desktopQuery.matches) {
      cta.style.marginLeft = "";
      if (link) link.style.marginLeft = "";
      if (content) content.style.width = "";
      return;
    }
    // Let the group size naturally before measuring, in case a previous
    // frozen width from an earlier call is still applied.
    if (content) content.style.width = "";
    const titleWidth = title.getBoundingClientRect().width;
    [cta, link].forEach(btn => {
      if (!btn) return;
      const btnWidth = btn.getBoundingClientRect().width;
      btn.style.marginLeft = `${Math.max((titleWidth - btnWidth) / 2, 0)}px`;
    });
    if (content) {
      // .start-hero's second grid column is sized to this element's
      // content width, and the whole hero box is centered on screen —
      // so once the CTA's decode animation starts rewriting its
      // characters (and briefly changing its own rendered width), that
      // would otherwise reflow the column and visibly shift the entire
      // centered group sideways. Freezing this element's width right
      // after positioning the CTA (and before decodeChar runs) locks
      // the group's size for the rest of the animation.
      content.style.width = `${content.getBoundingClientRect().width}px`;
    }
  }

  // Deliberately NOT watching the CTA's own text mutations here, and not
  // recomputing on document.fonts.ready either: its characters (and the
  // title's) get rewritten to random decode-pool glyphs of varying
  // widths for the ~1s scramble animation, and recomputing off of those
  // transient widths — whether from every mutation or from a fonts.ready
  // callback landing mid-animation — made the whole group visibly slide
  // sideways, or settle into a slightly wrong final position. Instead,
  // initStartHero() waits for fonts to be ready and calls `apply()` once,
  // synchronously, right after the CTA/title reach their final
  // (pre-animation) character markup — the one moment their widths are
  // both already correct and stable — so the group is positioned once
  // and never moves again on its own.
  window.addEventListener("resize", apply);
  if (link) {
    // app.js toggles btn-continue-start's display via inline style when
    // "이어서 학습하기" becomes available — recompute its centering then,
    // since its width is 0 (and thus unmeasurable) while hidden.
    new MutationObserver(apply).observe(link, {
      attributes: true,
      attributeFilter: ["style"],
    });
  }
  apply();
  return apply;
}

export function initStartHero() {
  if (heroStarted) return;
  heroStarted = true;

  const applyCtaCentering = setupCtaCentering();

  if (typeof gsap === "undefined") return;
  gsap.registerPlugin(SplitText);

  const emblem = document.querySelector(".start-emblem");
  if (emblem) {
    gsap.from(emblem, { opacity: 0, scale: 0.94, duration: 0.6, ease: "power2.out" });
  }

  const quotes = gsap.utils.toArray(".quote");
  quotes.forEach(quote => {
    gsap.set(quote, { position: "absolute", opacity: 0, whiteSpace: "nowrap" });
  });

  const glow = document.getElementById("start-decode-glow");
  if (glow) {
    gsap.to(glow, { opacity: 1, duration: 0.2 });
    gsap.to(glow, { opacity: 0, duration: 1.3, delay: 2.6, ease: "sine.inOut" });
  }
  // 문구별 등장/유지/페이드아웃은 각자의 timeline(revealQuoteVertical)이
  // 처리하고, startQuoteLoop이 그 timeline들을 하나씩 순서대로 재생한다 —
  // 예전에는 여러 문구를 동시에 띄워놓고 한 타이밍에 일괄 페이드아웃했는데,
  // 그러면 여러 구절이 뒤섞여 보이거나 등장 순서와 무관하게 한꺼번에
  // 사라지는 것처럼 보였다.

  // Split the title and CTA into their final per-character markup first
  // (both still showing their finished text at this point), re-measure
  // the CTA's centering against that final layout, and only then start
  // the decode/scramble tweens — so the button is already sitting in its
  // resting position before anything starts visibly moving. This whole
  // step waits for webfonts to finish loading first: measuring against a
  // fallback font's metrics (then correcting later, once fonts.ready
  // fires) is exactly what used to let a mid-animation recompute lock in
  // a slightly-off final position.
  function startTextDecode() {
    const titleEl = document.querySelector(".start-title");
    let titleSplit = null;
    if (titleEl) {
      titleSplit = SplitText.create(titleEl, { type: "chars, lines" });
      titleSplit.chars.forEach(charSpan => charSpan.classList.add("decode-char"));
    }

    const ctaBtn = document.getElementById("btn-start");
    let ctaLabel = "";
    if (ctaBtn) {
      ctaLabel = ctaBtn.textContent;
      ctaBtn.innerHTML = ctaLabel
        .split("")
        .map(ch => (ch === " " ? " " : `<span class="decode-char cta-char">${ch}</span>`))
        .join("");
    }

    if (applyCtaCentering) applyCtaCentering();

    // 배경 문구는 .start-hero의 "최종" 사각형을 기준으로 겹침을 피해야 한다
    // — applyCtaCentering()이 방금 폰트 로딩 완료 후 히어로 크기를 다시
    // 확정했으므로, 문구 루프는 반드시 이 시점 이후에 시작해야 나중에
    // 히어로가 커지면서 문구와 겹치는 일이 없다.
    startQuoteLoop(quotes);

    if (titleSplit) {
      titleSplit.chars.forEach((charSpan, i) => {
        const finalChar = charSpan.textContent;
        decodeChar(charSpan, finalChar, {
          tempColor: "rgba(102,86,108,0.5)",
          finalColor: "var(--ink)",
          startDelay: i * 0.07 + Math.random() * 0.04,
        });
      });
    }

    if (ctaBtn) {
      const spans = ctaBtn.querySelectorAll(".cta-char");
      const glyphs = ctaLabel.split("").filter(ch => ch !== " ");
      spans.forEach((span, i) => {
        decodeChar(span, glyphs[i], {
          tempColor: "rgba(255,255,255,0.55)",
          finalColor: "#fff",
          startDelay: 0.35 + i * 0.07 + Math.random() * 0.05,
        });
      });
    }
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(startTextDecode);
  } else {
    startTextDecode();
  }
}
