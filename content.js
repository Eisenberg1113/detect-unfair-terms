// ===== 효율적인 약관 탐지 시스템 =====

// 전역 상태 관리
const STATE = {
  isAnalyzing: false,
  hasAnalyzed: false,
  analysisCache: new Map(), // URL별 분석 결과 캐싱
  debounceTimer: null
};

// ===== 1단계: 빠른 사전 필터링 (URL & 메타데이터) =====

function shouldAnalyzePage() {
  const url = window.location.href.toLowerCase();
  const pathname = window.location.pathname.toLowerCase();

  // 제외할 도메인 (약관이 절대 없는 사이트)
  const excludeDomains = [
    'youtube.com',
    'youtu.be',
    'google.com',
    'gmail.com',
    'drive.google.com',
    'maps.google.com',
    'netflix.com',
    'spotify.com',
    'instagram.com',
    'facebook.com',
    'twitter.com',
    'x.com'
  ];

  // 제외 도메인 체크
  if (excludeDomains.some(domain => url.includes(domain))) {
    console.log('❌ 제외된 도메인 - 약관 탐지 스킵');
    return false;
  }

  // 약관 관련 URL 패턴 (우선 순위 높음)
  const termsPatterns = [
    /terms/i,
    /privacy/i,
    /policy/i,
    /agreement/i,
    /약관/,
    /개인정보/,
    /이용동의/,
    /signup/i,
    /register/i,
    /join/i,
    /회원가입/,
    /가입/
  ];

  // URL에 약관 관련 키워드가 있으면 분석
  if (termsPatterns.some(pattern => pattern.test(url) || pattern.test(pathname))) {
    console.log('✅ 약관 관련 URL 감지 - 분석 시작');
    return true;
  }

  // 페이지 제목 체크
  const title = document.title.toLowerCase();
  if (termsPatterns.some(pattern => pattern.test(title))) {
    console.log('✅ 약관 관련 페이지 제목 감지 - 분석 시작');
    return true;
  }

  // 빠른 키워드 스캔 (body에서 첫 1000자만 체크)
  const bodyText = document.body.innerText.substring(0, 1000).toLowerCase();
  const quickKeywords = [
    '개인정보 처리방침',
    '이용약관',
    '서비스 이용약관',
    'privacy policy',
    'terms of service',
    'terms and conditions'
  ];

  if (quickKeywords.some(keyword => bodyText.includes(keyword))) {
    console.log('✅ 약관 키워드 감지 - 분석 시작');
    return true;
  }

  console.log('⏭️ 약관 없는 페이지 - 탐지 스킵');
  return false;
}

// ===== 2단계: 캐싱 시스템 =====

function getCacheKey() {
  // URL + HTML 길이로 간단한 캐시 키 생성
  const url = window.location.href;
  const contentLength = document.body.innerHTML.length;
  return `${url}_${contentLength}`;
}

function isCached() {
  const cacheKey = getCacheKey();
  return STATE.analysisCache.has(cacheKey);
}

function saveToCache(terms) {
  const cacheKey = getCacheKey();
  STATE.analysisCache.set(cacheKey, {
    terms: terms,
    timestamp: Date.now()
  });

  // 캐시 크기 제한 (최대 50개)
  if (STATE.analysisCache.size > 50) {
    const firstKey = STATE.analysisCache.keys().next().value;
    STATE.analysisCache.delete(firstKey);
  }
}

function getFromCache() {
  const cacheKey = getCacheKey();
  return STATE.analysisCache.get(cacheKey);
}

// ===== 3단계: 효율적인 DOM 스캔 (타겟 방식) =====

function extractTermsText(progressCallback) {
  const candidates = [];

  // 전략 1: 특정 클래스/ID 이름으로 직접 타겟팅
  const targetSelectors = [
    // 약관 전용 컨테이너
    '[class*="terms"]',
    '[class*="privacy"]',
    '[class*="policy"]',
    '[class*="agreement"]',
    '[id*="terms"]',
    '[id*="privacy"]',
    '[id*="policy"]',
    '[id*="agreement"]',

    // 한글
    '[class*="약관"]',
    '[class*="개인정보"]',
    '[id*="약관"]',
    '[id*="개인정보"]',

    // 일반적인 약관 구조
    '.modal-body',
    '.terms-content',
    '.privacy-content',
    '.agreement-content',
    'dialog',
    '[role="dialog"]'
  ];

  // 진행률 업데이트: 10% - 타겟 선택자 준비 완료
  if (progressCallback) progressCallback(10, '타겟 요소 검색 중...');

  // 타겟 요소만 스캔
  const targetElements = new Set();
  targetSelectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => targetElements.add(el));
    } catch (e) {
      // 잘못된 선택자 무시
    }
  });

  console.log(`🎯 타겟 요소 ${targetElements.size}개 발견`);

  // 진행률 업데이트: 30% - 타겟 요소 발견
  if (progressCallback) progressCallback(30, `${targetElements.size}개 요소 발견`);

  // 타겟 요소가 없으면 전략 2로 전환
  if (targetElements.size === 0) {
    return fallbackScan(progressCallback);
  }

  // 타겟 요소 분석
  const totalElements = targetElements.size;
  let processedElements = 0;

  targetElements.forEach(el => {
    const text = (el.innerText || el.textContent || '').trim();

    // 기본 필터: 200자 이상, 50,000자 이하
    if (text.length < 200 || text.length > 50000) {
      processedElements++;
      return;
    }

    // 빠른 키워드 체크 (조기 종료)
    if (!hasTermsKeywords(text)) {
      processedElements++;
      return;
    }

    // 점수 계산
    const score = calculateTermsScore(el, text);

    if (score >= 60) {
      candidates.push({
        text: text,
        element: el.tagName,
        isRequired: checkIfRequired(el, text),
        score: score,
        features: analyzeFeatures(el, text)
      });
    }

    processedElements++;

    // 진행률 업데이트: 30% ~ 80%
    const progress = 30 + Math.floor((processedElements / totalElements) * 50);
    if (progressCallback && processedElements % Math.max(1, Math.floor(totalElements / 10)) === 0) {
      progressCallback(progress, `요소 분석 중... (${processedElements}/${totalElements})`);
    }
  });

  // 진행률 업데이트: 90% - 분석 완료
  if (progressCallback) progressCallback(90, '결과 정리 중...');

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// 전략 2: 폴백 스캔 (제한적 요소만)
function fallbackScan(progressCallback) {
  console.log('🔄 폴백 스캔 모드');

  const candidates = [];

  // 진행률 업데이트: 35% - 폴백 스캔 시작
  if (progressCallback) progressCallback(35, '전체 페이지 스캔 중...');

  // 약관이 있을 가능성이 높은 요소만 스캔
  const limitedElements = document.querySelectorAll('section, article, div[class], div[id], dialog');

  // 최대 100개만 체크 (성능 제한)
  const maxCheck = Math.min(limitedElements.length, 100);

  for (let i = 0; i < maxCheck; i++) {
    const el = limitedElements[i];
    const text = (el.innerText || el.textContent || '').trim();

    // 기본 필터
    if (text.length < 200 || text.length > 50000) continue;
    if (el.children.length > 15) continue; // 레이아웃 요소 제외

    // 빠른 키워드 체크
    if (!hasTermsKeywords(text)) continue;

    // 점수 계산
    const score = calculateTermsScore(el, text);

    if (score >= 60) {
      candidates.push({
        text: text,
        element: el.tagName,
        isRequired: checkIfRequired(el, text),
        score: score,
        features: analyzeFeatures(el, text)
      });
    }

    // 진행률 업데이트: 35% ~ 80%
    const progress = 35 + Math.floor((i / maxCheck) * 45);
    if (progressCallback && i % Math.max(1, Math.floor(maxCheck / 10)) === 0) {
      progressCallback(progress, `페이지 스캔 중... (${i}/${maxCheck})`);
    }

    // 이미 좋은 후보를 찾았으면 조기 종료
    if (candidates.length >= 3 && candidates.some(c => c.score >= 85)) {
      console.log('⚡ 고득점 약관 발견 - 스캔 조기 종료');
      if (progressCallback) progressCallback(80, '고득점 약관 발견!');
      break;
    }
  }

  // 진행률 업데이트: 90% - 분석 완료
  if (progressCallback) progressCallback(90, '결과 정리 중...');

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// 빠른 키워드 존재 체크 (조기 종료용)
function hasTermsKeywords(text) {
  const lowerText = text.toLowerCase();

  const essentialKeywords = [
    '개인정보', '이용약관', '동의', '수집', '제공',
    'privacy', 'terms', 'agreement', 'consent', 'personal'
  ];

  return essentialKeywords.some(keyword => lowerText.includes(keyword));
}

// ===== 4단계: 최적화된 점수 계산 =====

function calculateTermsScore(element, text) {
  let score = 0;
  const lowerText = text.toLowerCase();

  // 1. 텍스트 길이 점수 (최대 25점)
  const length = text.length;
  if (length > 500) score += 15;
  if (length > 1000) score += 5;
  if (length > 2000) score += 5;

  // 2. 키워드 점수 (최대 40점) - 최적화된 버전
  const highValueKeywords = [
    '개인정보', '수집', '이용약관', '서비스 이용', '동의', '제3자 제공',
    'privacy policy', 'terms of service', 'terms and conditions',
    'agreement', 'consent', 'personal information'
  ];

  const mediumValueKeywords = [
    '제공', '목적', '이용자', '회원', '정보', '처리', '마케팅',
    'user', 'personal', 'data', 'collect', 'process'
  ];

  let highMatches = 0, mediumMatches = 0;

  highValueKeywords.forEach(keyword => {
    if (lowerText.includes(keyword.toLowerCase())) {
      highMatches++;
    }
  });

  mediumValueKeywords.forEach(keyword => {
    if (lowerText.includes(keyword.toLowerCase())) {
      mediumMatches++;
    }
  });

  score += Math.min(highMatches * 8, 25);
  score += Math.min(mediumMatches * 2, 10);

  // 법률 구조 (제○조)
  if (/제\d+조|제 \d+ 조|article \d+/i.test(text)) {
    score += 5;
  }

  // 3. 구조적 특징 점수 (최대 25점)
  try {
    const styles = window.getComputedStyle(element);

    // 스크롤 가능한 박스
    const overflow = styles.overflow || styles.overflowY;
    if (overflow === 'auto' || overflow === 'scroll') {
      score += 10;
    }

    // 높이가 큰 요소
    if (element.scrollHeight > element.offsetHeight * 1.2) {
      score += 8;
    }

    // 테두리
    if (parseFloat(styles.borderWidth) > 0) {
      score += 5;
    }
  } catch (e) {
    // 무시
  }

  // 4. 위치적 특징 (최대 10점)
  // 체크박스 근처
  const nearbyCheckbox = element.querySelector('input[type="checkbox"]') ||
                         element.parentElement?.querySelector('input[type="checkbox"]');
  if (nearbyCheckbox) {
    score += 10;
  }

  return Math.min(score, 100);
}

// 약관 특징 분석
function analyzeFeatures(element, text) {
  return {
    type: identifyTermsType(text),
    hasLegalStructure: /제\d+조|article \d+/i.test(text),
    hasPrivacyContent: /개인정보|privacy/i.test(text),
    hasMarketingContent: /마케팅|marketing/i.test(text),
    language: detectLanguage(text),
    wordCount: text.split(/\s+/).length
  };
}

// 약관 타입 식별
function identifyTermsType(text) {
  const lower = text.toLowerCase();

  if (lower.includes('개인정보') || lower.includes('privacy')) return 'privacy';
  if (lower.includes('이용약관') || lower.includes('terms of service')) return 'terms';
  if (lower.includes('마케팅') || lower.includes('marketing')) return 'marketing';
  if (lower.includes('제3자') || lower.includes('third party')) return 'third-party';

  return 'unknown';
}

// 언어 감지
function detectLanguage(text) {
  const korean = (text.match(/[가-힣]/g) || []).length;
  const english = (text.match(/[a-zA-Z]/g) || []).length;
  const total = korean + english;

  if (total === 0) return 'unknown';

  const koreanRatio = korean / total;
  if (koreanRatio > 0.3) return 'ko';
  if (koreanRatio < 0.1) return 'en';
  return 'mixed';
}

// 필수 약관 확인
function checkIfRequired(element, text) {
  // 텍스트에서 직접 확인
  if (/\(필수\)|\[필수\]|필수 동의|required|mandatory/i.test(text)) {
    return true;
  }

  // 부모 요소 확인
  let parent = element.parentElement;
  for (let i = 0; i < 2 && parent; i++) {
    const parentText = (parent.innerText || '').toLowerCase();
    if (/필수|required|mandatory/i.test(parentText)) {
      return true;
    }
    parent = parent.parentElement;
  }

  // 체크박스 확인
  const nearbyCheckbox = element.querySelector('input[type="checkbox"]') ||
                         element.parentElement?.querySelector('input[type="checkbox"]');
  if (nearbyCheckbox?.required || nearbyCheckbox?.hasAttribute('required')) {
    return true;
  }

  return false;
}

// ===== 5단계: 메인 실행 로직 =====

function detectAndAnalyzeTerms() {
  // 이미 분석 중이면 스킵
  if (STATE.isAnalyzing) {
    console.log('⏸️ 이미 분석 중...');
    return;
  }

  // 디바운싱
  clearTimeout(STATE.debounceTimer);
  STATE.debounceTimer = setTimeout(() => {
    performDetection();
  }, 500); // 500ms 대기
}

function performDetection() {
  console.log('🔍 약관 탐지 시작...');

  // 1단계: URL/메타데이터 기반 사전 필터링
  if (!shouldAnalyzePage()) {
    return;
  }

  // 2단계: 캐시 확인
  if (isCached()) {
    console.log('💾 캐시된 결과 사용');
    const cached = getFromCache();
    if (cached && cached.terms.length > 0) {
      // UI 표시 (캐시)
      if (window.termsDetectorUI) {
        window.termsDetectorUI.show();
        window.termsDetectorUI.updateProgress(100, '캐시된 결과 사용');
        setTimeout(() => {
          window.termsDetectorUI.showSuccess(
            `${cached.terms.length}개의 약관을 찾았습니다. (캐시)`,
            cached.terms.length,
            0
          );
        }, 300);
      }
      sendToBackground(cached.terms);
    }
    return;
  }

  STATE.isAnalyzing = true;
  STATE.hasAnalyzed = true;

  // UI 생성 및 표시
  if (window.termsDetectorUI) {
    window.termsDetectorUI.show();
    window.termsDetectorUI.showIndeterminate('페이지 분석 준비 중...');
  }

  // 3단계: 실제 탐지 (프로그레스 콜백 포함)
  const startTime = performance.now();

  const progressCallback = (percent, status) => {
    if (window.termsDetectorUI) {
      window.termsDetectorUI.updateProgress(percent, status);
    }
  };

  const terms = extractTermsText(progressCallback);
  const endTime = performance.now();
  const timeMs = endTime - startTime;

  console.log(`⏱️ 탐지 소요 시간: ${timeMs.toFixed(2)}ms`);

  if (terms.length > 0) {
    console.log(`✅ 약관 발견: ${terms.length}개`);

    terms.forEach((term, index) => {
      console.log(`${index + 1}. [${term.score}점] ${term.features.type} (${term.features.language}) - ${term.isRequired ? '필수' : '선택'}`);
    });

    // 캐시 저장
    saveToCache(terms);

    // UI 업데이트 - 성공
    if (window.termsDetectorUI) {
      window.termsDetectorUI.updateProgress(100, `${terms.length}개의 약관 발견!`);
      setTimeout(() => {
        window.termsDetectorUI.showSuccess(
          `${terms.length}개의 약관을 찾았습니다.`,
          terms.length,
          timeMs
        );
        window.termsDetectorUI.updateStats(
          terms.length > 0 ? Math.round(terms.length * 10) : 10,
          terms.length,
          timeMs
        );
      }, 300);
    }

    // Background로 전송
    sendToBackground(terms);
  } else {
    console.log('❌ 약관 없음');

    // UI 업데이트 - 약관 없음
    if (window.termsDetectorUI) {
      window.termsDetectorUI.showNoTerms();
    }
  }

  STATE.isAnalyzing = false;
}

function sendToBackground(terms) {
  chrome.runtime.sendMessage({
    action: 'analyzeTerms',
    terms: terms,
    url: window.location.href
  });

  chrome.runtime.sendMessage({
    action: 'updateBadge',
    text: '분석중'
  });
}

// ===== 6단계: 이벤트 리스너 (스마트 초기화) =====

// 페이지 로드 시 실행
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', detectAndAnalyzeTerms);
} else {
  // DOM이 이미 준비되었으면 즉시 실행
  detectAndAnalyzeTerms();
}

// MutationObserver - 최적화 버전 (약관 관련 페이지에서만 활성화)
if (shouldAnalyzePage()) {
  const observer = new MutationObserver((mutations) => {
    // 이미 분석했으면 무시
    if (STATE.hasAnalyzed) return;

    let hasSignificantChange = false;

    for (let mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        for (let node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const text = (node.innerText || '').trim();
            if (text.length > 200 && hasTermsKeywords(text)) {
              hasSignificantChange = true;
              break;
            }
          }
        }
      }
      if (hasSignificantChange) break;
    }

    if (hasSignificantChange) {
      console.log('📝 새로운 약관 콘텐츠 감지');
      detectAndAnalyzeTerms();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// 수동 트리거 및 분석 완료 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'manualAnalyze') {
    console.log('🔧 수동 분석 요청');
    STATE.hasAnalyzed = false; // 재분석 허용
    STATE.analysisCache.clear(); // 캐시 초기화
    performDetection();
    sendResponse({ success: true });
  } else if (request.action === 'analysisComplete') {
    console.log('📬 분석 완료 메시지 받음:', request);

    if (request.success) {
      console.log('✅ API 분석 성공');
      // UI는 이미 약관 발견 상태로 표시되어 있음
    } else {
      console.log('❌ API 분석 실패:', request.error);

      // UI에 에러 표시
      if (window.termsDetectorUI) {
        window.termsDetectorUI.showError(
          request.error || '분석 중 오류가 발생했습니다.'
        );
      }
    }
  }
});

console.log('✨ 효율적인 약관 탐지 시스템 초기화 완료');