import aiohttp
import os
from pathlib import Path
from typing import Optional, Tuple

PEXELS_API_KEY = os.getenv("PEXELS_API_KEY", "")
PIXABAY_API_KEY = os.getenv("PIXABAY_API_KEY", "")


async def search_pexels(query: str, media_type: str = "video") -> Optional[str]:
    """Returns direct URL to stock media or None"""
    headers = {"Authorization": PEXELS_API_KEY}
    
    async with aiohttp.ClientSession() as session:
        url = f"https://api.pexels.com/v1/search?query={query}&per_page=1"
        if media_type == "video":
            url = f"https://api.pexels.com/videos/search?query={query}&per_page=1"
        
        try:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status != 200:
                    return None
                data = await resp.json()
                results = data.get("videos" if media_type == "video" else "photos", [])
                if not results:
                    return None
                
                if media_type == "video":
                    # Get smallest HD file
                    files = results[0].get("video_files", [])
                    hd_files = [f for f in files if f.get("quality") in ["hd", "sd"]]
                    if hd_files:
                        return min(hd_files, key=lambda x: x.get("width", 9999))["link"]
                else:
                    return results[0]["src"]["large"]
        except Exception:
            return None
    return None


async def search_pixabay(query: str, media_type: str = "video") -> Optional[str]:
    """Fallback to Pixabay"""
    async with aiohttp.ClientSession() as session:
        url = f"https://pixabay.com/api/videos/?key={PIXABAY_API_KEY}&q={query}&per_page=3"
        if media_type == "photo":
            url = f"https://pixabay.com/api/?key={PIXABAY_API_KEY}&q={query}&per_page=3"
        
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                data = await resp.json()
                hits = data.get("hits", [])
                if not hits:
                    return None
                if media_type == "video":
                    return hits[0].get("videos", {}).get("medium", {}).get("url")
                return hits[0].get("largeImageURL")
        except Exception:
            return None


async def fetch_media(query: str, project_dir: Path, media_type: str = "video") -> Tuple[str, bool]:
    """
    Returns (local_path, is_placeholder)
    """
    # Try Pexels first
    url = await search_pexels(query, media_type)
    
    # Fallback to Pixabay
    if not url:
        url = await search_pixabay(query, media_type)
    
    if url:
        # Download and cache
        local_path = project_dir / f"stock_{query.replace(' ', '_')[:30]}.{'mp4' if media_type == 'video' else 'jpg'}"
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as resp:
                with open(local_path, 'wb') as f:
                    f.write(await resp.read())
        return str(local_path), False
    
    # Generate white placeholder
    return None, True  # Will be handled by placeholder generator