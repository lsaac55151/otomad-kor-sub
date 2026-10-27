// -------------------------------------------------------------
// 해외 자막 음매드 모음 - Visual Web Builder & WYSIWYG Module
// -------------------------------------------------------------

window.Builder = (function () {
  let state = {
    viewport: 'desktop', // 'desktop' (100%) | 'tablet' (768px) | 'mobile' (390px)
    gridColumns: 'auto', // 'auto' | '2' | '3' | '4' | '5'
    cardDensity: 'standard', // 'standard' | 'compact'
    showLayerPanel: false,
    selectedIds: new Set(),
    inspectorVideoKey: null,
    draggedKey: null,
    layerSearch: '',
    hasUnsavedChanges: false
  };

  // 1. 뷰포트 반응형 프레임 제어
  const setViewport = (mode) => {
    state.viewport = mode;
    const main = document.getElementById('main-content');
    const wrapper = document.getElementById('canvas-wrapper');
    if (!main) return;

    ['desktop', 'tablet', 'mobile'].forEach(m => {
      const btn = document.getElementById(`btn-viewport-${m}`);
      if (btn) {
        if (m === mode) {
          btn.className = 'px-2.5 py-1 rounded bg-[#4169e1] text-[#faf9f6] font-semibold text-xs flex items-center gap-1.5 shadow-sm';
        } else {
          btn.className = 'px-2.5 py-1 rounded text-[#c0c0c0] hover:text-[#faf9f6] hover:bg-[#1b1f3b] text-xs flex items-center gap-1.5 transition-colors';
        }
      }
    });

    if (mode === 'desktop') {
      main.className = 'w-full max-w-7xl mx-auto p-4 sm:p-6 flex-grow transition-all duration-300';
      if (wrapper) wrapper.className = 'w-full flex justify-center py-2 transition-all duration-300';
    } else if (mode === 'tablet') {
      main.className = 'w-full max-w-[768px] mx-auto p-4 flex-grow border-x border-dashed border-[#c0c0c0]/30 bg-[#0c0e1a] shadow-2xl rounded-xl my-4 transition-all duration-300';
      if (wrapper) wrapper.className = 'w-full flex justify-center py-2 bg-black/40 transition-all duration-300';
    } else if (mode === 'mobile') {
      main.className = 'w-full max-w-[390px] mx-auto p-3 flex-grow border-x border-dashed border-[#c0c0c0]/30 bg-[#0c0e1a] shadow-2xl rounded-2xl my-4 transition-all duration-300';
      if (wrapper) wrapper.className = 'w-full flex justify-center py-2 bg-black/40 transition-all duration-300';
    }

    const vpIndicator = document.getElementById('builder-viewport-size');
    if (vpIndicator) {
      vpIndicator.textContent = mode === 'desktop' ? '100% (Desktop)' : (mode === 'tablet' ? '768px (Tablet)' : '390px (Mobile)');
    }
  };

  // 2. 그리드 레이아웃 열(Columns) 제어
  const setGridColumns = (cols) => {
    state.gridColumns = cols;
    ['auto', '2', '3', '4', '5'].forEach(c => {
      const btn = document.getElementById(`btn-grid-col-${c}`);
      if (btn) {
        btn.className = c === cols
          ? 'px-2 py-0.5 rounded bg-[#4169e1] text-[#faf9f6] text-[11px] font-semibold shadow-sm'
          : 'px-2 py-0.5 rounded text-[#c0c0c0] hover:text-[#faf9f6] text-[11px] font-medium transition-colors';
      }
    });
    if (window.app && app.render) app.render();
  };

  const getGridClass = () => {
    if (state.viewport === 'mobile') {
      return 'grid grid-cols-1 gap-3';
    }
    if (state.viewport === 'tablet') {
      return 'grid grid-cols-1 sm:grid-cols-2 gap-3.5';
    }

    switch (state.gridColumns) {
      case '2': return 'grid grid-cols-1 sm:grid-cols-2 gap-4';
      case '3': return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4';
      case '4': return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
      case '5': return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5';
      default: return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
    }
  };

  // 3. 카드 밀도 제어 (표준 / 컴팩트)
  const setCardDensity = (density) => {
    state.cardDensity = density;
    ['standard', 'compact'].forEach(d => {
      const btn = document.getElementById(`btn-density-${d}`);
      if (btn) {
        btn.className = d === density
          ? 'px-2 py-0.5 rounded bg-[#4169e1] text-[#faf9f6] text-[11px] font-semibold shadow-sm'
          : 'px-2 py-0.5 rounded text-[#c0c0c0] hover:text-[#faf9f6] text-[11px] font-medium transition-colors';
      }
    });
    if (window.app && app.render) app.render();
  };

  // 4. HTML5 드래그 앤 드롭 카드 재배치
  const handleDragStart = (e, key) => {
    if (!app.state.isEditMode) return;
    state.draggedKey = key;
    e.dataTransfer.setData('text/plain', key);
    e.dataTransfer.effectAllowed = 'move';
    const cardEl = e.currentTarget.closest('.card-item') || e.currentTarget;
    cardEl.classList.add('builder-dragging');
  };

  const handleDragOver = (e, targetKey) => {
    if (!app.state.isEditMode || !state.draggedKey || state.draggedKey === targetKey) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const cardEl = e.currentTarget.closest('.card-item') || e.currentTarget;
    cardEl.classList.add('builder-drag-target');
  };

  const handleDragLeave = (e) => {
    const cardEl = e.currentTarget.closest('.card-item') || e.currentTarget;
    cardEl.classList.remove('builder-drag-target');
  };

  const handleDrop = async (e, targetKey) => {
    if (!app.state.isEditMode || !state.draggedKey) return;
    e.preventDefault();
    const sourceKey = state.draggedKey;
    state.draggedKey = null;

    document.querySelectorAll('.builder-dragging, .builder-drag-target').forEach(el => {
      el.classList.remove('builder-dragging', 'builder-drag-target');
    });

    if (sourceKey === targetKey) return;

    const videos = app.state.videos;
    const sourceIdx = videos.findIndex(v => (v.id || `${v.title}-${v.upload_date}`) === sourceKey);
    const targetIdx = videos.findIndex(v => (v.id || `${v.title}-${v.upload_date}`) === targetKey);

    if (sourceIdx < 0 || targetIdx < 0) return;

    const [moved] = videos.splice(sourceIdx, 1);
    videos.splice(targetIdx, 0, moved);

    app.render();
    API.showToast(`[${moved.title.slice(0, 15)}...] 위치가 이동되었습니다.`, 'info');
    markUnsaved(true);
    await app.saveDataToServer();
    markUnsaved(false);
  };

  // 5. 실시간 인라인 텍스트 편집 (Live WYSIWYG Edit)
  const saveInlineTitle = async (key, newTitle) => {
    const clean = (newTitle || '').trim();
    if (!clean) return;
    const v = app.state.videos.find(x => (x.id || `${x.title}-${x.upload_date}`) === key);
    if (!v || v.title === clean) return;

    v.title = clean;
    markUnsaved(true);
    await app.saveDataToServer();
    markUnsaved(false);
    API.showToast('제목이 즉시 수정되었습니다.', 'success');
  };

  // 6. 다중 선택 및 일괄 편집 (Batch Actions)
  const toggleSelectVideo = (key, checked) => {
    if (checked) state.selectedIds.add(key);
    else state.selectedIds.delete(key);
    renderBatchBar();
  };

  const selectAllVideos = (select) => {
    if (select) {
      app.state.videos.forEach(v => state.selectedIds.add(v.id || `${v.title}-${v.upload_date}`));
    } else {
      state.selectedIds.clear();
    }
    renderBatchBar();
    if (window.app && app.render) app.render();
  };

  const renderBatchBar = () => {
    let bar = document.getElementById('builder-batch-bar');
    const count = state.selectedIds.size;

    if (count === 0) {
      if (bar) bar.classList.add('hidden');
      return;
    }

    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'builder-batch-bar';
      document.body.appendChild(bar);
    }

    bar.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1b1f3b] border border-[#c0c0c0]/35 shadow-2xl rounded-xl px-4 py-2.5 flex items-center gap-3 backdrop-blur-md text-xs text-[#faf9f6] animate-slide-up';
    bar.innerHTML = `
      <div class="flex items-center gap-2 pr-3 border-r border-[#c0c0c0]/25">
        <span class="w-2 h-2 rounded-full bg-[#ffa500] animate-pulse"></span>
        <span class="font-semibold"><strong class="font-mono text-[#ffa500] text-sm">${count}</strong>개 선택됨</span>
      </div>
      <button onclick="Builder.selectAllVideos(false)" class="text-[#c0c0c0] hover:text-[#faf9f6] transition-colors">선택 해제</button>
      <div class="h-4 w-[1px] bg-[#c0c0c0]/25"></div>
      <button onclick="Builder.batchAddTags()" class="px-2.5 py-1 rounded bg-[#14172c] hover:bg-[#252b52] border border-[#c0c0c0]/30 text-[#faf9f6] transition-colors flex items-center gap-1 font-medium shadow-sm">
        <i data-lucide="tag" class="w-3.5 h-3.5 text-[#87ceeb]"></i>
        <span>태그 추가</span>
      </button>
      <button onclick="Builder.batchSetSubtitler()" class="px-2.5 py-1 rounded bg-[#14172c] hover:bg-[#252b52] border border-[#c0c0c0]/30 text-[#faf9f6] transition-colors flex items-center gap-1 font-medium shadow-sm">
        <i data-lucide="user" class="w-3.5 h-3.5 text-[#87ceeb]"></i>
        <span>자막러 변경</span>
      </button>
      <button onclick="Builder.batchDeleteVideos()" class="px-2.5 py-1 rounded bg-red-950/80 hover:bg-red-900 border border-red-700/80 text-red-200 transition-colors flex items-center gap-1 font-semibold shadow-sm">
        <i data-lucide="trash-2" class="w-3.5 h-3.5 text-red-400"></i>
        <span>선택 삭제</span>
      </button>
      <button onclick="Builder.selectAllVideos(false)" class="p-1 rounded text-[#c0c0c0] hover:text-[#faf9f6] ml-1">
        <i data-lucide="x" class="w-4 h-4"></i>
      </button>
    `;
    if (window.lucide) lucide.createIcons();
  };

  const batchAddTags = async () => {
    if (state.selectedIds.size === 0) return;
    const input = prompt(`선택된 ${state.selectedIds.size}개 영상에 추가할 태그를 쉼표로 구분해 입력하세요 (예: 데스노드, 음매드):`);
    if (!input || !input.trim()) return;
    const newTags = input.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);
    if (!newTags.length) return;

    app.state.videos.forEach(v => {
      const key = v.id || `${v.title}-${v.upload_date}`;
      if (state.selectedIds.has(key)) {
        const cur = Array.isArray(v.tags) ? v.tags : (v.tags ? [v.tags] : []);
        const set = new Set([...cur, ...newTags]);
        v.tags = Array.from(set);
      }
    });

    state.selectedIds.clear();
    renderBatchBar();
    app.render();
    await app.saveDataToServer();
    API.showToast('선택된 영상에 태그가 일괄 추가되었습니다.', 'success');
  };

  const batchSetSubtitler = async () => {
    if (state.selectedIds.size === 0) return;
    const input = prompt(`선택된 ${state.selectedIds.size}개 영상의 자막 제작자명을 입력하세요:`);
    if (!input || !input.trim()) return;
    const name = input.trim();

    app.state.videos.forEach(v => {
      const key = v.id || `${v.title}-${v.upload_date}`;
      if (state.selectedIds.has(key)) {
        v.subtitler = name;
      }
    });

    state.selectedIds.clear();
    renderBatchBar();
    app.render();
    await app.saveDataToServer();
    API.showToast(`자막 제작자가 [${name}](으)로 일괄 변경되었습니다.`, 'success');
  };

  const batchDeleteVideos = async () => {
    if (state.selectedIds.size === 0) return;
    if (!confirm(`선택한 ${state.selectedIds.size}개 영상을 정말 삭제하시겠습니까?\n이 작업은 data.json 파일에 즉시 저장됩니다.`)) return;

    app.state.videos = app.state.videos.filter(v => {
      const key = v.id || `${v.title}-${v.upload_date}`;
      return !state.selectedIds.has(key);
    });

    state.selectedIds.clear();
    renderBatchBar();
    app.render();
    await app.saveDataToServer();
    API.showToast('선택한 영상이 일괄 삭제되었습니다.', 'success');
  };

  // 7. 레이어 트리 / CMS 비디오 목록 사이드바 (Layer Explorer Drawer)
  const toggleLayerPanel = (force = null) => {
    state.showLayerPanel = force !== null ? force : !state.showLayerPanel;
    let drawer = document.getElementById('builder-layer-drawer');

    if (!drawer) {
      drawer = document.createElement('div');
      drawer.id = 'builder-layer-drawer';
      document.body.appendChild(drawer);
    }

    if (!state.showLayerPanel) {
      drawer.className = 'hidden';
      const btn = document.getElementById('btn-toggle-layers');
      if (btn) btn.classList.remove('bg-neutral-800', 'text-white');
      return;
    }

    const btn = document.getElementById('btn-toggle-layers');
    if (btn) btn.classList.add('bg-[#4169e1]', 'text-[#faf9f6]');

    drawer.className = 'fixed top-0 right-0 bottom-0 w-80 sm:w-96 bg-[#14172c] border-l border-[#c0c0c0]/30 shadow-2xl z-50 flex flex-col transition-all duration-300';
    renderLayerDrawerContent();
  };

  const renderLayerDrawerContent = () => {
    const drawer = document.getElementById('builder-layer-drawer');
    if (!drawer || !state.showLayerPanel) return;

    const filtered = (app.state.videos || []).filter(v => {
      if (!state.layerSearch) return true;
      const q = state.layerSearch.toLowerCase();
      const crStr = Array.isArray(v.creator) ? v.creator.join(', ') : (v.creator || '');
      const subStr = Array.isArray(v.subtitler) ? v.subtitler.join(', ') : (v.subtitler || '');
      return (v.title || '').toLowerCase().includes(q) ||
             subStr.toLowerCase().includes(q) ||
             crStr.toLowerCase().includes(q);
    });

    drawer.innerHTML = `
      <div class="p-3.5 border-b border-[#c0c0c0]/25 flex items-center justify-between bg-[#1b1f3b]">
        <div class="flex items-center gap-2">
          <i data-lucide="layers" class="w-4 h-4 text-[#87ceeb]"></i>
          <span class="font-bold text-xs text-[#faf9f6]">레이어 탐색기</span>
          <span class="text-[11px] font-mono text-[#87ceeb]">(${filtered.length})</span>
        </div>
        <button onclick="Builder.toggleLayerPanel(false)" class="p-1 rounded text-[#c0c0c0] hover:text-[#faf9f6] hover:bg-[#252b52] transition-colors">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="p-2 border-b border-[#c0c0c0]/20 bg-[#14172c]">
        <div class="relative">
          <i data-lucide="search" class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#c0c0c0]"></i>
          <input type="text" placeholder="레이어 목록 검색..." value="${API.escapeHTML(state.layerSearch)}"
            oninput="Builder.searchLayers(this.value)"
            class="w-full bg-[#0c0e1a] border border-[#c0c0c0]/30 rounded px-2.5 py-1 pl-8 text-xs text-[#faf9f6] placeholder:text-[#c0c0c0]/60 outline-none focus:border-[#87ceeb] transition-colors" />
        </div>
      </div>

      <div class="p-2 overflow-y-auto flex-grow space-y-1 text-xs">
        ${filtered.map((v, i) => {
          const key = v.id || `${v.title}-${v.upload_date}`;
          const isSelected = state.selectedIds.has(key);
          const thumb = app.getThumbnail ? app.getThumbnail(v) : (v.thumbnail_url || '');
          const crText = Array.isArray(v.creator) ? v.creator.join(', ') : (v.creator || '');
          const subText = Array.isArray(v.subtitler) ? v.subtitler.join(', ') : (v.subtitler || '');

          return `
            <div class="group/layer p-1.5 rounded-lg border ${isSelected ? 'border-[#ffa500] bg-[#ffa500]/15' : 'border-[#c0c0c0]/15 bg-[#1b1f3b]/70 hover:bg-[#1b1f3b] hover:border-[#87ceeb]/40'} flex items-center gap-2.5 cursor-pointer transition-colors"
              onclick="Builder.scrollToCard('${API.escapeHTML(key)}')">
              <input type="checkbox" ${isSelected ? 'checked' : ''}
                onclick="event.stopPropagation()"
                onchange="Builder.toggleSelectVideo('${API.escapeHTML(key)}', this.checked)"
                class="w-3.5 h-3.5 rounded border-[#c0c0c0]/40 bg-[#0c0e1a] cursor-pointer" />
              <div class="w-12 aspect-video rounded overflow-hidden bg-black shrink-0 border border-[#c0c0c0]/25">
                <img src="${thumb}" referrerpolicy="no-referrer" class="w-full h-full object-cover" loading="lazy" />
              </div>
              <div class="min-w-0 flex-grow">
                <p class="text-xs font-medium text-[#faf9f6] truncate group-hover/layer:text-[#87ceeb] transition-colors">${API.escapeHTML(v.title)}</p>
                <div class="flex items-center gap-1.5 text-[10px] text-[#c0c0c0] font-mono mt-0.5 truncate">
                  <span class="truncate max-w-[120px]">${API.escapeHTML(subText ? `자막:${subText}` : (crText ? `원작:${crText}` : '미지정'))}</span>
                  <span>•</span>
                  <span>${v.upload_date || '날짜없음'}</span>
                </div>
              </div>
              <div class="flex items-center gap-1 opacity-0 group-hover/layer:opacity-100 transition-opacity">
                <button onclick="event.stopPropagation(); Modals.openExtractorModal('${API.escapeHTML(key)}')" title="속성 편집" class="p-1 rounded hover:bg-[#252b52] text-[#87ceeb]">
                  <i data-lucide="edit-2" class="w-3 h-3"></i>
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  };

  const searchLayers = (query) => {
    state.layerSearch = query || '';
    renderLayerDrawerContent();
  };

  const scrollToCard = (key) => {
    const card = document.querySelector(`[data-video-key="${key}"]`);
    if (card) {
      const cardWrapper = card.closest('.card-item') || card;
      cardWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
      cardWrapper.classList.add('builder-highlight-pulse');
      setTimeout(() => cardWrapper.classList.remove('builder-highlight-pulse'), 1800);
    }
  };

  // 8. 저장 상태 관리
  const markUnsaved = (unsaved) => {
    state.hasUnsavedChanges = unsaved;
    const dot = document.getElementById('builder-save-indicator-dot');
    const text = document.getElementById('builder-save-indicator-text');
    if (dot && text) {
      if (unsaved) {
        dot.className = 'w-2 h-2 rounded-full bg-[#ffa500] animate-pulse';
        text.textContent = '변경사항 미저장';
      } else {
        dot.className = 'w-2 h-2 rounded-full bg-[#87ceeb]';
        text.textContent = '저장됨';
      }
    }
  };

  // 9. 단축키 바인딩
  const initKeyboardShortcuts = () => {
    window.addEventListener('keydown', (e) => {
      // Ctrl + S / Cmd + S : 저장
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (app.state.isEditMode && app.saveDataToServer) {
          app.saveDataToServer();
          markUnsaved(false);
        }
      }
      // Esc : 패널 닫기, 선택 해제
      if (e.key === 'Escape') {
        if (state.selectedIds.size > 0) {
          selectAllVideos(false);
        }
        if (state.showLayerPanel) {
          toggleLayerPanel(false);
        }
      }
    });
  };

  return {
    state,
    setViewport,
    setGridColumns,
    getGridClass,
    setCardDensity,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    saveInlineTitle,
    toggleSelectVideo,
    selectAllVideos,
    batchAddTags,
    batchSetSubtitler,
    batchDeleteVideos,
    toggleLayerPanel,
    searchLayers,
    scrollToCard,
    markUnsaved,
    initKeyboardShortcuts
  };
})();

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  if (window.Builder) Builder.initKeyboardShortcuts();
});
