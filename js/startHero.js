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
  const x = Math.random() * Math.max(window.innerWidth - 140, 40);
  const h = window.innerHeight;
  const topBand = h * 0.16;
  const bottomBandStart = h * 0.72;
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
      delay: Math.random() * 0.9,
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
    gsap.to(glow, { opacity: 0, duration: 1.1, delay: 1.6, ease: "sine.inOut" });
  }
  gsap.to(quotes, {
    opacity: 0,
    duration: 1.1,
    delay: 1.6,
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
