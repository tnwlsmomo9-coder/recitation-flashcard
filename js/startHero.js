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

// 제목이 "김 서린 유리가 걷히듯" 흐리고 반투명한 상태로 시작해 배경 말씀
// 오버레이가 재생되는 동안 서서히 선명해지다가(전체 예상 재생시간의 약
// 80% 지점, 단 최대 5초 안에 완전히 선명해짐), 다 걷히고 나면 은은한 빛이
// 글자 안쪽만 왼쪽에서 오른쪽으로 한 번 지나간다. 위치/크기/폰트/색은
// 전혀 건드리지 않고 blur·opacity(그리고 광택용 배경 위치)만 움직인다 —
// background-clip: text로 그라디언트를 글자 모양에만 클리핑해서, 빛이
// 글자 바깥으로 사각형처럼 새어 나가지 않게 한다. 모션 감소 설정에서는
// 아무 애니메이션 없이 완성된 제목을 바로 보여준다.
function playTitleFogClear(titleEl, chunkCount) {
  // 모션 감소 설정에서는 흐림/광택 애니메이션 없이 완성된 제목을 그대로
  // 둔다 — gsap.set을 전혀 호출하지 않으므로 원래 CSS(정상 색상, 블러
  // 없음)가 그대로 유지된다.
  const prefersReducedMotion = window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return;

  const totalOverlay = estimateOverlayDuration(chunkCount);
  // 오버레이 시간이 아주 긴 말씀이어도 흐림이 걷히는 데 5초를 넘게
  // 기다리게 하지 않는다.
  const clearDuration = Math.min(totalOverlay * 0.8, 5);
  const shineDuration = 1.0;

  // 원래 글자색을 실측해 광택 그라디언트의 "평상시" 색으로 그대로 쓴다 —
  // 그래야 빛이 지나가지 않는 구간에서는 기존 색과 완전히 같아 보인다.
  const inkColor = getComputedStyle(titleEl).color;

  // 배경 위치는 반드시 픽셀 값으로, 하나의 "Xpx Ypx" 문자열로 지정한다 —
  // 퍼센트 값(예: "200% 0")은 background-size가 100%를 넘는 경우
  // (요소 폭 - 배경 폭)*퍼센트/100 공식으로 계산되어 육안 직관과 달리
  // 그라디언트 전체가 요소 밖으로 밀려나 아무것도 안 보일 수 있고,
  // backgroundPositionX/Y를 각각 따로 지정하면(gsap.set에 나눠 넣으면)
  // 이 프로젝트의 GSAP 버전에서 배경이 아예 그려지지 않는 문제가 있었다
  // (실측으로 확인됨) — 그래서 실제 폭(w)을 기준으로 직접 픽셀을 계산해
  // 하나의 문자열로만 넘긴다.
  const w = titleEl.getBoundingClientRect().width;
  const startPos = `${(-1.8 * w).toFixed(2)}px 0px`;
  const endPos = `${(-0.2 * w).toFixed(2)}px 0px`;

  gsap.set(titleEl, {
    filter: "blur(9px)",
    opacity: 0.55,
    backgroundImage: `linear-gradient(100deg, ${inkColor} 35%, #FFFDF8 50%, ${inkColor} 65%)`,
    backgroundSize: `${(w * 3).toFixed(2)}px 100%`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: startPos,
    webkitBackgroundClip: "text",
    backgroundClip: "text",
    webkitTextFillColor: "transparent",
    color: "transparent",
  });

  const tl = gsap.timeline();
  // 흐림(9px→0)과 반투명(0.55→1)이 함께, 천천히 걷히며 선명해진다.
  tl.to(titleEl, {
    filter: "blur(0px)",
    opacity: 1,
    duration: clearDuration,
    ease: "sine.out",
  }, 0);
  // 다 걷힌 직후, 은은한 빛이 글자 안쪽만 왼쪽에서 오른쪽으로 한 번
  // 스쳐 지나간다.
  tl.to(titleEl, {
    backgroundPosition: endPos,
    duration: shineDuration,
    ease: "power2.inOut",
  }, clearDuration);
}

// 배경 문구가 뜰 구역(zone). 한 단계에 최대 3개까지 동시에 뜰 수 있으므로,
// 묶음마다 직전 묶음과 "다른" 구역을 골라 같은 단계 안에서도 자리가 겹치는
// 느낌을 줄인다(실제 겹침 방지는 obstacle 기반 자리 탐색이 담당). side-left/
// right는 데스크톱에서 히어로 좌우의 넉넉한 여백을 쓰고, 그 여백이 없는 화면
// (모바일 등)에서는 상/하단 밴드의 가운데 열로 대체된다.
const QUOTE_ZONES = ["top-left", "top-right", "bottom-left", "bottom-right", "side-left", "side-right"];

function pickZone(excludeZone) {
  const options = excludeZone ? QUOTE_ZONES.filter(z => z !== excludeZone) : QUOTE_ZONES;
  return options[Math.floor(Math.random() * options.length)];
}

function getRandomPosition(quoteWidth, zone, marginX, containerRect) {
  const w = containerRect.width;
  const h = containerRect.height;
  const heroEl = document.querySelector(".start-hero");
  const heroRectAbs = heroEl ? heroEl.getBoundingClientRect() : null;
  // .quote는 .start-quotes 안에서 절대좌표(왼쪽 위가 0,0)로 이동하므로,
  // 뷰포트 기준인 히어로 rect도 같은 로컬 좌표계로 변환해야 비교가 맞는다.
  const heroRect = heroRectAbs ? {
    left: heroRectAbs.left - containerRect.left,
    right: heroRectAbs.right - containerRect.left,
    top: heroRectAbs.top - containerRect.top,
    bottom: heroRectAbs.bottom - containerRect.top,
  } : null;
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
      const x = marginX.left + Math.random() * available;
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
  const colTotal = (w - marginX.left - marginX.right) / 3;
  const colAvailable = colTotal - quoteWidth;
  // 문구가 커서(글자 크기가 제각각이라 큰 것도 있다) 3분의 1 칸보다 넓으면
  // 그 칸 안에 억지로 넣지 않는다 — 억지로 넣으면 옆 칸 문구와 겹치므로,
  // 이럴 땐 칸 구분을 포기하고 밴드 전체 폭에서 자리를 찾는다.
  if (colAvailable >= 40) {
    const x = marginX.left + col * colTotal + Math.random() * colAvailable;
    return { x, y };
  }
  const x = marginX.left + Math.random() * Math.max(w - marginX.left - marginX.right - quoteWidth, 4);
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
// (히어로 요소들 + 같은 단계에서 앞서 배치된 다른 묶음)과 겹치지 않는 첫
// 후보를 쓴다. 시도할수록 여유(margin)를 16px→2px로 줄여, 자리가 빠듯한
// 화면에서도 "조금 더 빡빡하지만 안 겹치는" 자리를 찾을 확률을 높인다.
// 끝까지 못 찾으면 null을 반환한다. marginX는 화면 좌우 바깥쪽 안전
// 여백(16px 이상 + safe-area-inset)이다. w/h는 .start-quotes 컨테이너
// 자체의 크기(containerRect)를 쓴다 — window.innerWidth/Height를 쓰면,
// 데스크톱처럼 히어로 섹션이 뷰포트보다 좁게 가운데 정렬되는 화면에서
// .quote가 실제로 움직이는 좌표계(컨테이너 로컬)와 어긋나 화면 밖으로
// 잘려 보일 수 있다.
function searchClearPosition(width, height, obstacles, candidateFn, maxAttempts, marginX, containerRect) {
  const w = containerRect.width;
  const h = containerRect.height;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { x, y } = candidateFn();
    const clampedX = Math.min(Math.max(x, marginX.left), Math.max(w - width - marginX.right, marginX.left));
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
// 포기하지 않고, zone 선호를 내려놓은 채 화면 전체에서 다시 찾는다. required가
// true면(한 단계의 첫 묶음) 그래도 못 찾을 때 마지막 후보로 타협해 어딘가에는
// 반드시 배치하고, false면(같은 단계의 2~3번째 묶음) 억지로 겹치게 두지 않고
// null을 반환해 이번 단계는 그만큼만(1~2개) 동시에 보여주고 넘어가게 한다.
function findClearPosition(width, height, obstacles, zone, marginX, required, containerRect) {
  const w = containerRect.width;
  const h = containerRect.height;

  const zoned = searchClearPosition(width, height, obstacles, () => getRandomPosition(width, zone, marginX, containerRect), 60, marginX, containerRect);
  if (zoned) return zoned;

  const free = searchClearPosition(width, height, obstacles, () => ({
    x: Math.random() * Math.max(w - width, 1),
    y: Math.random() * Math.max(h - height, 1),
  }), 80, marginX, containerRect);
  if (free) return free;

  if (!required) return null;

  const x = Math.min(Math.max(Math.random() * Math.max(w - width, 1), marginX.left), Math.max(w - width - marginX.right, marginX.left));
  const y = Math.min(Math.max(Math.random() * Math.max(h - height, 1), 4), Math.max(h - height - 4, 4));
  return { x, y, rect: { left: x, top: y, right: x + width, bottom: y + height } };
}

// 뷰포트 메타에 viewport-fit=cover가 없는 한 env(safe-area-inset-*)는 0으로
// 계산되지만, 다른 화면까지 건드리는 메타 태그 변경 없이도 나중에 뷰포트
// 설정이 바뀌면 자동으로 반영되도록 숨김 프로브 엘리먼트로 실측해 둔다.
function getSafeMargins() {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
    "padding:0 env(safe-area-inset-right) 0 env(safe-area-inset-left);";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const left = parseFloat(cs.paddingLeft) || 0;
  const right = parseFloat(cs.paddingRight) || 0;
  document.body.removeChild(probe);
  return { left, right };
}

// 말씀 묶음이 절대 침범하면 안 되는 기존 히어로 요소들. .start-hero 전체를
// 뭉뚱그린 사각형 하나 대신 요소 단위로 실측해서, 요소 사이 빈틈에도 자리를
// 찾을 여지를 준다. #btn-continue-start는 "이어서 학습하기"가 아직 없을 때
// display:none이라 자동으로 제외된다.
const HERO_EXCLUSION_SELECTORS = [
  ".start-emblem",
  ".start-kicker-badge",
  ".start-title",
  ".start-title-flourish",
  ".start-subtitle-row",
  "#btn-start",
  "#btn-continue-start",
];

function buildExclusionZones(containerRect) {
  const margin = 20;
  const zones = [];
  for (const selector of HERO_EXCLUSION_SELECTORS) {
    const el = document.querySelector(selector);
    if (!el || getComputedStyle(el).display === "none") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    // 히어로 요소 rect는 뷰포트 기준이므로 .start-quotes 컨테이너 로컬
    // 좌표로 변환해서 넣는다 — .quote들의 x/y도 같은 로컬 좌표계다.
    zones.push({
      left: r.left - containerRect.left - margin,
      top: r.top - containerRect.top - margin,
      right: r.right - containerRect.left + margin,
      bottom: r.bottom - containerRect.top + margin,
    });
  }
  return zones;
}

// 배경 말씀 묶음 하나의 재생 시간을 구성하는 조각들. revealQuoteBubble/
// startQuoteLoop과 제목 fog-clear 효과의 시간 추정(estimateOverlayDuration)이
// 서로 어긋나지 않도록 이 값들을 공유한다.
const CHUNK_SWELL_DURATION = 0.55;
const CHUNK_HOLD_MIN = 1.0;
const CHUNK_HOLD_RANGE = 0.3;
const CHUNK_BURST_DURATION = 0.5;
const MAX_CONCURRENT_QUOTES = 3;
const STAGE_GAP = 0.3;

// 배경 말씀 오버레이의 예상 총 재생 시간(초). 실제로는 화면 여백에 따라
// 한 단계에 1~3개가 동시에 들어가므로 정확한 값과 조금 다를 수 있지만,
// 제목 fog-clear 효과 시간을 "대략" 맞추는 용도로는 매 단계가 항상 최대
// 동시 개수로 찬다고 가정한 이 추정치로 충분하다.
function estimateOverlayDuration(chunkCount) {
  const avgChunkLifespan = CHUNK_SWELL_DURATION + (CHUNK_HOLD_MIN + CHUNK_HOLD_RANGE / 2) + CHUNK_BURST_DURATION;
  const estimatedStages = Math.max(Math.ceil(chunkCount / MAX_CONCURRENT_QUOTES), 1);
  return estimatedStages * (avgChunkLifespan + STAGE_GAP);
}

// 64구절 중 오버레이 한 번에 보여줄 말씀 하나를 무작위로 고른다.
function pickRandomVerseId() {
  const ids = getAllVerseIds();
  return ids[Math.floor(Math.random() * ids.length)];
}

// 공백과 문장부호를 뺀 글자 수. 두 어절만으로는 너무 짧아 의미가 어색한지
// 판단하는 기준으로 쓴다.
function meaningfulLength(str) {
  return str.replace(/[\s.,!?;:'"·\-()\[\]{}]/g, "").length;
}

// 한 구절 본문을 앞에서부터 어절 단위로 묶어 순서대로 배열로 만든다. 기본은
// 2어절이지만, 그 2(~3)어절만으론 공백·문장부호 제외 글자 수가 4자 이하로
// 너무 짧아 의미가 어색할 때는 자연스러워질 때까지(최대 4어절까지) 한
// 어절씩 계속 붙인다. 전체 어절 수가 홀수라 마지막에 1어절만 외로이 남으면
// 바로 앞 묶음에 합친다(앞 묶음이 이미 4어절이면 예외적으로 그대로 둔다).
// 단어 자체는 늘리거나 줄이지 않고 묶는 경계만 바꾼다.
function chunkVerseIntoGroups(text) {
  const words = text.split(" ").filter(w => w.length > 0);
  const groups = [];
  let i = 0;
  while (i < words.length) {
    let size = Math.min(2, words.length - i);
    while (
      size < 4 &&
      i + size < words.length &&
      meaningfulLength(words.slice(i, i + size).join("")) <= 4
    ) {
      size++;
    }
    groups.push(words.slice(i, i + size));
    i += size;
  }

  if (groups.length >= 2) {
    const last = groups[groups.length - 1];
    const prev = groups[groups.length - 2];
    if (last.length === 1 && prev.length < 4) {
      prev.push(...last);
      groups.pop();
    }
  }

  return groups.map(g => g.join(" "));
}

// 비눗방울 느낌: 작고 흐릿하게 시작해 부풀며 선명해지고, 제자리에서 천천히
// 위로 떠오르다가, 끝에는 살짝 더 커지며 투명하게 터지듯 사라진다. 실제
// 방울 모양(원형 배경/테두리)은 만들지 않고 텍스트 블록(묶음) 자체에
// scale/opacity/blur/이동만 적용하며, 묶음 전체가 하나의 단위로 함께
// 움직이도록 글자를 쪼개지 않는다.
//
// obstacles와 겹치지 않는 자리를 못 찾으면(required가 false일 때) null을
// 반환하고 아무것도 그리지 않는다 — 같은 단계에서 3개를 다 띄우기엔 화면이
// 좁을 때, 억지로 겹쳐 넣는 대신 이번 묶음은 다음 단계로 넘기기 위함이다.
function revealQuoteBubble(quote, text, obstacles, zone, marginX, required, containerRect) {
  quote.textContent = text;
  // .quote span 풀은 재사용된다 — 이전 사이클이 남긴 transform/scale이
  // 인라인 스타일에 그대로 남아 있으면, 아래 getBoundingClientRect() 실측이
  // 그 잔여 배율까지 포함해버려 크기·배치 계산이 틀어진다. 측정 전에 반드시
  // 초기화한다.
  gsap.set(quote, { clearProps: "transform,filter", opacity: 0 });

  // 문구마다 크기를 제각각으로 둬서(0.8배~1.4배) 배경이 평면적으로 보이지
  // 않게 한다 — 크기를 바꾸면 렌더 너비/높이도 바뀌므로 반드시 아래
  // 충돌판정용 실측(getBoundingClientRect) 전에 적용해야 한다.
  const baseFontSize = parseFloat(getComputedStyle(quote).fontSize);
  const sizeScale = 0.8 + Math.random() * 0.6;
  quote.style.fontSize = `${baseFontSize * sizeScale}px`;

  // 마지막 "터지는" 순간 burstScale까지 커지고, 그 사이 floatDistance만큼
  // 위로 떠오른다. 충돌 판정용 여유 공간은 이 최대 크기 + 뜨는 거리까지
  // 포함해서 잡아야, 자라거나 떠오른 뒤에도 옆 영역(히어로 등)을 침범하거나
  // 화면 밖으로 잘리지 않는다.
  const burstScale = 1.18;
  const floatDistance = 10 + Math.random() * 10; // 10~20px

  let size = quote.getBoundingClientRect();
  // 3~4어절로 늘어난 묶음은 좁은 화면 폭보다 넓어질 수 있다. 부풀었을 때
  // 최대 폭(burstScale 적용)이 화면 가용 폭(좌우 안전 여백 제외)을 넘으면
  // 그 비율만큼 글자 크기를 줄여 화면 안에 들어오게 맞춘다.
  const availableWidth = Math.max(containerRect.width - marginX.left - marginX.right, 40);
  const projectedWidth = size.width * burstScale;
  if (projectedWidth > availableWidth) {
    const shrink = (availableWidth / projectedWidth) * 0.98;
    quote.style.fontSize = `${parseFloat(quote.style.fontSize) * shrink}px`;
    size = quote.getBoundingClientRect();
  }

  const growthW = size.width * (burstScale - 1);
  const growthH = size.height * (burstScale - 1);
  const reserveW = size.width + growthW;
  const reserveH = size.height + growthH + floatDistance;
  const placement = findClearPosition(reserveW, reserveH, obstacles, zone, marginX, required, containerRect);
  if (!placement) return null;
  const { x, y, rect } = placement;

  // 가로는 중앙 정렬, 세로는 아래쪽에 growthH/2만 남기고 나머지(위쪽)를
  // "떠오르는 동안 자랄 공간"으로 준다 — 떠오른 최종 위치에서도 위/아래
  // 모두 growthH/2씩 여유가 남도록 계산된 값이다.
  const offsetX = growthW / 2;
  const offsetY = growthH / 2 + floatDistance;
  const baseX = x + offsetX;
  const baseY = y + offsetY;

  const swellDuration = CHUNK_SWELL_DURATION;
  const holdDuration = CHUNK_HOLD_MIN + Math.random() * CHUNK_HOLD_RANGE;
  const burstDuration = CHUNK_BURST_DURATION;
  const totalDuration = swellDuration + holdDuration + burstDuration;

  gsap.set(quote, {
    x: baseX,
    y: baseY,
    scale: 0.55,
    opacity: 0,
    filter: "blur(7px)",
    transformOrigin: "50% 50%",
  });

  const tl = gsap.timeline();
  // 작고 흐린 상태 → 부드럽게 부풀며 선명해짐
  tl.to(quote, {
    scale: 1,
    opacity: 1,
    filter: "blur(0px)",
    duration: swellDuration,
    ease: "power2.out",
  }, 0);
  // 등장부터 사라질 때까지 쉬지 않고 제자리에서 위로 천천히 떠오름
  tl.to(quote, {
    y: baseY - floatDistance,
    duration: totalDuration,
    ease: "sine.inOut",
  }, 0);
  // 살짝 더 커지며 투명하게 터지듯 사라짐
  tl.to(quote, {
    scale: burstScale,
    opacity: 0,
    duration: burstDuration,
    ease: "power1.in",
  }, swellDuration + holdDuration);

  return { rect, lifespan: totalDuration };
}

// 64구절 중 무작위로 고른 말씀 하나를 의미 단위(2~4어절) 묶음으로 끊어,
// "단계"마다 최대 3개까지 서로 다른 위치에 동시에 띄운다. 화면이 좁아 3개가
// 겹치지 않게 안 들어가면 그 단계는 1~2개만 띄우고 남은 묶음은 다음 단계로
// 넘어간다. 한 단계의 모든 묶음이 완전히 사라진 뒤에야(그 단계의 lifespan
// 최댓값만큼 기다린 뒤) 다음 단계를 시작한다. 마지막 단계까지 끝나면 더 이상
// 새 말씀으로 넘어가지 않고 onAllDone을 호출한 뒤 멈춘다 — 오버레이가 떠
// 있는 총 시간은 곧 묶음 개수(=말씀 길이)에 비례해 자동으로 정해진다.
function startQuoteLoop(quotes, onAllDone) {
  const verseId = pickRandomVerseId();
  const chunks = chunkVerseIntoGroups(findVerseById(verseId).verse.text);
  const safe = getSafeMargins();
  const marginX = { left: Math.max(16, safe.left), right: Math.max(16, safe.right) };
  const quotesContainer = document.querySelector(".start-quotes");

  const MAX_CONCURRENT = MAX_CONCURRENT_QUOTES;
  const gapBetweenStages = STAGE_GAP;
  let chunkIndex = 0;
  let poolIndex = 0;
  let lastZone = null;

  function playNextStage() {
    if (chunkIndex >= chunks.length) {
      if (onAllDone) onAllDone();
      return;
    }

    // .quote는 .start-quotes를 기준으로 절대좌표 이동하므로, 그 컨테이너의
    // "지금" 뷰포트상 위치/크기를 매 단계 새로 실측해 좌표 변환 기준으로
    // 쓴다(리사이즈 등으로 바뀌어도 항상 최신 값을 쓰게 된다).
    const containerRect = quotesContainer.getBoundingClientRect();
    const stageObstacles = buildExclusionZones(containerRect);
    const attemptCount = Math.min(MAX_CONCURRENT, chunks.length - chunkIndex);
    let stageMaxLifespan = 0;

    for (let n = 0; n < attemptCount; n++) {
      const zone = pickZone(lastZone);
      const quote = quotes[poolIndex % quotes.length];
      // 단계의 첫 묶음은 반드시 어딘가에 배치하고(required=true), 두
      // 번째·세 번째부터는 겹치지 않는 자리를 못 찾으면 억지로 겹치게 두지
      // 않고 이번 단계를 여기서 마무리한다 — 공간이 좁은 화면에서 자동으로
      // 1~2개만 동시에 뜨게 되는 지점.
      const required = n === 0;
      const result = revealQuoteBubble(quote, chunks[chunkIndex], stageObstacles, zone, marginX, required, containerRect);
      if (!result) break;

      stageObstacles.push(result.rect);
      stageMaxLifespan = Math.max(stageMaxLifespan, result.lifespan);
      lastZone = zone;
      chunkIndex++;
      poolIndex++;
    }

    gsap.delayedCall(stageMaxLifespan + gapBetweenStages, playNextStage);
  }

  playNextStage();
  return chunks.length;
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

  const emblem = document.querySelector(".start-emblem");
  if (emblem) {
    gsap.from(emblem, { opacity: 0, scale: 0.94, duration: 0.6, ease: "power2.out" });
  }

  const quotes = gsap.utils.toArray(".quote");
  quotes.forEach(quote => {
    // left/top을 명시하지 않으면 브라우저가 각 span의 원래 인라인 흐름상
    // "가상 위치"(직전 형제들의 누적 폭에 따라 span마다 다름)를 기준으로
    // 잡아버려서, 이후 revealQuoteBubble의 x/y(절대 좌표로 가정한 translate)
    // 계산이 span마다 다른 만큼씩 어긋난다. left:0/top:0으로 기준점을
    // .start-quotes 좌상단으로 고정해 모든 span이 같은 원점을 쓰게 한다.
    gsap.set(quote, { position: "absolute", left: 0, top: 0, opacity: 0, whiteSpace: "nowrap" });
  });

  const glow = document.getElementById("start-decode-glow");
  if (glow) {
    gsap.to(glow, { opacity: 1, duration: 0.2 });
    gsap.to(glow, { opacity: 0, duration: 1.3, delay: 2.6, ease: "sine.inOut" });
  }
  // 문구별 등장/유지/페이드아웃은 각자의 timeline(revealQuoteBubble)이
  // 처리하고, startQuoteLoop이 그 timeline들을 단계별로(최대 3개 동시)
  // 재생한다 — 한 단계의 모든 묶음이 완전히 사라진 뒤에만 다음 단계로
  // 넘어가므로, 여러 구절이 뒤섞여 보이거나 등장 순서와 무관하게 한꺼번에
  // 사라지는 일은 없다.

  // Split the CTA into its final per-character markup first (still showing
  // its finished text at this point), re-measure the CTA's centering
  // against that final layout, and only then start its decode/scramble
  // tween — so the button is already sitting in its resting position
  // before anything starts visibly moving. This whole step waits for
  // webfonts to finish loading first: measuring against a fallback font's
  // metrics (then correcting later, once fonts.ready fires) is exactly
  // what used to let a mid-animation recompute lock in a slightly-off
  // final position. The title no longer needs this treatment since its
  // fog-clear effect (playTitleFogClear) never changes its text or size.
  function startTextDecode() {
    const titleEl = document.querySelector(".start-title");

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
    //
    // 말씀 쇼 전용 배경 스크림: 쇼가 시작되면 은은하게 켜져서 색상·불투명도를
    // 그대로 유지하다가, 마지막 묶음까지 완전히 사라진 뒤(onAllDone)에만
    // 페이드아웃한다. 제목/버튼 스크램블에 쓰이는 start-decode-glow와는
    // 별개의 요소라, 그 기존 타이밍에는 영향을 주지 않는다.
    const scrim = document.getElementById("quote-overlay-scrim");
    if (scrim) gsap.to(scrim, { opacity: 1, duration: 0.2 });
    const chunkCount = startQuoteLoop(quotes, () => {
      if (scrim) gsap.to(scrim, { opacity: 0, duration: 0.7, ease: "sine.inOut" });
    });

    if (titleEl) {
      playTitleFogClear(titleEl, chunkCount);
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
