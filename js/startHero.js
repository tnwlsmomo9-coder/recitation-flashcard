let heroStarted = false;

function charsFromText(text) {
  const unique = Array.from(new Set(text.replace(/\s/g, "").split("")));
  return unique.join("");
}

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

function scrambleQuote(quote, text) {
  const chars = charsFromText(text);
  const tl = gsap.timeline();

  tl.call(() => {
    const { x, y } = getRandomPosition();
    gsap.set(quote, { x, y });
  })
    .to(quote, {
      delay: Math.random() * 1.8,
      duration: 0.7,
      opacity: 1,
      scrambleText: { text, chars, revealDelay: 0.35, speed: 1 },
      ease: "power2.out",
    })
    .to(quote, {
      delay: 0.3,
      duration: 0.7,
      scrambleText: { text: "", chars },
      opacity: 0,
      ease: "power2.in",
    });
}

export function initStartHero() {
  if (heroStarted) return;
  heroStarted = true;

  if (typeof gsap === "undefined") return;
  gsap.registerPlugin(SplitText, ScrambleTextPlugin);

  const emblem = document.querySelector(".start-emblem");
  if (emblem) {
    gsap.from(emblem, { opacity: 0, scale: 0.94, duration: 0.6, ease: "power2.out" });
  }

  const quotes = gsap.utils.toArray(".quote");
  quotes.forEach(quote => {
    gsap.set(quote, { position: "absolute", opacity: 0, whiteSpace: "nowrap" });
    scrambleQuote(quote, quote.textContent ?? "");
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

  const ctaBtn = document.getElementById("btn-start");
  if (ctaBtn) {
    const label = ctaBtn.textContent;
    ctaBtn.innerHTML = label
      .split("")
      .map(ch => (ch === " " ? " " : `<span class="decode-char cta-char">${ch}</span>`))
      .join("");

    const spans = ctaBtn.querySelectorAll(".cta-char");
    const glyphs = label.split("").filter(ch => ch !== " ");
    spans.forEach((span, i) => {
      decodeChar(span, glyphs[i], {
        tempColor: "rgba(255,255,255,0.55)",
        finalColor: "#fff",
        startDelay: 0.35 + i * 0.07 + Math.random() * 0.05,
      });
    });
  }

  const titleEl = document.querySelector(".start-title");
  if (titleEl) {
    const split = SplitText.create(titleEl, { type: "chars, lines" });
    split.chars.forEach(charSpan => charSpan.classList.add("decode-char"));
    split.chars.forEach((charSpan, i) => {
      const finalChar = charSpan.textContent;
      decodeChar(charSpan, finalChar, {
        tempColor: "rgba(102,86,108,0.5)",
        finalColor: "var(--ink)",
        startDelay: i * 0.07 + Math.random() * 0.04,
      });
    });
  }
}
