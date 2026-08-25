import { getAllVerseIds, findVerseById } from "./data.js";
import { getMemorizationChunks } from "./practice.js";

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

function getRandomPosition() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const heroEl = document.querySelector(".start-hero");
  const heroRect = heroEl ? heroEl.getBoundingClientRect() : null;
  const sideMargin = heroRect ? heroRect.left : 0;

  // 데스크톱처럼 히어로 좌우에 넉넉한 여백이 있을 때만, 그 여백도 후보 영역에 포함한다.
  // 모바일/태블릿은 여백이 거의 없어 이 분기가 사실상 타지 않으므로 기존 동작 그대로 유지된다.
  if (heroRect && sideMargin > 80 && Math.random() < 0.5) {
    const useLeft = Math.random() < 0.5;
    const y = h * 0.1 + Math.random() * h * 0.8;
    if (useLeft) {
      const x = 16 + Math.random() * Math.max(sideMargin - 80, 40);
      return { x, y };
    }
    const rightStart = heroRect.right + 60;
    const x = rightStart + Math.random() * Math.max(w - rightStart - 100, 40);
    return { x, y };
  }

  const x = Math.random() * Math.max(w - 140, 40);
  const topBand = h * 0.14;
  const bottomBandStart = h * 0.8;
  const bottomBand = Math.max(h - bottomBandStart - 40, 40);
  const y = Math.random() < 0.5
    ? Math.random() * topBand
    : bottomBandStart + Math.random() * bottomBand;
  return { x, y };
}

// 64구절 중에서 배경 문구용으로 쓸 만한 자연스러운 짧은 발췌문을 count개
// (중복 없이) 골라온다 — 각 verse에 이미 있는 memorizationChunks(없으면
// practice.js가 자동 분할)에서 무작위로 한 구를 뽑는다.
function pickRandomQuoteTexts(count) {
  const ids = getAllVerseIds().slice();
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, count).map(id => {
    const found = findVerseById(id);
    const chunks = getMemorizationChunks(found.verse);
    return chunks[Math.floor(Math.random() * chunks.length)];
  });
}

// 글자를 무작위 자모/기호로 스크램블하지 않고, 각 음절이 제자리(가로 위치는
// 고정)에서 아래쪽에서 위로 올라오며 나타나는 효과. 처음부터 끝까지
// textContent는 최종 글자 그대로다.
function revealQuoteVertical(quote, text) {
  quote.innerHTML = "";
  const spans = text.split("").map(ch => {
    const span = document.createElement("span");
    span.className = "quote-char";
    span.textContent = ch === " " ? " " : ch;
    return span;
  });
  spans.forEach(span => quote.appendChild(span));
  gsap.set(spans, { y: 10, opacity: 0 });

  const tl = gsap.timeline();
  tl.call(() => {
    const { x, y } = getRandomPosition();
    gsap.set(quote, { x, y, opacity: 1 });
  })
    .to(spans, {
      delay: Math.random() * 1.8,
      y: 0,
      opacity: 1,
      duration: 0.32,
      ease: "power2.out",
      stagger: 0.035,
    })
    .to(quote, {
      delay: 0.9,
      duration: 0.7,
      opacity: 0,
      ease: "power2.in",
    });
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
  const quoteTexts = pickRandomQuoteTexts(quotes.length);
  quotes.forEach((quote, i) => {
    gsap.set(quote, { position: "absolute", opacity: 0, whiteSpace: "nowrap" });
    revealQuoteVertical(quote, quoteTexts[i] ?? "");
  });

  const glow = document.getElementById("start-decode-glow");
  if (glow) {
    gsap.to(glow, { opacity: 1, duration: 0.2 });
    gsap.to(glow, { opacity: 0, duration: 1.3, delay: 2.6, ease: "sine.inOut" });
  }
  gsap.to(quotes, {
    opacity: 0,
    duration: 1.3,
    delay: 2.6,
    ease: "sine.inOut",
    overwrite: "auto",
  });

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
