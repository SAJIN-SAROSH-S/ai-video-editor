import aiohttp
import os
import re
from pathlib import Path
from typing import Optional, Tuple


def get_pexels_api_key() -> str:
    return os.getenv("PEXELS_API_KEY", "").strip()


def get_pixabay_api_key() -> str:
    return os.getenv("PIXABAY_API_KEY", "").strip()


async def search_pexels(query: str, media_type: str = "video", session: Optional[aiohttp.ClientSession] = None) -> Optional[str]:
    """Returns direct URL to stock media or None. Skips immediately if no API key is configured."""
    api_key = get_pexels_api_key()
    if not api_key:
        return None

    headers = {"Authorization": api_key}
    url = f"https://api.pexels.com/v1/search?query={query}&per_page=1"
    if media_type == "video":
        url = f"https://api.pexels.com/videos/search?query={query}&per_page=1"

    own_session = False
    if session is None:
        session = aiohttp.ClientSession()
        own_session = True

    try:
        async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=4)) as resp:
            if resp.status != 200:
                return None
            data = await resp.json()
            results = data.get("videos" if media_type == "video" else "photos", [])
            if not results:
                return None

            if media_type == "video":
                # Get smallest HD file for fast download and clean rendering
                files = results[0].get("video_files", [])
                hd_files = [f for f in files if f.get("quality") in ["hd", "sd"]]
                if hd_files:
                    return min(hd_files, key=lambda x: x.get("width", 9999))["link"]
            else:
                return results[0].get("src", {}).get("large")
    except Exception:
        return None
    finally:
        if own_session:
            await session.close()
    return None


async def search_pixabay(query: str, media_type: str = "video", session: Optional[aiohttp.ClientSession] = None) -> Optional[str]:
    """Fallback to Pixabay. Skips immediately if no API key is configured."""
    api_key = get_pixabay_api_key()
    if not api_key:
        return None

    url = f"https://pixabay.com/api/videos/?key={api_key}&q={query}&per_page=3"
    if media_type == "photo":
        url = f"https://pixabay.com/api/?key={api_key}&q={query}&per_page=3"

    own_session = False
    if session is None:
        session = aiohttp.ClientSession()
        own_session = True

    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=4)) as resp:
            if resp.status != 200:
                return None
            data = await resp.json()
            hits = data.get("hits", [])
            if not hits:
                return None
            if media_type == "video":
                return hits[0].get("videos", {}).get("medium", {}).get("url") or hits[0].get("videos", {}).get("small", {}).get("url")
            return hits[0].get("largeImageURL")
    except Exception:
        return None
    finally:
        if own_session:
            await session.close()
    return None


async def fetch_media(
    query: str,
    project_dir: Path,
    scene_id: int = 1,
    media_type: str = "video",
    session: Optional[aiohttp.ClientSession] = None
) -> Tuple[Optional[str], bool, str]:
    """
    Returns (local_path, is_placeholder, media_type)
    Uses scene_id to avoid filename collisions and supports session reuse.
    """
    url = None
    downloaded_type = None

    if media_type == 'video':
        url = await search_pexels(query, 'video', session=session) or await search_pixabay(query, 'video', session=session)
        downloaded_type = 'video' if url else None

    if not url:
        url = await search_pexels(query, 'photo', session=session) or await search_pixabay(query, 'photo', session=session)
        downloaded_type = 'photo' if url else None

    if url:
        safe_query = re.sub(r'[^\w\-]', '_', query)[:25]
        extension = 'mp4' if downloaded_type == 'video' else 'jpg'
        local_path = project_dir / f"scene_{scene_id:03d}_{safe_query}.{extension}"

        own_session = False
        if session is None:
            session = aiohttp.ClientSession()
            own_session = True

        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status == 200:
                    with open(local_path, 'wb') as f:
                        f.write(await resp.read())
                    return str(local_path), False, downloaded_type
        except Exception:
            pass
        finally:
            if own_session:
                await session.close()

    return None, True, 'placeholder'