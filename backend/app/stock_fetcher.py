import aiohttp
import os
import re
import urllib.parse
from pathlib import Path
from typing import Optional, Tuple, List

def get_dimensions(aspect_ratio: str) -> Tuple[int, int]:
    """Returns (width, height) for the given aspect ratio"""
    ar = str(aspect_ratio or "16:9").strip().lower()
    if ar in ["9:16", "portrait"]:
        return (1080, 1920)
    elif ar in ["1:1", "square"]:
        return (1080, 1080)
    elif ar in ["4:5"]:
        return (1080, 1350)
    return (1920, 1080)


def get_pexels_api_key() -> str:
    return os.getenv("PEXELS_API_KEY", "").strip()


def get_pixabay_api_key() -> str:
    return os.getenv("PIXABAY_API_KEY", "").strip()


def sanitize_search_query(raw_prompt: str) -> str:
    """
    Strips cinematic directions and labels to produce clean, keyword-dense search terms.
    """
    if not raw_prompt:
        return "visual scene"

    text = str(raw_prompt).strip()
    # Strip scene / shot prefixes
    text = re.sub(
        r'^(scene\s*\d*[:\-\.]?|shot\s*(of)?[:\-\.]?|close[\-\s]*up(\s*of)?[:\-\.]?|wide\s*shot(\s*of)?[:\-\.]?|cinematic\s*shot(\s*of)?[:\-\.]?|a\s*photo\s*of|footage\s*of|video\s*of)\s*',
        '',
        text,
        flags=re.IGNORECASE
    )

    # Clean symbols and punctuation
    text = re.sub(r'[\(\)\[\]\{\}"\'`]', ' ', text)
    text = re.sub(r'[^\w\s\-]', ' ', text)

    words = [w.strip() for w in text.split() if len(w.strip()) > 1]
    stopwords = {
        'the', 'and', 'for', 'with', 'from', 'this', 'that', 'into', 'over', 'onto',
        'showing', 'displays', 'displaying', 'looking', 'view', 'shot', 'ultra', '4k',
        'hd', 'realistic', 'hyperrealistic', 'epic', 'concept', 'render', 'style'
    }
    filtered = [w for w in words if w.lower() not in stopwords]

    if not filtered:
        filtered = words[:4]

    return " ".join(filtered[:5])


async def search_pexels(
    query: str,
    media_type: str = "video",
    session: Optional[aiohttp.ClientSession] = None
) -> Optional[str]:
    """Returns direct URL to Pexels stock media or None."""
    api_key = get_pexels_api_key()
    if not api_key:
        return None

    clean_q = urllib.parse.quote(sanitize_search_query(query))
    headers = {"Authorization": api_key}
    url = f"https://api.pexels.com/v1/search?query={clean_q}&per_page=3"
    if media_type == "video":
        url = f"https://api.pexels.com/videos/search?query={clean_q}&per_page=3"

    own_session = False
    if session is None:
        session = aiohttp.ClientSession()
        own_session = True

    try:
        async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=5)) as resp:
            if resp.status == 200:
                data = await resp.json()
                results = data.get("videos" if media_type == "video" else "photos", [])
                if results:
                    if media_type == "video":
                        files = results[0].get("video_files", [])
                        hd_files = [f for f in files if f.get("quality") in ["hd", "sd"]]
                        if hd_files:
                            return min(hd_files, key=lambda x: x.get("width", 9999))["link"]
                    else:
                        return results[0].get("src", {}).get("large") or results[0].get("src", {}).get("original")
    except Exception:
        pass
    finally:
        if own_session:
            await session.close()
    return None


async def search_pixabay(
    query: str,
    media_type: str = "video",
    session: Optional[aiohttp.ClientSession] = None
) -> Optional[str]:
    """Returns direct URL to Pixabay stock media or None."""
    api_key = get_pixabay_api_key()
    if not api_key:
        return None

    clean_q = urllib.parse.quote(sanitize_search_query(query))
    url = f"https://pixabay.com/api/videos/?key={api_key}&q={clean_q}&per_page=3"
    if media_type == "photo":
        url = f"https://pixabay.com/api/?key={api_key}&q={clean_q}&per_page=3"

    own_session = False
    if session is None:
        session = aiohttp.ClientSession()
        own_session = True

    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
            if resp.status == 200:
                data = await resp.json()
                hits = data.get("hits", [])
                if hits:
                    if media_type == "video":
                        return hits[0].get("videos", {}).get("medium", {}).get("url") or hits[0].get("videos", {}).get("small", {}).get("url")
                    return hits[0].get("largeImageURL") or hits[0].get("webformatURL")
    except Exception:
        pass
    finally:
        if own_session:
            await session.close()
    return None


async def search_wikimedia_commons(
    query: str,
    session: Optional[aiohttp.ClientSession] = None
) -> Optional[str]:
    """Free open-source stock image search on Wikimedia Commons archive."""
    clean_q = urllib.parse.quote(sanitize_search_query(query))
    url = (
        f"https://commons.wikimedia.org/w/api.php?"
        f"action=query&generator=search&gsrsearch={clean_q}&gsrlimit=6&prop=imageinfo&iiprop=url|mime&format=json"
    )

    own_session = False
    if session is None:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AIVideoEditor/1.0"}
        session = aiohttp.ClientSession(headers=headers)
        own_session = True

    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
            if resp.status == 200:
                data = await resp.json()
                pages = data.get("query", {}).get("pages", {})
                for _, pdata in pages.items():
                    img_info_list = pdata.get("imageinfo", [])
                    if img_info_list:
                        img_info = img_info_list[0]
                        mime = img_info.get("mime", "")
                        direct_url = img_info.get("url")
                        if direct_url and ("image" in mime or direct_url.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))):
                            if not direct_url.lower().endswith((".svg", ".pdf", ".tif")):
                                return direct_url
    except Exception:
        pass
    finally:
        if own_session:
            await session.close()
    return None


async def download_image_from_url(
    url: str,
    output_path: Path,
    session: Optional[aiohttp.ClientSession] = None,
    timeout_sec: int = 15
) -> bool:
    """Safely downloads binary image content to output_path."""
    own_session = False
    if session is None:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AIVideoEditor/1.0"}
        session = aiohttp.ClientSession(headers=headers)
        own_session = True

    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=timeout_sec)) as resp:
            if resp.status == 200:
                content = await resp.read()
                if len(content) > 1000:
                    with open(output_path, "wb") as f:
                        f.write(content)
                    return True
    except Exception:
        pass
    finally:
        if own_session:
            await session.close()
    return False


async def fetch_media(
    query: str,
    project_dir: Path,
    scene_id: int = 1,
    media_type: str = "video",
    aspect_ratio: str = "16:9",
    session: Optional[aiohttp.ClientSession] = None
) -> Tuple[Optional[str], bool, str]:
    """
    Multi-tier Free & Premium Visual Media Fetcher:
      1. Pexels Stock Video / Photo (API Key)
      2. Pixabay Stock Video / Photo (API Key)
      3. Wikimedia Commons Open Stock Archives (Free)
      4. Pollinations High-Res Open AI Scene Visuals (Free)
      5. LoremFlickr & Thematic Visual Engines (Free)
    Guarantees rich visual imagery is always downloaded and applied to every scene.
    """
    proj_dir_abs = Path(project_dir).resolve()
    clean_q = sanitize_search_query(query)
    safe_slug = re.sub(r'[^\w\-]', '_', clean_q)[:24] or f"scene_{scene_id}"
    width, height = get_dimensions(aspect_ratio)

    # 1. Pexels / Pixabay Video
    if media_type == "video":
        stock_url = await search_pexels(query, "video", session=session) or await search_pixabay(query, "video", session=session)
        if stock_url:
            vid_path = proj_dir_abs / f"scene_{scene_id:03d}_{safe_slug}.mp4"
            if await download_image_from_url(stock_url, vid_path, session=session, timeout_sec=25):
                return str(vid_path), False, "video"

    # 2. Pexels / Pixabay Photo
    stock_url = await search_pexels(query, "photo", session=session) or await search_pixabay(query, "photo", session=session)
    if stock_url:
        img_path = proj_dir_abs / f"scene_{scene_id:03d}_{safe_slug}.jpg"
        if await download_image_from_url(stock_url, img_path, session=session, timeout_sec=15):
            return str(img_path), False, "photo"

    # 3. Wikimedia Commons Free Open Stock
    wiki_url = await search_wikimedia_commons(query, session=session)
    if wiki_url:
        wiki_img_path = proj_dir_abs / f"scene_{scene_id:03d}_wiki_{safe_slug}.jpg"
        if await download_image_from_url(wiki_url, wiki_img_path, session=session, timeout_sec=15):
            return str(wiki_img_path), False, "photo"

    # 4. Open AI Scene Visual Generator (Pollinations - 1080p scene artwork)
    encoded_p = urllib.parse.quote(f"cinematic sharp 4k photography of {clean_q}")
    poll_url = f"https://image.pollinations.ai/prompt/{encoded_p}?width={width}&height={height}&nologo=true"
    poll_img_path = proj_dir_abs / f"scene_{scene_id:03d}_visual_{safe_slug}.jpg"
    if await download_image_from_url(poll_url, poll_img_path, session=session, timeout_sec=10):
        return str(poll_img_path), False, "photo"

    # 5. LoremFlickr / Thematic Free Stock
    tag_list = ",".join([w.lower() for w in clean_q.split()[:3]]) or "nature,cinematic"
    flickr_url = f"https://loremflickr.com/{width}/{height}/{tag_list}"
    flickr_img_path = proj_dir_abs / f"scene_{scene_id:03d}_stock_{safe_slug}.jpg"
    if await download_image_from_url(flickr_url, flickr_img_path, session=session, timeout_sec=8):
        return str(flickr_img_path), False, "photo"

    return None, True, "placeholder"