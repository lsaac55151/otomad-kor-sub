// -------------------------------------------------------------
// 해외 자막 음매드 모음 - Main Application Module
// -------------------------------------------------------------

window.app = (function () {
  let state = {
    data: null,
    videos: [],
    viewMode: 'tag', // 'tag' | 'all' | 'subtitler' | 'creator'
    selectedTag: '',
    sortOrder: 'latest', // 'latest' | 'oldest' | 'name' | 'random'
    lang: 'ko',
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

  const sortVideos = (list) => {
    const arr = [...list];
    if (state.sortOrder === 'latest') {
      arr.sort((a, b) => API.getRefinedDate(b).localeCompare(API.getRefinedDate(a)));
    } else if (state.sortOrder === 'oldest') {
      arr.sort((a, b) => API.getRefinedDate(a).localeCompare(API.getRefinedDate(b)));
    } else if (state.sortOrder === 'name') {
      arr.sort((a, b) => (a.title || "").localeCompare(b.title || "", state.lang));
    } else if (state.sortOrder === 'random') {
      arr.sort((a, b) => getRandomWeight(a.id || a.title) - getRandomWeight(b.id || b.title));
    }
    return arr;
  };

  // 스켈레톤 로딩 상태 렌더러
  const renderSkeleton = () => {
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        ${Array(8).fill(0).map(() => `
          <div class="rounded-lg border border-neutral-800/80 bg-neutral-900/40 p-3 space-y-3">
            <div class="w-full aspect-video rounded skeleton"></div>
            <div class="space-y-1.5">
              <div class="h-3.5 w-3/4 rounded skeleton"></div>
              <div class="h-2.5 w-1/2 rounded skeleton"></div>
            </div>
            <div class="pt-2 border-t border-neutral-800/60 flex justify-between">
              <div class="h-2.5 w-16 rounded skeleton"></div>
              <div class="h-2.5 w-12 rounded skeleton"></div>
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

  // 렌더링
  const render = () => {
    const main = document.getElementById('main-content');
    const curI18n = window.I18N[state.lang];

    // 헤더 상태 업데이트
    ['ko', 'ja'].forEach(l => {
      const btn = document.getElementById(`btn-lang-${l}`);
      if (btn) btn.className = `px-2 py-0.5 text-xs font-semibold rounded transition-colors ${state.lang === l ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200'}`;
    });

    ['tag', 'all', 'subtitler', 'creator'].forEach(m => {
      const btn = document.getElementById(`btn-${m}`);
      if (btn) btn.className = `px-2.5 py-1 rounded text-xs font-medium transition-colors ${state.viewMode === m ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200'}`;
    });

    // 검색 필터 배너
    const banner = document.getElementById('search-filter-banner');
    const clearBtn = document.getElementById('search-clear-btn');
    const countEl = document.getElementById('search-result-count');
    const filtered = state.videos.filter(v => matchSearch(v, state.searchQuery));

    if (state.searchQuery.trim()) {
      banner.classList.remove('hidden');
      clearBtn.classList.remove('hidden');
      document.getElementById('current-search-text').textContent = state.searchQuery;
      countEl.textContent = `${filtered.length}건`;
    } else {
      banner.classList.add('hidden');
      clearBtn.classList.add('hidden');
    }

    // 빈 상태 (Empty State)
    if (filtered.length === 0) {
      main.innerHTML = `
        <div class="py-20 text-center border border-dashed border-neutral-800 rounded-xl my-4 bg-neutral-900/20">
          <p class="text-sm font-semibold text-neutral-300">${curI18n.noVideos}</p>
          <p class="text-xs text-neutral-500 mt-1">${curI18n.noVideosDesc}</p>
          ${state.searchQuery ? `<button onclick="app.clearSearch()" class="mt-4 px-3 py-1.5 rounded border border-neutral-700 hover:bg-neutral-800 text-xs text-neutral-300 font-medium transition-colors">${curI18n.clearFilter}</button>` : ''}
        </div>
      `;
      lucide.createIcons();
      return;
    }

    // 뷰 모드별 분기
    const gridClass = window.Builder ? Builder.getGridClass() : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
    const densityClass = window.Builder && Builder.state.cardDensity === 'compact' ? 'card-compact' : '';

    if (state.viewMode === 'all') {
      const sorted = sortVideos(filtered);
      main.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center justify-between pb-2 border-b border-neutral-800 text-xs text-neutral-400 font-mono">
            <span>ALL (${sorted.length})</span>
          </div>
          <div class="${gridClass} ${densityClass}">
            ${sorted.map((v, i) => renderCard(v, `all-${i}`)).join('')}
          </div>
        </div>
      `;
    } else if (state.viewMode === 'tag') {
      // 태그별 집계 및 그룹화 (자막, 음매드 제외)
      const tagGroups = {};
      const tagCounts = {};
      const ignoredTags = new Set(['자막', '음매드', '#자막', '#음매드']);

      filtered.forEach(v => {
        const rawTags = (Array.isArray(v.tags) ? v.tags : (v.tags ? [v.tags] : []))
          .map(t => String(t).trim().replace(/^#/, ''))
          .filter(t => t && !ignoredTags.has(t));

        const effectiveTags = rawTags.length ? rawTags : ['기타'];
        effectiveTags.forEach(tag => {
          if (!tagGroups[tag]) tagGroups[tag] = [];
          tagGroups[tag].push(v);
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      });

      // 태그 정렬
      const sortedTags = Object.keys(tagGroups).sort((a, b) => {
        if (state.sortOrder === 'name') {
          return a.localeCompare(b, state.lang);
        } else if (state.sortOrder === 'latest') {
          const dateA = tagGroups[a][0] ? API.getRefinedDate(tagGroups[a][0]) : '';
          const dateB = tagGroups[b][0] ? API.getRefinedDate(tagGroups[b][0]) : '';
          return dateB.localeCompare(dateA);
        } else if (state.sortOrder === 'oldest') {
          const dateA = tagGroups[a][0] ? API.getRefinedDate(tagGroups[a][0]) : '';
          const dateB = tagGroups[b][0] ? API.getRefinedDate(tagGroups[b][0]) : '';
          return dateA.localeCompare(dateB);
        }
        // 기본: 동영상 많은 순 (기타는 맨 뒤)
        if (a === '기타') return 1;
        if (b === '기타') return -1;
        return tagCounts[b] - tagCounts[a];
      });

      const formatPlaylistDate = (dateStr) => {
        if (!dateStr) return '최근';
        return String(dateStr).replace(/-/g, '. ').replace(/\//g, '. ');
      };

      // 1) 특정 태그 상세 뷰 (해당 태그의 비디오 바둑판 목록)
      if (state.selectedTag && tagGroups[state.selectedTag]) {
        const currentTagVideos = sortVideos(tagGroups[state.selectedTag]);
        const coverVideo = currentTagVideos[0];
        const coverThumb = coverVideo ? getThumbnail(coverVideo) : '';
        const latestDateText = coverVideo ? formatPlaylistDate(API.getRefinedDate(coverVideo)) : '최근';

        main.innerHTML = `
          <div class="mb-6 space-y-4">
            <!-- 뒤로가기 버튼 -->
            <button onclick="app.selectTagFilter('')"
              class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900/70 hover:bg-neutral-800 text-xs text-neutral-300 font-medium transition-colors">
              <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i>
              <span>모든 재생목록 보기</span>
            </button>

            <!-- 재생목록 정보 헤더 카드 -->
            <div class="p-4 sm:p-5 rounded-xl border border-neutral-800 bg-neutral-900/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div class="flex items-center gap-4 min-w-0">
                <div class="playlist-deck-stack w-28 sm:w-36 shrink-0">
                  <div class="playlist-deck-layer-1"></div>
                  <div class="playlist-deck-layer-2"></div>
                  <div class="playlist-thumb-box">
                    <img src="${coverThumb}" class="w-full h-full object-cover object-center" onerror="if(!this.dataset.fallback && this.src.includes('maxresdefault')){this.dataset.fallback=1;this.src=this.src.replace('maxresdefault.jpg','hqdefault.jpg');}" />
                    <div class="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/85 text-[10px] text-white font-medium flex items-center gap-1 shadow">
                      <svg class="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M22 7H2v2h20V7zm-8 4H2v2h12v-2zm0 4H2v2h12v-2zm4-1v6l5-3-5-3z"/></svg>
                      <span>${currentTagVideos.length}개</span>
                    </div>
                  </div>
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2 text-xs text-neutral-400">
                    <span class="font-semibold text-neutral-300">재생목록</span>
                    <span>•</span>
                    <span>공개</span>
                    <span>•</span>
                    <span class="font-mono">${currentTagVideos.length}개의 동영상</span>
                  </div>
                  <h2 class="text-lg sm:text-xl font-bold text-neutral-100 tracking-tight mt-1 truncate">
                    ${API.escapeHTML(state.selectedTag)}
                  </h2>
                  <p class="text-xs text-neutral-500 mt-1">
                    최근 업데이트: ${latestDateText}
                  </p>
                </div>
              </div>

              ${currentTagVideos.length > 0 ? `
                <div class="flex items-center gap-2 w-full md:w-auto shrink-0">
                  <button onclick="app.playVideo('${currentTagVideos[0].id || `${currentTagVideos[0].title}-${currentTagVideos[0].upload_date}`}')"
                    class="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-neutral-100 hover:bg-white text-neutral-950 text-xs font-bold transition-colors">
                    <i data-lucide="play" class="w-3.5 h-3.5 fill-current"></i>
                    <span>첫 영상부터 재생</span>
                  </button>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- 비디오 바둑판 그리드 -->
          <div class="${gridClass} ${densityClass}">
            ${currentTagVideos.map((v, i) => renderCard(v, `tag-${state.selectedTag}-${i}`)).join('')}
          </div>
        `;
      } else {
        // 2) 전체 재생목록 그리드 (스크린샷 속 유튜브 보관함 재생목록 카드 스타일)
        main.innerHTML = `
          <div class="space-y-6">
            <div class="flex items-center justify-between pb-3 border-b border-neutral-800/80">
              <div class="flex items-baseline gap-2">
                <h2 class="text-base font-bold text-neutral-100 tracking-tight">재생목록</h2>
                <span class="text-xs text-neutral-500 font-mono">${sortedTags.length}개</span>
              </div>
              <div class="text-xs text-neutral-400">
                <span>총 <strong class="text-neutral-200 font-mono">${filtered.length}</strong>개 동영상</span>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
              ${sortedTags.map(tag => {
                const gVideos = sortVideos(tagGroups[tag]);
                const coverVideo = gVideos[0];
                const coverThumb = coverVideo ? getThumbnail(coverVideo) : '';
                const latestDateText = coverVideo ? formatPlaylistDate(API.getRefinedDate(coverVideo)) : '최근';

                return `
                  <div class="playlist-card group" onclick="app.selectTagFilter('${API.escapeHTML(tag)}')">
                    <!-- 상단 덱 스택 효과 -->
                    <div class="playlist-deck-stack">
                      <div class="playlist-deck-layer-1"></div>
                      <div class="playlist-deck-layer-2"></div>
                      <div class="playlist-thumb-box">
                        <img src="${coverThumb}" alt="${API.escapeHTML(tag)}" referrerpolicy="no-referrer" class="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105" loading="lazy" onerror="if(!this.dataset.fallback && this.src.includes('maxresdefault')){this.dataset.fallback=1;this.src=this.src.replace('maxresdefault.jpg','hqdefault.jpg');}" />
                        
                        <!-- 호버 시 모두 재생 오버레이 -->
                        <div class="opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute inset-0 bg-black/40 flex items-center justify-center z-10">
                          <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/85 backdrop-blur-md text-white text-xs font-semibold border border-white/10 shadow-lg">
                            <i data-lucide="play" class="w-3.5 h-3.5 fill-current"></i>
                            <span>모두 재생</span>
                          </div>
                        </div>

                        <!-- 우측 하단 동영상 개수 뱃지 (유튜브 스타일) -->
                        <div class="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/85 backdrop-blur-sm flex items-center gap-1.5 text-[11px] font-semibold text-white tracking-tight z-10 shadow-sm border border-white/5">
                          <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                            <path d="M22 7H2v2h20V7zm-8 4H2v2h12v-2zm0 4H2v2h12v-2zm4-1v6l5-3-5-3z"/>
                          </svg>
                          <span>동영상 ${gVideos.length.toLocaleString()}개</span>
                        </div>
                      </div>
                    </div>

                    <!-- 카드 하단 메타 정보 -->
                    <div class="mt-3 flex items-start justify-between gap-2">
                      <div class="min-w-0 flex-grow">
                        <h3 class="text-sm font-semibold text-neutral-100 group-hover:text-white line-clamp-2 leading-snug cursor-pointer transition-colors" title="${API.escapeHTML(tag)}">
                          ${API.escapeHTML(tag)}
                        </h3>
                        <p class="text-xs text-neutral-400 mt-1">공개 · 재생목록</p>
                        <p class="text-xs text-neutral-500 mt-0.5">최근 업데이트: ${latestDateText}</p>
                        <div class="mt-1.5">
                          <button onclick="event.stopPropagation(); app.selectTagFilter('${API.escapeHTML(tag)}')" class="text-xs font-medium text-neutral-400 hover:text-neutral-200 transition-colors inline-block">
                            전체 재생목록 보기
                          </button>
                        </div>
                      </div>
                      <button class="p-1 -mr-1 text-neutral-400 hover:text-neutral-200 rounded-full hover:bg-neutral-800 transition-colors shrink-0" title="재생목록 보기" onclick="event.stopPropagation(); app.selectTagFilter('${API.escapeHTML(tag)}')">
                        <i data-lucide="more-vertical" class="w-4 h-4"></i>
                      </button>
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
      filtered.forEach(v => {
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
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          ${sortedNames.map(name => {
            const count = groups[name].length;
            const profile = pmap[name] || 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=100';
            const channelUrl = (state.data?.channelMap || {})[name] || (pmap[name] && pmap[name].match(/usericon\/\d+\/(\d+)/) ? `https://www.nicovideo.jp/user/${pmap[name].match(/usericon\/\d+\/(\d+)/)[1]}` : null);
            const isNico = channelUrl && (channelUrl.includes('nicovideo') || channelUrl.includes('nico.ms'));
            const isYt = channelUrl && (channelUrl.includes('youtube') || channelUrl.includes('youtu.be'));
            const isNaver = channelUrl && channelUrl.includes('naver');

            return `
              <div onclick="Modals.openCreatorModal('${API.escapeHTML(name)}', '${state.viewMode}')"
                class="card-item p-3 rounded-lg border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-900 cursor-pointer flex items-center justify-between gap-3 group/item transition-all">
                <div class="flex items-center gap-3 min-w-0 flex-grow">
                  <div class="w-10 h-10 rounded overflow-hidden bg-neutral-800 shrink-0 border border-neutral-800">
                    <img src="${profile}" referrerpolicy="no-referrer" class="w-full h-full object-cover" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1534447677768-be436bb09401?w=100'" />
                  </div>
                  <div class="flex-grow min-w-0">
                    <h3 class="text-xs font-semibold text-neutral-100 truncate">${API.escapeHTML(name)}</h3>
                    <p class="text-[11px] text-neutral-500 font-mono">${count} ${curI18n.works}</p>
                  </div>
                </div>
                ${channelUrl ? `
                  <a href="${channelUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"
                    class="p-1.5 rounded bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white border border-neutral-700/60 transition-colors shrink-0"
                    title="${isNico ? '니코동 마이페이지로 이동' : (isYt ? 'YouTube 채널로 이동' : (isNaver ? '네이버 블로그로 이동' : '채널 페이지로 이동'))}">
                    <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
                  </a>
                ` : `
                  <i data-lucide="chevron-right" class="w-4 h-4 text-neutral-600 shrink-0"></i>
                `}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    lucide.createIcons();
  };

  const renderThumbnailHTML = (v, videoKey, thumb, date, ytId, hasNaver) => {
    const isNaverOnly = hasNaver && !ytId;
    const fallbackHq = ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : '';
    const onErrorAttr = fallbackHq && thumb !== fallbackHq
      ? `onerror="if(!this.dataset.fallback){this.dataset.fallback=1;this.src='${fallbackHq}';}"`
      : `onerror="if(!this.dataset.fallback){this.dataset.fallback=1;this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=640&auto=format&fit=crop&q=80';}"`;

    return `
      <div class="w-full h-full relative group cursor-pointer overflow-hidden" onclick="app.playVideo('${API.escapeHTML(videoKey)}')">
        <img src="${thumb}" alt="${API.escapeHTML(v.title)}" referrerpolicy="no-referrer" class="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105" loading="lazy" ${onErrorAttr} />
        <div class="absolute inset-0 bg-black/35 group-hover:bg-black/15 transition-colors flex items-center justify-center">
          ${isNaverOnly ? `
            <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-950/90 text-emerald-300 border border-emerald-600/70 shadow-lg group-hover:scale-105 transition-all text-xs font-semibold backdrop-blur-sm">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>블로그에서 감상</span>
              <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
            </div>
          ` : `
            <div class="w-9 h-9 rounded-full bg-neutral-900/90 text-white flex items-center justify-center border border-neutral-700/80 group-hover:scale-110 transition-transform shadow-md">
              <i data-lucide="play" class="w-4 h-4 ml-0.5 text-neutral-200"></i>
            </div>
          `}
        </div>
        <div class="absolute bottom-1.5 left-1.5 flex items-center gap-1 font-mono text-[10px]">
          ${hasNaver ? `<span class="bg-emerald-950/90 text-emerald-400 border border-emerald-800/80 px-1 rounded font-semibold">NAVER</span>` : ''}
          ${ytId ? `<span class="bg-red-950/90 text-red-400 border border-red-800/80 px-1 rounded font-semibold">YouTube</span>` : ''}
        </div>
        ${date !== '0000/00/00' ? `<span class="absolute bottom-1.5 right-1.5 text-[10px] font-mono bg-black/80 px-1.5 py-0.2 rounded text-neutral-300">${date}</span>` : ''}
      </div>
    `;
  };

  // 모든 임베드 플레이어를 즉시 정리하고 단일 재생 상태 보장
  const stopAllPlayers = () => {
    // 1. 모든 HTML5 video 태그 정지 및 리소스 해제 (오디오/스트림 유출 완전 방지)
    const playingVideos = document.querySelectorAll('video');
    playingVideos.forEach(v => {
      try {
        v.pause();
        v.removeAttribute('src');
        v.load();
      } catch (_) {}
    });

    // 2. DOM에 이미 렌더링된 활성 플레이어들을 원래 썸네일로 즉시 복원
    Object.keys(state.activePlayers).forEach(key => {
      const safeKey = window.CSS && CSS.escape ? CSS.escape(key) : key.replace(/["\\]/g, '\\$&');
      const mediaBoxes = document.querySelectorAll(`[data-video-key="${safeKey}"]`);
      const v = state.videos.find(x => (x.id || `${x.title}-${x.upload_date}`) === key);
      if (v && mediaBoxes.length > 0) {
        const thumb = getThumbnail(v);
        const date = API.getRefinedDate(v);
        const ytId = v.yt_id || API.extractYtId(v.original_link);
        const hasNaver = v.platform === 'naver' || v.naver_url || v.naver_vid;
        mediaBoxes.forEach(box => {
          box.innerHTML = renderThumbnailHTML(v, key, thumb, date, ytId, hasNaver);
        });
      }
    });

    // 3. 활성 플레이어 상태 맵 초기화
    state.activePlayers = {};
    if (window.lucide) lucide.createIcons();
  };

  // 영상 플레이어 바로 아래에 표시되는 눈에 띄는 외부 링크 이동 버튼 바
  const renderLinkButtons = (v) => {
    const buttons = [];
    const ytId = v.yt_id || API.extractYtId(v.original_link);
    const ytUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : null;
    const naverUrl = v.naver_url || (v.original_link && v.original_link.includes('blog.naver.com') ? v.original_link : null);

    // 1. 유튜브 바로가기 버튼 (자막 영상)
    if (ytUrl) {
      buttons.push(`
        <a href="${ytUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="YouTube에서 영상 보기"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-800/90 hover:bg-neutral-700 text-[11px] font-semibold text-neutral-200 hover:text-white border border-neutral-700/80 hover:border-neutral-500 transition-all shadow-sm group/btn">
          <svg class="w-3.5 h-3.5 fill-red-500 shrink-0" viewBox="0 0 24 24">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          <span>YouTube 이동</span>
          <i data-lucide="arrow-up-right" class="w-3 h-3 text-neutral-400 group-hover/btn:text-neutral-200 transition-colors"></i>
        </a>
      `);
    }

    // 2. 네이버 블로그 바로가기 버튼 (자막 영상)
    if (naverUrl) {
      const isPrimary = !ytUrl;
      buttons.push(`
        <a href="${naverUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="네이버 블로그 게시글 보기"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded ${isPrimary ? 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/80' : 'bg-neutral-800/90 hover:bg-neutral-700 text-neutral-200 hover:text-white border border-neutral-700/80 hover:border-emerald-600/60'} text-[11px] font-semibold transition-all shadow-sm group/btn">
          <span class="w-3.5 h-3.5 rounded bg-emerald-500 text-neutral-950 font-black text-[9px] flex items-center justify-center shrink-0">N</span>
          <span>네이버 블로그</span>
          <i data-lucide="arrow-up-right" class="w-3 h-3 text-neutral-400 group-hover/btn:text-neutral-200 transition-colors"></i>
        </a>
      `);
    }

    // 3. 원본 MAD 이동 버튼 (니코동, YouTube 등)
    const sourceUrl = v.source_url || (v.original_link && v.original_link !== ytUrl && v.original_link !== naverUrl ? v.original_link : null);
    if (sourceUrl) {
      const isNico = sourceUrl.includes('nicovideo.jp') || sourceUrl.includes('nico.ms');
      const isYtSource = sourceUrl.includes('youtube.com') || sourceUrl.includes('youtu.be');

      let iconHtml = '<i data-lucide="globe" class="w-3.5 h-3.5 text-neutral-300"></i>';
      let labelText = '원본 MAD';
      let titleText = `원본 MAD 영상 열기 (${sourceUrl})`;

      if (isNico) {
        iconHtml = '<i data-lucide="tv" class="w-3.5 h-3.5 text-neutral-300"></i>';
        labelText = '원본 MAD (니코동)';
        titleText = `니코동 원본 MAD 영상 보기 (${sourceUrl})`;
      } else if (isYtSource) {
        iconHtml = `
          <svg class="w-3.5 h-3.5 fill-red-500 shrink-0" viewBox="0 0 24 24">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        `;
        labelText = '원본 MAD (YouTube)';
        titleText = `YouTube 원본 MAD 영상 보기 (${sourceUrl})`;
      }

      buttons.push(`
        <a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="${titleText}"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-800/90 hover:bg-neutral-700 text-[11px] font-semibold text-neutral-200 hover:text-white border border-neutral-700/80 hover:border-neutral-500 transition-all shadow-sm group/btn">
          ${iconHtml}
          <span>${labelText}</span>
          <i data-lucide="arrow-up-right" class="w-3 h-3 text-neutral-400 group-hover/btn:text-neutral-200 transition-colors"></i>
        </a>
      `);
    }

    if (!buttons.length) return '';
    return `
      <div class="px-3 pt-2.5 pb-0 flex items-center gap-1.5 flex-wrap">
        ${buttons.join('')}
      </div>
    `;
  };

  // 개별 영상 카드 렌더러
  const renderCard = (v, domId) => {
    const curI18n = window.I18N[state.lang];
    const videoKey = v.id || `${v.title}-${v.upload_date}`;
    const activePlayer = state.activePlayers[videoKey];
    const thumb = getThumbnail(v);
    const date = API.getRefinedDate(v);
    const ytId = v.yt_id || API.extractYtId(v.original_link);
    const hasNaver = v.platform === 'naver' || v.naver_url || v.naver_vid;

    // 미디어 영역
    let mediaHTML = '';
    if (activePlayer) {
      if (activePlayer.type === 'youtube') {
        mediaHTML = `
          <div class="w-full h-full relative">
            <iframe src="https://www.youtube.com/embed/${activePlayer.id}?autoplay=1&enablejsapi=1" class="w-full h-full border-none" allowfullscreen allow="autoplay; encrypted-media"></iframe>
            <button onclick="app.closePlayer('${API.escapeHTML(videoKey)}')" class="absolute top-1.5 right-1.5 p-1 rounded bg-black/80 hover:bg-neutral-800 text-neutral-300 border border-neutral-700 z-20" title="플레이어 닫기">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        `;
      } else if (activePlayer.type === 'naver_stream') {
        mediaHTML = `
          <div class="w-full h-full relative bg-black group">
            <video src="${activePlayer.streamUrl}" controls autoplay playsinline class="w-full h-full object-contain bg-black"></video>
            <button onclick="app.closePlayer('${API.escapeHTML(videoKey)}')" class="absolute top-1.5 right-1.5 p-1 rounded bg-black/80 hover:bg-neutral-800 text-neutral-300 border border-neutral-700 z-20 opacity-80 hover:opacity-100 transition-opacity" title="플레이어 닫기">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        `;
      } else if (activePlayer.type === 'naver_embed') {
        mediaHTML = `
          <div class="w-full h-full relative">
            <iframe src="${activePlayer.embedUrl}" class="w-full h-full border-none" allowfullscreen allow="autoplay; encrypted-media"></iframe>
            <button onclick="app.closePlayer('${API.escapeHTML(videoKey)}')" class="absolute top-1.5 right-1.5 p-1 rounded bg-black/80 hover:bg-neutral-800 text-neutral-300 border border-neutral-700 z-20" title="플레이어 닫기">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        `;
      }
    } else {
      mediaHTML = renderThumbnailHTML(v, videoKey, thumb, date, ytId, hasNaver);
    }

    const pmap = state.data?.profileMap || {};
    const subtitlers = parseSubtitlers(v.subtitler);
    const creators = parseCreators(v.creator);
    const tags = (Array.isArray(v.tags) ? v.tags : (v.tags ? [v.tags] : []))
      .map(t => String(t).trim().replace(/^#/, ''))
      .filter(t => t && !['자막', '음매드'].includes(t));

    const isSelected = window.Builder && Builder.state.selectedIds.has(videoKey);

    return `
      <div class="card-item rounded-lg border ${isSelected ? 'border-blue-600 bg-blue-950/20' : 'border-neutral-800 bg-neutral-900/60'} overflow-hidden flex flex-col justify-between transition-all"
        data-card-key="${API.escapeHTML(videoKey)}"
        ${state.isEditMode ? `
          draggable="true"
          ondragstart="Builder.handleDragStart(event, '${API.escapeHTML(videoKey)}')"
          ondragover="Builder.handleDragOver(event, '${API.escapeHTML(videoKey)}')"
          ondragleave="Builder.handleDragLeave(event)"
          ondrop="Builder.handleDrop(event, '${API.escapeHTML(videoKey)}')"
        ` : ''}>
        
        ${state.isEditMode ? `
          <div class="px-2.5 py-1.5 bg-neutral-950 border-b border-neutral-800/80 flex items-center justify-between text-xs select-none">
            <div class="flex items-center gap-1.5">
              <input type="checkbox" ${isSelected ? 'checked' : ''}
                onclick="event.stopPropagation()"
                onchange="Builder.toggleSelectVideo('${API.escapeHTML(videoKey)}', this.checked)"
                class="w-3.5 h-3.5 rounded border-neutral-700 bg-neutral-900 cursor-pointer" title="일괄 작업용 선택" />
              <div class="flex items-center gap-1 cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-200" title="드래그하여 순서 재배치">
                <i data-lucide="grip-vertical" class="w-3.5 h-3.5 text-neutral-500"></i>
                <span class="text-[10px] font-mono font-semibold text-neutral-400">#${domId.split('-').pop() ? Number(domId.split('-').pop()) + 1 : ''}</span>
              </div>
            </div>
            <div class="flex items-center gap-1 text-[10px] text-neutral-500 font-mono">
              <span>드래그 이동</span>
            </div>
          </div>
        ` : ''}

        <div class="w-full aspect-video bg-black relative overflow-hidden" data-video-key="${API.escapeHTML(videoKey)}">
          ${mediaHTML}
        </div>

        ${renderLinkButtons(v)}

        <div class="p-3 pt-2 flex flex-col flex-grow justify-between gap-2.5">
          <div>
            ${state.isEditMode ? `
              <h3 contenteditable="true" spellcheck="false"
                class="text-xs font-semibold text-neutral-100 hover:text-white transition-colors line-clamp-2 leading-snug cursor-text builder-inline-editable"
                onblur="Builder.saveInlineTitle('${API.escapeHTML(videoKey)}', this.innerText)"
                onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
                title="클릭하여 제목 직접 수정">${API.escapeHTML(v.title)}</h3>
            ` : `
              <h3 onclick="app.playVideo('${API.escapeHTML(videoKey)}')" title="${API.escapeHTML(v.title)}"
                class="text-xs font-semibold text-neutral-100 hover:text-white transition-colors line-clamp-2 leading-snug cursor-pointer">
                ${API.escapeHTML(v.title)}
              </h3>
            `}
            ${v.originalTitle ? `<p class="text-[11px] text-neutral-500 truncate mt-0.5">${API.escapeHTML(v.originalTitle)}</p>` : ''}
          </div>

          <div class="pt-2 border-t border-neutral-800/80 space-y-2 text-xs">
            <div class="flex items-start justify-between gap-2">
              <span class="text-neutral-400 text-xs shrink-0 font-medium ${subtitlers.length > 1 ? 'mt-0.5' : ''}">자막</span>
              ${subtitlers.length > 1 ? `
                <div class="flex items-center gap-1.5 flex-wrap justify-end max-w-[200px]">
                  ${subtitlers.map(sName => {
                    const sAvatar = pmap[sName] || '';
                    return `
                      <button onclick="Modals.openCreatorModal('${API.escapeHTML(sName)}', 'subtitler')"
                        class="inline-flex items-center gap-1.5 font-medium text-neutral-200 hover:text-white transition-colors truncate max-w-[160px] group text-right px-1.5 py-0.5 rounded bg-neutral-800/80 hover:bg-neutral-800 border border-neutral-700/60" title="${API.escapeHTML(sName)}">
                        ${sAvatar ? `<img src="${sAvatar}" referrerpolicy="no-referrer" class="card-avatar-img w-[18px] h-[18px] rounded-full object-cover shrink-0 border border-neutral-700/80" onerror="this.style.display='none'">` : `<span class="card-avatar-img w-[18px] h-[18px] rounded-full bg-neutral-800 border border-neutral-700/60 text-[9px] flex items-center justify-center text-neutral-300 shrink-0 font-medium font-mono">자</span>`}
                        <span class="truncate text-xs font-medium">${API.escapeHTML(sName)}</span>
                      </button>
                    `;
                  }).join('')}
                </div>
              ` : `
                <button onclick="Modals.openCreatorModal('${API.escapeHTML(subtitlers[0] || 'Unknown')}', 'subtitler')"
                  class="flex items-center gap-2 font-medium text-neutral-200 hover:text-white transition-colors truncate max-w-[170px] text-right group">
                  ${pmap[subtitlers[0]] ? `<img src="${pmap[subtitlers[0]]}" referrerpolicy="no-referrer" class="card-avatar-img w-[22px] h-[22px] rounded-full object-cover shrink-0 border border-neutral-700/80" onerror="this.style.display='none'">` : `<span class="card-avatar-img w-[22px] h-[22px] rounded-full bg-neutral-800 border border-neutral-700/60 text-[10px] flex items-center justify-center text-neutral-300 shrink-0 font-medium font-mono">자</span>`}
                  <span class="truncate text-xs font-medium">${API.escapeHTML(subtitlers[0] || 'Unknown')}</span>
                </button>
              `}
            </div>
            <div class="flex items-start justify-between gap-2">
              <span class="text-neutral-400 text-xs shrink-0 font-medium ${creators.length > 1 ? 'mt-0.5' : ''}">원작</span>
              ${creators.length > 1 ? `
                <div class="flex items-center gap-1.5 flex-wrap justify-end max-w-[200px]">
                  ${creators.map(cName => {
                    const cAvatar = pmap[cName] || '';
                    return `
                      <button onclick="Modals.openCreatorModal('${API.escapeHTML(cName)}', 'creator')"
                        class="inline-flex items-center gap-1.5 font-medium text-neutral-200 hover:text-white transition-colors truncate max-w-[160px] group text-right px-1.5 py-0.5 rounded bg-neutral-800/80 hover:bg-neutral-800 border border-neutral-700/60" title="${API.escapeHTML(cName)}">
                        ${cAvatar ? `<img src="${cAvatar}" referrerpolicy="no-referrer" class="card-avatar-img w-[18px] h-[18px] rounded-full object-cover shrink-0 border border-neutral-700/80" onerror="this.style.display='none'">` : `<span class="card-avatar-img w-[18px] h-[18px] rounded-full bg-neutral-800 border border-neutral-700/60 text-[9px] flex items-center justify-center text-neutral-300 shrink-0 font-medium font-mono">원</span>`}
                        <span class="truncate text-xs font-medium">${API.escapeHTML(cName)}</span>
                      </button>
                    `;
                  }).join('')}
                </div>
              ` : `
                <button onclick="Modals.openCreatorModal('${API.escapeHTML(creators[0] || 'Unknown')}', 'creator')"
                  class="flex items-center gap-2 font-medium text-neutral-200 hover:text-white transition-colors truncate max-w-[170px] text-right group">
                  ${pmap[creators[0]] ? `<img src="${pmap[creators[0]]}" referrerpolicy="no-referrer" class="card-avatar-img w-[22px] h-[22px] rounded-full object-cover shrink-0 border border-neutral-700/80" onerror="this.style.display='none'">` : `<span class="card-avatar-img w-[22px] h-[22px] rounded-full bg-neutral-800 border border-neutral-700/60 text-[10px] flex items-center justify-center text-neutral-300 shrink-0 font-medium font-mono">원</span>`}
                  <span class="truncate text-xs font-medium">${API.escapeHTML(creators[0] || 'Unknown')}</span>
                </button>
              `}
            </div>
          </div>

          <div class="pt-2 border-t border-neutral-800/60 flex items-center justify-between gap-2">
            <div class="flex flex-wrap gap-1 overflow-hidden max-h-5">
              ${tags.slice(0, 3).map(t => `
                <span onclick="app.selectTagFilter('${API.escapeHTML(t)}')"
                  class="cursor-pointer text-[10px] text-neutral-400 hover:text-neutral-200 transition-colors bg-neutral-800/60 px-1.5 py-0.2 rounded border border-neutral-800">
                  #${API.escapeHTML(t)}
                </span>
              `).join('')}
            </div>
          </div>

          ${state.isEditMode ? `
            <div class="pt-2 border-t border-neutral-800 flex items-center justify-between text-xs">
              <div class="flex items-center gap-1">
                <button onclick="app.moveVideo('${API.escapeHTML(v.id || videoKey)}', -1)" title="순서 앞으로" class="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200">
                  <i data-lucide="chevron-up" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="app.moveVideo('${API.escapeHTML(v.id || videoKey)}', 1)" title="순서 뒤로" class="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200">
                  <i data-lucide="chevron-down" class="w-3.5 h-3.5"></i>
                </button>
              </div>
              <div class="flex items-center gap-1.5">
                <button onclick="Modals.openExtractorModal('${API.escapeHTML(v.id || videoKey)}')" class="px-2 py-0.5 rounded border border-neutral-700 hover:bg-neutral-800 text-[11px] text-neutral-300 font-medium">수정</button>
                <button onclick="app.deleteVideo('${API.escapeHTML(v.id || videoKey)}')" class="px-2 py-0.5 rounded border border-red-900/60 hover:bg-red-950 text-[11px] text-red-400 font-medium">삭제</button>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  };

  const playVideo = async (videoKey) => {
    const v = state.videos.find(x => (x.id || `${x.title}-${x.upload_date}`) === videoKey);
    if (!v) return;

    const ytId = v.yt_id || API.extractYtId(v.original_link);
    const isNaver = v.platform === 'naver' || v.naver_vid || v.naver_url || (v.original_link && v.original_link.includes('blog.naver.com'));

    // 1. 유튜브 영상 재생
    if (ytId) {
      stopAllPlayers();
      const playerData = { type: 'youtube', id: ytId };
      state.activePlayers[videoKey] = playerData;

      const safeKey = window.CSS && CSS.escape ? CSS.escape(videoKey) : videoKey.replace(/["\\]/g, '\\$&');
      const mediaBoxes = document.querySelectorAll(`[data-video-key="${safeKey}"]`);
      const playerHTML = `
        <div class="w-full h-full relative">
          <iframe src="https://www.youtube.com/embed/${playerData.id}?autoplay=1&enablejsapi=1" class="w-full h-full border-none" allowfullscreen allow="autoplay; encrypted-media"></iframe>
          <button onclick="app.closePlayer('${API.escapeHTML(videoKey)}')" class="absolute top-1.5 right-1.5 p-1 rounded bg-black/80 hover:bg-neutral-800 text-neutral-300 border border-neutral-700 z-20" title="플레이어 닫기">
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

    // 2. 네이버 동영상: 원작 블로그 포스트로 안전하게 새 탭 이동
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

  const closePlayer = (videoKey) => {
    stopAllPlayers();
  };

  const deleteVideo = async (videoKey) => {
    stopAllPlayers();
    const v = state.videos.find(x => (x.id || `${x.title}-${x.upload_date}`) === videoKey);
    if (!v || !confirm(`이 영상을 삭제하시겠습니까?\n\n"${v.title}"`)) return;
    state.videos = state.videos.filter(x => (x.id || `${x.title}-${x.upload_date}`) !== videoKey);
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

    // 1. 비주얼 빌더 배너
    const banner = document.getElementById('edit-mode-banner');
    if (banner) {
      if (isEdit) banner.classList.remove('hidden');
      else banner.classList.add('hidden');
    }

    // 2. 데스크톱 영상 등록 버튼
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

    // 3. 모바일 영상 등록 버튼
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

    // 4. 푸터 편집 도구 (영상 등록, data.json 관리)
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

    // 5. 상단 모드 전환 토글 버튼
    // GitHub Pages 등 배포 환경(서버 미연결 상태에서 mode 파라미터도 없음): 완전 숨김
    // 로컬 서버 연결 상태이거나 mode=edit으로 접근한 경우에만 토글 버튼 노출
    const toggleBtn = document.getElementById('btn-toggle-edit');
    const toggleText = document.getElementById('btn-toggle-edit-text');
    if (toggleBtn) {
      const showToggle = state.serverConnected || isEdit || window.location.search.includes('mode=');
      if (showToggle) {
        toggleBtn.classList.remove('hidden');
        if (isEdit) {
          toggleBtn.className = 'px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm';
          if (toggleText) toggleText.innerHTML = '<i data-lucide="eye" class="w-3.5 h-3.5"></i><span>뷰어 모드</span>';
        } else {
          toggleBtn.className = 'px-2.5 py-1 rounded border border-neutral-700 hover:bg-neutral-800 text-neutral-300 font-medium text-xs flex items-center gap-1.5 transition-colors';
          if (toggleText) toggleText.innerHTML = '<i data-lucide="edit-3" class="w-3.5 h-3.5"></i><span>편집 모드</span>';
        }
      } else {
        toggleBtn.classList.add('hidden');
      }
    }

    // 6. 사이트 타이틀/서브타이틀 인라인 수정 모드 활성화/비활성화
    updateSiteHeaderEditability();

    // 7. 비주얼 빌더 모듈 상태 연동
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
    document.getElementById('search-input').value = q;
    render();
  };

  const clearSearch = () => {
    stopAllPlayers();
    state.searchQuery = '';
    document.getElementById('search-input').value = '';
    render();
  };

  const setViewMode = (mode) => {
    stopAllPlayers();
    state.viewMode = mode;
    state.selectedTag = '';
    render();
  };

  const selectTagFilter = (tag) => {
    stopAllPlayers();
    state.selectedTag = tag;
    state.viewMode = 'tag';
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
    render();
  };

  const setLanguage = (lang) => {
    stopAllPlayers();
    state.lang = lang;
    render();
  };

  const init = async () => {
    const params = new URLSearchParams(window.location.search);
    const hasEdit = params.get('mode') === 'edit' || params.has('edit');
    state.serverConnected = await API.checkServerStatus();

    // URL에 ?mode=edit 이 있을 때만 편집 모드로 시작
    state.isEditMode = hasEdit;

    updateEditModeUI();
    loadData();
  };

  return {
    state,
    init,
    updateEditModeUI,
    loadData,
    saveDataToServer,
    render,
    renderCard,
    getThumbnail,
    playVideo,
    closePlayer,
    stopAllPlayers,
    deleteVideo,
    moveVideo,
    toggleEditMode,
    setSearchQuery,
    clearSearch,
    setViewMode,
    selectTagFilter,
    syncProfiles,
    setSortOrder,
    setLanguage,
    parseCreators,
    parseSubtitlers
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
