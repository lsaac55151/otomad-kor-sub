import json
import urllib.request
import re
import sys
import os
import shutil
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "data.json")
BACKUP_FILE = os.path.join(BASE_DIR, "data.backup.before_source_extract.json")

def extract_source_url_from_description(desc, current_yt_id=""):
    if not desc:
        return None
    
    lines = [line.strip() for line in desc.splitlines() if line.strip()]
    
    source_keywords = [
        '원작', '원본', '본가', 'original', '本家', 'sm', '니코동', '니코', 
        'niconico', '출처', '원 주소', '원작자', '원 영상', 'source', '원제'
    ]
    exclude_keywords = ['원곡', '原曲', 'bgm', '사용된 곡', 'music', '노래', '오프닝', '엔딩', 'ost', '참가자']
    
    # 1. 키워드가 있는 라인 우선 확인
    for line in lines:
        line_lower = line.lower()
        # 원곡 라인 제외하되, 원작/원본이 함께 있으면 유지
        if any(ex in line_lower for ex in exclude_keywords) and not any(sk in line_lower for sk in ['원작', '원본', '본가', '本家', 'sm']):
            continue
            
        if any(kw in line_lower for kw in source_keywords):
            # 니코동 링크 또는 sm 번호
            sm_m = re.search(r'(?:nicovideo\.jp\/watch\/|nico\.ms\/)?\b(sm\d+|nm\d+|so\d+)\b', line, re.I)
            if sm_m:
                return f"https://www.nicovideo.jp/watch/{sm_m.group(1).lower()}"
                
            # 유튜브 링크
            yt_m = re.search(r'(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})', line)
            if yt_m and yt_m.group(1) != current_yt_id:
                return f"https://www.youtube.com/watch?v={yt_m.group(1)}"

    # 2. 본문 전체에서 니코동 URL 감지
    nico_url_m = re.search(r'https?:\/\/(?:www\.)?(?:nicovideo\.jp\/watch|nico\.ms)\/(sm\d+|nm\d+|so\d+)', desc, re.I)
    if nico_url_m:
        return f"https://www.nicovideo.jp/watch/{nico_url_m.group(1).lower()}"

    # 3. 본문 전체에서 sm/nm/so 번호 감지 (#sm... 또는 sm...)
    for line in lines:
        line_lower = line.lower()
        if any(ex in line_lower for ex in exclude_keywords) and not any(sk in line_lower for sk in ['원작', '원본', '본가', '本家']):
            continue
        sm_m = re.search(r'(?:#|\b)(sm\d{5,10}|nm\d{5,10}|so\d{5,10})\b', line, re.I)
        if sm_m:
            return f"https://www.nicovideo.jp/watch/{sm_m.group(1).lower()}"

    # 4. 유튜브 링크 (원곡/참가자 라인 제외, 본인 제외)
    for line in lines:
        line_lower = line.lower()
        if any(ex in line_lower for ex in exclude_keywords):
            continue
        yt_m = re.search(r'(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})', line)
        if yt_m and yt_m.group(1) != current_yt_id:
            return f"https://www.youtube.com/watch?v={yt_m.group(1)}"

    return None

def fetch_youtube_description(video_id):
    url = f"https://www.youtube.com/watch?v={video_id}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko,en"
    })
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        m = re.search(r'"shortDescription":\s*"((?:[^"\\]|\\.)*)"', html)
        if m:
            desc = json.loads(f'"{m.group(1)}"')
            return desc
    except Exception:
        pass
    return ""

def process_all_videos():
    if not os.path.exists(DATA_FILE):
        print(f"[ERROR] {DATA_FILE} not found!")
        return

    # 1. 안전 백업 생성
    shutil.copy2(DATA_FILE, BACKUP_FILE)
    print(f"[*] Backup created at {BACKUP_FILE}")

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    videos = data.get("videos", [])
    print(f"[*] Total videos: {len(videos)}")

    # 설명란 조회가 필요한 유튜브 영상 목록 추출
    need_fetch = []
    for idx, v in enumerate(videos):
        vid = v.get("yt_id")
        if not vid and v.get("original_link"):
            m = re.search(r'(?:v=|\/)([a-zA-Z0-9_-]{11})', v.get("original_link"))
            if m:
                vid = m.group(1)
        if vid:
            # 설명란이 없거나 비어있는 경우
            if not v.get("description"):
                need_fetch.append((idx, vid))

    print(f"[*] YouTube videos needing description fetch: {len(need_fetch)} / {len(videos)}")

    # 설명란 병렬 다운로드 (15개 워커)
    fetched_descs = {}
    if need_fetch:
        print("[*] Fetching YouTube descriptions in parallel...")
        t0 = time.time()
        with ThreadPoolExecutor(max_workers=15) as executor:
            future_to_item = {executor.submit(fetch_youtube_description, vid): (idx, vid) for idx, vid in need_fetch}
            completed = 0
            for fut in as_completed(future_to_item):
                idx, vid = future_to_item[fut]
                completed += 1
                try:
                    desc = fut.result()
                    if desc:
                        fetched_descs[idx] = desc
                except Exception:
                    pass
                if completed % 50 == 0 or completed == len(need_fetch):
                    print(f"    Progress: {completed} / {len(need_fetch)} ({len(fetched_descs)} descriptions found)")
        print(f"[*] Fetched {len(fetched_descs)} descriptions in {time.time() - t0:.2f}s")

    # 설명란 반영 및 원본 링크(source_url) 추출
    source_extracted_count = 0
    nico_count = 0
    youtube_count = 0
    other_count = 0

    for idx, v in enumerate(videos):
        # 1. description 채우기
        if idx in fetched_descs:
            v["description"] = fetched_descs[idx]
        
        desc = v.get("description", "")
        vid = v.get("yt_id", "")

        # 2. 이미 수동으로 지정된 source_url이 있다면 보존
        if v.get("source_url"):
            source_extracted_count += 1
            if "nicovideo" in v["source_url"] or "nico.ms" in v["source_url"]:
                nico_count += 1
            elif "youtube" in v["source_url"] or "youtu.be" in v["source_url"]:
                youtube_count += 1
            else:
                other_count += 1
            continue

        # 3. 원본 링크 추출
        source_url = extract_source_url_from_description(desc, current_yt_id=vid)
        if source_url:
            v["source_url"] = source_url
            source_extracted_count += 1
            if "nicovideo" in source_url or "nico.ms" in source_url:
                nico_count += 1
            elif "youtube" in source_url or "youtu.be" in source_url:
                youtube_count += 1
            else:
                other_count += 1

    print("\n" + "="*50)
    print(f"[*] 원본 링크 추출 결과 요약:")
    print(f"    - 총 비디오 수: {len(videos)}")
    print(f"    - 원본 MAD 링크 보유 비디오 수: {source_extracted_count}개 ({source_extracted_count/len(videos)*100:.1f}%)")
    print(f"        * 니코동 (NicoNico) 원본: {nico_count}개")
    print(f"        * 유튜브 (YouTube) 원본: {youtube_count}개")
    print(f"        * 기타 원본: {other_count}개")
    print("="*50 + "\n")

    # 결과 저장
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"[SUCCESS] data.json updated successfully with new source_url and descriptions!")

if __name__ == "__main__":
    process_all_videos()
