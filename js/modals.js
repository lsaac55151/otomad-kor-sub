// -------------------------------------------------------------
// 해외 자막 음매드 모음 - Modal Controller Module
// -------------------------------------------------------------

window.Modals = (function () {
  let modalState = {
    editingVideoId: null,
    currentSingleItem: null,
    playlistItems: [],
    isPlaylistMode: false,
    currentCreatorModal: null
  };

  // 모달 표시 / 숨김 헬퍼
  const toggleModal = (modalId, show) => {
    const el = document.getElementById(modalId);
    if (!el) return;
    if (show) {
      el.classList.remove('hidden');
      el.classList.add('flex');
    } else {
      el.classList.add('hidden');
      el.classList.remove('flex');
    }
  };

  const getChannelInfo = (name) => {
    if (!name || name === 'Unknown') return null;
    const cleanName = String(name).trim();
    const cmap = app.state.data?.channelMap || {};
    let url = cmap[cleanName];

    // 1. If not in channelMap, infer from Nico avatar (usericon/<dir>/<user_id>)
    if (!url) {
      const avatar = app.state.data?.profileMap?.[cleanName] || '';
      const nicoMatch = avatar.match(/usericon\/\d+\/(\d+)/);
      if (nicoMatch) {
        url = `https://www.nicovideo.jp/user/${nicoMatch[1]}`;
      }
    }

    // 2. If not found, infer from Naver blog videos
    if (!url && app.state.videos) {
      const target = cleanName.toLowerCase();
      for (const v of app.state.videos) {
        const subs = (app.parseSubtitlers ? app.parseSubtitlers(v.subtitler) : [v.subtitler]).map(s => String(s).trim().toLowerCase());
        const crs = (app.parseCreators ? app.parseCreators(v.creator) : [v.creator]).map(s => String(s).trim().toLowerCase());
        if (subs.includes(target) || crs.includes(target)) {
          const nurl = v.naver_url || v.original_link || '';
          const m = nurl.match(/(?:blog\.naver\.com|m\.blog\.naver\.com)\/([a-zA-Z0-9_\-]+)/);
          if (m && m[1] && m[1].toLowerCase() !== 'postview') {
            url = `https://blog.naver.com/${m[1]}`;
            if (!app.state.data) app.state.data = {};
            if (!app.state.data.channelMap) app.state.data.channelMap = {};
            app.state.data.channelMap[cleanName] = url;
            break;
          }
        }
      }
    }

    if (!url) return null;

    let platform = 'generic';
    let label = '채널 방문';

    if (url.includes('nicovideo.jp') || url.includes('nico.ms')) {
      platform = 'niconico';
      label = '니코동 마이페이지';
    } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
      platform = 'youtube';
      label = 'YouTube 채널';
    } else if (url.includes('blog.naver.com') || url.includes('m.blog.naver.com')) {
      platform = 'naver';
      label = '네이버 블로그';
    }

    return { url, platform, label };
  };

  const renderCreatorChannelBadge = (name) => {
    const chInfo = getChannelInfo(name);
    const chBadgeEl = document.getElementById('modal-creator-channel-badge');
    if (!chBadgeEl) return chInfo;

    if (chInfo) {
      let btnHtml = '';
      if (chInfo.platform === 'youtube') {
        btnHtml = `
          <a href="${chInfo.url}" target="_blank" rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded theme-bg-subtle hover:theme-bg-hover text-[11px] font-semibold theme-text-main border theme-border-subtle hover:border-[#4169e1] shadow-sm transition-all group"
            title="YouTube 채널로 이동">
            <svg class="w-3.5 h-3.5 fill-red-500 shrink-0" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            <span>YouTube 채널</span>
            <i data-lucide="arrow-up-right" class="w-3 h-3 theme-text-sub group-hover:text-[#4169e1] transition-colors"></i>
          </a>
        `;
      } else if (chInfo.platform === 'naver') {
        btnHtml = `
          <a href="${chInfo.url}" target="_blank" rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded theme-bg-subtle hover:theme-bg-hover text-[11px] font-semibold theme-text-main hover:text-[#03c75a] border theme-border-subtle hover:border-[#03c75a] shadow-sm transition-all group"
            title="네이버 블로그로 이동">
            <span class="w-3.5 h-3.5 rounded bg-[#03c75a] text-white font-black text-[9px] flex items-center justify-center shrink-0">N</span>
            <span>네이버 블로그</span>
            <i data-lucide="arrow-up-right" class="w-3 h-3 theme-text-sub group-hover:text-[#03c75a] transition-colors"></i>
          </a>
        `;
      } else if (chInfo.platform === 'niconico') {
        btnHtml = `
          <a href="${chInfo.url}" target="_blank" rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded theme-bg-subtle hover:theme-bg-hover text-[11px] font-semibold theme-text-main border theme-border-subtle hover:border-[#4169e1] shadow-sm transition-all group"
            title="니코동 마이페이지로 이동">
            <i data-lucide="tv" class="w-3.5 h-3.5 theme-text-sub group-hover:text-[#4169e1]"></i>
            <span>니코동 마이페이지</span>
            <i data-lucide="arrow-up-right" class="w-3 h-3 theme-text-sub group-hover:text-[#4169e1] transition-colors"></i>
          </a>
        `;
      } else {
        btnHtml = `
          <a href="${chInfo.url}" target="_blank" rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded theme-bg-subtle hover:theme-bg-hover text-[11px] font-semibold theme-text-main border theme-border-subtle hover:border-[#4169e1] shadow-sm transition-all group"
            title="공식 채널/페이지로 이동">
            <i data-lucide="globe" class="w-3.5 h-3.5 theme-text-sub group-hover:text-[#4169e1]"></i>
            <span>채널 바로가기</span>
            <i data-lucide="arrow-up-right" class="w-3 h-3 theme-text-sub group-hover:text-[#4169e1] transition-colors"></i>
          </a>
        `;
      }
      chBadgeEl.innerHTML = btnHtml;
      chBadgeEl.classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
    } else {
      chBadgeEl.innerHTML = '';
      chBadgeEl.classList.add('hidden');
    }
    return chInfo;
  };

  // 1. 제작자/자막자 상세 모달
  const openCreatorModal = (name, type = 'creator') => {
    if (window.app && app.stopAllPlayers) app.stopAllPlayers();
    modalState.currentCreatorModal = { name, type };
    const curI18n = window.I18N[app.state.lang];
    const isSub = type === 'subtitler';
    const parseFn = isSub
      ? (app.parseSubtitlers || (val => Array.isArray(val) ? val : String(val || '').split(',').map(s => s.trim()).filter(Boolean)))
      : (app.parseCreators || (val => Array.isArray(val) ? val : String(val || '').split(',').map(s => s.trim()).filter(Boolean)));
    const filtered = app.state.videos.filter(v => {
      const list = parseFn(isSub ? v.subtitler : v.creator).map(s => String(s).trim().toLowerCase());
      return list.includes(name.trim().toLowerCase());
    });
    const pmap = app.state.data?.profileMap || {};
    const profile = pmap[name] || app.state.data?.config?.defaultProfile || 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=100';

    document.getElementById('modal-creator-name').textContent = name;
    document.getElementById('modal-creator-type-badge').textContent = type === 'subtitler' ? curI18n.subtitlerBadge : curI18n.creatorBadge;
    document.getElementById('modal-creator-profile').src = profile;
    document.getElementById('modal-creator-count').textContent = `${filtered.length} ${curI18n.works}`;

    // 채널 링크 버튼 렌더링
    const chInfo = renderCreatorChannelBadge(name);

    // 채널이 즉시 감지되지 않은 경우, 해당 제작자의 YouTube 영상에서 채널 URL을 비동기 조회하여 버튼 노출
    if (!chInfo && filtered.length > 0) {
      const sampleYt = filtered.find(x => x.yt_id);
      if (sampleYt && sampleYt.yt_id) {
        API.fetchYoutubeMeta(sampleYt.yt_id).then(meta => {
          if (meta && meta.author_url) {
            if (!app.state.data) app.state.data = {};
            if (!app.state.data.channelMap) app.state.data.channelMap = {};
            app.state.data.channelMap[name] = meta.author_url;
            renderCreatorChannelBadge(name);
          }
        }).catch(() => {});
      }
    }

    // 편집 모드일 때만 프로필 수정 버튼 노출
    const creatorEditBtn = document.getElementById('modal-creator-edit-btn');
    if (creatorEditBtn) {
      if (window.app && app.state && app.state.isEditMode) {
        creatorEditBtn.classList.remove('hidden');
      } else {
        creatorEditBtn.classList.add('hidden');
      }
    }

    const worksContainer = document.getElementById('modal-creator-works');
    worksContainer.innerHTML = filtered.map((v, i) => app.renderCard(v, `modal-${i}`)).join('');
    lucide.createIcons();
    toggleModal('creator-modal', true);
  };

  const promptEditCreatorProfile = async () => {
    if (!modalState.currentCreatorModal) return;
    const { name, type } = modalState.currentCreatorModal;
    const typeLabel = type === 'subtitler' ? '자막 제작자' : '원작자';
    const curAvatar = app.state.data?.profileMap?.[name] || '';
    const input = prompt(
      `[${name}] (${typeLabel})의 프로필 연동 정보를 입력하세요.\n\n` +
      `• 네이버 블로그 주소 (예: https://blog.naver.com/아이디)\n` +
      `• 유튜브 채널/영상 주소 (예: https://www.youtube.com/@채널명)\n` +
      `• 니코동 유저 ID / 영상 번호 (예: 1234567, sm9)\n` +
      `• 직접 이미지 URL (https://...)\n`,
      curAvatar
    );
    if (!input || !input.trim() || input.trim() === curAvatar) return;
    const val = input.trim();

    try {
      API.showToast('프로필 정보 조회 중...', 'info');
      const res = await API.fetchProfile(val, name);
      if (res && res.success && res.avatar) {
        if (!app.state.data) app.state.data = {};
        if (!app.state.data.profileMap) app.state.data.profileMap = {};
        if (!app.state.data.channelMap) app.state.data.channelMap = {};
        app.state.data.profileMap[name] = res.avatar;
        if (res.user_url || res.url) {
          app.state.data.channelMap[name] = res.user_url || res.url;
        }
        document.getElementById('modal-creator-profile').src = res.avatar;
        openCreatorModal(name, type);
        await app.saveDataToServer();
        const platName = res.platform === 'naver' ? '네이버 블로그' : (res.platform === 'youtube' ? '유튜브' : (res.platform === 'niconico' ? '니코동' : '이미지'));
        API.showToast(`[${name}] ${platName} 프로필이 저장되었습니다.`, 'success');
      } else {
        throw new Error(res.error || '프로필 정보를 찾을 수 없습니다.');
      }
    } catch (err) {
      alert(`프로필 적용 실패: ${err.message}`);
    }
  };

  const closeCreatorModal = () => {
    if (window.app && app.stopAllPlayers) app.stopAllPlayers();
    const worksContainer = document.getElementById('modal-creator-works');
    if (worksContainer) worksContainer.innerHTML = '';
    toggleModal('creator-modal', false);
  };

  // 2. data.json 파일 관리 모달
  const openDataModal = () => toggleModal('data-modal', true);
  const closeDataModal = () => toggleModal('data-modal', false);

  const handleFileUpload = (evt) => {
    const file = evt.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        app.state.data = parsed;
        app.state.videos = Array.isArray(parsed.videos) ? parsed.videos : [];
        closeDataModal();
        app.render();
        API.showToast('data.json 파일을 불러왔습니다.', 'success');
      } catch (err) {
        alert('올바른 JSON 파일이 아닙니다: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const downloadDataJSON = () => {
    const fullData = {
      config: app.state.data?.config || {},
      creatorMap: app.state.data?.creatorMap || {},
      profileMap: app.state.data?.profileMap || {},
      channelMap: app.state.data?.channelMap || {},
      videos: app.state.videos
    };
    const blob = new Blob([JSON.stringify(fullData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 3. raw-json 모달
  const openRawJsonModal = () => {
    const fullData = {
      config: app.state.data?.config || {},
      creatorMap: app.state.data?.creatorMap || {},
      profileMap: app.state.data?.profileMap || {},
      channelMap: app.state.data?.channelMap || {},
      videos: app.state.videos
    };
    const textarea = document.getElementById('raw-json-textarea');
    textarea.value = JSON.stringify(fullData, null, 2);
    document.getElementById('raw-json-error-box').classList.add('hidden');
    document.getElementById('raw-json-status').textContent = `총 ${fullData.videos.length}개 영상`;
    toggleModal('raw-json-modal', true);
  };

  const closeRawJsonModal = () => toggleModal('raw-json-modal', false);

  const formatRawJSON = () => {
    const textarea = document.getElementById('raw-json-textarea');
    try {
      const parsed = JSON.parse(textarea.value);
      textarea.value = JSON.stringify(parsed, null, 2);
      document.getElementById('raw-json-error-box').classList.add('hidden');
      API.showToast('JSON 정렬이 완료되었습니다.', 'info');
    } catch (e) {
      showRawJsonError(e.message);
    }
  };

  const validateRawJSON = () => {
    const textarea = document.getElementById('raw-json-textarea');
    try {
      const parsed = JSON.parse(textarea.value);
      if (!parsed.videos || !Array.isArray(parsed.videos)) {
        throw new Error('"videos" 배열이 누락되었습니다.');
      }
      document.getElementById('raw-json-error-box').classList.add('hidden');
      API.showToast(`검증 완료: 총 ${parsed.videos.length}개 영상 데이터 정상`, 'success');
      return true;
    } catch (e) {
      showRawJsonError(e.message);
      return false;
    }
  };

  const showRawJsonError = (msg) => {
    const errBox = document.getElementById('raw-json-error-box');
    document.getElementById('raw-json-error-text').textContent = `문법 오류: ${msg}`;
    errBox.classList.remove('hidden');
  };

  const saveRawJSONToFile = async () => {
    const textarea = document.getElementById('raw-json-textarea');
    try {
      const parsed = JSON.parse(textarea.value);
      if (!parsed.videos || !Array.isArray(parsed.videos)) {
        throw new Error('"videos" 배열이 필요합니다.');
      }
      const success = await app.saveDataToServer(parsed);
      if (success) closeRawJsonModal();
    } catch (e) {
      showRawJsonError(e.message);
    }
  };

  const renderCreatorAvatarsPreview = () => {
    const creatorVal = (document.getElementById('meta-creator')?.value || '').trim();
    const names = creatorVal.split(',').map(s => s.trim()).filter(Boolean);
    const prevSec = document.getElementById('creator-avatar-preview');
    if (!prevSec) return;

    if (!names.length) {
      prevSec.classList.add('hidden');
      prevSec.innerHTML = '';
      return;
    }

    const pmap = app.state.data?.profileMap || {};
    const chips = names.map(name => {
      const avatar = pmap[name];
      if (avatar) {
        return `
          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded theme-bg-subtle border theme-border-medium text-[11px] theme-text-main shadow-sm" title="${API.escapeHTML(name)}">
            <img src="${avatar}" referrerpolicy="no-referrer" class="w-3.5 h-3.5 rounded-full object-cover shrink-0" onerror="this.style.display='none'" />
            <span class="truncate max-w-[90px] font-medium">${API.escapeHTML(name)}</span>
          </span>
        `;
      }
      return '';
    }).filter(Boolean);

    if (chips.length > 0) {
      prevSec.innerHTML = chips.join('');
      prevSec.className = 'flex items-center gap-1.5 text-[11px] theme-text-sub flex-wrap justify-end';
      prevSec.classList.remove('hidden');
    } else {
      prevSec.classList.add('hidden');
      prevSec.innerHTML = '';
    }
  };

  const renderSubtitlerAvatarsPreview = () => {
    const subVal = (document.getElementById('meta-subtitler')?.value || '').trim();
    const names = subVal.split(',').map(s => s.trim()).filter(Boolean);
    const prevSec = document.getElementById('subtitler-avatar-preview');
    if (!prevSec) return;

    if (!names.length) {
      prevSec.classList.add('hidden');
      prevSec.innerHTML = '';
      return;
    }

    const pmap = app.state.data?.profileMap || {};
    const chips = names.map(name => {
      const avatar = pmap[name];
      if (avatar) {
        return `
          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded theme-bg-subtle border theme-border-medium text-[11px] theme-text-main shadow-sm" title="${API.escapeHTML(name)}">
            <img src="${avatar}" referrerpolicy="no-referrer" class="w-3.5 h-3.5 rounded-full object-cover shrink-0" onerror="this.style.display='none'" />
            <span class="truncate max-w-[90px] font-medium">${API.escapeHTML(name)}</span>
          </span>
        `;
      }
      return '';
    }).filter(Boolean);

    if (chips.length > 0) {
      prevSec.innerHTML = chips.join('');
      prevSec.className = 'flex items-center gap-1.5 text-[11px] theme-text-sub flex-wrap justify-end';
      prevSec.classList.remove('hidden');
    } else {
      prevSec.classList.add('hidden');
      prevSec.innerHTML = '';
    }
  };

  // 4. 추출기 및 등록 모달
  const openExtractorModal = (editId = null) => {
    modalState.editingVideoId = editId;
    modalState.currentSingleItem = null;
    modalState.playlistItems = [];
    switchExtractorMode('single');

    const titleEl = document.getElementById('extractor-modal-title');
    const inputEl = document.getElementById('extract-input');
    const autoBadge = document.getElementById('auto-title-badge');
    const subtitlerBadge = document.getElementById('auto-subtitler-badge');
    const autoSourceBadge = document.getElementById('auto-source-badge');
    const autoCreatorBadge = document.getElementById('auto-creator-badge');
    if (autoBadge) autoBadge.classList.add('hidden');
    if (subtitlerBadge) subtitlerBadge.classList.add('hidden');
    if (autoSourceBadge) autoSourceBadge.classList.add('hidden');
    if (autoCreatorBadge) autoCreatorBadge.classList.add('hidden');

    const nicoQueryEl = document.getElementById('meta-nico-query');
    if (nicoQueryEl) nicoQueryEl.value = '';
    const subQueryEl = document.getElementById('meta-subtitler-query');
    if (subQueryEl) subQueryEl.value = '';
    const batchCrEl = document.getElementById('playlist-batch-creator');
    if (batchCrEl) batchCrEl.value = '';
    updateDuplicateBanner(null);
    renderCreatorAvatarsPreview();
    renderSubtitlerAvatarsPreview();

    if (editId) {
      const v = app.state.videos.find(x => (x.id || `${x.title}-${x.upload_date}`) === editId);
      if (!v) return;
      modalState.currentSingleItem = { ...v };
      titleEl.textContent = "영상 정보 수정";
      document.getElementById('btn-save-video-text').textContent = "수정 완료 (덮어쓰기)";

      const ytId = v.yt_id || API.extractYtId(v.original_link);
      const ytUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : null;
      const naverUrl = v.naver_url || (v.original_link && v.original_link.includes('blog.naver.com') ? v.original_link : null);
      const curSourceUrl = v.source_url || (v.original_link && v.original_link !== ytUrl && v.original_link !== naverUrl ? v.original_link : '') || '';

      inputEl.value = v.original_link || v.naver_url || '';
      document.getElementById('meta-title').value = v.title || '';
      document.getElementById('meta-orig-title').value = v.originalTitle || '';
      document.getElementById('meta-creator').value = Array.isArray(v.creator) ? v.creator.join(', ') : (v.creator || '');
      document.getElementById('meta-subtitler').value = Array.isArray(v.subtitler) ? v.subtitler.join(', ') : (v.subtitler || '');
      const sourceUrlEl = document.getElementById('meta-source-url');
      if (sourceUrlEl) sourceUrlEl.value = curSourceUrl;
      document.getElementById('meta-date').value = v.upload_date || '';
      document.getElementById('meta-tags').value = Array.isArray(v.tags) ? v.tags.join(', ') : (v.tags || '');
      document.getElementById('meta-desc').value = v.description || '';

      renderCreatorAvatarsPreview();
      renderSubtitlerAvatarsPreview();

      if (v.yt_id) showExtractPreview(v, 'youtube');
      else if (v.platform === 'naver' || v.naver_url || v.naver_vid || (v.original_link && v.original_link.includes('blog.naver.com'))) showExtractPreview(v, 'naver_blog');
      else document.getElementById('extract-preview-section').classList.add('hidden');
    } else {
      titleEl.textContent = "영상 등록";
      document.getElementById('btn-save-video-text').textContent = "data.json에 저장 (덮어쓰기)";
      inputEl.value = '';
      document.getElementById('meta-title').value = '';
      document.getElementById('meta-orig-title').value = '';
      document.getElementById('meta-creator').value = '';
      document.getElementById('meta-subtitler').value = '';
      const sourceUrlEl = document.getElementById('meta-source-url');
      if (sourceUrlEl) sourceUrlEl.value = '';
      document.getElementById('meta-date').value = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
      document.getElementById('meta-tags').value = '';
      document.getElementById('meta-desc').value = '';
      document.getElementById('extract-preview-section').classList.add('hidden');
      renderCreatorAvatarsPreview();
      renderSubtitlerAvatarsPreview();
      if (subQueryEl) subQueryEl.value = '';
      if (nicoQueryEl) nicoQueryEl.value = '';
    }

    updateGeneratedJSON();
    toggleModal('extractor-modal', true);
  };

  const closeExtractorModal = () => toggleModal('extractor-modal', false);

  const lookupSubtitlerProfile = async (customQuery = '') => {
    const queryEl = document.getElementById('meta-subtitler-query');
    const query = (customQuery || (queryEl ? queryEl.value : '') || '').trim();
    if (!query) {
      alert('네이버 블로그 주소, 유튜브 채널/영상 링크, 또는 니코동 주소를 입력하세요.');
      if (queryEl) queryEl.focus();
      return;
    }

    try {
      API.showToast('자막 제작자 프로필 조회 중...', 'info');
      const res = await API.fetchProfile(query);
      if (res && res.success) {
        const subtitlerEl = document.getElementById('meta-subtitler');
        const currentSubtitlers = subtitlerEl.value ? subtitlerEl.value.split(',').map(s => s.trim()).filter(Boolean) : [];

        if (res.nickname) {
          if (!currentSubtitlers.length || (currentSubtitlers.length === 1 && (currentSubtitlers[0] === 'Unknown' || currentSubtitlers[0].startsWith('http')))) {
            subtitlerEl.value = res.nickname;
          } else if (!currentSubtitlers.includes(res.nickname)) {
            currentSubtitlers.push(res.nickname);
            subtitlerEl.value = currentSubtitlers.join(', ');
          }
        }

        if (!app.state.data) app.state.data = {};
        if (!app.state.data.profileMap) app.state.data.profileMap = {};
        if (!app.state.data.channelMap) app.state.data.channelMap = {};
        if (res.avatar && subName) {
          app.state.data.profileMap[subName] = res.avatar;
          if (res.nickname && res.nickname !== subName) {
            app.state.data.profileMap[res.nickname] = res.avatar;
          }
        }
        if (res.url || res.user_url) {
          const chUrl = res.url || res.user_url;
          app.state.data.channelMap[subName] = chUrl;
          if (res.nickname && res.nickname !== subName) {
            app.state.data.channelMap[res.nickname] = chUrl;
          }
        }

        renderSubtitlerAvatarsPreview();
        updateGeneratedJSON();
        API.showToast(`자막 제작자 [${subName}] 프로필 연동 완료`, 'success');
        if (queryEl) queryEl.value = '';
      }
    } catch (err) {
      API.showToast(`프로필 조회 실패: ${err.message}`, 'error');
    }
  };

  const checkSubtitlerAutoLink = (val) => {
    const text = String(val || '').trim();
    if (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('@') || text.includes('blog.naver.com') || text.includes('youtube.com')) {
      const queryEl = document.getElementById('meta-subtitler-query');
      if (queryEl) queryEl.value = text;
      lookupSubtitlerProfile(text);
    }
  };

  const lookupNicoProfile = async () => {
    const queryEl = document.getElementById('meta-nico-query');
    const query = (queryEl.value || '').trim();
    if (!query) {
      alert('니코동 유저 ID/URL/sm번호 또는 유튜브/블로그 주소를 입력하세요.');
      queryEl.focus();
      return;
    }

    try {
      API.showToast('원작자 프로필 조회 중...', 'info');
      const res = await API.fetchProfile(query);
      if (res && res.success) {
        const creatorEl = document.getElementById('meta-creator');
        const currentCreators = creatorEl.value ? creatorEl.value.split(',').map(s => s.trim()).filter(Boolean) : [];

        if (res.nickname) {
          if (!currentCreators.length || (currentCreators.length === 1 && currentCreators[0] === 'Unknown')) {
            creatorEl.value = res.nickname;
          } else if (!currentCreators.includes(res.nickname)) {
            currentCreators.push(res.nickname);
            creatorEl.value = currentCreators.join(', ');
          }
        }

        const creatorName = res.nickname || creatorEl.value.trim();
        if (!app.state.data) app.state.data = {};
        if (!app.state.data.profileMap) app.state.data.profileMap = {};
        if (!app.state.data.channelMap) app.state.data.channelMap = {};
        if (res.avatar && creatorName) {
          app.state.data.profileMap[creatorName] = res.avatar;
          if (res.nickname && res.nickname !== creatorName) {
            app.state.data.profileMap[res.nickname] = res.avatar;
          }
        }
        if (res.user_url || res.url) {
          const chUrl = res.user_url || res.url;
          app.state.data.channelMap[creatorName] = chUrl;
          if (res.nickname && res.nickname !== creatorName) {
            app.state.data.channelMap[res.nickname] = chUrl;
          }
        }

        renderCreatorAvatarsPreview();
        updateGeneratedJSON();
        API.showToast(`원작자 프로필 [${creatorName}] 연동 완료`, 'success');
        queryEl.value = '';
      }
    } catch (err) {
      API.showToast(`원작자 프로필 조회 실패: ${err.message}`, 'error');
    }
  };

  const switchExtractorMode = (mode) => {
    modalState.isPlaylistMode = (mode === 'playlist');
    const singleSec = document.getElementById('single-video-section');
    const plistSec = document.getElementById('playlist-section');
    const singleFooter = document.getElementById('single-footer-buttons');
    const plistFooter = document.getElementById('playlist-footer-buttons');

    if (modalState.isPlaylistMode) {
      if (singleSec) singleSec.classList.add('hidden');
      if (plistSec) plistSec.classList.remove('hidden');
      if (singleFooter) singleFooter.classList.add('hidden');
      if (plistFooter) plistFooter.classList.remove('hidden');
    } else {
      if (singleSec) singleSec.classList.remove('hidden');
      if (plistSec) plistSec.classList.add('hidden');
      if (singleFooter) singleFooter.classList.remove('hidden');
      if (plistFooter) plistFooter.classList.add('hidden');
    }
  };

  const updateDuplicateBanner = (target) => {
    const dupBanner = document.getElementById('duplicate-warning-banner');
    const dupText = document.getElementById('duplicate-warning-text');
    const dupBtn = document.getElementById('btn-edit-duplicate');
    if (!dupBanner || !dupText) return;

    if (!target) {
      dupBanner.classList.add('hidden');
      return;
    }

    const existing = API.findDuplicateVideo(target, app.state.videos, modalState.editingVideoId);
    if (existing) {
      dupText.textContent = `"${existing.title}" (${existing.upload_date || '날짜없음'})`;
      if (dupBtn) {
        dupBtn.onclick = () => openExtractorModal(existing.id || `${existing.title}-${existing.upload_date}`);
      }
      dupBanner.classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
    } else {
      dupBanner.classList.add('hidden');
    }
  };

  const handleExtractInput = async (val) => {
    const input = (val || "").trim();
    if (!input) {
      updateDuplicateBanner(null);
      return;
    }

    // 재생목록 감지
    const plistId = API.extractPlaylistId(input);
    if (plistId && (input.includes('playlist') || input.includes('list='))) {
      updateDuplicateBanner(null);
      switchExtractorMode('playlist');
      fetchPlaylist(input);
      return;
    }

    switchExtractorMode('single');
    updateDuplicateBanner(input);
    const extracted = {
      title: "",
      originalTitle: "",
      creator: "",
      subtitler: "",
      upload_date: new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
      platform: "",
      yt_id: "",
      naver_url: "",
      naver_vid: "",
      naver_outkey: "",
      thumbnail_url: "",
      original_link: input,
      is_viewable: true,
      tags: [],
      description: ""
    };

    const ytId = API.extractYtId(input);
    if (ytId) {
      extracted.platform = "youtube";
      extracted.yt_id = ytId;
      extracted.thumbnail_url = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
      extracted.original_link = `https://www.youtube.com/watch?v=${ytId}`;
      showExtractPreview(extracted, 'youtube');

      const meta = await API.fetchYoutubeMeta(ytId);
      if (meta && meta.thumbnail) {
        extracted.thumbnail_url = meta.thumbnail;
        showExtractPreview(extracted, 'youtube');
      }
      if (meta && (meta.title || meta.channel_avatar)) {
        const titleEl = document.getElementById('meta-title');
        const origTitleEl = document.getElementById('meta-orig-title');
        const subtitlerEl = document.getElementById('meta-subtitler');

        if (meta.title) {
          const cleanTitle = (meta.title || '').replace(/^\[(?:자막|한글자막|번역)\]\s*/i, '').trim();
          titleEl.value = cleanTitle;
          if (!origTitleEl.value.trim()) origTitleEl.value = meta.original_title || cleanTitle;
          extracted.title = cleanTitle;
          extracted.originalTitle = origTitleEl.value;
        }

        // 유튜브 채널명은 자막 제작자(subtitler)로만 설정! 원작자(creator)를 덮어쓰지 않음!
        if (meta.author) {
          const currentSubs = subtitlerEl.value ? subtitlerEl.value.split(',').map(s => s.trim()).filter(Boolean) : [];
          if (!currentSubs.length) {
            subtitlerEl.value = meta.author;
          } else if (!currentSubs.includes(meta.author)) {
            currentSubs.push(meta.author);
            subtitlerEl.value = currentSubs.join(', ');
          }
          if (meta.channel_avatar) {
            if (!app.state.data) app.state.data = {};
            if (!app.state.data.profileMap) app.state.data.profileMap = {};
            app.state.data.profileMap[meta.author] = meta.channel_avatar;
          }
          if (meta.author_url) {
            if (!app.state.data) app.state.data = {};
            if (!app.state.data.channelMap) app.state.data.channelMap = {};
            app.state.data.channelMap[meta.author] = meta.author_url;
          }
          renderSubtitlerAvatarsPreview();
        }

        // 설명란에서 원작자(Creator) 자동 감지
        if (meta.creator) {
          const creatorEl = document.getElementById('meta-creator');
          if (creatorEl) {
            creatorEl.value = meta.creator;
            extracted.creator = meta.creator;
            renderCreatorAvatarsPreview();
          }
          const autoCreatorBadge = document.getElementById('auto-creator-badge');
          if (autoCreatorBadge) autoCreatorBadge.classList.remove('hidden');
        }

        // 설명란에서 원제(Original Title) 자동 감지
        if (meta.original_title) {
          origTitleEl.value = meta.original_title;
          extracted.originalTitle = meta.original_title;
        }

        // 설명란 원문 자동 보존
        if (meta.description) {
          const descEl = document.getElementById('meta-desc');
          if (descEl && !descEl.value.trim()) {
            descEl.value = meta.description;
            extracted.description = meta.description;
          }
        }

        // 설명란에서 원본 링크(Source URL) 자동 감지
        if (meta.source_url) {
          const sourceEl = document.getElementById('meta-source-url');
          if (sourceEl) {
            sourceEl.value = meta.source_url;
            extracted.source_url = meta.source_url;
          }
          const autoSourceBadge = document.getElementById('auto-source-badge');
          if (autoSourceBadge) autoSourceBadge.classList.remove('hidden');
        }

        const autoBadge = document.getElementById('auto-title-badge');
        const subtitlerBadge = document.getElementById('auto-subtitler-badge');
        if (autoBadge) autoBadge.classList.remove('hidden');
        if (subtitlerBadge) subtitlerBadge.classList.remove('hidden');
        updateGeneratedJSON();
        updateDuplicateBanner(extracted);
      }
      return;
    }

    // 2. 네이버 블로그 또는 네이버 동영상 자동 추출
    const isNaverInput = input.includes('blog.naver.com') ||
      input.includes('rmcnmv.naver.com') ||
      input.includes('tv.naver.com') ||
      (input.includes('vid=') && (input.includes('outKey=') || input.includes('inkey=') || input.includes('key=')));

    if (isNaverInput) {
      API.showToast('네이버 블로그/동영상 정보 자동 조회 중...', 'info');
      try {
        const meta = await API.fetchNaverInfo(input);
        if (meta && meta.success) {
          extracted.platform = meta.platform || "naver";

          if (meta.yt_id) {
            extracted.yt_id = meta.yt_id;
            extracted.platform = "youtube";
            extracted.original_link = `https://www.youtube.com/watch?v=${meta.yt_id}`;
            extracted.thumbnail_url = meta.thumbnail_url || `https://i.ytimg.com/vi/${meta.yt_id}/hqdefault.jpg`;
            showExtractPreview(extracted, 'youtube');
          } else {
            extracted.platform = "naver";
            if (meta.vid) extracted.naver_vid = meta.vid;
            if (meta.outkey) extracted.naver_outkey = meta.outkey;
            extracted.naver_url = meta.naver_url || meta.original_url || input;
            extracted.original_link = meta.original_url || input;
            extracted.thumbnail_url = meta.thumbnail_url || "";
            showExtractPreview(extracted, 'naver_blog');
          }

          const titleEl = document.getElementById('meta-title');
          const origTitleEl = document.getElementById('meta-orig-title');
          const subtitlerEl = document.getElementById('meta-subtitler');
          const dateEl = document.getElementById('meta-date');

          if (meta.title) {
            const cleanTitle = meta.title.replace(/^\[자막\]\s*/i, '').trim();
            titleEl.value = cleanTitle;
            if (!origTitleEl.value.trim()) origTitleEl.value = cleanTitle;
            extracted.title = cleanTitle;
            extracted.originalTitle = origTitleEl.value;
          }

          // 블로그 작성자는 자막 제작자(subtitler)로 자동 등록
          if (meta.author) {
            const currentSubs = subtitlerEl.value ? subtitlerEl.value.split(',').map(s => s.trim()).filter(Boolean) : [];
            if (!currentSubs.length) {
              subtitlerEl.value = meta.author;
            } else if (!currentSubs.includes(meta.author)) {
              currentSubs.push(meta.author);
              subtitlerEl.value = currentSubs.join(', ');
            }
            extracted.subtitler = subtitlerEl.value;
            if (meta.channel_avatar) {
              if (!app.state.data) app.state.data = {};
              if (!app.state.data.profileMap) app.state.data.profileMap = {};
              app.state.data.profileMap[meta.author] = meta.channel_avatar;
            }
            const naverTargetUrl = meta.naver_url || meta.original_url || input;
            const nm = naverTargetUrl.match(/(?:blog\.naver\.com|m\.blog\.naver\.com)\/([a-zA-Z0-9_\-]+)/);
            if (nm && nm[1] && nm[1].toLowerCase() !== 'postview') {
              if (!app.state.data) app.state.data = {};
              if (!app.state.data.channelMap) app.state.data.channelMap = {};
              app.state.data.channelMap[meta.author] = `https://blog.naver.com/${nm[1]}`;
            }
            renderSubtitlerAvatarsPreview();
          }

          if (meta.upload_date) {
            dateEl.value = meta.upload_date;
            extracted.upload_date = meta.upload_date;
          }

          const autoBadge = document.getElementById('auto-title-badge');
          const subtitlerBadge = document.getElementById('auto-subtitler-badge');
          if (autoBadge) autoBadge.classList.remove('hidden');
          if (subtitlerBadge) subtitlerBadge.classList.remove('hidden');

          updateGeneratedJSON();
          updateDuplicateBanner(extracted);
          API.showToast(`네이버 블로그 [${meta.title || meta.author || '게시글'}] 정보 추출 완료`, 'success');
          return;
        }
      } catch (err) {
        console.warn('Naver auto extract failed:', err);
      }
    }

    const naver = API.extractNaverVideo(input);
    if (naver) {
      extracted.platform = "naver";
      extracted.naver_url = naver.url;
      extracted.original_link = naver.url;
      showExtractPreview(extracted, 'naver_blog');
      updateDuplicateBanner(extracted);
      return;
    }
  };

  const showExtractPreview = (item, type) => {
    modalState.currentSingleItem = item;
    const previewSec = document.getElementById('extract-preview-section');
    const badge = document.getElementById('extract-platform-badge');
    const statusText = document.getElementById('extract-status-text');
    const playerContainer = document.getElementById('extract-player-container');
    previewSec.classList.remove('hidden');

    if (type === 'youtube') {
      badge.className = 'px-2 py-0.5 rounded text-[11px] font-semibold bg-red-950 text-red-400 border border-red-800';
      badge.textContent = 'YouTube';
      statusText.textContent = `ID: ${item.yt_id}`;
      playerContainer.innerHTML = `<iframe src="https://www.youtube.com/embed/${item.yt_id}" class="w-full h-full border-none" allowfullscreen></iframe>`;
    } else {
      badge.className = 'px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800';
      badge.textContent = 'NAVER Blog';
      const targetUrl = item.naver_url || item.original_link || '#';
      statusText.textContent = targetUrl;
      const thumb = item.thumbnail_url || (window.app && app.getThumbnail ? app.getThumbnail(item) : '') || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=640&auto=format&fit=crop&q=80';
      playerContainer.innerHTML = `
        <div class="w-full h-full relative bg-neutral-950 flex flex-col items-center justify-center overflow-hidden border border-neutral-800 group">
          <img src="${thumb}" referrerpolicy="no-referrer" class="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:scale-105 transition-transform duration-300" onerror="this.style.display='none'" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/30"></div>
          <div class="relative z-10 text-center p-3 flex flex-col items-center gap-2">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/90 text-emerald-300 font-semibold text-xs border border-emerald-700/80 shadow-md backdrop-blur-sm">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>네이버 블로그 원작 포스트 연동</span>
            </span>
            <p class="text-xs text-neutral-200 truncate max-w-sm font-medium">${API.escapeHTML(item.title || '게시글')}</p>
            <a href="${targetUrl}" target="_blank" rel="noopener noreferrer"
              class="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-900/90 hover:bg-neutral-800 text-[11px] text-neutral-300 hover:text-white border border-neutral-700/80 transition-colors">
              <span>블로그 원문 확인</span>
              <i data-lucide="arrow-up-right" class="w-3 h-3 text-neutral-400"></i>
            </a>
          </div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
    }
    updateGeneratedJSON();
  };

  const updateGeneratedJSON = () => {
    if (!modalState.currentSingleItem) return;
    const item = modalState.currentSingleItem;
    const title = document.getElementById('meta-title').value.trim();
    const origTitle = document.getElementById('meta-orig-title').value.trim();
    const creator = document.getElementById('meta-creator').value.trim();
    const subtitler = document.getElementById('meta-subtitler').value.trim();
    let sourceUrl = (document.getElementById('meta-source-url')?.value || '').trim();
    if (sourceUrl && /^(?:#)?(sm|nm|so)\d+$/i.test(sourceUrl)) {
      sourceUrl = `https://www.nicovideo.jp/watch/${sourceUrl.replace(/^#/, '').toLowerCase()}`;
    }
    const date = document.getElementById('meta-date').value.trim();
    const tags = document.getElementById('meta-tags').value.split(',').map(s => s.trim()).filter(Boolean);
    const desc = document.getElementById('meta-desc').value.trim();

    if (title) item.title = title;
    if (origTitle) item.originalTitle = origTitle;
    if (creator) {
      const cList = creator.split(',').map(s => s.trim()).filter(Boolean);
      item.creator = cList.length > 1 ? cList : (cList[0] || '');
    } else {
      item.creator = '';
    }
    if (subtitler) {
      const sList = subtitler.split(',').map(s => s.trim()).filter(Boolean);
      item.subtitler = sList.length > 1 ? sList : (sList[0] || '');
    } else {
      item.subtitler = '';
    }
    item.source_url = sourceUrl;
    if (date) item.upload_date = date;
    if (tags.length) item.tags = tags;
    if (desc) item.description = desc;
    item.id = item.id || `video-${Date.now()}`;

    const jsonEl = document.getElementById('extract-json-output');
    if (jsonEl) jsonEl.textContent = JSON.stringify(item, null, 2);
  };

  const handleDescInput = (descVal) => {
    updateGeneratedJSON();
    const desc = (descVal || '').trim();
    if (!desc) return;

    const sourceEl = document.getElementById('meta-source-url');
    if (sourceEl && !sourceEl.value.trim()) {
      const currentYtId = modalState.currentSingleItem?.yt_id || '';
      const src = API.extractSourceUrlFromDescription(desc, currentYtId);
      if (src) {
        sourceEl.value = src;
        if (modalState.currentSingleItem) modalState.currentSingleItem.source_url = src;
        document.getElementById('auto-source-badge')?.classList.remove('hidden');
      }
    }

    const creatorEl = document.getElementById('meta-creator');
    if (creatorEl && !creatorEl.value.trim()) {
      const cr = API.extractCreatorFromDescription(desc);
      if (cr) {
        creatorEl.value = cr;
        if (modalState.currentSingleItem) modalState.currentSingleItem.creator = cr;
        document.getElementById('auto-creator-badge')?.classList.remove('hidden');
        renderCreatorAvatarsPreview();
      }
    }

    const origTitleEl = document.getElementById('meta-orig-title');
    if (origTitleEl && !origTitleEl.value.trim()) {
      const ot = API.extractOriginalTitleFromDescription(desc);
      if (ot) {
        origTitleEl.value = ot;
        if (modalState.currentSingleItem) modalState.currentSingleItem.originalTitle = ot;
      }
    }

    updateGeneratedJSON();
  };

  const saveCurrentVideoToFile = async () => {
    updateGeneratedJSON();
    if (!modalState.currentSingleItem || !modalState.currentSingleItem.title) {
      alert('영상 제목을 입력하세요.');
      document.getElementById('meta-title').focus();
      return;
    }

    // 이미 리스트에 있는 동일 링크 중복 영상 검사
    const existing = API.findDuplicateVideo(modalState.currentSingleItem, app.state.videos, modalState.editingVideoId);
    if (existing) {
      alert(`이미 리스트에 동일한 링크의 영상이 등록되어 있습니다.\n\n• 제목: ${existing.title}\n• 업로드 날짜: ${existing.upload_date || '미지정'}\n\n중복 영상은 추가할 수 없습니다.`);
      return;
    }

    const item = { ...modalState.currentSingleItem };
    if (modalState.editingVideoId) {
      const idx = app.state.videos.findIndex(x => (x.id || `${x.title}-${x.upload_date}`) === modalState.editingVideoId);
      if (idx >= 0) app.state.videos[idx] = item;
      else app.state.videos.unshift(item);
    } else {
      app.state.videos.unshift(item);
    }

    const success = await app.saveDataToServer();
    if (success) closeExtractorModal();
  };

  const addSingleToSession = () => {
    updateGeneratedJSON();
    if (!modalState.currentSingleItem || !modalState.currentSingleItem.title) {
      alert('영상 제목을 입력하세요.');
      return;
    }

    // 이미 리스트에 있는 동일 링크 중복 영상 검사
    const existing = API.findDuplicateVideo(modalState.currentSingleItem, app.state.videos, modalState.editingVideoId);
    if (existing) {
      alert(`이미 리스트에 동일한 링크의 영상이 등록되어 있습니다.\n\n• 제목: ${existing.title}\n\n중복 영상은 추가할 수 없습니다.`);
      return;
    }

    app.state.videos.unshift({ ...modalState.currentSingleItem });
    closeExtractorModal();
    app.render();
    API.showToast('화면에 추가되었습니다.', 'info');
  };

  // 재생목록 추출 및 일괄 저장
  const fetchPlaylist = async (url) => {
    const loading = document.getElementById('playlist-loading');
    const result = document.getElementById('playlist-result-container');
    loading.classList.remove('hidden');
    result.classList.add('hidden');

    try {
      const videos = await API.fetchPlaylistVideos(url);
      const defaultDate = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
      let dupCount = 0;
      let detectedCount = 0;

      modalState.playlistItems = videos.map(v => {
        const existing = API.findDuplicateVideo(v, app.state.videos);
        const isDup = Boolean(existing);
        if (isDup) dupCount++;
        if (v.creator || v.source_url) detectedCount++;

        const cleanTitle = (v.title || '').replace(/^\[(?:자막|한글자막|번역)\]\s*/i, '').trim();
        return {
          id: v.id,
          title: cleanTitle,
          originalTitle: v.originalTitle || cleanTitle,
          creator: v.creator || '',
          subtitler: v.uploader || '',
          upload_date: defaultDate,
          platform: 'youtube',
          yt_id: v.id,
          thumbnail_url: v.thumbnail || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
          original_link: v.url || `https://www.youtube.com/watch?v=${v.id}`,
          source_url: v.source_url || '',
          description: v.description || '',
          is_viewable: true,
          tags: [],
          isDuplicate: isDup,
          existingTitle: existing ? existing.title : '',
          selected: !isDup // 이미 있는 영상은 자동으로 선택 해제
        };
      });

      renderPlaylistItems();
      loading.classList.add('hidden');
      result.classList.remove('hidden');

      let msg = `재생목록 ${modalState.playlistItems.length}개 추출 완료`;
      if (detectedCount > 0) {
        msg += ` (${detectedCount}개 원작/출처 자동 감지)`;
      }
      if (dupCount > 0) {
        msg += ` • 중복 ${dupCount}개 제외`;
      }
      API.showToast(msg, 'success');
    } catch (e) {
      loading.classList.add('hidden');
      API.showToast(`추출 실패: ${e.message}`, 'error');
    }
  };

  const renderPlaylistItems = () => {
    const listEl = document.getElementById('playlist-items-list');
    const summaryCount = document.getElementById('playlist-summary-count');
    const saveBtn = document.getElementById('btn-save-playlist-text');
    const totalCount = modalState.playlistItems.length;
    const selectedCount = modalState.playlistItems.filter(x => x.selected).length;
    const dupCount = modalState.playlistItems.filter(x => x.isDuplicate).length;

    if (summaryCount) {
      if (dupCount > 0) {
        summaryCount.innerHTML = `총 <strong class="theme-text-main">${totalCount}</strong>개 중 <strong class="text-[#4169e1] font-bold">${selectedCount}</strong>개 선택됨 <span class="text-[#ffa500] font-semibold text-[11px] ml-1">(중복 ${dupCount}개 자동 제외됨)</span>`;
      } else {
        summaryCount.innerHTML = `총 <strong class="theme-text-main">${totalCount}</strong>개 중 <strong class="text-[#4169e1] font-bold">${selectedCount}</strong>개 선택`;
      }
    }
    if (saveBtn) saveBtn.textContent = `선택 영상 (${selectedCount}개) data.json에 일괄 저장`;

    listEl.innerHTML = modalState.playlistItems.map((item, idx) => {
      const isDup = item.isDuplicate;
      let cardBg = '';
      if (isDup) {
        cardBg = item.selected
          ? 'bg-[#ffa500]/15 border-[#ffa500]/70'
          : 'theme-bg-subtle theme-border-subtle opacity-60';
      } else {
        cardBg = item.selected
          ? 'theme-bg-surface border-[#4169e1] shadow-sm'
          : 'theme-bg-subtle theme-border-subtle opacity-60';
      }

      return `
      <div class="p-2 rounded border ${cardBg} flex items-center gap-3 transition-colors">
        <input type="checkbox" ${item.selected ? 'checked' : ''} onchange="Modals.togglePlaylistItem(${idx}, this.checked)" class="w-4 h-4 cursor-pointer rounded theme-border-medium theme-bg-canvas shrink-0" />
        <div class="w-16 aspect-video rounded overflow-hidden bg-black shrink-0 border theme-border-subtle relative">
          <img src="${item.thumbnail_url}" class="w-full h-full object-cover" loading="lazy" />
          ${isDup ? '<span class="absolute bottom-0 inset-x-0 bg-[#ffa500] text-[#0c0e1a] text-[9px] font-bold text-center py-0.2">중복</span>' : ''}
        </div>
        <div class="flex-grow min-w-0 space-y-1">
          <div class="flex items-center gap-1.5">
            ${isDup ? `<span class="px-1.5 py-0.2 rounded text-[10px] bg-[#ffa500]/20 text-[#ffa500] border border-[#ffa500]/50 font-semibold shrink-0" title="기존: ${API.escapeHTML(item.existingTitle)}">이미 등록됨</span>` : ''}
            <input type="text" value="${API.escapeHTML(item.title)}" oninput="Modals.updatePlaylistItemTitle(${idx}, this.value)"
              class="w-full theme-bg-canvas border theme-border-medium focus:border-[#4169e1] rounded px-2 py-0.5 text-xs theme-text-main outline-none transition-colors" />
          </div>
          <div class="flex items-center justify-between text-[11px] theme-text-sub font-mono truncate">
            <div class="flex items-center gap-1.5 truncate">
              <span>자막: ${API.escapeHTML(Array.isArray(item.subtitler) ? item.subtitler.join(', ') : (item.subtitler || '미지정'))}</span>
              ${item.creator ? `<span>•</span><span class="text-[#4169e1] font-medium truncate max-w-[140px]" title="원작자: ${API.escapeHTML(item.creator)}">원작: ${API.escapeHTML(item.creator)}</span>` : ''}
              ${item.source_url ? `<span>•</span><span class="text-[#4169e1] font-medium shrink-0" title="${API.escapeHTML(item.source_url)}">출처: ${item.source_url.includes('nicovideo') || item.source_url.includes('nico.ms') ? '니코동' : '유튜브'}</span>` : ''}
            </div>
            ${isDup ? `<span class="text-[#ffa500]/90 truncate text-[10px] ml-2 shrink-0">기존: "${API.escapeHTML(item.existingTitle)}"</span>` : ''}
          </div>
        </div>
      </div>
    `;
    }).join('');
  };

  const togglePlaylistItem = (idx, checked) => {
    if (modalState.playlistItems[idx]) {
      modalState.playlistItems[idx].selected = checked;
      renderPlaylistItems();
    }
  };

  const toggleSelectAllPlaylist = (mode) => {
    if (mode === 'new') {
      modalState.playlistItems.forEach(x => { x.selected = !x.isDuplicate; });
    } else if (mode === true || mode === 'all') {
      modalState.playlistItems.forEach(x => { x.selected = true; });
    } else {
      modalState.playlistItems.forEach(x => { x.selected = false; });
    }
    renderPlaylistItems();
  };

  const updatePlaylistItemTitle = (idx, val) => {
    if (modalState.playlistItems[idx]) modalState.playlistItems[idx].title = val;
  };

  const applyBatchSubtitler = (val) => {
    const list = val.split(',').map(s => s.trim()).filter(Boolean);
    const subVal = list.length > 1 ? list : (list[0] || '');
    modalState.playlistItems.forEach(x => { x.subtitler = subVal; });
    renderPlaylistItems();
  };

  const applyBatchCreator = (val) => {
    const list = val.split(',').map(s => s.trim()).filter(Boolean);
    const crVal = list.length > 1 ? list : (list[0] || '');
    modalState.playlistItems.forEach(x => { x.creator = crVal; });
    renderPlaylistItems();
  };

  const applyBatchTags = (val) => {
    const tags = val.split(',').map(s => s.trim()).filter(Boolean);
    modalState.playlistItems.forEach(x => { x.tags = tags; });
  };

  const applyBatchDate = (val) => {
    modalState.playlistItems.forEach(x => { x.upload_date = val.trim(); });
  };

  const savePlaylistToServer = async () => {
    const selected = modalState.playlistItems.filter(x => x.selected);
    if (!selected.length) return alert('저장할 영상을 선택하세요.');

    // 이미 리스트에 있는 중복 영상은 알아서 필터링 (동일 링크 기준)
    const nonDuplicates = selected.filter(item => !API.findDuplicateVideo(item, app.state.videos));
    const duplicateCount = selected.length - nonDuplicates.length;

    if (nonDuplicates.length === 0) {
      alert(`선택한 ${selected.length}개 영상이 모두 이미 리스트에 등록되어 있어 추가되지 않았습니다.`);
      return;
    }

    const newVideos = nonDuplicates.map(v => {
      const item = { ...v };
      delete item.selected;
      delete item.isDuplicate;
      delete item.existingTitle;
      item.id = item.id || `yt-${item.yt_id || Date.now()}`;
      // [자막] 접두사를 붙이지 않음 (원문 제목 유지)
      item.title = (item.title || '').replace(/^\[(?:자막|한글자막|번역)\]\s*/i, '').trim();
      return item;
    });

    app.state.videos.unshift(...newVideos);
    const success = await app.saveDataToServer();
    if (success) {
      closeExtractorModal();
      if (duplicateCount > 0) {
        API.showToast(`신규 영상 ${newVideos.length}개 추가 완료 (중복 ${duplicateCount}개 자동 제외)`, 'success');
      } else {
        API.showToast(`신규 영상 ${newVideos.length}개 추가 완료`, 'success');
      }
    }
  };

  const addPlaylistToSession = () => {
    const selected = modalState.playlistItems.filter(x => x.selected);
    if (!selected.length) return alert('영상을 선택하세요.');

    // 이미 리스트에 있는 중복 영상은 알아서 필터링 (동일 링크 기준)
    const nonDuplicates = selected.filter(item => !API.findDuplicateVideo(item, app.state.videos));
    const duplicateCount = selected.length - nonDuplicates.length;

    if (nonDuplicates.length === 0) {
      alert(`선택한 영상이 모두 이미 리스트에 등록되어 있어 추가되지 않았습니다.`);
      return;
    }

    app.state.videos.unshift(...nonDuplicates.map(v => {
      const item = { ...v };
      delete item.selected;
      delete item.isDuplicate;
      delete item.existingTitle;
      // [자막] 접두사를 붙이지 않음 (원문 제목 유지)
      item.title = (item.title || '').replace(/^\[(?:자막|한글자막|번역)\]\s*/i, '').trim();
      return item;
    }));
    closeExtractorModal();
    app.render();
    if (duplicateCount > 0) {
      API.showToast(`화면에 ${nonDuplicates.length}개 추가되었습니다. (중복 ${duplicateCount}개 제외)`, 'info');
    } else {
      API.showToast(`화면에 ${nonDuplicates.length}개 추가되었습니다.`, 'info');
    }
  };

  return {
    openCreatorModal,
    closeCreatorModal,
    openDataModal,
    closeDataModal,
    handleFileUpload,
    downloadDataJSON,
    openRawJsonModal,
    closeRawJsonModal,
    formatRawJSON,
    validateRawJSON,
    saveRawJSONToFile,
    openExtractorModal,
    closeExtractorModal,
    handleExtractInput,
    handleDescInput,
    updateGeneratedJSON,
    saveCurrentVideoToFile,
    addSingleToSession,
    togglePlaylistItem,
    toggleSelectAllPlaylist,
    updatePlaylistItemTitle,
    applyBatchSubtitler,
    applyBatchCreator,
    applyBatchTags,
    applyBatchDate,
    savePlaylistToServer,
    addPlaylistToSession,
    lookupNicoProfile,
    lookupSubtitlerProfile,
    checkSubtitlerAutoLink,
    promptEditCreatorProfile,
    renderCreatorAvatarsPreview,
    renderSubtitlerAvatarsPreview
  };
})();
