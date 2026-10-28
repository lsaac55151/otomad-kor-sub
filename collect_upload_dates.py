#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
collect_upload_dates.py
--------------------------------------------------------------------------------
해외 자막 음매드 모음 (Subtitled Otomad Archive)
영상 자막 업로드 날짜 메타데이터 (유튜브 및 네이버 블로그) 전수 수집 및 최신순 정렬 스크립트
--------------------------------------------------------------------------------
"""

import os
import sys
import json
import re
import time
import shutil
import urllib.request
import urllib.parse
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "data.json")
BACKUP_FILE = os.path.join(BASE_DIR, "data.backup.before_dates.json")

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

def normalize_date(raw):
    """문자열에서 YYYY/MM/DD 형태의 정규화된 날짜 문자열 반환"""
    if not raw:
        return None
    raw = str(raw).strip()
    m = re.search(r'(\d{4})[\.\-\/]\s*(\d{1,2})[\.\-\/]\s*(\d{1,2})', raw)
    if m:
        year = int(m.group(1))
        month = int(m.group(2))
        day = int(m.group(3))
        if 2000 <= year <= 2030 and 1 <= month <= 12 and 1 <= day <= 31:
            return f"{year:04d}/{month:02d}/{day:02d}"
    return None

def fetch_youtube_date(yt_id):
    """유튜브 영상 웹페이지에서 실제 자막 영상 업로드/게시 날짜 추출"""
    if not yt_id:
        return None
    url = f"https://www.youtube.com/watch?v={yt_id}"
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept-Language": "ko,en"
    })
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
            
        # 1. itemprop="datePublished"
        m = re.search(r'itemprop="datePublished"\s+content="([^"]+)"', html)
        if m:
            d = normalize_date(m.group(1))
            if d:
                return d
                
        # 2. "publishDate": "2023-05-12T..."
        m = re.search(r'"publishDate":\s*"([^"]+)"', html)
        if m:
            d = normalize_date(m.group(1))
            if d:
                return d
                
        # 3. itemprop="uploadDate" / "uploadDate": ...
        m = re.search(r'itemprop="uploadDate"\s+content="([^"]+)"', html) or re.search(r'"uploadDate":\s*"([^"]+)"', html)
        if m:
            d = normalize_date(m.group(1))
            if d:
                return d
    except Exception:
        pass

    # 폴백: yt-dlp 로 업로드 날짜 조회
    try:
        cmd = ["yt-dlp", "--skip-download", "--print", "upload_date", f"https://www.youtube.com/watch?v={yt_id}"]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=12)
        out = res.stdout.strip()
        if re.match(r'^\d{8}$', out):
            return f"{out[:4]}/{out[4:6]}/{out[6:8]}"
    except Exception:
        pass

    return None

def fetch_naver_date(naver_url, thumb_url=""):
    """네이버 블로그 게시글에서 실제 자막 포스트 작성/업로드 날짜 추출"""
    url = naver_url or ""
    
    # 1. 썸네일 URL에 이미 날짜가 포함된 경우 (예: /2014/03/16/)
    thumb_date = None
    if thumb_url:
        m_thumb = re.search(r'/(\d{4})/(\d{2})/(\d{2})/', thumb_url)
        if m_thumb:
            thumb_date = f"{m_thumb.group(1)}/{m_thumb.group(2)}/{m_thumb.group(3)}"

    # 2. 블로그 URL 파싱 (blogId, logNo)
    blog_id, log_no = None, None
    m1 = re.search(r'blog\.naver\.com/(?:PostView\.naver\?.*blogId=)?([a-zA-Z0-9_\-]+)[/?&].*logNo=(\d+)', url)
    if m1:
        blog_id, log_no = m1.group(1), m1.group(2)
    else:
        m2 = re.search(r'blog\.naver\.com/([a-zA-Z0-9_\-]+)/(\d+)', url)
        if m2:
            blog_id, log_no = m2.group(1), m2.group(2)

    if not blog_id or not log_no:
        return thumb_date

    postview_url = f"https://blog.naver.com/PostView.naver?blogId={blog_id}&logNo={log_no}"
    req = urllib.request.Request(postview_url, headers={
        "User-Agent": USER_AGENT,
        "Referer": "https://blog.naver.com/"
    })
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            html = resp.read().decode("utf-8", errors="ignore")

        # 2-1. 메타태그: naverblog:created_date
        m = re.search(r'<meta\s+property=["\']naverblog:created_date["\']\s+content=["\']([^"\']+)["\']', html)
        if m:
            d = normalize_date(m.group(1))
            if d:
                return d

        # 2-2. 스마트에디터 ONE: se_publishDate
        m = re.search(r'class="se_publishDate[^"]*">([^<]+)<', html)
        if m:
            d = normalize_date(m.group(1))
            if d:
                return d

        # 2-3. 구에디터: p.date
        m = re.search(r'<p[^>]*class="[^"]*date[^"]*"[^>]*>(.*?)</p>', html, re.DOTALL | re.IGNORECASE)
        if m:
            d = normalize_date(m.group(1))
            if d:
                return d

        # 2-4. _postAddDate
        m = re.search(r'class="[^"]*_postAddDate[^"]*">([^<]+)<', html)
        if m:
            d = normalize_date(m.group(1))
            if d:
                return d
    except Exception:
        pass

    return thumb_date

def process_video_item(item):
    """단일 영상 항목의 날짜 수집 작업 (스레드 워커 함수)"""
    vid_id = item.get("id") or item.get("title", "unknown")
    platform = item.get("platform") or ""
    yt_id = item.get("yt_id") or ""
    orig_link = item.get("original_link") or ""
    naver_url = item.get("naver_url") or (orig_link if "blog.naver.com" in orig_link else "")
    thumb_url = item.get("thumbnail_url") or ""
    current_date = item.get("upload_date") or ""

    # YouTube ID 추출 보완
    if not yt_id and ("youtube.com" in orig_link or "youtu.be" in orig_link):
        m_yt = re.search(r'(?:youtu\.be\/|youtube\.com\/(?:v\/|u\/\w\/|embed\/|watch\?v=|shorts\/|watch\?.+&v=))([^#\&\?\s]{11})', orig_link)
        if m_yt:
            yt_id = m_yt.group(1)

    extracted_date = None

    if yt_id:
        extracted_date = fetch_youtube_date(yt_id)
    elif naver_url:
        extracted_date = fetch_naver_date(naver_url, thumb_url)

    # 날짜 정규화 검증
    normalized = normalize_date(extracted_date) if extracted_date else None
    
    # 추출 실패 시 기존 날짜 유지
    final_date = normalized if normalized else normalize_date(current_date)
    if not final_date:
        final_date = current_date or "0000/00/00"

    is_updated = (normalized is not None and normalized != current_date)
    return {
        "id": vid_id,
        "title": item.get("title", ""),
        "platform": platform or ("youtube" if yt_id else "naver"),
        "old_date": current_date,
        "new_date": final_date,
        "is_updated": is_updated
    }

def main():
    print("=" * 70)
    print(" [전수 수집] 해외 자막 음매드 영상 자막 업로드 날짜 수집 & 최신순 정렬")
    print("=" * 70)

    if not os.path.exists(DATA_FILE):
        print(f"[오류] {DATA_FILE} 파일을 찾을 수 없습니다.")
        sys.exit(1)

    # 1. 원본 파일 백업
    try:
        shutil.copy2(DATA_FILE, BACKUP_FILE)
        print(f"[백업] data.json -> {os.path.basename(BACKUP_FILE)} 저장 완료")
    except Exception as e:
        print(f"[경고] 백업 파일 생성 실패: {e}")

    # 2. data.json 로드
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    videos = data.get("videos", [])
    total = len(videos)
    print(f"[안내] 총 {total}개 영상 항목에 대한 자막 업로드 날짜 전수 수집을 시작합니다.")
    print("      (멀티스레드 병렬 요청: 최대 8개 워커)")

    # 3. 병렬 날짜 수집 실행
    results = {}
    completed = 0
    t_start = time.time()

    with ThreadPoolExecutor(max_workers=8) as executor:
        future_map = {executor.submit(process_video_item, v): v for v in videos}
        for future in as_completed(future_map):
            completed += 1
            res = future.result()
            results[res["id"]] = res
            
            percent = (completed / total) * 100
            diff_mark = " (변경)" if res["is_updated"] else ""
            status_text = f"[{completed}/{total}] {percent:5.1f}% | {res['platform']:7s} | {res['old_date']} -> {res['new_date']}{diff_mark}"
            
            # 10개마다 또는 변경 시 진행 상황 출력
            if completed % 10 == 0 or res["is_updated"] or completed == total:
                print(status_text)

    t_end = time.time()
    elapsed = t_end - t_start

    # 4. 수집된 날짜 data.json 객체에 반영
    updated_count = 0
    for v in videos:
        vid_id = v.get("id") or v.get("title", "unknown")
        if vid_id in results:
            res = results[vid_id]
            if res["is_updated"]:
                updated_count += 1
            v["upload_date"] = res["new_date"]

    print("-" * 70)
    print(f"[완료] 날짜 수집 종료 (소요 시간: {elapsed:.1f}초)")
    print(f"      - 전체: {total}개")
    print(f"      - 새로 갱신된 날짜: {updated_count}개")

    # 5. 정렬순 설정대로 배치 (자막 업로드 날짜 최신순: latest / 내림차순)
    # 날짜 유효성 기준: 최신 날짜가 맨 앞, 오래된 날짜가 뒤, 미확인(0000/00/00)은 맨 뒤
    print("-" * 70)
    print("[정렬] 정렬순 설정대로 배치: 자막 업로드 날짜 최신순(내림차순)으로 data.json 재정렬 중...")

    def sort_key(v):
        d = normalize_date(v.get("upload_date"))
        return d if d else "0000/00/00"

    # 안정 정렬 (Stable Sort): 같은 날짜는 기존 상대적 순서 보존
    videos.sort(key=sort_key, reverse=True)
    data["videos"] = videos

    # 6. data.json 파일에 저장
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # 7. 상위 10개 및 하위 5개 미리보기
    print("[확인] 정렬 후 상위 5개 (최신 자막 영상):")
    for i, v in enumerate(videos[:5]):
        print(f"  #{i+1:02d} [{v.get('upload_date')}] [{v.get('platform')}] {v.get('title')[:35]}")

    print("\n[확인] 정렬 후 하위 5개 (가장 오래된 자막 영상):")
    for i, v in enumerate(videos[-5:]):
        print(f"  #{total-4+i:02d} [{v.get('upload_date')}] [{v.get('platform')}] {v.get('title')[:35]}")

    print("=" * 70)
    print(f"[성공] data.json 에 전수 수집된 날짜와 최신순 배치가 완벽하게 저장되었습니다!")
    print("=" * 70)

if __name__ == "__main__":
    main()
