import json
import urllib.request
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

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
            
            # Direct check for avatar in watch page
            direct_avatar = re.search(r'"avatar":\{"thumbnails":\[\{"url":"(https://yt3\.[^"]+)"', html)
            if direct_avatar:
                return direct_avatar.group(1)
            
            # Check owner profile URL
            m = re.search(r'"ownerProfileUrl":\s*"([^"]+)"', html)
            if m:
                ch_url = m.group(1).replace("http://", "https://")
                av = get_channel_avatar_from_url(ch_url)
                if av:
                    return av
            
            m2 = re.search(r'"channelId":\s*"([^"]+)"', html)
            if m2:
                ch_url = f"https://www.youtube.com/channel/{m2.group(1)}"
                av = get_channel_avatar_from_url(ch_url)
                if av:
                    return av
    except Exception:
        pass
    return None

def sync_all_profiles():
    with open('data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    videos = data.get('videos', [])
    profile_map = data.get('profileMap', {})
    
    # 1. Map subtitler -> representative video ID
    subtitler_vids = {}
    creator_vids = {}
    
    for v in videos:
        yt = v.get('yt_id') or ''
        if not yt and v.get('original_link'):
            m = re.search(r'(?:v=|\/)([a-zA-Z0-9_-]{11})', v.get('original_link'))
            if m:
                yt = m.group(1)
        if not yt:
            continue
        
        sub = (v.get('subtitler') or '').strip()
        if sub and sub != 'Unknown':
            subtitler_vids.setdefault(sub, []).append(yt)
            
        cr = (v.get('creator') or '').strip()
        if cr and cr != 'Unknown':
            creator_vids.setdefault(cr, []).append(yt)
    
    tasks = {}
    # Prioritize targets not already in profile_map (subtitlers only for YouTube)
    for sub, vids in subtitler_vids.items():
        if sub not in profile_map or not profile_map[sub]:
            tasks[sub] = vids[0]
            
    print(f"Total targets to resolve: {len(tasks)}")
    
    success_count = 0
    t0 = time.time()
    
    with ThreadPoolExecutor(max_workers=10) as executor:
        future_to_name = {executor.submit(fetch_avatar_for_video, vid): name for name, vid in tasks.items()}
        for future in as_completed(future_to_name):
            name = future_to_name[future]
            try:
                avatar = future.result()
                if avatar:
                    profile_map[name] = avatar
                    success_count += 1
                    sys.stdout.buffer.write(f"[OK] {name} -> {avatar[:50]}...\n".encode('utf-8'))
                else:
                    sys.stdout.buffer.write(f"[FAIL] {name}\n".encode('utf-8'))
            except Exception as e:
                sys.stdout.buffer.write(f"[ERROR] {name}: {e}\n".encode('utf-8'))
                
    data['profileMap'] = profile_map
    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        
    print(f"\nCompleted in {time.time()-t0:.2f}s. Successfully resolved {success_count}/{len(tasks)} profiles.")
    print(f"Total profiles in profileMap now: {len(profile_map)}")

if __name__ == '__main__':
    sync_all_profiles()
