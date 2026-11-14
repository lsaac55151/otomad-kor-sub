// -------------------------------------------------------------
// 해외 자막 음매드 모음 - Main Application Module
// -------------------------------------------------------------

window.app = (function () {
  let state = {
    data: null,
    videos: [],
    viewMode: 'tag', // 'tag' | 'all' | 'subtitler' | 'creator'
    selectedTag: '',
    selectedCategory: 'all', // 'all' | 'youtube' | 'naver'
    sortOrder: 'latest', // 'latest' | 'oldest' | 'name' | 'random'
    gridDensity: localStorage.getItem('archive_grid_density') || '4', // '3' | '4' | '5'
    lang: 'ko',
    theme: 'light',
    searchQuery: '',
    activePlayers: {},
    isEditMode: false,
    serverConnected: false,
    randomWeights: {}
  };

  const getRandomWeight = (key) => {
    if (!state.randomWeights[key]) state.randomWeights[key] = Math.random();
    return state.randomWeights[key];
  };

  const parseCreators = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
    return String(val).split(',').map(s => s.trim()).filter(Boolean);
  };

  const parseSubtitlers = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
    return String(val).split(',').map(s => s.trim()).filter(Boolean);
  };

  const getPlatformCategory = (v) => {
    if (!v) return 'youtube';
    const hasNaver = v.platform === 'naver' || (!v.yt_id && Boolean(v.naver_url || v.naver_vid));
    return hasNaver ? 'naver' : 'youtube';
  };

  const getVideoTags = (v) => {
    const ignoredTags = new Set(['자막', '음매드']);
    return (Array.isArray(v?.tags) ? v.tags : (v?.tags ? [v.tags] : []))
      .map(t => String(t).trim().replace(/^#/, ''))
      .filter(t => t && !ignoredTags.has(t));
  };

  const getThumbnail = (v) => {
    if (!v) return '';
    if (v.thumbnail_url && v.thumbnail_url.trim()) {
      return v.thumbnail_url.trim();
    }
    const ytId = v.yt_id || API.extractYtId(v.original_link);
    if (ytId) {
      return `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
    }
    if (v.nico_id) {
      const match = String(v.nico_id).match(/\d+/);
      if (match) return `https://nicovideo.cdn.nimg.jp/thumbnails/${match[0]}/${match[0]}`;
    }
    return 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=640&auto=format&fit=crop&q=80';
  };

  const matchSearch = (video, query) => {
    if (!query) return true;
    const q = API.cleanStr(query);
    if (!q) return true;
    const targets = [
      video.title,
      video.originalTitle,
      ...parseCreators(video.creator),
      ...parseSubtitlers(video.subtitler),
      video.description,
      video.yt_id,
      video.original_link,
      ...(Array.isArray(video.tags) ? video.tags : [video.tags])
    ].filter(Boolean);
    return targets.some(t => API.cleanStr(t).includes(q));
  };

  const matchCategory = (video, category) => {
    if (!category || category === 'all') return true;
    return getPlatformCategory(video) === category;
  };

  const matchTag = (video, tag) => {
    if (!tag) return true;
    const tags = getVideoTags(video);
    if (tag === '기타') return tags.length === 0;
    return tags.includes(tag);
  };

  const sortVideos = (list) => {
    const arr = [...list];
    if (state.sortOrder === 'latest') {
      arr.sort((a, b) => {
        const cmp = API.getRefinedDate(b).localeCompare(API.getRefinedDate(a));
        if (cmp !== 0) return cmp;
        return (a.title || "").localeCompare(b.title || "", state.lang);
      });
    } else if (state.sortOrder === 'oldest') {
      arr.sort((a, b) => {
        const dateA = API.getRefinedDate(a);
        const dateB = API.getRefinedDate(b);
        const validA = dateA && dateA !== '0000/00/00' ? dateA : '9999/99/99';
        const validB = dateB && dateB !== '0000/00/00' ? dateB : '9999/99/99';
        const cmp = validA.localeCompare(validB);
        if (cmp !== 0) return cmp;
        return (a.title || "").localeCompare(b.title || "", state.lang);
      });
    } else if (state.sortOrder === 'name') {
      arr.sort((a, b) => (a.title || "").localeCompare(b.title || "", state.lang));
    } else if (state.sortOrder === 'random') {
      arr.sort((a, b) => getRandomWeight(a.id || a.title) - getRandomWeight(b.id || b.title));
    }
    return arr;
  };

  const sortVideosInState = (order = state.sortOrder || 'latest') => {
    state.videos.sort((a, b) => {
      const dateA = API.getRefinedDate(a);
      const dateB = API.getRefinedDate(b);
      if (order === 'latest') {
        const cmp = dateB.localeCompare(dateA);
        if (cmp !== 0) return cmp;
        return (a.title || "").localeCompare(b.title || "", state.lang);
      }
      if (order === 'oldest') {
        const validA = dateA && dateA !== '0000/00/00' ? dateA : '9999/99/99';
        const validB = dateB && dateB !== '0000/00/00' ? dateB : '9999/99/99';
        const cmp = validA.localeCompare(validB);
        if (cmp !== 0) return cmp;
        return (a.title || "").localeCompare(b.title || "", state.lang);
      }
      if (order === 'name') return (a.title || "").localeCompare(b.title || "", state.lang);
      return 0;
    });
    if (state.data) state.data.videos = state.videos;
  };

  // URL 쿼리 파라미터 동기화
  const syncURLParams = () => {
    try {
      const url = new URL(window.location);
      if (state.viewMode && state.viewMode !== 'tag') url.searchParams.set('view', state.viewMode);
      else url.searchParams.delete('view');

      if (state.selectedTag) url.searchParams.set('tag', state.selectedTag);
      else url.searchParams.delete('tag');

      if (state.selectedCategory && state.selectedCategory !== 'all') url.searchParams.set('cat', state.selectedCategory);
      else url.searchParams.delete('cat');

      if (state.sortOrder && state.sortOrder !== 'latest') url.searchParams.set('sort', state.sortOrder);
      else url.searchParams.delete('sort');

      if (state.searchQuery && state.searchQuery.trim()) url.searchParams.set('q', state.searchQuery.trim());
      else url.searchParams.delete('q');

      window.history.replaceState({}, '', url);
    } catch (_) {}
  };

  // 테마 관리 (기본: 라이트 모드, 즉시 일괄 전환)
  const initTheme = () => {
    const saved = localStorage.getItem('archive_theme') || 'light';
    setTheme(saved, false);
  };

  const setTheme = (theme) => {
    const docEl = document.documentElement;
    docEl.classList.add('theme-transitioning');

    state.theme = theme;
    docEl.setAttribute('data-theme', theme);
    localStorage.setItem('archive_theme', theme);

    const btn = document.getElementById('btn-theme-toggle');
    if (btn) {
      if (theme === 'light') {
        btn.innerHTML = `
          <i id="theme-icon" data-lucide="sun" class="w-3.5 h-3.5 theme-text-sub"></i>
          <span id="theme-text" class="hidden sm:inline text-[11px] font-medium">라이트</span>
        `;
        btn.title = '현재 라이트 모드 (클릭 시 다크 모드로 전환)';
      } else {
        btn.innerHTML = `
          <i id="theme-icon" data-lucide="moon" class="w-3.5 h-3.5 theme-text-sub"></i>
          <span id="theme-text" class="hidden sm:inline text-[11px] font-medium">다크</span>
        `;
        btn.title = '현재 다크 모드 (클릭 시 라이트 모드로 전환)';
      }
      if (window.lucide) {
        try {
          lucide.createIcons({ root: btn });
        } catch (_) {
          lucide.createIcons();
        }
      }
    }

    void document.body.offsetHeight;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        docEl.classList.remove('theme-transitioning');
      });
    });
  };

  const toggleTheme = () => {
    const next = state.theme === 'light' ? 'dark' : 'light';
    setTheme(next);
  };

  // 그리드 밀도 클래스 계산 (모바일 1~2열 스택, 16px/24px 일정 간격)
  const getDensityGridClass = (density = state.gridDensity) => {
    switch (String(density)) {
      case '3':
        return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6';
      case '5':
        return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4';
      case '4':
      default:
        return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
    }
  };

  const updateDensityButtonsUI = () => {
    ['3', '4', '5'].forEach(d => {
      const btn = document.getElementById(`btn-density-${d}`);
      if (btn) {
        btn.className = d === String(state.gridDensity)
          ? 'px-2 py-1 rounded-md theme-accent-btn font-semibold'
          : 'px-2 py-1 rounded-md theme-text-sub theme-hover-text transition-colors';
      }
    });
  };

  const setGridDensity = (density) => {
    const normalized = ['3', '4', '5'].includes(String(density)) ? String(density) : '4';
    state.gridDensity = normalized;
    localStorage.setItem('archive_grid_density', normalized);
    updateDensityButtonsUI();
    if (window.Builder && Builder.state && Builder.state.gridColumns !== 'auto') {
      Builder.state.gridColumns = 'auto';
    }
    render();
  };

  // 스켈레톤 로딩 상태 렌더러
  const renderSkeleton = () => {
    const main = document.getElementById('main-content');
    const gridCls = getDensityGridClass();
    main.innerHTML = `
      <div class="${gridCls}">
        ${Array(8).fill(0).map(() => `
          <div class="rounded-xl border theme-border-subtle theme-bg-surface overflow-hidden">
            <div class="w-full aspect-video skeleton"></div>
            <div class="p-3.5 space-y-2.5">
              <div class="h-3.5 w-4/5 rounded skeleton"></div>
              <div class="flex items-center justify-between pt-1">
                <div class="h-4 w-14 rounded-full skeleton"></div>
                <div class="h-3 w-16 rounded skeleton"></div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  };

  // 데이터 로드
  const loadData = async () => {
    renderSkeleton();
    try {
      const raw = await API.fetchDataJSON();
      state.data = raw;
      state.videos = Array.isArray(raw.videos) ? raw.videos : [];
      if (raw.config?.title) document.getElementById('site-title').textContent = raw.config.title;
      if (raw.config?.subtitle) document.getElementById('site-subtitle').textContent = raw.config.subtitle;
      if (state.isEditMode) updateSiteHeaderEditability();
    } catch (err) {
      console.warn("데이터 로드 실패:", err);
      state.videos = [];
    }
    render();
  };

  // 서버 저장
  const saveDataToServer = async (customData = null) => {
    const fullData = customData || {
      config: state.data?.config || {},
      creatorMap: state.data?.creatorMap || {},
      profileMap: state.data?.profileMap || {},
      channelMap: state.data?.channelMap || {},
      videos: state.videos
    };
    try {
      await API.saveDataJSON(fullData);
      API.showToast('data.json 파일에 저장되었습니다.', 'success');
      state.data = fullData;
      state.videos = Array.isArray(fullData.videos) ? fullData.videos : [];
      render();
      return true;
    } catch (err) {
      API.showToast(`저장 실패: ${err.message}`, 'error');
      return false;
    }
  };

  // 상단 가로형 필터 칩 & 활성 필터 요약 배너 렌더링
  const renderFilterChrome = (searchMatchedVideos, finalFilteredCount) => {
    const filterStrip = document.getElementById('category-filter-strip');
    const catContainer = document.getElementById('category-chips-container');
    const tagContainer = document.getElementById('tag-chips-container');
    const activeBanner = document.getElementById('active-filter-banner');
    const activePills = document.getElementById('active-filter-pills');
    const resultCountEl = document.getElementById('search-result-count');
    const clearSearchBtn = document.getElementById('search-clear-btn');

    if (clearSearchBtn) {
      if (state.searchQuery.trim()) clearSearchBtn.classList.remove('hidden');
      else clearSearchBtn.classList.add('hidden');
    }

    // 1. 가로형 카테고리 & 인기 태그 필터 스트립 ('all' 뷰에서 노출)
    if (filterStrip && catContainer && tagContainer) {
      if (state.viewMode === 'all' && state.videos.length > 0) {
        filterStrip.classList.remove('hidden');

        const ytCount = searchMatchedVideos.filter(v => getPlatformCategory(v) === 'youtube').length;
        const naverCount = searchMatchedVideos.filter(v => getPlatformCategory(v) === 'naver').length;

        const categories = [
          { key: 'all', label: '전체', count: searchMatchedVideos.length },
          { key: 'youtube', label: 'YouTube', count: ytCount },
          { key: 'naver', label: 'NAVER', count: naverCount }
        ];

        catContainer.innerHTML = categories.map(c => {
          const isActive = state.selectedCategory === c.key;
          return `
            <button onclick="app.setCategoryFilter('${c.key}')"
              class="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors shrink-0 inline-flex items-center gap-1 ${isActive
                ? 'theme-accent-btn font-semibold'
                : 'theme-bg-subtle theme-text-sub theme-hover-bg theme-hover-text border theme-border-subtle'}">
              <span>${c.label}</span>
              <span class="font-mono text-[10px] ${isActive ? 'opacity-90' : 'theme-text-muted'}">${c.count}</span>
            </button>
          `;
        }).join('');

        // 태그 집계 (현재 카테고리+검색 기준)
        const catFiltered = searchMatchedVideos.filter(v => matchCategory(v, state.selectedCategory));
        const tagCounts = {};
        catFiltered.forEach(v => {
          const tList = getVideoTags(v);
          tList.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
        });
        const topTags = Object.entries(tagCounts)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], state.lang))
          .slice(0, 14)
          .map(([tag]) => tag);

        if (state.selectedTag && !topTags.includes(state.selectedTag)) {
          topTags.unshift(state.selectedTag);
        }

        tagContainer.innerHTML = topTags.map(tag => {
          const isActive = state.selectedTag === tag;
          return `
            <button onclick="app.selectTagFilter('${API.escapeHTML(isActive ? '' : tag)}', 'all')"
              class="px-2.5 py-1 rounded-full text-[11px] transition-colors shrink-0 ${isActive
                ? 'theme-accent-soft border font-semibold'
                : 'theme-bg-surface theme-text-sub theme-hover-bg theme-hover-text border theme-border-subtle'}">
              #${API.escapeHTML(tag)}
            </button>
          `;
        }).join('');
      } else {
        filterStrip.classList.add('hidden');
      }
    }

    // 2. 선택된 필터 조건 요약 배너
    if (activeBanner && activePills && resultCountEl) {
      const pills = [];
      if (state.searchQuery.trim()) {
        pills.push(`
          <span class="pill-badge pill-badge-accent">
            <span>검색: "${API.escapeHTML(state.searchQuery.trim())}"</span>
          </span>
        `);
      }
      if (state.viewMode === 'all' && state.selectedCategory !== 'all') {
        const catName = state.selectedCategory === 'youtube' ? 'YouTube' : 'NAVER';
        pills.push(`
          <span class="pill-badge pill-badge-accent">
            <span>분류: ${catName}</span>
          </span>
        `);
      }
      if (state.selectedTag) {
        pills.push(`
          <span class="pill-badge pill-badge-accent">
            <span>태그: #${API.escapeHTML(state.selectedTag)}</span>
          </span>
        `);
      }

      if (pills.length > 0) {
        activePills.innerHTML = pills.join('');
        resultCountEl.textContent = `${finalFilteredCount}건`;
        activeBanner.classList.remove('hidden');
      } else {
        activeBanner.classList.add('hidden');
      }
    }
  };

  // 메인 렌더링
  const render = () => {
    const main = document.getElementById('main-content');
    const curI18n = window.I18N[state.lang];

    // 헤더 뷰 모드 탭 동기화
    ['tag', 'all', 'subtitler', 'creator'].forEach(m => {
      const btn = document.getElementById(`btn-${m}`);
      if (btn) {
        btn.className = state.viewMode === m
          ? 'px-2.5 py-1 rounded-md text-xs theme-accent-btn font-semibold'
          : 'px-2.5 py-1 rounded-md text-xs font-medium theme-text-sub theme-hover-text transition-colors';
      }
    });

    updateDensityButtonsUI();

    // 정렬 선택 라벨 동기화
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      if (sortSelect.value !== state.sortOrder) sortSelect.value = state.sortOrder;
      if (curI18n) {
        const optLatest = sortSelect.querySelector('option[value="latest"]');
        const optOldest = sortSelect.querySelector('option[value="oldest"]');
        const optName = sortSelect.querySelector('option[value="name"]');
        const optRandom = sortSelect.querySelector('option[value="random"]');
        if (optLatest) optLatest.textContent = curI18n.sortLatest;
        if (optOldest) optOldest.textContent = curI18n.sortOldest;
        if (optName) optName.textContent = curI18n.sortName;
        if (optRandom) optRandom.textContent = curI18n.sortRandom;
      }
    }

    const searchMatched = state.videos.filter(v => matchSearch(v, state.searchQuery));

    // 현재 뷰에 맞는 최종 필터 계산
    let finalFiltered = searchMatched;
    if (state.viewMode === 'all') {
      finalFiltered = searchMatched.filter(v =>
        matchCategory(v, state.selectedCategory) && matchTag(v, state.selectedTag)
      );
    } else if (state.viewMode === 'tag' && state.selectedTag) {
      finalFiltered = searchMatched.filter(v => matchTag(v, state.selectedTag));
    }

    renderFilterChrome(searchMatched, finalFiltered.length);

    // 빈 상태 (Empty State)
    if (finalFiltered.length === 0) {
      main.innerHTML = `
        <div class="py-20 text-center border border-dashed theme-border-medium rounded-xl my-4 theme-bg-surface">
          <p class="text-sm font-semibold theme-text-main">${curI18n.noVideos}</p>
          <p class="text-xs theme-text-muted mt-1">${curI18n.noVideosDesc}</p>
          ${(state.searchQuery || state.selectedCategory !== 'all' || state.selectedTag) ? `
            <button onclick="app.clearAllFilters()" class="mt-4 px-3.5 py-1.5 rounded-lg border theme-border-medium theme-bg-subtle theme-hover-bg text-xs theme-text-main font-medium transition-colors">
              필터 초기화
            </button>
          ` : ''}
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const gridClass = window.Builder && state.isEditMode
      ? Builder.getGridClass()
      : getDensityGridClass();
    const densityClass = window.Builder && Builder.state.cardDensity === 'compact' ? 'card-compact' : '';

    if (state.viewMode === 'all') {
      const sorted = sortVideos(finalFiltered);
      main.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center justify-between pb-2.5 border-b theme-border-subtle text-xs theme-text-muted">
            <span class="font-medium theme-text-sub">전체 아카이브</span>
            <span class="font-mono">${sorted.length.toLocaleString()}건</span>
          </div>
          <div class="${gridClass} ${densityClass}">
            ${sorted.map((v, i) => renderCard(v, `all-${i}`)).join('')}
          </div>
        </div>
      `;
    } else if (state.viewMode === 'tag') {
      const tagGroups = {};
      const tagCounts = {};

      searchMatched.forEach(v => {
        const rawTags = getVideoTags(v);
        const effectiveTags = rawTags.length ? rawTags : ['기타'];
        effectiveTags.forEach(tag => {
          if (!tagGroups[tag]) tagGroups[tag] = [];
          tagGroups[tag].push(v);
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      });

      const tagDateStats = {};
      Object.entries(tagGroups).forEach(([tag, vList]) => {
        let minDate = '9999/99/99';
        let maxDate = '0000/00/00';
        vList.forEach(v => {
          const d = API.getRefinedDate(v);
          if (d && d !== '0000/00/00') {
            if (d < minDate) minDate = d;
            if (d > maxDate) maxDate = d;
          }
        });
        tagDateStats[tag] = {
          min: minDate === '9999/99/99' ? '0000/00/00' : minDate,
          max: maxDate
        };
      });

      const sortedTags = Object.keys(tagGroups).sort((a, b) => {
        if (state.sortOrder === 'name') {
          return a.localeCompare(b, state.lang);
        } else if (state.sortOrder === 'latest') {
          const maxA = tagDateStats[a]?.max || '0000/00/00';
          const maxB = tagDateStats[b]?.max || '0000/00/00';
          const cmp = maxB.localeCompare(maxA);
          if (cmp !== 0) return cmp;
          const countDiff = (tagCounts[b] || 0) - (tagCounts[a] || 0);
          if (countDiff !== 0) return countDiff;
          return a.localeCompare(b, state.lang);
        } else if (state.sortOrder === 'oldest') {
          const minA = tagDateStats[a]?.min && tagDateStats[a].min !== '0000/00/00' ? tagDateStats[a].min : '9999/99/99';
          const minB = tagDateStats[b]?.min && tagDateStats[b].min !== '0000/00/00' ? tagDateStats[b].min : '9999/99/99';
          const cmp = minA.localeCompare(minB);
          if (cmp !== 0) return cmp;
          const countDiff = (tagCounts[b] || 0) - (tagCounts[a] || 0);
          if (countDiff !== 0) return countDiff;
          return a.localeCompare(b, state.lang);
        } else if (state.sortOrder === 'random') {
          return getRandomWeight(a) - getRandomWeight(b);
        }
        if (a === '기타') return 1;
        if (b === '기타') return -1;
        const countDiff = (tagCounts[b] || 0) - (tagCounts[a] || 0);
        if (countDiff !== 0) return countDiff;
        return a.localeCompare(b, state.lang);
      });

      const playlistDateLabel = state.sortOrder === 'oldest' ? (curI18n.playlistOldestVideo || '최초 업로드') : (curI18n.playlistLatestVideo || '최신 업로드');

      if (state.selectedTag && tagGroups[state.selectedTag]) {
        const currentTagVideos = sortVideos(tagGroups[state.selectedTag]);
        const coverVideo = currentTagVideos[0];
        const coverThumb = coverVideo ? getThumbnail(coverVideo) : '';
        const repDate = state.sortOrder === 'oldest' ? tagDateStats[state.selectedTag]?.min : tagDateStats[state.selectedTag]?.max;
        const latestDateText = repDate && repDate !== '0000/00/00' && repDate !== '9999/99/99'
          ? API.formatDisplayDate(repDate)
          : (coverVideo ? API.formatDisplayDate(coverVideo) : '-');

        main.innerHTML = `
          <div class="mb-6 space-y-4">
            <button onclick="app.selectTagFilter('')"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border theme-border-subtle theme-bg-surface theme-hover-bg text-xs theme-text-main font-medium transition-colors">
              <i data-lucide="arrow-left" class="w-3.5 h-3.5 theme-accent-text"></i>
              <span>모든 컬렉션 보기</span>
            </button>

            <div class="p-4 sm:p-5 rounded-xl border theme-border-subtle theme-bg-surface flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div class="playlist-deck-stack w-32 sm:w-40 shrink-0">
                <div class="playlist-deck-layer-1"></div>
                <div class="playlist-deck-layer-2"></div>
                <div class="playlist-thumb-box">
                  <img src="${coverThumb}" referrerpolicy="no-referrer" class="w-full h-full object-cover object-center" onerror="if(!this.dataset.fallback && this.src.includes('maxresdefault')){this.dataset.fallback=1;this.src=this.src.replace('maxresdefault.jpg','hqdefault.jpg');}" />
                </div>
              </div>
              <div class="min-w-0 text-left space-y-1.5">
                <div class="flex items-center gap-2 text-xs">
                  <span class="pill-badge pill-badge-accent">컬렉션</span>
                  <span class="font-mono theme-text-muted">${currentTagVideos.length}개 동영상</span>
                </div>
                <h2 class="text-lg sm:text-xl font-bold theme-text-main tracking-tight truncate">
                  ${API.escapeHTML(state.selectedTag)}
                </h2>
                <p class="text-xs theme-text-muted font-mono">
                  ${playlistDateLabel}: ${latestDateText}
                </p>
              </div>
            </div>
          </div>

          <div class="${gridClass} ${densityClass}">
            ${currentTagVideos.map((v, i) => renderCard(v, `tag-${state.selectedTag}-${i}`)).join('')}
          </div>
        `;
      } else {
        main.innerHTML = `
          <div class="space-y-5">
            <div class="flex items-center justify-between pb-2.5 border-b theme-border-subtle">
              <div class="flex items-baseline gap-2">
                <h2 class="text-sm font-semibold theme-text-main tracking-tight">태그별 컬렉션</h2>
                <span class="text-xs font-mono theme-accent-text font-semibold">${sortedTags.length}개</span>
              </div>
              <div class="text-xs theme-text-muted font-mono">
                총 ${searchMatched.length.toLocaleString()}건
              </div>
            </div>

            <div class="${gridClass}">
              ${sortedTags.map(tag => {
                const gVideos = sortVideos(tagGroups[tag]);
                const repVideo = state.sortOrder === 'oldest'
                  ? gVideos[0]
                  : (tagGroups[tag].find(v => API.getRefinedDate(v) === tagDateStats[tag]?.max) || gVideos[0]);
                const coverThumb = repVideo ? getThumbnail(repVideo) : '';
                const repDate = state.sortOrder === 'oldest' ? tagDateStats[tag]?.min : tagDateStats[tag]?.max;
                const dateText = repDate && repDate !== '0000/00/00' && repDate !== '9999/99/99'
                  ? API.formatDisplayDate(repDate)
                  : (repVideo ? API.formatDisplayDate(repVideo) : '-');

                return `
                  <div class="playlist-card group" onclick="app.selectTagFilter('${API.escapeHTML(tag)}')">
                    <div class="playlist-deck-stack">
                      <div class="playlist-deck-layer-1"></div>
                      <div class="playlist-deck-layer-2"></div>
                      <div class="playlist-thumb-box">
                        <img src="${coverThumb}" alt="${API.escapeHTML(tag)}" referrerpolicy="no-referrer" class="w-full h-full object-cover object-center" loading="lazy" onerror="if(!this.dataset.fallback && this.src.includes('maxresdefault')){this.dataset.fallback=1;this.src=this.src.replace('maxresdefault.jpg','hqdefault.jpg');}" />
                        <div class="absolute inset-x-0 bottom-0 h-12 thumb-scrim pointer-events-none"></div>
                        <div class="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-sm flex items-center gap-1 text-[11px] font-mono font-medium text-white z-10">
                          <i data-lucide="list-video" class="w-3 h-3 opacity-90"></i>
                          <span>${gVideos.length.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <div class="mt-2.5 text-left space-y-1">
                      <h3 class="text-[13px] font-semibold theme-text-main line-clamp-2 leading-snug" title="${API.escapeHTML(tag)}">
                        ${API.escapeHTML(tag)}
                      </h3>
                      <div class="flex items-center justify-between gap-2 text-[11px] theme-text-muted font-mono">
                        <span>동영상 ${gVideos.length.toLocaleString()}개</span>
                        <span>${dateText}</span>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }
    } else if (state.viewMode === 'subtitler' || state.viewMode === 'creator') {
      const isSub = state.viewMode === 'subtitler';
      const groups = {};
      searchMatched.forEach(v => {
        const names = isSub ? parseSubtitlers(v.subtitler) : parseCreators(v.creator);
        const effectiveNames = names.length ? names : ['Unknown'];
        effectiveNames.forEach(name => {
          if (!groups[name]) groups[name] = [];
          groups[name].push(v);
        });
      });

      const sortedNames = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
      const pmap = state.data?.profileMap || {};

      main.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center justify-between pb-2.5 border-b theme-border-subtle text-xs">
            <span class="font-medium theme-text-sub">${isSub ? '자막 제작자' : '원작자'} 디렉토리</span>
            <span class="font-mono theme-text-muted">${sortedNames.length.toLocaleString()}명</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            ${sortedNames.map(name => {
              const count = groups[name].length;
              const profile = pmap[name] || 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=100';
              const channelUrl = (state.data?.channelMap || {})[name] || (pmap[name] && pmap[name].match(/usericon\/\d+\/(\d+)/) ? `https://www.nicovideo.jp/user/${pmap[name].match(/usericon\/\d+\/(\d+)/)[1]}` : null);
              const isNico = channelUrl && (channelUrl.includes('nicovideo') || channelUrl.includes('nico.ms'));
              const isYt = channelUrl && (channelUrl.includes('youtube') || channelUrl.includes('youtu.be'));
              const isNaver = channelUrl && channelUrl.includes('naver');

              return `
                <div onclick="Modals.openCreatorModal('${API.escapeHTML(name)}', '${state.viewMode}')"
                  class="card-item p-3 rounded-xl cursor-pointer flex items-center justify-between gap-3">
                  <div class="flex items-center gap-3 min-w-0 flex-grow text-left">
                    <div class="w-10 h-10 rounded-lg overflow-hidden theme-bg-subtle shrink-0 border theme-border-hairline">
                      <img src="${profile}" referrerpolicy="no-referrer" class="w-full h-full object-cover" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1534447677768-be436bb09401?w=100'" />
                    </div>
                    <div class="flex-grow min-w-0">
                      <h3 class="text-xs font-semibold theme-text-main truncate">${API.escapeHTML(name)}</h3>
                      <p class="text-[11px] theme-text-muted font-mono mt-0.5">${count} ${curI18n.works}</p>
                    </div>
                  </div>
                  ${channelUrl ? `
                    <a href="${channelUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"
                      class="p-1.5 rounded-lg theme-bg-subtle theme-hover-bg theme-text-sub theme-hover-text border theme-border-subtle transition-colors shrink-0"
                      title="${isNico ? '니코동 마이페이지로 이동' : (isYt ? 'YouTube 채널로 이동' : (isNaver ? '네이버 블로그로 이동' : '채널 페이지로 이동'))}">
                      <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
                    </a>
                  ` : `
                    <i data-lucide="chevron-right" class="w-4 h-4 theme-text-muted shrink-0"></i>
                  `}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    if (window.lucide) lucide.createIcons();
  };

  // 썸네일 영역 렌더링 (원본 색감 보존 + 하단 스크림 + 퀵 재생 버튼)
  const renderThumbnailHTML = (v, videoKey, thumb, ytId, hasNaver) => {
    const isNaverOnly = hasNaver && !ytId;
    const fallbackHq = ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : '';
    const onErrorAttr = fallbackHq && thumb !== fallbackHq
      ? `onerror="if(!this.dataset.fallback){this.dataset.fallback=1;this.src='${fallbackHq}';}"`
      : `onerror="if(!this.dataset.fallback){this.dataset.fallback=1;this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=640&auto=format&fit=crop&q=80';}"`;

    return `
      <div class="w-full h-full relative group/thumb cursor-pointer overflow-hidden">
        <img src="${thumb}" alt="${API.escapeHTML(v.title)}" referrerpolicy="no-referrer" class="w-full h-full object-cover object-center" loading="lazy" ${onErrorAttr} />
        <div class="absolute inset-x-0 bottom-0 h-14 thumb-scrim pointer-events-none"></div>
        <button type="button"
          onclick="event.stopPropagation(); app.playVideo('${API.escapeHTML(videoKey)}')"
          title="${isNaverOnly ? '네이버 블로그에서 감상' : '카드에서 바로 재생'}"
          class="thumb-play-btn absolute bottom-2 right-2 inline-flex items-center gap-1 ${isNaverOnly ? 'px-2 py-1 rounded-full' : 'w-8 h-8 rounded-full justify-center'} bg-black/70 hover:bg-[#4169e1] text-white border border-white/15 backdrop-blur-sm z-10 text-[11px] font-medium">
          ${isNaverOnly
            ? `<i data-lucide="external-link" class="w-3 h-3"></i><span>블로그</span>`
            : `<i data-lucide="play" class="w-3.5 h-3.5 ml-0.5 fill-current"></i>`}
        </button>
      </div>
    `;
  };

  // 모든 임베드 플레이어 정리
  const stopAllPlayers = () => {
    const playingVideos = document.querySelectorAll('video');
    playingVideos.forEach(v => {
      try {
        v.pause();
        v.removeAttribute('src');
        v.load();
      } catch (_) {}
    });

    Object.keys(state.activePlayers).forEach(key => {
      const safeKey = window.CSS && CSS.escape ? CSS.escape(key) : key.replace(/["\\]/g, '\\$&');
      const mediaBoxes = document.querySelectorAll(`[data-video-key="${safeKey}"]`);
      const v = state.videos.find(x => (x.id || `${x.title}-${x.upload_date}`) === key);
      if (v && mediaBoxes.length > 0) {
        const thumb = getThumbnail(v);
        const ytId = v.yt_id || API.extractYtId(v.original_link);
        const hasNaver = v.platform === 'naver' || v.naver_url || v.naver_vid;
        mediaBoxes.forEach(box => {
          box.innerHTML = renderThumbnailHTML(v, key, thumb, ytId, hasNaver);
        });
      }
    });

    state.activePlayers = {};
    if (window.lucide) lucide.createIcons();
  };

  // 개별 영상 카드 렌더러 (전면 3요소: 썸네일 · 제목 · 핵심 배지/날짜)
  const renderCard = (v, domId) => {
    const videoKey = v.id || `${v.title}-${v.upload_date}`;
    const activePlayer = state.activePlayers[videoKey];
    const thumb = getThumbnail(v);
    const displayDate = API.formatDisplayDate(v);
    const ytId = v.yt_id || API.extractYtId(v.original_link);
    const hasNaver = v.platform === 'naver' || Boolean(v.naver_url || v.naver_vid);
    const isNaver = getPlatformCategory(v) === 'naver';

    let mediaHTML = '';
    if (activePlayer) {
      if (activePlayer.type === 'youtube') {
        mediaHTML = `
          <div class="w-full h-full relative" onclick="event.stopPropagation()">
            <iframe src="https://www.youtube.com/embed/${activePlayer.id}?autoplay=1&enablejsapi=1" class="w-full h-full border-none" allowfullscreen allow="autoplay; encrypted-media"></iframe>
            <button onclick="event.stopPropagation(); app.closePlayer('${API.escapeHTML(videoKey)}')" class="absolute top-2 right-2 p-1 rounded-md bg-black/75 hover:bg-black text-white border border-white/15 z-20" title="플레이어 닫기">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        `;
      } else if (activePlayer.type === 'naver_stream') {
        mediaHTML = `
          <div class="w-full h-full relative bg-black" onclick="event.stopPropagation()">
            <video src="${activePlayer.streamUrl}" controls autoplay playsinline class="w-full h-full object-contain bg-black"></video>
            <button onclick="event.stopPropagation(); app.closePlayer('${API.escapeHTML(videoKey)}')" class="absolute top-2 right-2 p-1 rounded-md bg-black/75 hover:bg-black text-white border border-white/15 z-20" title="플레이어 닫기">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        `;
      } else if (activePlayer.type === 'naver_embed') {
        mediaHTML = `
          <div class="w-full h-full relative" onclick="event.stopPropagation()">
            <iframe src="${activePlayer.embedUrl}" class="w-full h-full border-none" allowfullscreen allow="autoplay; encrypted-media"></iframe>
            <button onclick="event.stopPropagation(); app.closePlayer('${API.escapeHTML(videoKey)}')" class="absolute top-2 right-2 p-1 rounded-md bg-black/75 hover:bg-black text-white border border-white/15 z-20" title="플레이어 닫기">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        `;
      }
    } else {
      mediaHTML = renderThumbnailHTML(v, videoKey, thumb, ytId, hasNaver);
    }

    const isSelected = window.Builder && Builder.state.selectedIds.has(videoKey);
    const platformPill = isNaver
      ? `<span class="pill-badge pill-badge-naver">NAVER</span>`
      : `<span class="pill-badge pill-badge-yt">YouTube</span>`;

    return `
      <article class="card-item group rounded-xl overflow-hidden flex flex-col justify-between cursor-pointer text-left ${isSelected ? 'ring-2 ring-[#4169e1]' : ''}"
        data-card-key="${API.escapeHTML(videoKey)}"
        onclick="Modals.openDetailDrawer('${API.escapeHTML(videoKey)}')"
        ${state.isEditMode ? `
          draggable="true"
          ondragstart="Builder.handleDragStart(event, '${API.escapeHTML(videoKey)}')"
          ondragover="Builder.handleDragOver(event, '${API.escapeHTML(videoKey)}')"
          ondragleave="Builder.handleDragLeave(event)"
          ondrop="Builder.handleDrop(event, '${API.escapeHTML(videoKey)}')"
        ` : ''}>

        ${state.isEditMode ? `
          <div class="px-2.5 py-1.5 theme-bg-subtle border-b theme-border-subtle flex items-center justify-between text-xs select-none" onclick="event.stopPropagation()">
            <div class="flex items-center gap-1.5">
              <input type="checkbox" ${isSelected ? 'checked' : ''}
                onchange="Builder.toggleSelectVideo('${API.escapeHTML(videoKey)}', this.checked)"
                class="w-3.5 h-3.5 rounded theme-border-medium theme-bg-input cursor-pointer" title="일괄 작업용 선택" />
              <div class="flex items-center gap-1 cursor-grab active:cursor-grabbing theme-text-sub theme-hover-text" title="드래그하여 순서 재배치">
                <i data-lucide="grip-vertical" class="w-3.5 h-3.5 theme-accent-text"></i>
                <span class="text-[10px] font-mono font-semibold theme-accent-text">#${domId.split('-').pop() ? Number(domId.split('-').pop()) + 1 : ''}</span>
              </div>
            </div>
            <span class="text-[10px] theme-text-muted font-mono">드래그 이동</span>
          </div>
        ` : ''}

        <!-- 1. 썸네일 이미지 -->
        <div class="thumb-frame" data-video-key="${API.escapeHTML(videoKey)}">
          ${mediaHTML}
        </div>

        <!-- 2. 제목 + 3. 핵심 분류 배지/날짜 -->
        <div class="card-body p-3.5 flex flex-col flex-grow justify-between gap-2.5">
          ${state.isEditMode ? `
            <h3 contenteditable="true" spellcheck="false"
              onclick="event.stopPropagation()"
              class="text-[13px] font-semibold theme-text-main line-clamp-2 leading-snug cursor-text builder-inline-editable"
              onblur="Builder.saveInlineTitle('${API.escapeHTML(videoKey)}', this.innerText)"
              onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
              title="클릭하여 제목 직접 수정">${API.escapeHTML(v.title)}</h3>
          ` : `
            <h3 title="${API.escapeHTML(v.title)}"
              class="text-[13px] font-semibold theme-text-main line-clamp-2 leading-snug">
              ${API.escapeHTML(v.title)}
            </h3>
          `}

          <div class="flex items-center justify-between gap-2 pt-0.5">
            ${platformPill}
            <span class="text-[11px] font-mono theme-text-muted shrink-0">${displayDate}</span>
          </div>

          ${state.isEditMode ? `
            <div class="pt-2 border-t theme-border-subtle flex items-center justify-between text-xs" onclick="event.stopPropagation()">
              <div class="flex items-center gap-1">
                <button onclick="app.moveVideo('${API.escapeHTML(v.id || videoKey)}', -1)" title="순서 앞으로" class="p-1 rounded-md theme-hover-bg theme-text-sub theme-hover-text transition-colors">
                  <i data-lucide="chevron-up" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="app.moveVideo('${API.escapeHTML(v.id || videoKey)}', 1)" title="순서 뒤로" class="p-1 rounded-md theme-hover-bg theme-text-sub theme-hover-text transition-colors">
                  <i data-lucide="chevron-down" class="w-3.5 h-3.5"></i>
                </button>
              </div>
              <div class="flex items-center gap-1.5">
                <button onclick="Modals.openExtractorModal('${API.escapeHTML(v.id || videoKey)}')" class="px-2 py-0.5 rounded-md border theme-accent-soft text-[11px] font-semibold transition-colors">수정</button>
                <button onclick="app.deleteVideo('${API.escapeHTML(v.id || videoKey)}')" class="px-2 py-0.5 rounded-md border text-[11px] font-medium transition-colors" style="background-color: var(--accent-danger-bg); border-color: var(--accent-danger-border); color: var(--accent-danger-text);">삭제</button>
              </div>
            </div>
          ` : ''}
        </div>
      </article>
    `;
  };

  const playVideo = async (videoKey) => {
    const v = state.videos.find(x => (x.id || `${x.title}-${x.upload_date}`) === videoKey);
    if (!v) return;

    const ytId = v.yt_id || API.extractYtId(v.original_link);
    const isNaver = v.platform === 'naver' || v.naver_vid || v.naver_url || (v.original_link && v.original_link.includes('blog.naver.com'));

    if (ytId) {
      stopAllPlayers();
      const playerData = { type: 'youtube', id: ytId };
      state.activePlayers[videoKey] = playerData;

      const safeKey = window.CSS && CSS.escape ? CSS.escape(videoKey) : keyEscape(videoKey);
      const mediaBoxes = document.querySelectorAll(`[data-video-key="${safeKey}"]`);
      const playerHTML = `
        <div class="w-full h-full relative" onclick="event.stopPropagation()">
          <iframe src="https://www.youtube.com/embed/${playerData.id}?autoplay=1&enablejsapi=1" class="w-full h-full border-none" allowfullscreen allow="autoplay; encrypted-media"></iframe>
          <button onclick="event.stopPropagation(); app.closePlayer('${API.escapeHTML(videoKey)}')" class="absolute top-2 right-2 p-1 rounded-md bg-black/75 hover:bg-black text-white border border-white/15 z-20" title="플레이어 닫기">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      `;

      if (mediaBoxes.length > 0) {
        mediaBoxes.forEach(box => { box.innerHTML = playerHTML; });
        if (window.lucide) lucide.createIcons();
      } else {
        render();
      }
      return;
    }

    if (isNaver) {
      stopAllPlayers();
      const targetUrl = v.naver_url || v.original_link;
      if (targetUrl) {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    if (v.original_link) return window.open(v.original_link, '_blank', 'noopener,noreferrer');
    if (v.naver_url) return window.open(v.naver_url, '_blank', 'noopener,noreferrer');
  };

  const keyEscape = (k) => String(k).replace(/["\\]/g, '\\$&');

  const closePlayer = () => {
    stopAllPlayers();
  };

  const deleteVideo = async (videoKey) => {
    stopAllPlayers();
    const v = state.videos.find(x => (x.id || `${x.title}-${x.upload_date}`) === videoKey);
    if (!v || !confirm(`이 영상을 삭제하시겠습니까?\n\n"${v.title}"`)) return;
    state.videos = state.videos.filter(x => (x.id || `${x.title}-${x.upload_date}`) !== videoKey);
    if (window.Modals && Modals.closeDetailDrawer) Modals.closeDetailDrawer();
    await saveDataToServer();
  };

  const moveVideo = async (videoKey, dir) => {
    stopAllPlayers();
    const idx = state.videos.findIndex(x => (x.id || `${x.title}-${x.upload_date}`) === videoKey);
    if (idx < 0) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= state.videos.length) return;
    const item = state.videos.splice(idx, 1)[0];
    state.videos.splice(targetIdx, 0, item);
    await saveDataToServer();
  };

  const updateSiteHeaderEditability = () => {
    const titleEl = document.getElementById('site-title');
    const subEl = document.getElementById('site-subtitle');
    if (!titleEl || !subEl) return;

    if (state.isEditMode) {
      titleEl.contentEditable = "true";
      titleEl.spellcheck = false;
      titleEl.classList.add('builder-inline-editable');
      titleEl.title = "클릭하여 사이트 제목 편집";
      titleEl.onblur = async () => {
        const val = titleEl.innerText.trim();
        if (val && state.data) {
          state.data.config = state.data.config || {};
          if (state.data.config.title !== val) {
            state.data.config.title = val;
            await saveDataToServer();
            API.showToast('사이트 제목이 저장되었습니다.', 'success');
          }
        }
      };

      subEl.contentEditable = "true";
      subEl.spellcheck = false;
      subEl.classList.add('builder-inline-editable');
      subEl.title = "클릭하여 사이트 부제목 편집";
      subEl.onblur = async () => {
        const val = subEl.innerText.trim();
        if (val && state.data) {
          state.data.config = state.data.config || {};
          if (state.data.config.subtitle !== val) {
            state.data.config.subtitle = val;
            await saveDataToServer();
            API.showToast('사이트 부제목이 저장되었습니다.', 'success');
          }
        }
      };
    } else {
      titleEl.contentEditable = "false";
      titleEl.classList.remove('builder-inline-editable');
      titleEl.removeAttribute('title');
      titleEl.onblur = null;

      subEl.contentEditable = "false";
      subEl.classList.remove('builder-inline-editable');
      subEl.removeAttribute('title');
      subEl.onblur = null;
    }
  };

  const updateEditModeUI = () => {
    const isEdit = state.isEditMode;

    const banner = document.getElementById('edit-mode-banner');
    if (banner) {
      if (isEdit) banner.classList.remove('hidden');
      else banner.classList.add('hidden');
    }

    const btnDesktopReg = document.getElementById('btn-desktop-register');
    if (btnDesktopReg) {
      if (isEdit) {
        btnDesktopReg.classList.remove('hidden');
        btnDesktopReg.classList.add('md:flex');
      } else {
        btnDesktopReg.classList.add('hidden');
        btnDesktopReg.classList.remove('md:flex');
      }
    }

    const btnMobileReg = document.getElementById('btn-mobile-register');
    if (btnMobileReg) {
      if (isEdit) {
        btnMobileReg.classList.remove('hidden');
        btnMobileReg.classList.add('md:hidden');
      } else {
        btnMobileReg.classList.add('hidden');
        btnMobileReg.classList.remove('md:hidden');
      }
    }

    const footerTools = document.getElementById('footer-edit-tools');
    if (footerTools) {
      if (isEdit) {
        footerTools.classList.remove('hidden');
        footerTools.classList.add('flex');
      } else {
        footerTools.classList.add('hidden');
        footerTools.classList.remove('flex');
      }
    }

    const toggleBtn = document.getElementById('btn-toggle-edit');
    const toggleText = document.getElementById('btn-toggle-edit-text');
    if (toggleBtn) {
      const showToggle = state.serverConnected || isEdit || window.location.search.includes('mode=');
      if (showToggle) {
        toggleBtn.classList.remove('hidden');
        if (isEdit) {
          toggleBtn.className = 'px-2.5 py-1.5 rounded-lg theme-accent-btn font-semibold text-xs flex items-center gap-1.5';
          if (toggleText) toggleText.innerHTML = '<i data-lucide="eye" class="w-3.5 h-3.5"></i><span>뷰어 모드</span>';
        } else {
          toggleBtn.className = 'px-2.5 py-1.5 rounded-lg border theme-border-medium theme-bg-surface theme-hover-bg theme-text-main font-medium text-xs flex items-center gap-1.5 transition-colors';
          if (toggleText) toggleText.innerHTML = '<i data-lucide="edit-3" class="w-3.5 h-3.5 theme-accent-text"></i><span>편집 모드</span>';
        }
      } else {
        toggleBtn.classList.add('hidden');
      }
    }

    updateSiteHeaderEditability();

    if (window.Builder) {
      if (isEdit) {
        Builder.setViewport(Builder.state.viewport || 'desktop');
      } else {
        Builder.setViewport('desktop');
        Builder.toggleLayerPanel(false);
        Builder.selectAllVideos(false);
      }
    }

    if (window.lucide) lucide.createIcons();
  };

  const toggleEditMode = (force = null) => {
    stopAllPlayers();
    state.isEditMode = force !== null ? force : !state.isEditMode;
    const url = new URL(window.location);
    if (state.isEditMode) url.searchParams.set('mode', 'edit');
    else url.searchParams.delete('mode');
    window.history.replaceState({}, '', url);

    updateEditModeUI();
    render();
  };

  const setSearchQuery = (q) => {
    stopAllPlayers();
    state.searchQuery = q;
    const input = document.getElementById('search-input');
    if (input && input.value !== q) input.value = q;
    syncURLParams();
    render();
  };

  const clearSearch = () => {
    stopAllPlayers();
    state.searchQuery = '';
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    syncURLParams();
    render();
  };

  const clearAllFilters = () => {
    stopAllPlayers();
    state.searchQuery = '';
    state.selectedCategory = 'all';
    state.selectedTag = '';
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    syncURLParams();
    render();
  };

  const setViewMode = (mode) => {
    stopAllPlayers();
    state.viewMode = mode;
    if (mode !== 'all') state.selectedCategory = 'all';
    state.selectedTag = '';
    syncURLParams();
    render();
  };

  const setCategoryFilter = (category) => {
    stopAllPlayers();
    state.selectedCategory = category || 'all';
    syncURLParams();
    render();
  };

  const selectTagFilter = (tag, targetMode = 'tag') => {
    stopAllPlayers();
    state.selectedTag = tag;
    if (targetMode) state.viewMode = targetMode;
    syncURLParams();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const syncProfiles = async () => {
    API.showToast('YouTube 프로필 이미지 동기화 중...', 'info');
    try {
      const res = await API.syncProfiles();
      if (res && res.success) {
        API.showToast(`프로필 동기화 완료: ${res.updated}개 갱신됨`, 'success');
        await loadData();
      } else {
        API.showToast(`동기화 완료: 총 ${res?.totalProfiles || 0}개 프로필`, 'info');
        await loadData();
      }
    } catch (err) {
      API.showToast(`동기화 오류: ${err.message}`, 'error');
    }
  };

  const setSortOrder = (order) => {
    stopAllPlayers();
    state.sortOrder = order;
    syncURLParams();
    render();
  };

  const setLanguage = (lang) => {
    stopAllPlayers();
    state.lang = lang;
    render();
  };

  const init = async () => {
    initTheme();
    const params = new URLSearchParams(window.location.search);
    const hasEdit = params.get('mode') === 'edit' || params.has('edit');

    const urlView = params.get('view');
    if (['tag', 'all', 'subtitler', 'creator'].includes(urlView)) {
      state.viewMode = urlView;
    }
    const urlTag = params.get('tag');
    if (urlTag) state.selectedTag = urlTag;
    const urlCat = params.get('cat');
    if (['all', 'youtube', 'naver'].includes(urlCat)) {
      state.selectedCategory = urlCat;
    }
    const urlSort = params.get('sort');
    if (['latest', 'oldest', 'name', 'random'].includes(urlSort)) {
      state.sortOrder = urlSort;
    }
    const urlQ = params.get('q');
    if (urlQ) {
      state.searchQuery = urlQ;
      const inputEl = document.getElementById('search-input');
      if (inputEl) inputEl.value = urlQ;
    }

    state.serverConnected = await API.checkServerStatus();
    state.isEditMode = hasEdit;

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect && state.sortOrder) {
      sortSelect.value = state.sortOrder;
    }

    updateDensityButtonsUI();
    updateEditModeUI();
    loadData();
  };

  return {
    state,
    init,
    initTheme,
    setTheme,
    toggleTheme,
    updateEditModeUI,
    loadData,
    saveDataToServer,
    render,
    renderCard,
    getThumbnail,
    getDensityGridClass,
    setGridDensity,
    getPlatformCategory,
    getVideoTags,
    playVideo,
    closePlayer,
    stopAllPlayers,
    deleteVideo,
    moveVideo,
    toggleEditMode,
    setSearchQuery,
    clearSearch,
    clearAllFilters,
    setViewMode,
    setCategoryFilter,
    selectTagFilter,
    syncProfiles,
    setSortOrder,
    sortVideosInState,
    setLanguage,
    parseCreators,
    parseSubtitlers
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
