// -------------------------------------------------------------
// 해외 자막 음매드 모음 - API & Utility Module
// -------------------------------------------------------------

window.API = (function () {
  const escapeHTML = (str) => {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g,
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  };

  const cleanStr = (str) => {
    if (!str) return '';
    return String(str).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  };

  const getRefinedDate = (v) => {
    const d = String(v?.upload_date || "");
    const m = d.match(/(\d{4})[\/\.-](\d{2})[\/\.-](\d{2})/);
    if (m) return `${m[1]}/${m[2]}/${m[3]}`;
    const m2 = d.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m2) return `${m2[1]}/${m2[2]}/${m2[3]}`;
    const mYear = d.match(/^(\d{4})$/);
    if (mYear) return `${mYear[1]}/01/01`;
    return "0000/00/00";
  };

  const extractYtId = (url) => {
    if (!url) return null;
    const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:v\/|u\/\w\/|embed\/|watch\?v=|shorts\/|watch\?.+&v=))([^#\&\?\s]{11})/i);
    return m ? m[1] : null;
  };

  const extractPlaylistId = (url) => {
    if (!url) return null;
    const m = String(url).match(/[?&]list=([a-zA-Z0-9_\-]+)/i);
    return m ? m[1] : null;
  };

  const extractNaverVideo = (str) => {
    if (!str) return null;
    const text = String(str);
    const vidMatch = text.match(/vid=([a-zA-Z0-9_\-]+)/i);
    const outKeyMatch = text.match(/outKey=([a-zA-Z0-9_\-]+)/i);
    if (vidMatch && outKeyMatch) {
      return {
        vid: vidMatch[1],
        outKey: outKeyMatch[1],
        embedUrl: `https://serviceapi.rmcnmv.naver.com/flash/outKeyPlayer.nhn?vid=${vidMatch[1]}&outKey=${outKeyMatch[1]}&controlBarMovable=true&jsApi=true&autoPlay=false`
      };
    }
    const tvMatch = text.match(/tv\.naver\.com\/v\/(\d+)/i);
    if (tvMatch) {
      return { tvId: tvMatch[1], embedUrl: `https://tv.naver.com/embed/${tvMatch[1]}` };
    }
    const blogMatch = text.match(/blog\.naver\.com\/([a-zA-Z0-9_\-]+)\/(\d+)/i) || text.match(/m\.blog\.naver\.com\/([a-zA-Z0-9_\-]+)\/(\d+)/i);
    if (blogMatch) {
      return { isBlogOnly: true, url: `https://blog.naver.com/${blogMatch[1]}/${blogMatch[2]}` };
    }
    return null;
  };

  // 동일 영상 중복 감지용 링크 고유 식별자 키 추출
  const getVideoLinkKeys = (videoOrUrl) => {
    const keys = new Set();
    if (!videoOrUrl) return keys;

    if (typeof videoOrUrl === 'string') {
      const str = videoOrUrl.trim();
      if (!str) return keys;

      // 1. YouTube 영상 ID
      const ytId = extractYtId(str);
      if (ytId) {
        keys.add(`yt:${ytId}`);
        return keys;
      }

      // 2. Naver vid
      const vidMatch = str.match(/vid=([a-zA-Z0-9_\-]+)/i);
      if (vidMatch) keys.add(`naver_vid:${vidMatch[1]}`);

      // 3. Naver 블로그 포스트 (blogId + logNo)
      const blogMatch = str.match(/(?:blog\.naver\.com|m\.blog\.naver\.com)\/([a-zA-Z0-9_\-]+)\/(\d+)/i) ||
        str.match(/blog\.naver\.com\/PostView\.naver\?.*blogId=([a-zA-Z0-9_\-]+).*logNo=(\d+)/i) ||
        str.match(/blog\.naver\.com\/([a-zA-Z0-9_\-]+)\?.*logNo=(\d+)/i);
      if (blogMatch && blogMatch[1].toLowerCase() !== 'postview') {
        keys.add(`naver_blog:${blogMatch[1].toLowerCase()}:${blogMatch[2]}`);
      }

      // 4. Naver TV
      const tvMatch = str.match(/tv\.naver\.com\/v\/(\d+)/i);
      if (tvMatch) keys.add(`naver_tv:${tvMatch[1]}`);

      // 5. 니코동
      const nicoMatch = str.match(/(?:nicovideo\.jp\/watch\/|nico\.ms\/)(sm\d+|nm\d+|so\d+)/i) || str.match(/^(sm\d+|nm\d+|so\d+)$/i);
      if (nicoMatch) keys.add(`nico:${nicoMatch[1].toLowerCase()}`);

      // 6. 일반 URL 정규화
      if (!keys.size) {
        try {
          const u = new URL(str.startsWith('http') ? str : `https://${str}`);
          const cleanPath = `${u.hostname.replace(/^www\./i, '').toLowerCase()}${u.pathname.replace(/\/+$/, '')}`;
          const cleanSearch = u.search ? u.search.replace(/[?&](?:utm_[^&=]+|si|fbclid)=[^&=]*/gi, '').replace(/^[?&]/, '') : '';
          const full = cleanPath + (cleanSearch ? `?${cleanSearch}` : '');
          if (full) keys.add(`url:${full}`);
        } catch (_) {
          const clean = str.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').toLowerCase();
          if (clean) keys.add(`url:${clean}`);
        }
      }
      return keys;
    }

    // 영상 객체 (Object)
    const v = videoOrUrl;
    // 1. YouTube 영상 ID
    const ytId = v.yt_id || extractYtId(v.original_link) || extractYtId(v.naver_url) || extractYtId(v.url) || extractYtId(v.id);
    if (ytId) {
      keys.add(`yt:${ytId}`);
      return keys;
    }

    // 2. Naver vid
    if (v.naver_vid) keys.add(`naver_vid:${v.naver_vid}`);

    // 3. 링크 필드 순회
    const urls = [v.naver_url, v.original_link, v.url].filter(Boolean);
    for (const rawUrl of urls) {
      const uStr = String(rawUrl).trim();
      const vidM = uStr.match(/vid=([a-zA-Z0-9_\-]+)/i);
      if (vidM) keys.add(`naver_vid:${vidM[1]}`);

      const bM = uStr.match(/(?:blog\.naver\.com|m\.blog\.naver\.com)\/([a-zA-Z0-9_\-]+)\/(\d+)/i) ||
        uStr.match(/blog\.naver\.com\/PostView\.naver\?.*blogId=([a-zA-Z0-9_\-]+).*logNo=(\d+)/i) ||
        uStr.match(/blog\.naver\.com\/([a-zA-Z0-9_\-]+)\?.*logNo=(\d+)/i);
      if (bM && bM[1].toLowerCase() !== 'postview') {
        keys.add(`naver_blog:${bM[1].toLowerCase()}:${bM[2]}`);
      }

      const tvM = uStr.match(/tv\.naver\.com\/v\/(\d+)/i);
      if (tvM) keys.add(`naver_tv:${tvM[1]}`);

      const nicoM = uStr.match(/(?:nicovideo\.jp\/watch\/|nico\.ms\/)(sm\d+|nm\d+|so\d+)/i);
      if (nicoM) keys.add(`nico:${nicoM[1].toLowerCase()}`);
    }

    // 4. 일반 URL 정규화 폴백
    if (!keys.size) {
      for (const rawUrl of urls) {
        const uStr = String(rawUrl).trim();
        try {
          const u = new URL(uStr.startsWith('http') ? uStr : `https://${uStr}`);
          const cleanPath = `${u.hostname.replace(/^www\./i, '').toLowerCase()}${u.pathname.replace(/\/+$/, '')}`;
          const cleanSearch = u.search ? u.search.replace(/[?&](?:utm_[^&=]+|si|fbclid)=[^&=]*/gi, '').replace(/^[?&]/, '') : '';
          const full = cleanPath + (cleanSearch ? `?${cleanSearch}` : '');
          if (full) keys.add(`url:${full}`);
        } catch (_) {
          const clean = uStr.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').toLowerCase();
          if (clean) keys.add(`url:${clean}`);
        }
      }
    }

    return keys;
  };

  // 두 영상/링크가 동일한 영상인지 검사
  const isSameVideoLink = (itemA, itemB) => {
    if (!itemA || !itemB) return false;
    const keysA = getVideoLinkKeys(itemA);
    const keysB = getVideoLinkKeys(itemB);
    if (!keysA.size || !keysB.size) return false;
    for (const k of keysA) {
      if (keysB.has(k)) return true;
    }
    return false;
  };

  // 비디오 목록에서 동일 링크의 중복 영상 찾기 (excludeId는 수정 시 자기 자신 제외용)
  const findDuplicateVideo = (target, videoList, excludeId = null) => {
    if (!target || !videoList || !Array.isArray(videoList)) return null;
    const targetKeys = getVideoLinkKeys(target);
    if (!targetKeys.size) return null;

    for (const v of videoList) {
      const vKey = v.id || `${v.title}-${v.upload_date}`;
      if (excludeId && (vKey === excludeId || v.id === excludeId)) continue;
      const vKeys = getVideoLinkKeys(v);
      for (const k of targetKeys) {
        if (vKeys.has(k)) return v;
      }
    }
    return null;
  };

  // 유튜브 설명란에서 원작자(Creator) 자동 추출
  const extractCreatorFromDescription = (desc) => {
    if (!desc) return null;
    const lines = String(desc).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const patterns = [
      /(?:제작자|제작|원작자|원작|원동화|만든이)\s*[:\-\=：]\s*([^\r\n,]+)/i,
      /(?:Maker|Creator|Author|Made by|Movie)\s*[:\-\=：]\s*([^\r\n,]+)/i,
      /(?:投稿者|投稿|作者|動画|うｐ主|うぷ主)\s*[:\-\=：]\s*([^\r\n,]+)/i,
      /(?:音声・映像|映像・音声)\s*[:\-\=：]\s*([^\r\n,]+)/i,
      /(?:주최)\s*[:\-\=：]\s*([^\r\n,]+)/i
    ];
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (['원곡', '原曲', 'bgm', '노래', 'music', '사용된 곡', '참가자'].some(ex => lower.includes(ex))) {
        continue;
      }
      for (const pat of patterns) {
        const m = line.match(pat);
        if (m) {
          let val = m[1].trim();
          if (['http://', 'https://', 'sm', 'nm'].some(ex => val.toLowerCase().includes(ex))) continue;
          val = val.replace(/님(?:\s*\(.*?\))?$/, '').trim();
          val = val.replace(/\s*[\(（](?:삭제됨|탈퇴|비공개|전계정|제명)[\)）]$/, '').trim();
          val = val.replace(/\[.*?\]$/, '').trim();
          if (val && val.length <= 30) return val;
        }
      }
    }
    return null;
  };

  // 유튜브 설명란에서 원제(Original Title) 자동 추출
  const extractOriginalTitleFromDescription = (desc) => {
    if (!desc) return null;
    const lines = String(desc).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const patterns = [
      /(?:원제|원작제|원제목)\s*[:\-\=：]\s*([^\r\n]+)/i,
      /(?:Original Title)\s*[:\-\=：]\s*([^\r\n]+)/i
    ];
    for (const line of lines) {
      for (const pat of patterns) {
        const m = line.match(pat);
        if (m) {
          let val = m[1].trim();
          val = val.replace(/https?:\/\/\S+/g, '').trim();
          val = val.replace(/\(?(?:sm|nm|so)\d+\)?/gi, '').trim();
          val = val.replace(/#.*$/, '').trim();
          val = val.replace(/[\(（](?:삭제됨|재업로드|복구|고화질)[\)）]/g, '').trim();
          if (val && val.length <= 100) return val;
        }
      }
    }
    return null;
  };

  // 유튜브 설명란에서 원작 링크(Source URL) 자동 추출
  const extractSourceUrlFromDescription = (desc, currentYtId = '') => {
    if (!desc) return null;
    const lines = String(desc).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const sourceKeywords = ['원작', '원본', '본가', 'original', '本家', 'sm', '니코동', '니코', 'niconico', '출처', '원 주소', '원작자', '원 영상', 'source', '원제'];
    const excludeKeywords = ['원곡', '原曲', 'bgm', '사용된 곡', 'music', '노래', '오프닝', '엔딩', 'ost', '참가자'];

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (excludeKeywords.some(ex => lower.includes(ex)) && !['원작', '원본', '본가', '本家', 'sm'].some(sk => lower.includes(sk))) {
        continue;
      }
      if (sourceKeywords.some(kw => lower.includes(kw))) {
        const smM = line.match(/(?:nicovideo\.jp\/watch\/|nico\.ms\/)?\b(sm\d+|nm\d+|so\d+)\b/i);
        if (smM) return `https://www.nicovideo.jp/watch/${smM[1].toLowerCase()}`;
        const ytM = line.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/i);
        if (ytM && ytM[1] !== currentYtId) return `https://www.youtube.com/watch?v=${ytM[1]}`;
      }
    }

    const nicoUrlM = desc.match(/https?:\/\/(?:www\.)?(?:nicovideo\.jp\/watch|nico\.ms)\/(sm\d+|nm\d+|so\d+)/i);
    if (nicoUrlM) return `https://www.nicovideo.jp/watch/${nicoUrlM[1].toLowerCase()}`;

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (excludeKeywords.some(ex => lower.includes(ex)) && !['원작', '원본', '본가', '本家'].some(sk => lower.includes(sk))) {
        continue;
      }
      const smM = line.match(/(?:#|\b)(sm\d{5,10}|nm\d{5,10}|so\d{5,10})\b/i);
      if (smM) return `https://www.nicovideo.jp/watch/${smM[1].toLowerCase()}`;
    }

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (excludeKeywords.some(ex => lower.includes(ex))) continue;
      const ytM = line.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/i);
      if (ytM && ytM[1] !== currentYtId) return `https://www.youtube.com/watch?v=${ytM[1]}`;
    }

    return null;
  };

  const showToast = (message, type = 'info') => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    const borderColors = {
      success: 'border-emerald-600 bg-neutral-900 text-emerald-300',
      error: 'border-red-600 bg-neutral-900 text-red-300',
      info: 'border-neutral-700 bg-neutral-900 text-neutral-200'
    };
    const cls = borderColors[type] || borderColors.info;
    toast.className = `p-3 px-4 rounded-lg border text-xs font-medium shadow-lg pointer-events-auto transition-all duration-200 transform translate-y-2 opacity-0 ${cls}`;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    });
    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-1');
      setTimeout(() => toast.remove(), 200);
    }, 3200);
  };

  const checkServerStatus = async () => {
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        return json.editable === true;
      }
    } catch (_) {}
    return false;
  };

  const fetchDataJSON = async () => {
    const res = await fetch(`data.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  };

  const saveDataJSON = async (fullData) => {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(fullData, null, 2)
    });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || '저장 실패');
    return json;
  };

  const fetchYoutubeMeta = async (video_id) => {
    try {
      const res = await fetch(`/api/youtube_info?id=${video_id}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) return json;
      }
    } catch (_) {}

    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${video_id}&format=json`);
    if (oembedRes.ok) {
      const odata = await oembedRes.json();
      const cleanTitle = (odata.title || '').replace(/^\[(?:자막|한글자막|번역)\]\s*/i, '').trim();
      return { success: true, title: cleanTitle, author: odata.author_name };
    }
    return { success: false };
  };

  const fetchPlaylistVideos = async (url) => {
    const res = await fetch(`/api/extract_playlist?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || '재생목록 추출 실패');
    return json.videos || [];
  };

  const syncProfiles = async () => {
    const res = await fetch('/api/sync_profiles');
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    return await res.json();
  };

  const fetchProfile = async (query, name = '') => {
    let url = `/api/fetch_profile?query=${encodeURIComponent(query)}`;
    if (name) url += `&name=${encodeURIComponent(name)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || '프로필 정보를 불러올 수 없습니다.');
    return json;
  };

  const fetchNicoInfo = async (query) => {
    const res = await fetch(`/api/nico_info?query=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || '니코동 정보 조회 실패');
    return json;
  };

  const fetchNaverInfo = async (url) => {
    const res = await fetch(`/api/naver_info?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || '네이버 정보 조회 실패');
    return json;
  };

  const fetchNaverStream = async (vid, key, url = '') => {
    let query = '';
    if (vid && key) {
      query = `vid=${encodeURIComponent(vid)}&key=${encodeURIComponent(key)}`;
      if (url) query += `&url=${encodeURIComponent(url)}`;
    } else if (url) {
      query = `url=${encodeURIComponent(url)}`;
    } else {
      throw new Error('vid/key 또는 url이 필요합니다.');
    }
    const res = await fetch(`/api/naver_stream?${query}`);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || '네이버 스트림 조회 실패');
    return json;
  };

  return {
    escapeHTML,
    cleanStr,
    getRefinedDate,
    extractYtId,
    extractPlaylistId,
    extractNaverVideo,
    getVideoLinkKeys,
    isSameVideoLink,
    findDuplicateVideo,
    extractCreatorFromDescription,
    extractOriginalTitleFromDescription,
    extractSourceUrlFromDescription,
    showToast,
    checkServerStatus,
    fetchDataJSON,
    saveDataJSON,
    fetchYoutubeMeta,
    fetchPlaylistVideos,
    syncProfiles,
    fetchProfile,
    fetchNicoInfo,
    fetchNaverInfo,
    fetchNaverStream
  };
})();

