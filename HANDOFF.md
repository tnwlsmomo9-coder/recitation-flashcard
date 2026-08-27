## HANDOFF — 현재 상태 인수인계

이 문서는 Claude Code와 Codex(또는 다른 협업 에이전트)가 교대로 작업할 때 사용하는 현재 상태 인수인계 문서입니다.
항상 이 파일에는 **현재 작업 트리 기준 상태만** 남기고, 과거 작업 이력은 Git 히스토리에서 확인하세요.

---

### 1) Git 상태

- 브랜치: `main`
- 현재 HEAD: `b415051` — `Add handoff document for Claude and Codex`
- `main`과 `origin/main`은 동일한 커밋(`b415051`)을 가리킵니다.
- 본 문서 최신화 직전 작업 트리는 clean 상태였습니다.
- 현재 소스 파일 변경은 없고, 이 최신화로 인한 `HANDOFF.md` unstaged 변경만 존재합니다.

---

### 2) 현재 구현 상태

- 시작 화면(랜딩/hero), 목차(TOC), 암송 학습 카드, 암송점검 및 랜덤 범위 선택 UI가 구현되어 있습니다.
- 암송 연습 모드(`full`, `lineByLine`, `progressive`, `initials`), 암기 상태 선택, 자동 이동, 검색 및 필터링 기능이 유지되어 있습니다.
- 로컬 저장소 기반 상태 관리(`js/storage.js`), 연습 로직(`js/practice.js`), 데이터(`js/data.js`)가 존재합니다.
- PWA 관련 `manifest.json`, `theme-color`, Apple 메타 태그 및 홈 화면 아이콘 연결이 `index.html`에 정상 유지되어 있습니다.
- `index.html`의 서비스워커 등록 스크립트와 `sw.js`가 유지되어 있습니다.
- 시작 화면의 `tabindex="0"`, `role="button"`, `aria-label`을 포함한 키보드 접근성용 DOM 속성이 유지되어 있습니다.
- 랜덤 범위 선택 UI의 `range-option-list`, `custom-picker-screen`, `custom-picker-list` DOM 구조가 관련 `js/app.js` 로직과 호환되는 현재 구조로 유지되어 있습니다.

---

### 3) 미완료 작업

- 현재 확인된 미완료 작업이나 중단된 소스 변경은 없습니다.
- 다음 작업은 새로운 요청 또는 명시적인 작업 지시를 기준으로 시작하세요.

---

### 4) 작업 주의사항

- 기존에 완료된 기능은 새 요청의 범위에 필요한 경우에만 수정하세요.
- 작업 시작 전 `git status` 및 관련 코드를 다시 확인하세요.
- 이 문서에 과거 작업 이력을 누적하지 말고, 작업 종료 시 현재 실제 상태로 갱신하세요.
