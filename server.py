import http.server
import socketserver
import os
import sys
import json
import webbrowser
import threading
import shutil
import urllib.request
from urllib.parse import urlparse, parse_qs
import subprocess
import re
import html as html_lib
from concurrent.futures import ThreadPoolExecutor, as_completed

# Windows 콘솔 환경에서 한글 출력 깨짐 방지
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "data.json")
BACKUP_FILE = os.path.join(BASE_DIR, "data.backup.json")

def get_channel_avatar_from_url(channel_url):
    req = urllib.request.Request(channel_url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko,en"
    })
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
            m = re.search(r'<meta property="og:image" content="([^"]+)"', html)
            if m and ('yt3.googleusercontent.com' in m.group(1) or 'yt3.ggpht.com' in m.group(1)):
                return m.group(1)
    except Exception:
        pass
    return None

def fetch_avatar_for_video(video_id):
    url = f"https://www.youtube.com/watch?v={video_id}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko,en"
    })
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
            m = re.search(r'"ownerProfileUrl":\s*"([^"]+)"', html)
            if m:
                av = get_channel_avatar_from_url(m.group(1).replace("http://", "https://"))
                if av:
                    return av
            m2 = re.search(r'"channelId":\s*"([^"]+)"', html)
            if m2:
                av = get_channel_avatar_from_url(f"https://www.youtube.com/channel/{m2.group(1)}")
                if av:
                    return av
    except Exception:
        pass
    return None

def get_best_youtube_thumbnail(video_id):
    max_url = f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg"
    try:
        req = urllib.request.Request(max_url, method="HEAD")
        with urllib.request.urlopen(req, timeout=2) as resp:
            if resp.status == 200:
                return max_url
    except Exception:
        pass
    return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

def extract_source_url_from_description(desc, current_yt_id=""):
    if not desc:
        return None
    lines = [line.strip() for line in desc.splitlines() if line.strip()]
    source_keywords = [
        '원작', '원본', '본가', 'original', '本家', 'sm', '니코동', '니코', 
        'niconico', '출처', '원 주소', '원작자', '원 영상', 'source', '원제'
    ]
    exclude_keywords = ['원곡', '原曲', 'bgm', '사용된 곡', 'music', '노래', '오프닝', '엔딩', 'ost', '참가자']

    for line in lines:
        line_lower = line.lower()
        if any(ex in line_lower for ex in exclude_keywords) and not any(sk in line_lower for sk in ['원작', '원본', '본가', '本家', 'sm']):
            continue
        if any(kw in line_lower for kw in source_keywords):
            sm_m = re.search(r'(?:nicovideo\.jp\/watch\/|nico\.ms\/)?\b(sm\d+|nm\d+|so\d+)\b', line, re.I)
            if sm_m:
                return f"https://www.nicovideo.jp/watch/{sm_m.group(1).lower()}"
            yt_m = re.search(r'(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})', line)
            if yt_m and yt_m.group(1) != current_yt_id:
                return f"https://www.youtube.com/watch?v={yt_m.group(1)}"

    nico_url_m = re.search(r'https?:\/\/(?:www\.)?(?:nicovideo\.jp\/watch|nico\.ms)\/(sm\d+|nm\d+|so\d+)', desc, re.I)
    if nico_url_m:
        return f"https://www.nicovideo.jp/watch/{nico_url_m.group(1).lower()}"

    for line in lines:
        line_lower = line.lower()
        if any(ex in line_lower for ex in exclude_keywords) and not any(sk in line_lower for sk in ['원작', '원본', '본가', '本家']):
            continue
        sm_m = re.search(r'(?:#|\b)(sm\d{5,10}|nm\d{5,10}|so\d{5,10})\b', line, re.I)
        if sm_m:
            return f"https://www.nicovideo.jp/watch/{sm_m.group(1).lower()}"

    for line in lines:
        line_lower = line.lower()
        if any(ex in line_lower for ex in exclude_keywords):
            continue
        yt_m = re.search(r'(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})', line)
        if yt_m and yt_m.group(1) != current_yt_id:
            return f"https://www.youtube.com/watch?v={yt_m.group(1)}"

    return None

def extract_creator_from_description(desc):
    if not desc:
        return None
    lines = [line.strip() for line in desc.splitlines() if line.strip()]
    patterns = [
        r'(?:제작자|제작|원작자|원작|원동화|만든이)\s*[:\-\=：]\s*([^\r\n,]+)',
        r'(?:Maker|Creator|Author|Made by|Movie)\s*[:\-\=：]\s*([^\r\n,]+)',
        r'(?:投稿者|投稿|作者|動画|うｐ主|うぷ主)\s*[:\-\=：]\s*([^\r\n,]+)',
        r'(?:音声・映像|映像・音声)\s*[:\-\=：]\s*([^\r\n,]+)',
        r'(?:주최)\s*[:\-\=：]\s*([^\r\n,]+)',
    ]
    for line in lines:
        if any(ex in line.lower() for ex in ['원곡', '原曲', 'bgm', '노래', 'music', '사용된 곡', '참가자']):
            continue
        for pat in patterns:
            m = re.search(pat, line, re.IGNORECASE)
            if m:
                val = m.group(1).strip()
                if any(ex in val.lower() for ex in ['http://', 'https://', 'sm', 'nm']):
                    continue
                val = re.sub(r'님(?:\s*\(.*?\))?$', '', val).strip()
                val = re.sub(r'\s*[\(（](?:삭제됨|탈퇴|비공개|전계정|제명)[\)）]$', '', val).strip()
                val = re.sub(r'\[.*?\]$', '', val).strip()
                if val and len(val) <= 30:
                    return val
    return None

def extract_original_title_from_description(desc):
    if not desc:
        return None
    lines = [line.strip() for line in desc.splitlines() if line.strip()]
    patterns = [
        r'(?:원제|원작제|원제목)\s*[:\-\=：]\s*([^\r\n]+)',
        r'(?:Original Title)\s*[:\-\=：]\s*([^\r\n]+)',
    ]
    for line in lines:
        for pat in patterns:
            m = re.search(pat, line, re.IGNORECASE)
            if m:
                val = m.group(1).strip()
                val = re.sub(r'https?:\/\/\S+', '', val).strip()
                val = re.sub(r'\(?(?:sm|nm|so)\d+\)?', '', val, flags=re.IGNORECASE).strip()
                val = re.sub(r'#.*$', '', val).strip()
                val = re.sub(r'[\(（](?:삭제됨|재업로드|복구|고화질)[\)）]', '', val).strip()
                if val and len(val) <= 100:
                    return val
    return None

def fetch_youtube_details(video_id):
    """유튜브 비디오의 설명란과 실제 업로드/게시 날짜를 동시에 추출"""
    url = f"https://www.youtube.com/watch?v={video_id}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko,en"
    })
    description = ""
    upload_date = ""
    try:
        with urllib.request.urlopen(req, timeout=7) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        
        # 1. 설명란 추출
        m = re.search(r'"shortDescription":\s*"((?:[^"\\]|\\.)*)"', html)
        if m:
            description = json.loads(f'"{m.group(1)}"')
            
        # 2. 실제 자막 영상 업로드 날짜 추출 (itemprop="datePublished" / publishDate / uploadDate)
        m_date = re.search(r'itemprop="datePublished"\s+content="([^"]+)"', html) or \
                 re.search(r'"publishDate":\s*"([^"]+)"', html) or \
                 re.search(r'itemprop="uploadDate"\s+content="([^"]+)"', html) or \
                 re.search(r'"uploadDate":\s*"([^"]+)"', html)
        if m_date:
            raw_d = m_date.group(1)[:10]
            parts = re.split(r'[\.\-\/]', raw_d)
            if len(parts) >= 3:
                upload_date = f"{int(parts[0]):04d}/{int(parts[1]):02d}/{int(parts[2]):02d}"
    except Exception:
        pass
    return description, upload_date

def fetch_youtube_description(video_id):
    desc, _ = fetch_youtube_details(video_id)
    return desc

def get_single_youtube_info(video_id):
    title = ""
    author = ""
    author_url = ""
    avatar = None
    description = ""
    source_url = None
    creator = ""
    original_title = ""
    upload_date = ""

    try:
        url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            title = data.get("title", "")
            author = data.get("author_name", "")
            author_url = data.get("author_url", "")
    except Exception:
        pass

    # [자막] 접두사 제거
    if title:
        title = re.sub(r'^\[(?:자막|한글자막|번역)\]\s*', '', title, flags=re.I).strip()

    description, upload_date = fetch_youtube_details(video_id)
    if description:
        source_url = extract_source_url_from_description(description, current_yt_id=video_id)
        creator = extract_creator_from_description(description) or ""
        original_title = extract_original_title_from_description(description) or ""

    # 설명란에 제작자가 없고 니코동 sm 원작 링크가 있는 경우 니코동 API에서 유저 닉네임 자동 조회
    if not creator and source_url and re.search(r'(?:sm|nm|so)\d+', source_url, re.I):
        try:
            nico_p = get_nico_profile(source_url)
            if nico_p.get("success") and nico_p.get("nickname"):
                creator = nico_p["nickname"]
        except Exception:
            pass

    if author_url:
        avatar = get_channel_avatar_from_url(author_url)
    if not avatar:
        avatar = fetch_avatar_for_video(video_id)

    return {
        "success": bool(title or avatar),
        "id": video_id,
        "title": title,
        "author": author,
        "author_url": author_url,
        "upload_date": upload_date,
        "thumbnail": get_best_youtube_thumbnail(video_id),
        "channel_avatar": avatar,
        "description": description,
        "source_url": source_url,
        "creator": creator,
        "original_title": original_title
    }

def extract_playlist_videos(playlist_url):
    cmd = ["yt-dlp", "--flat-playlist", "--dump-json", "--no-warnings", playlist_url]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        items = []
        for line in res.stdout.strip().split("\n"):
            if not line.strip():
                continue
            try:
                d = json.loads(line)
                vid = d.get("id")
                raw_title = d.get("title")
                if not vid or raw_title in ("[Deleted video]", "[Private video]", None):
                    continue
                # [자막] 접두사 제거
                clean_title = re.sub(r'^\[(?:자막|한글자막|번역)\]\s*', '', raw_title, flags=re.I).strip()
                items.append({
                    "id": vid,
                    "title": clean_title,
                    "uploader": d.get("uploader") or d.get("channel") or "",
                    "thumbnail": f"https://i.ytimg.com/vi/{vid}/maxresdefault.jpg",
                    "url": f"https://www.youtube.com/watch?v={vid}",
                    "description": "",
                    "source_url": "",
                    "creator": "",
                    "originalTitle": clean_title
                })
            except Exception:
                continue

        # 설명란 및 실제 업로드 날짜 병렬 다운로드 & 원작/제작자 자동 추출
        if items:
            with ThreadPoolExecutor(max_workers=10) as executor:
                future_to_item = {executor.submit(fetch_youtube_details, it["id"]): it for it in items}
                for fut in as_completed(future_to_item):
                    it = future_to_item[fut]
                    try:
                        desc, upload_date = fut.result()
                        if upload_date:
                            it["upload_date"] = upload_date
                        if desc:
                            it["description"] = desc
                            src = extract_source_url_from_description(desc, current_yt_id=it["id"])
                            if src:
                                it["source_url"] = src
                            cr = extract_creator_from_description(desc)
                            if cr:
                                it["creator"] = cr
                            ot = extract_original_title_from_description(desc)
                            if ot:
                                it["originalTitle"] = ot
                    except Exception:
                        pass

            # 설명란에서 제작자를 못 찾았지만 니코동 원본 링크가 있는 항목은 니코동에서 제작자 닉네임 조회
            nico_lookups = [it for it in items if not it.get("creator") and it.get("source_url") and re.search(r'(?:sm|nm|so)\d+', it["source_url"], re.I)]
            if nico_lookups:
                with ThreadPoolExecutor(max_workers=5) as executor:
                    future_to_nico = {executor.submit(get_nico_profile, it["source_url"]): it for it in nico_lookups}
                    for fut in as_completed(future_to_nico):
                        it = future_to_nico[fut]
                        try:
                            np = fut.result()
                            if np.get("success") and np.get("nickname"):
                                it["creator"] = np["nickname"]
                        except Exception:
                            pass

        return {"success": True, "count": len(items), "videos": items}
    except Exception as e:
        return {"success": False, "error": str(e), "videos": []}

def get_nico_profile(query):
    query = str(query).strip()
    user_id = None

    # 1. sm 영상 번호 또는 니코동 영상 링크
    sm_match = re.search(r'(?:watch\/|nico\.ms\/)?(sm\d+)', query, re.IGNORECASE)
    if sm_match:
        sm_id = sm_match.group(1).lower()
        try:
            thumb_url = f"https://ext.nicovideo.jp/api/getthumbinfo/{sm_id}"
            req = urllib.request.Request(thumb_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=6) as resp:
                xml = resp.read().decode("utf-8")
                uid_m = re.search(r'<user_id>(\d+)</user_id>', xml)
                if uid_m:
                    user_id = uid_m.group(1)
        except Exception:
            pass

    # 2. 유저 ID 또는 유저 프로필 URL
    if not user_id:
        u_match = re.search(r'(?:nicovideo\.jp\/user\/|user\/)?(\d+)', query)
        if u_match:
            user_id = u_match.group(1)

    if not user_id:
        return {"success": False, "error": "올바른 니코동 유저 ID, URL 또는 영상(sm) 번호가 아닙니다."}

    user_page_url = f"https://www.nicovideo.jp/user/{user_id}"
    req2 = urllib.request.Request(user_page_url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ja,en"
    })
    try:
        with urllib.request.urlopen(req2, timeout=6) as resp2:
            html = resp2.read().decode("utf-8", errors="ignore")
            og = re.search(r'<meta property="og:image" content="([^"]+)"', html)
            avatar = og.group(1) if og else None

            name_m = re.search(r'<meta property="profile:username" content="([^"]+)"', html)
            nickname = name_m.group(1) if name_m else None
            if not nickname:
                t_m = re.search(r'<title>([^<]+)さんのユーザーページ', html)
                if t_m:
                    nickname = t_m.group(1).strip()

            res = {
                "success": True,
                "user_id": user_id,
                "nickname": nickname or f"User {user_id}",
                "avatar": avatar or f"https://img.nicoprofile.nimg.jp/usericon/{int(user_id)//10000}/{user_id}.jpg",
                "user_url": user_page_url
            }

            if res.get("nickname") and res.get("avatar") and os.path.exists(DATA_FILE):
                try:
                    with open(DATA_FILE, "r", encoding="utf-8") as f:
                        d = json.load(f)
                    if "profileMap" not in d:
                        d["profileMap"] = {}
                    d["profileMap"][res["nickname"]] = res["avatar"]
                    if "channelMap" not in d:
                        d["channelMap"] = {}
                    if res.get("user_url"):
                        d["channelMap"][res["nickname"]] = res["user_url"]
                    with open(DATA_FILE, "w", encoding="utf-8") as f:
                        json.dump(d, f, ensure_ascii=False, indent=2)
                except Exception:
                    pass
            return res
    except Exception:
        fallback_avatar = f"https://img.nicoprofile.nimg.jp/usericon/{int(user_id)//10000}/{user_id}.jpg"
        return {
            "success": True,
            "user_id": user_id,
            "nickname": f"User {user_id}",
            "avatar": fallback_avatar,
            "user_url": user_page_url
        }

def fetch_any_profile(query):
    query = str(query).strip()
    if not query:
        return {"success": False, "error": "주소 또는 ID를 입력하세요."}

    # 1. 직접 이미지 URL인 경우
    if re.match(r'^https?://.*\.(?:jpg|jpeg|png|webp|gif)(?:\?.*)?$', query, re.IGNORECASE) or \
       'yt3.googleusercontent.com' in query or 'yt3.ggpht.com' in query or \
       'blogpfthumb-phinf.pstatic.net' in query or 'img.nicoprofile.nimg.jp' in query:
        return {
            "success": True,
            "platform": "image",
            "nickname": "",
            "avatar": query,
            "url": query
        }

    # 2. 네이버 블로그 URL 또는 ID인 경우
    if "blog.naver.com" in query or "m.blog.naver.com" in query or "naver.me" in query:
        post_m = re.search(r'(?:blog\.naver\.com|m\.blog\.naver\.com)/([a-zA-Z0-9_\-]+)/(\d+)', query)
        if post_m:
            ninfo = get_naver_info(query)
            if ninfo.get("success") and (ninfo.get("author") or ninfo.get("channel_avatar")):
                return {
                    "success": True,
                    "platform": "naver",
                    "nickname": ninfo.get("author", post_m.group(1)),
                    "avatar": ninfo.get("channel_avatar", ""),
                    "url": f"https://blog.naver.com/{post_m.group(1)}"
                }

        blog_m = re.search(r'(?:blog\.naver\.com|m\.blog\.naver\.com)/([a-zA-Z0-9_\-]+)', query)
        blog_id = blog_m.group(1) if blog_m else query
        mobile_url = f"https://m.blog.naver.com/{blog_id}"
        req = urllib.request.Request(mobile_url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "ko,en"
        })
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
                img = re.search(r'<meta property="og:image" content="([^"]+)"', html)
                nick_m = re.search(r'class="text__yNQEd"[^>]*>([^<]+)<', html) or \
                         re.search(r'<meta property="naverblog:nickname" content="([^"]+)"', html) or \
                         re.search(r'<meta property="og:title" content="([^:"]+)', html)
                nickname = html_lib.unescape(nick_m.group(1)).strip() if nick_m else blog_id
                avatar = img.group(1) if img else ""
                if avatar or nickname:
                    return {
                        "success": True,
                        "platform": "naver",
                        "nickname": nickname,
                        "avatar": avatar,
                        "url": f"https://blog.naver.com/{blog_id}"
                    }
        except Exception as e:
            return {"success": False, "error": f"네이버 블로그 조회 실패: {str(e)}"}

    # 3. 유튜브 URL 또는 채널/핸들인 경우
    if "youtube.com" in query or "youtu.be" in query or query.startswith("@"):
        # 1) 영상 링크인 경우
        yt_id_m = re.search(r'(?:v=|youtu\.be/|embed/)([a-zA-Z0-9_\-]{11})', query)
        if yt_id_m and not query.startswith("@") and "/channel/" not in query and "/@" not in query:
            yt_id = yt_id_m.group(1)
            yinfo = get_single_youtube_info(yt_id)
            if yinfo.get("author") or yinfo.get("channel_avatar"):
                return {
                    "success": True,
                    "platform": "youtube",
                    "nickname": yinfo.get("author", ""),
                    "avatar": yinfo.get("channel_avatar", ""),
                    "url": yinfo.get("author_url", f"https://www.youtube.com/watch?v={yt_id}")
                }

        # 2) 채널/핸들 링크인 경우
        target_url = query
        if query.startswith("@"):
            target_url = f"https://www.youtube.com/{query}"
        elif not query.startswith("http"):
            target_url = f"https://www.youtube.com/{query}"

        req = urllib.request.Request(target_url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "ko,en"
        })
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
                img = re.search(r'<meta property="og:image" content="([^"]+)"', html)
                title = re.search(r'<meta property="og:title" content="([^"]+)"', html)
                nickname = html_lib.unescape(title.group(1)).strip() if title else ""
                avatar = img.group(1) if img else ""
                if avatar or nickname:
                    return {
                        "success": True,
                        "platform": "youtube",
                        "nickname": nickname,
                        "avatar": avatar,
                        "url": target_url
                    }
        except Exception as e:
            return {"success": False, "error": f"유튜브 프로필 조회 실패: {str(e)}"}

    # 4. 니코동 (URL, sm번호, 숫자 ID)
    nico_res = get_nico_profile(query)
    if nico_res.get("success"):
        return {
            "success": True,
            "platform": "niconico",
            "nickname": nico_res.get("nickname", ""),
            "avatar": nico_res.get("avatar", ""),
            "url": nico_res.get("user_url", f"https://www.nicovideo.jp/user/{nico_res.get('user_id', '')}")
        }

    return {"success": False, "error": f"지원하지 않는 주소이거나 프로필을 찾을 수 없습니다: {query}"}

def fetch_rmc_video_info(vid, outkey):
    api_url = f"https://apis.naver.com/rmcnmv/rmcnmv/vod/play/v2.0/{vid}?key={outkey}"
    req = urllib.request.Request(api_url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    res = {}
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            meta = data.get("meta", {})
            if meta.get("subject"):
                res["video_title"] = meta.get("subject")
            if meta.get("cover", {}).get("source"):
                res["thumbnail_url"] = meta.get("cover", {}).get("source")
    except Exception:
        pass
    return res

def get_naver_info(query):
    query = str(query).strip()
    if not query:
        return {"success": False, "error": "네이버 블로그 또는 동영상 URL이 비어 있습니다."}

    # 1. outKeyPlayer 또는 VID / outKey 직접 감지
    vid_m = re.search(r'vid=([a-zA-Z0-9_\-]+)', query)
    key_m = re.search(r'(?:outKey|inKey|key)=([a-zA-Z0-9_\-]+)', query)
    if vid_m and key_m:
        vid = vid_m.group(1)
        outkey = key_m.group(1)
        rmc = fetch_rmc_video_info(vid, outkey)
        return {
            "success": True,
            "platform": "naver",
            "vid": vid,
            "outkey": outkey,
            "embed_url": f"https://serviceapi.rmcnmv.naver.com/flash/outKeyPlayer.nhn?vid={vid}&outKey={outkey}&controlBarMovable=true&jsApi=true&autoPlay=false",
            "title": rmc.get("video_title", ""),
            "thumbnail_url": rmc.get("thumbnail_url", ""),
            "has_video": True,
            "original_url": query,
            "naver_url": query
        }

    # 2. 블로그 URL 파싱
    blog_id = None
    log_no = None

    pv_m = re.search(r'blog\.naver\.com/PostView\.naver\?.*blogId=([a-zA-Z0-9_\-]+).*logNo=(\d+)', query)
    if pv_m:
        blog_id, log_no = pv_m.group(1), pv_m.group(2)
    else:
        m_blog = re.search(r'(?:m\.)?blog\.naver\.com/([a-zA-Z0-9_\-]+)/(\d+)', query)
        if m_blog:
            blog_id, log_no = m_blog.group(1), m_blog.group(2)
        else:
            red_m = re.search(r'blog\.naver\.com/([a-zA-Z0-9_\-]+)\?.*logNo=(\d+)', query)
            if red_m:
                blog_id, log_no = red_m.group(1), red_m.group(2)

    if not blog_id or not log_no:
        # 네이버 TV
        tv_m = re.search(r'tv\.naver\.com/v/(\d+)', query)
        if tv_m:
            tv_id = tv_m.group(1)
            return {
                "success": True,
                "platform": "naver",
                "tv_id": tv_id,
                "embed_url": f"https://tv.naver.com/embed/{tv_id}",
                "original_url": f"https://tv.naver.com/v/{tv_id}",
                "naver_url": f"https://tv.naver.com/v/{tv_id}",
                "has_video": True
            }
        return {"success": False, "error": "유효한 네이버 블로그 또는 동영상 주소가 아닙니다."}

    postview_url = f"https://blog.naver.com/PostView.naver?blogId={blog_id}&logNo={log_no}"
    req = urllib.request.Request(postview_url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko,en",
        "Referer": "https://blog.naver.com/"
    })

    try:
        with urllib.request.urlopen(req, timeout=7) as resp:
            content = resp.read().decode("utf-8", errors="ignore")
    except Exception as e:
        return {"success": False, "error": f"네이버 블로그 포스트를 불러올 수 없습니다: {str(e)}"}

    info = {
        "success": True,
        "platform": "naver",
        "blog_id": blog_id,
        "log_no": log_no,
        "original_url": f"https://blog.naver.com/{blog_id}/{log_no}",
        "naver_url": f"https://blog.naver.com/{blog_id}/{log_no}",
        "title": "",
        "author": "",
        "channel_avatar": "",
        "upload_date": "",
        "thumbnail_url": "",
        "vid": "",
        "outkey": "",
        "embed_url": "",
        "has_video": False,
        "yt_id": ""
    }

    import html as html_lib

    # 1. 제목
    t_m = re.search(r'<meta\s+property=["\']og:title["\']\s+content=["\']([^"\']+)["\']', content)
    if t_m:
        title = html_lib.unescape(t_m.group(1)).strip()
        title = re.sub(r'\s*:\s*네이버\s*블로그$', '', title)
        title = re.sub(r'^\[자막\]\s*', '', title, flags=re.IGNORECASE).strip()
        info["title"] = title
    else:
        t_m2 = re.search(r'<title>([^<]+)</title>', content)
        if t_m2:
            title = html_lib.unescape(t_m2.group(1)).strip()
            title = re.sub(r'\s*:\s*네이버\s*블로그$', '', title)
            title = re.sub(r'^\[자막\]\s*', '', title, flags=re.IGNORECASE).strip()
            info["title"] = title

    # 2. 작성자 / 닉네임 (자막 제작자)
    author_m = re.search(r'<meta\s+property=["\']naverblog:nickname["\']\s+content=["\']([^"\']+)["\']', content)
    if author_m:
        info["author"] = html_lib.unescape(author_m.group(1)).strip()
    else:
        author_m2 = re.search(r'<span class="nick">([^<]+)</span>', content)
        if author_m2:
            info["author"] = html_lib.unescape(author_m2.group(1)).strip()
        else:
            info["author"] = blog_id

    # 3. 작성자 프로필 이미지
    prof_m = re.search(r'<meta\s+property=["\']naverblog:profile_image["\']\s+content=["\']([^"\']+)["\']', content)
    if prof_m:
        info["channel_avatar"] = html_lib.unescape(prof_m.group(1)).strip()

    # 4. 작성 날짜
    date_m = re.search(r'<meta\s+property=["\']naverblog:created_date["\']\s+content=["\']([^"\']+)["\']', content)
    if date_m:
        d_val = date_m.group(1).strip()
        d_match = re.search(r'(\d{4})[\.\-\/]\s*(\d{1,2})[\.\-\/]\s*(\d{1,2})', d_val)
        if d_match:
            info["upload_date"] = f"{d_match.group(1)}/{int(d_match.group(2)):02d}/{int(d_match.group(3)):02d}"
    if not info["upload_date"]:
        date_m2 = re.search(r'class="se_publishDate[^"]*">([^<]+)<', content) or re.search(r'class="[^"]*date[^"]*">([^<]+)<', content)
        if date_m2:
            d_match = re.search(r'(\d{4})[\.\-\/]\s*(\d{1,2})[\.\-\/]\s*(\d{1,2})', date_m2.group(1))
            if d_match:
                info["upload_date"] = f"{d_match.group(1)}/{int(d_match.group(2)):02d}/{int(d_match.group(3)):02d}"
    if not info["upload_date"]:
        m_p = re.search(r'<p[^>]*class="[^"]*date[^"]*"[^>]*>(.*?)</p>', content, re.DOTALL | re.IGNORECASE)
        if m_p:
            d_match = re.search(r'(\d{4})[\.\-\/]\s*(\d{1,2})[\.\-\/]\s*(\d{1,2})', m_p.group(1))
            if d_match:
                info["upload_date"] = f"{d_match.group(1)}/{int(d_match.group(2)):02d}/{int(d_match.group(3)):02d}"

    # 5. 블로그 기본 썸네일
    img_m = re.search(r'<meta\s+property=["\']og:image["\']\s+content=["\']([^"\']+)["\']', content)
    if img_m:
        info["thumbnail_url"] = html_lib.unescape(img_m.group(1)).strip()
        if not info["upload_date"]:
            m_thumb = re.search(r'/(\d{4})/(\d{2})/(\d{2})/', info["thumbnail_url"])
            if m_thumb:
                info["upload_date"] = f"{m_thumb.group(1)}/{m_thumb.group(2)}/{m_thumb.group(3)}"

    # 6. 본문 내 동영상 모듈 감지 (SmartEditor ONE v2_video)
    vid = None
    outkey = None

    for mod_m in re.finditer(r'data-module=["\']([^"\']+)["\']', content):
        raw_mod = html_lib.unescape(mod_m.group(1))
        if '"v2_video"' in raw_mod or '"vid"' in raw_mod:
            try:
                mod_data = json.loads(raw_mod)
                v_obj = mod_data.get("data", mod_data)
                if "vid" in v_obj:
                    vid = v_obj.get("vid")
                    outkey = v_obj.get("inkey") or v_obj.get("outKey")
                    if vid and outkey:
                        break
            except Exception:
                pass

    if not vid or not outkey:
        v_match = re.search(r'"vid"\s*:\s*"([a-zA-Z0-9_\-]+)"', content)
        k_match = re.search(r'"(?:inkey|outKey)"\s*:\s*"([a-zA-Z0-9_\-]+)"', content)
        if v_match and k_match:
            vid = v_match.group(1)
            outkey = k_match.group(1)

    # SmartEditor 2.0 <pzp-pc-layout ...> 감지
    if not vid or not outkey:
        pz = re.search(r'<pzp-pc-layout[^>]+vid=["\']([a-zA-Z0-9_\-]+)["\'][^>]+key=["\']([a-zA-Z0-9_\-]+)["\']', content)
        if not pz:
            pz = re.search(r'<pzp-pc-layout[^>]+key=["\']([a-zA-Z0-9_\-]+)["\'][^>]+vid=["\']([a-zA-Z0-9_\-]+)["\']', content)
            if pz:
                vid, outkey = pz.group(2), pz.group(1)
        else:
            vid, outkey = pz.group(1), pz.group(2)

    if not vid or not outkey:
        p_match = re.search(r'outKeyPlayer\.nhn\?.*vid=([a-zA-Z0-9_\-]+).*outKey=([a-zA-Z0-9_\-]+)', content)
        if p_match:
            vid = p_match.group(1)
            outkey = p_match.group(2)

    if vid and outkey:
        info["has_video"] = True
        info["vid"] = vid
        info["outkey"] = outkey
        info["embed_url"] = f"https://serviceapi.rmcnmv.naver.com/flash/outKeyPlayer.nhn?vid={vid}&outKey={outkey}&controlBarMovable=true&jsApi=true&autoPlay=false"
        rmc = fetch_rmc_video_info(vid, outkey)
        if rmc.get("thumbnail_url"):
            info["thumbnail_url"] = rmc["thumbnail_url"]
        if rmc.get("video_title") and not info["title"]:
            info["title"] = re.sub(r'^\[자막\]\s*', '', rmc["video_title"], flags=re.IGNORECASE).strip()
    else:
        # 혹시 본문에 유튜브 영상이 임베드되어 있는지 확인
        yt_m = re.search(r'(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})', content)
        if yt_m:
            info["has_video"] = True
            info["platform"] = "youtube"
            info["yt_id"] = yt_m.group(1)
            if not info["thumbnail_url"]:
                info["thumbnail_url"] = get_best_youtube_thumbnail(info['yt_id'])

    # 작성자 프로필을 profileMap에 자동 캐싱
    if info.get("author") and info.get("channel_avatar") and os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                d = json.load(f)
            if "profileMap" not in d:
                d["profileMap"] = {}
            if info["author"] not in d["profileMap"] or not d["profileMap"][info["author"]]:
                d["profileMap"][info["author"]] = info["channel_avatar"]
                with open(DATA_FILE, "w", encoding="utf-8") as f:
                    json.dump(d, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    return info

def get_naver_stream(vid=None, key=None, url=None):
    if (not vid or not key) and url:
        info = get_naver_info(url)
        if info.get("success") and info.get("vid") and info.get("outkey"):
            vid = info["vid"]
            key = info["outkey"]

    if not vid or not key:
        return {"success": False, "error": "동영상 VID 또는 KEY가 유효하지 않습니다."}

    api_url = f"https://apis.naver.com/rmcnmv/rmcnmv/vod/play/v2.0/{vid}?key={key}"
    req = urllib.request.Request(api_url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            videos = data.get("videos", {}).get("list", [])
            if videos:
                return {
                    "success": True,
                    "stream_url": videos[0].get("source"),
                    "vid": vid,
                    "outkey": key,
                    "encoding": videos[0].get("encodingOption", {}).get("name", "")
                }
    except Exception:
        pass

    if url:
        info = get_naver_info(url)
        if info.get("success") and info.get("vid") and info.get("outkey"):
            new_vid = info["vid"]
            new_key = info["outkey"]
            api_url2 = f"https://apis.naver.com/rmcnmv/rmcnmv/vod/play/v2.0/{new_vid}?key={new_key}"
            req2 = urllib.request.Request(api_url2, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            })
            try:
                with urllib.request.urlopen(req2, timeout=6) as resp2:
                    data2 = json.loads(resp2.read().decode("utf-8"))
                    videos2 = data2.get("videos", {}).get("list", [])
                    if videos2:
                        return {
                            "success": True,
                            "stream_url": videos2[0].get("source"),
                            "vid": new_vid,
                            "outkey": new_key,
                            "encoding": videos2[0].get("encodingOption", {}).get("name", "")
                        }
            except Exception as e:
                return {"success": False, "error": f"네이버 스트림 조회 실패: {str(e)}"}

    return {"success": False, "error": "재생 가능한 동영상 스트림을 찾을 수 없습니다."}

def sync_profiles_internal():
    if not os.path.exists(DATA_FILE):
        return {"success": False, "error": "data.json not found"}
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    videos = data.get("videos", [])
    profile_map = data.get("profileMap", {})
    tasks = {}

    for v in videos:
        sub = (v.get("subtitler") or "").strip()
        yt = v.get("yt_id") or ""
        if not yt and v.get("original_link"):
            m = re.search(r'(?:v=|\/)([a-zA-Z0-9_-]{11})', v.get("original_link"))
            if m:
                yt = m.group(1)
        if not yt:
            continue
        # 유튜브 업로더 프로필은 자막 제작자에게만 매핑 (원작자에게 덮어씌우지 않음)
        if sub and sub != "Unknown" and (sub not in profile_map or not profile_map[sub]):
            tasks[sub] = yt

    updated = 0
    with ThreadPoolExecutor(max_workers=8) as executor:
        fmap = {executor.submit(fetch_avatar_for_video, vid): name for name, vid in tasks.items()}
        for fut in as_completed(fmap):
            name = fmap[fut]
            try:
                av = fut.result()
                if av:
                    profile_map[name] = av
                    updated += 1
            except Exception:
                pass

    if updated > 0:
        data["profileMap"] = profile_map
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    return {"success": True, "updated": updated, "totalProfiles": len(profile_map)}

def get_video_link_keys(v):
    keys = set()
    if not isinstance(v, dict):
        return keys

    link = v.get("original_link") or v.get("naver_url") or v.get("url") or ""
    yt_id = v.get("yt_id") or ""
    if not yt_id and link:
        m = re.search(r'(?:youtu\.be\/|youtube\.com\/(?:v\/|u\/\w\/|embed\/|watch\?v=|shorts\/|watch\?.+&v=))([^#\&\?\s]{11})', link, re.I)
        if m:
            yt_id = m.group(1)
    if yt_id:
        keys.add(f"yt:{yt_id}")
        return keys

    vid = v.get("naver_vid")
    if vid:
        keys.add(f"naver_vid:{vid}")

    for l in [v.get("naver_url"), v.get("original_link"), v.get("url")]:
        if not l:
            continue
        m_blog = re.search(r'(?:blog\.naver\.com|m\.blog\.naver\.com)\/([a-zA-Z0-9_\-]+)\/(\d+)', l, re.I)
        if not m_blog:
            m_blog = re.search(r'blog\.naver\.com\/PostView\.naver\?.*blogId=([a-zA-Z0-9_\-]+).*logNo=(\d+)', l, re.I)
        if not m_blog:
            m_blog = re.search(r'blog\.naver\.com\/([a-zA-Z0-9_\-]+)\?.*logNo=(\d+)', l, re.I)
        if m_blog and m_blog.group(1).lower() != 'postview':
            keys.add(f"naver_blog:{m_blog.group(1).lower()}:{m_blog.group(2)}")

        tv_m = re.search(r'tv\.naver\.com\/v\/(\d+)', l, re.I)
        if tv_m:
            keys.add(f"naver_tv:{tv_m.group(1)}")

    if not keys and link:
        clean = re.sub(r'^https?:\/\/', '', link, flags=re.I).strip().lower().rstrip('/')
        if clean:
            keys.add(f"url:{clean}")

    return keys

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        if path in ("/api/status", "/api/status/"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            status_data = {
                "status": "ok",
                "editable": True,
                "dataFile": os.path.abspath(DATA_FILE),
                "hasBackup": os.path.exists(BACKUP_FILE)
            }
            self.wfile.write(json.dumps(status_data, ensure_ascii=False).encode("utf-8"))
            return

        if path in ("/api/youtube_info", "/api/youtube_info/"):
            video_id = params.get("id", [""])[0] or params.get("v", [""])[0]
            if not video_id:
                url_param = params.get("url", [""])[0]
                m = re.search(r'(?:youtu\.be\/|youtube\.com\/(?:v\/|u\/\w\/|embed\/|watch\?v=|shorts\/|watch\?.+&v=))([^#\&\?\s]{11})', url_param)
                if m:
                    video_id = m.group(1)

            if not video_id:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": "영상 ID가 없습니다."}, ensure_ascii=False).encode("utf-8"))
                return

            info = get_single_youtube_info(video_id)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(info, ensure_ascii=False).encode("utf-8"))
            return

        if path in ("/api/extract_playlist", "/api/extract_playlist/"):
            playlist_url = params.get("url", [""])[0]
            playlist_id = params.get("list", [""])[0]
            if not playlist_url and playlist_id:
                playlist_url = f"https://www.youtube.com/playlist?list={playlist_id}"

            if not playlist_url:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": "재생목록 URL이 없습니다."}, ensure_ascii=False).encode("utf-8"))
                return

            plist_data = extract_playlist_videos(playlist_url)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(plist_data, ensure_ascii=False).encode("utf-8"))
            return

        if path in ("/api/sync_profiles", "/api/sync_profiles/"):
            res = sync_profiles_internal()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode("utf-8"))
            return

        if path in ("/api/fetch_profile", "/api/fetch_profile/"):
            query = params.get("query", [""])[0] or params.get("url", [""])[0] or params.get("id", [""])[0]
            if not query:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": "주소 또는 ID가 필요합니다."}, ensure_ascii=False).encode("utf-8"))
                return

            profile_data = fetch_any_profile(query)
            target_name = params.get("name", [""])[0] or profile_data.get("nickname", "")
            if profile_data.get("success") and profile_data.get("avatar") and target_name and os.path.exists(DATA_FILE):
                try:
                    with open(DATA_FILE, "r", encoding="utf-8") as f:
                        d = json.load(f)
                    if "profileMap" not in d:
                        d["profileMap"] = {}
                    d["profileMap"][target_name] = profile_data["avatar"]
                    with open(DATA_FILE, "w", encoding="utf-8") as f:
                        json.dump(d, f, ensure_ascii=False, indent=2)
                except Exception:
                    pass

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(profile_data, ensure_ascii=False).encode("utf-8"))
            return

        if path in ("/api/nico_info", "/api/nico_info/"):
            query = params.get("query", [""])[0] or params.get("url", [""])[0] or params.get("id", [""])[0]
            if not query:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": "니코동 유저 ID, URL 또는 영상 번호가 필요합니다."}, ensure_ascii=False).encode("utf-8"))
                return

            nico_data = get_nico_profile(query)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(nico_data, ensure_ascii=False).encode("utf-8"))
            return

        if path in ("/api/naver_info", "/api/naver_info/"):
            url_param = params.get("url", [""])[0] or params.get("query", [""])[0] or params.get("id", [""])[0]
            if not url_param:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": "네이버 블로그 또는 동영상 URL이 필요합니다."}, ensure_ascii=False).encode("utf-8"))
                return

            naver_data = get_naver_info(url_param)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(naver_data, ensure_ascii=False).encode("utf-8"))
            return

        if path in ("/api/naver_stream", "/api/naver_stream/"):
            vid = params.get("vid", [""])[0]
            key = params.get("key", [""])[0] or params.get("outkey", [""])[0]
            url = params.get("url", [""])[0]
            stream_data = get_naver_stream(vid=vid, key=key, url=url)
            status_code = 200 if stream_data.get("success") else 400
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(stream_data, ensure_ascii=False).encode("utf-8"))
            return

        super().do_GET()

    def do_POST(self):
        if self.path in ("/api/save", "/api/save/"):
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                post_data = self.rfile.read(content_length)
                json_data = json.loads(post_data.decode("utf-8"))

                if os.path.exists(DATA_FILE):
                    shutil.copy2(DATA_FILE, BACKUP_FILE)
                    try:
                        with open(DATA_FILE, "r", encoding="utf-8") as f_old:
                            old_data = json.load(f_old)
                        for map_key in ("channelMap", "profileMap", "creatorMap", "config"):
                            old_dict = old_data.get(map_key, {})
                            if isinstance(old_dict, dict):
                                if map_key not in json_data or not isinstance(json_data[map_key], dict):
                                    json_data[map_key] = {}
                                for k, v in old_dict.items():
                                    if k not in json_data[map_key] or not json_data[map_key][k]:
                                        json_data[map_key][k] = v
                        if "videos" not in json_data or not isinstance(json_data["videos"], list):
                            json_data["videos"] = old_data.get("videos", [])
                    except Exception as err:
                        print("[WARN] Error merging old data:", err)

                # 중복 영상 자동 필터링 (동일 링크 기준)
                if "videos" in json_data and isinstance(json_data["videos"], list):
                    unique_videos = []
                    seen_keys = set()
                    dup_count = 0
                    for v in json_data["videos"]:
                        v_keys = get_video_link_keys(v)
                        if v_keys and any(k in seen_keys for k in v_keys):
                            dup_count += 1
                            continue
                        for k in v_keys:
                            seen_keys.add(k)
                        unique_videos.append(v)
                    json_data["videos"] = unique_videos
                    if dup_count > 0:
                        print(f"[*] 동일 링크 중복 영상 {dup_count}개가 자동으로 필터링되었습니다.")

                    # 자막 업로드 날짜 기준 최신순(내림차순) 정렬 배치 보장
                    def get_sort_key(v):
                        d = str(v.get("upload_date") or "").strip()
                        m = re.search(r'(\d{4})[\.\-\/]\s*(\d{1,2})[\.\-\/]\s*(\d{1,2})', d)
                        return f"{int(m.group(1)):04d}/{int(m.group(2)):02d}/{int(m.group(3)):02d}" if m else "0000/00/00"
                    unique_videos.sort(key=get_sort_key, reverse=True)
                    json_data["videos"] = unique_videos

                with open(DATA_FILE, "w", encoding="utf-8") as f:
                    json.dump(json_data, f, ensure_ascii=False, indent=2)

                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                response = {
                    "success": True,
                    "message": "data.json에 저장되었습니다.",
                    "backup": "data.backup.json 생성됨"
                }
                self.wfile.write(json.dumps(response, ensure_ascii=False).encode("utf-8"))
                print(f"[OK] data.json 저장 완료 ({len(json_data.get('videos', []))}개 영상)")
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False).encode("utf-8"))
            return

        if self.path in ("/api/sync_profiles", "/api/sync_profiles/"):
            res = sync_profiles_internal()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

def open_browser(port):
    url = f"http://localhost:{port}/?mode=edit"
    print(f"[*] 브라우저를 엽니다: {url}")
    webbrowser.open(url)

def run_server():
    socketserver.TCPServer.allow_reuse_address = True
    port = PORT
    server = None
    for p in range(PORT, PORT + 20):
        try:
            server = socketserver.TCPServer(("", p), CustomHandler)
            port = p
            break
        except OSError:
            continue

    if not server:
        print("[!] 포트를 열 수 없습니다. 이미 다른 서버가 실행 중인지 확인하세요.")
        sys.exit(1)

    print("=" * 60)
    print("  해외 자막 음매드 모음 - 편집 서버가 시작되었습니다!")
    print(f"  - 로컬 주소: http://localhost:{port}/?mode=edit")
    print(f"  - 데이터 파일: {DATA_FILE}")
    print("  - 브라우저에서 영상 수정/추가/삭제 후 바로 덮어쓸 수 있습니다.")
    print("  - 서버를 종료하려면 이 창에서 Ctrl+C를 누르세요.")
    print("=" * 60)

    threading.Timer(0.6, open_browser, args=(port,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] 서버를 종료합니다.")
        server.server_close()

if __name__ == "__main__":
    run_server()
