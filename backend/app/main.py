from dotenv import load_dotenv
load_dotenv()  # Load PEXELS_API_KEY / PIXABAY_API_KEY etc. from a .env file, if present

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import uuid
import asyncio
import aiohttp
import json
import re
import time
import shutil
import os
from typing import Optional, List, Dict

from .models import VideoRequest, ProjectState, Storyboard
from .stock_fetcher import fetch_media
from .placeholder import create_placeholder
from .video_builder import render_storyboard
from .caption_engine import generate_captions, burn_captions

app = FastAPI(title="AI Video Editor")

# CORS: configurable via ALLOWED_ORIGINS env var (comma-separated).
_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
_allow_origins = ["*"] if _origins_env.strip() == "*" else [o.strip() for o in _origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=_allow_origins != ["*"],  # credentials + wildcard origin is invalid together
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECTS_DIR = Path("projects")
PROJECTS_DIR.mkdir(exist_ok=True)

projects = {}
project_logs = {}  # Store logs for each project

AI_API_KEY = os.getenv('AI_API_KEY') or os.getenv('OPENAI_API_KEY') or ''
AI_API_URL = os.getenv('AI_API_URL', 'https://api.openai.com/v1/chat/completions')
AI_API_MODEL = os.getenv('AI_API_MODEL', 'gpt-4o')

# Cleanup settings
MAX_PROJECT_AGE_HOURS = int(os.getenv('MAX_PROJECT_AGE_HOURS', '24'))  # Keep projects for 24 hours by default
MAX_TOTAL_DISK_SIZE_MB = int(os.getenv('MAX_TOTAL_DISK_SIZE_MB', '2048'))  # 2GB max


def cleanup_old_projects():
    """Delete old project folders and media files to free up disk space."""
    import glob
    
    if not PROJECTS_DIR.exists():
        return
    
    current_time = time.time()
    max_age_seconds = MAX_PROJECT_AGE_HOURS * 3600
    total_freed_mb = 0
    deleted_projects = 0
    
    try:
        # Get all project directories
        project_dirs = [d for d in PROJECTS_DIR.iterdir() if d.is_dir()]
        
        for project_dir in sorted(project_dirs):
            # Check if project is older than MAX_PROJECT_AGE_HOURS
            dir_age = current_time - project_dir.stat().st_mtime
            
            if dir_age > max_age_seconds:
                try:
                    # Calculate folder size before deletion
                    folder_size = sum(f.stat().st_size for f in project_dir.rglob('*') if f.is_file())
                    folder_size_mb = folder_size / (1024 * 1024)
                    
                    # Delete the entire project directory
                    shutil.rmtree(project_dir, ignore_errors=True)
                    total_freed_mb += folder_size_mb
                    deleted_projects += 1
                except Exception as e:
                    print(f"[CLEANUP] Error deleting {project_dir}: {e}")
                    continue
        
        # Log cleanup results
        if deleted_projects > 0:
            print(f"[CLEANUP] Freed {total_freed_mb:.2f} MB by removing {deleted_projects} old project(s)")
        
        # Check total disk usage
        check_disk_usage()
        
    except Exception as e:
        print(f"[CLEANUP] Error during cleanup: {e}")


def check_disk_usage():
    """Check and warn if disk usage exceeds limit."""
    if not PROJECTS_DIR.exists():
        return
    
    try:
        total_size = sum(f.stat().st_size for f in PROJECTS_DIR.rglob('*') if f.is_file())
        total_size_mb = total_size / (1024 * 1024)
        
        if total_size_mb > MAX_TOTAL_DISK_SIZE_MB:
            print(f"[DISK WARNING] Total projects folder is {total_size_mb:.2f} MB (limit: {MAX_TOTAL_DISK_SIZE_MB} MB)")
            # Aggressive cleanup if over limit
            cleanup_excess_projects()
        else:
            print(f"[DISK OK] Projects folder using {total_size_mb:.2f} MB of {MAX_TOTAL_DISK_SIZE_MB} MB")
    except Exception as e:
        print(f"[DISK CHECK] Error: {e}")


def cleanup_excess_projects():
    """Delete oldest projects until disk usage is under limit."""
    if not PROJECTS_DIR.exists():
        return
    
    try:
        project_dirs = sorted(
            [d for d in PROJECTS_DIR.iterdir() if d.is_dir()],
            key=lambda x: x.stat().st_mtime
        )
        
        for project_dir in project_dirs:
            total_size = sum(f.stat().st_size for f in PROJECTS_DIR.rglob('*') if f.is_file())
            total_size_mb = total_size / (1024 * 1024)
            
            if total_size_mb <= MAX_TOTAL_DISK_SIZE_MB:
                break
            
            try:
                folder_size = sum(f.stat().st_size for f in project_dir.rglob('*') if f.is_file())
                folder_size_mb = folder_size / (1024 * 1024)
                
                shutil.rmtree(project_dir, ignore_errors=True)
                print(f"[CLEANUP] Removed {project_dir.name} to free {folder_size_mb:.2f} MB")
            except Exception as e:
                print(f"[CLEANUP] Error removing {project_dir}: {e}")
                continue
    except Exception as e:
        print(f"[CLEANUP] Error in excess cleanup: {e}")


@app.on_event("startup")
async def startup_cleanup():
    """Cleanup old projects when server starts."""
    print("[SERVER] Starting cleanup of old projects...")
    cleanup_old_projects()
    print("[SERVER] Startup cleanup completed!")


async def call_ai_model(prompt: str) -> str:
    if not AI_API_KEY:
        raise ValueError('AI API key is not configured. Set AI_API_KEY or OPENAI_API_KEY.')

    headers = {
        'Authorization': f'Bearer {AI_API_KEY}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'AI Video Editor/1.0'
    }

    payload = {
        'model': AI_API_MODEL,
        'messages': [
            {
                'role': 'system',
                'content': 'You are an expert video producer and motion graphics editor. Generate concise storyboard JSON for a short video. Include motion graphics, pacing, cuts, J-cuts, and L-cuts as appropriate.'
            },
            {
                'role': 'user',
                'content': prompt
            }
        ],
        'temperature': 0.2,
        'max_tokens': 2000
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(AI_API_URL, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=60)) as resp:
            body = await resp.text()
            if resp.status != 200:
                try:
                    error_data = json.loads(body)
                    error_detail = error_data.get('error') or error_data.get('message') or body
                except Exception:
                    error_detail = body
                raise ValueError(f'AI API request failed ({resp.status}): {error_detail}')

            data = json.loads(body)

    # OpenAI-compatible response parsing
    content = None
    if isinstance(data, dict):
        choices = data.get('choices') or []
        if choices and isinstance(choices, list):
            choice = choices[0]
            if isinstance(choice, dict):
                message = choice.get('message') or {}
                content = message.get('content') or choice.get('text')
        if not content:
            content = data.get('output_text') or data.get('text')

    if not content:
        raise ValueError('AI response did not contain any usable text output.')

    return str(content)


def extract_json_payload(text: str) -> dict:
    cleaned = text.strip()
    cleaned = re.sub(r'```(?:json)?\s*', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'```', '', cleaned)
    cleaned = re.sub(r'^\s*>+\s?', '', cleaned, flags=re.MULTILINE)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        decoder = json.JSONDecoder()
        for idx, char in enumerate(cleaned):
            if char not in '{[':
                continue
            try:
                value, _ = decoder.raw_decode(cleaned[idx:])
                return value
            except json.JSONDecodeError:
                continue

        match = re.search(r'(\{[\s\S]*\})', cleaned)
        if match:
            return json.loads(match.group(1))

        match = re.search(r'(\[[\s\S]*\])', cleaned)
        if match:
            return json.loads(match.group(1))

        raise


def build_storyboard_prompt(prompt_template: str, topic: str, duration: float, aspect_ratio: str, style: str) -> str:
    prompt = prompt_template.replace('[YOUR TOPIC HERE]', topic)
    prompt = re.sub(r'"total_duration":\s*\d+', f'"total_duration": {int(duration)}', prompt)
    prompt = re.sub(r'"aspect_ratio":\s*"[\d:]+"', f'"aspect_ratio": "{aspect_ratio}"', prompt)
    prompt += (
        '\n\nUse the selected style: ' + style + '.'
        ' Focus on strong motion graphics, animated typography, pacing, rhythm, and clear scene transitions.'
        ' Use J-cuts, L-cuts, and standard cuts to maintain viewer interest.'
        ' Always return only raw valid JSON with no markdown or extra text.'
    )
    return prompt


def add_log(project_id: str, stage: str, percent: int, message: str):
    """Add a progress log entry"""
    if project_id not in project_logs:
        project_logs[project_id] = []
    
    entry = {
        "timestamp": time.strftime("%H:%M:%S"),
        "stage": stage,
        "percent": percent,
        "message": message
    }
    project_logs[project_id].append(entry)
    print(f"[{project_id}] {percent}% | {stage}: {message}")


def sanitize_storyboard_dict(raw: dict) -> dict:
    """Normalizes non-standard LLM fields into valid backend values"""
    if isinstance(raw, list):
        raw = {"scenes": raw}

    if not isinstance(raw, dict):
        return {}

    raw["title"] = str(raw.get("title", "Untitled Video"))
    try:
        raw["total_duration"] = float(raw.get("total_duration", 15.0))
    except Exception:
        raw["total_duration"] = 15.0

    raw["aspect_ratio"] = str(raw.get("aspect_ratio", "16:9"))

    valid_cameras = ["static", "pan left", "pan right", "zoom in", "zoom out", "ken burns"]
    valid_transitions = ["cut", "fade", "dissolve", "slide left", "slide right"]
    valid_anim = ["typewriter", "fade-in", "slide-up", "bounce", "none"]
    valid_pos = ["top-center", "bottom-center", "lower-third", "center"]

    scenes = raw.get("scenes", [])
    if isinstance(scenes, dict):
        scenes = list(scenes.values())

    if isinstance(scenes, list):
        for idx, s in enumerate(scenes):
            if not isinstance(s, dict):
                continue
            s["scene_id"] = int(s.get("scene_id", idx + 1))
            try:
                s["duration_seconds"] = float(s.get("duration_seconds", 5.0))
            except Exception:
                s["duration_seconds"] = 5.0
            s["visual_prompt"] = str(s.get("visual_prompt", "stock video footage"))
            s["fallback_text"] = str(s.get("fallback_text", s["visual_prompt"]))
            s["start_time"] = str(s.get("start_time", "0:00"))
            s["end_time"] = str(s.get("end_time", "0:05"))

            # Normalize motion graphics arrays
            mg = s.get("motion_graphics")
            if isinstance(mg, str):
                s["motion_graphics"] = [item.strip() for item in mg.split(",") if item.strip()]
            elif isinstance(mg, list):
                s["motion_graphics"] = [str(item).strip() for item in mg if str(item).strip()]
            else:
                s["motion_graphics"] = []

            # Normalize caption highlight words
            ch = s.get("caption_highlight_words")
            if isinstance(ch, str):
                s["caption_highlight_words"] = [word.strip() for word in ch.split(",") if word.strip()]
            elif isinstance(ch, list):
                s["caption_highlight_words"] = [str(word).strip() for word in ch if str(word).strip()]
            else:
                s["caption_highlight_words"] = []

            # Normalize camera movement
            cam = str(s.get("camera_movement", "static")).lower()
            if cam not in valid_cameras:
                if "zoom" in cam or "push" in cam or "in" in cam:
                    s["camera_movement"] = "zoom in"
                elif "out" in cam or "pull" in cam:
                    s["camera_movement"] = "zoom out"
                elif "left" in cam:
                    s["camera_movement"] = "pan left"
                elif "right" in cam:
                    s["camera_movement"] = "pan right"
                elif "burns" in cam or "pan" in cam or "tilt" in cam or "whip" in cam:
                    s["camera_movement"] = "ken burns"
                else:
                    s["camera_movement"] = "static"

            # Normalize transitions
            t_in = str(s.get("transition_in", "cut")).lower()
            if t_in not in valid_transitions:
                s["transition_in"] = "fade" if ("fade" in t_in or "dissolve" in t_in or "whip" in t_in) else "cut"

            t_out = str(s.get("transition_out", "cut")).lower()
            if t_out not in valid_transitions:
                s["transition_out"] = "fade" if ("fade" in t_out or "dissolve" in t_out or "whip" in t_out) else "cut"

            # Normalize typography
            ty = s.get("typography")
            if isinstance(ty, dict):
                anim = str(ty.get("animation", "fade-in")).lower()
                if anim not in valid_anim:
                    ty["animation"] = "fade-in"
                pos = str(ty.get("position", "center")).lower()
                if pos not in valid_pos:
                    ty["position"] = "center"
                s["typography"] = ty
            elif not ty:
                s["typography"] = {"text": "", "position": "center", "animation": "fade-in", "color": "#FFFFFF"}

    raw["scenes"] = scenes
    return raw


def save_project_from_storyboard(storyboard: Storyboard) -> dict:
    project_id = str(uuid.uuid4())[:8]
    project_dir = PROJECTS_DIR / project_id
    project_dir.mkdir(exist_ok=True)

    with open(project_dir / 'storyboard.json', 'w') as f:
        f.write(storyboard.model_dump_json(indent=2))

    project = ProjectState(
        project_id=project_id,
        storyboard=storyboard
    )
    projects[project_id] = project
    add_log(project_id, 'STORYBOARD', 40, 'Storyboard ready for media fetching!')

    return {
        'project_id': project_id,
        'storyboard': storyboard.model_dump(),
        'message': 'Storyboard generated and saved. Ready to fetch media.'
    }


@app.post('/api/generate-storyboard')
async def generate_storyboard(payload: dict):
    """Step 0: Generate storyboard JSON from an AI model and initialize the project."""
    topic = str(payload.get('topic', '')).strip()
    prompt_template = str(payload.get('prompt_template', '')).strip()
    duration = float(payload.get('duration_seconds', 30))
    aspect_ratio = str(payload.get('aspect_ratio', '16:9'))
    style = str(payload.get('style', 'educational'))

    if not topic or not prompt_template:
        raise HTTPException(400, 'AI generation requires a topic and a prompt template.')

    prompt_text = build_storyboard_prompt(prompt_template, topic, duration, aspect_ratio, style)
    try:
        raw_response = await call_ai_model(prompt_text)
    except Exception as e:
        raise HTTPException(500, f'AI generation failed: {str(e)}')

    try:
        storyboard_data = extract_json_payload(raw_response)
    except Exception as e:
        raise HTTPException(500, f'Unable to parse AI response as JSON: {str(e)}')

    if isinstance(storyboard_data, dict) and isinstance(storyboard_data.get('storyboard'), (dict, list)):
        storyboard_data = storyboard_data['storyboard']

    cleaned = sanitize_storyboard_dict(storyboard_data)
    try:
        storyboard = Storyboard.model_validate(cleaned)
    except Exception as e:
        raise HTTPException(400, f'Generated storyboard validation failed: {str(e)}')

    project_data = save_project_from_storyboard(storyboard)
    add_log(project_data['project_id'], 'AI', 35, 'Generated storyboard saved. Ready to fetch media.')
    return project_data


@app.post("/api/create-project")
async def create_project(payload: dict):
    """Step 1: Save user-provided JSON storyboard and initialize project"""
    project_id = str(uuid.uuid4())[:8]
    project_dir = PROJECTS_DIR / project_id
    project_dir.mkdir(exist_ok=True)
    
    add_log(project_id, "INIT", 0, "Project created from JSON storyboard...")
    
    try:
        raw_storyboard = payload.get("storyboard", payload)
        sanitized = sanitize_storyboard_dict(raw_storyboard)
        storyboard = Storyboard.model_validate(sanitized)
        
        add_log(project_id, "STORYBOARD", 30, f"Parsed '{storyboard.title}' ({len(storyboard.scenes)} scenes)")
        add_log(project_id, "STORYBOARD", 35, "Saving storyboard to project...")
        
        with open(project_dir / "storyboard.json", 'w') as f:
            f.write(storyboard.model_dump_json(indent=2))
        
        project = ProjectState(
            project_id=project_id,
            storyboard=storyboard
        )
        projects[project_id] = project
        
        add_log(project_id, "STORYBOARD", 40, "Storyboard ready for media fetching!")
        
        return {
            "project_id": project_id,
            "storyboard": storyboard.model_dump(),
            "message": "Storyboard uploaded successfully. Now fetch media."
        }
    except Exception as e:
        add_log(project_id, "ERROR", 0, f"JSON validation failed: {str(e)}")
        raise HTTPException(400, f"Invalid storyboard JSON: {str(e)}")


def clean_project_temp_renders(project_dir: Path):
    """Clean up intermediate scene renders and concat lists, leaving downloaded stock media intact"""
    for pattern in ['scene_*.mp4', 'transition_*.mp4', 'concat_list.txt', 'concat_intermediate.mp4']:
        for item in project_dir.glob(pattern):
            try:
                item.unlink()
            except Exception:
                pass


def clean_project_media(project_dir: Path):
    """Full media cleanup for project deletion / resets"""
    media_dir = project_dir / 'media'
    if media_dir.exists() and media_dir.is_dir():
        shutil.rmtree(media_dir, ignore_errors=True)

    media_map_path = project_dir / 'media_map.json'
    if media_map_path.exists():
        try:
            media_map_path.unlink()
        except Exception:
            pass

    clean_project_temp_renders(project_dir)


@app.post("/api/fetch-media/{project_id}")
async def fetch_project_media(project_id: str):
    """Step 2: Download stock media or generate placeholders in parallel"""
    if project_id not in projects:
        raise HTTPException(404, "Project not found")
    
    project = projects[project_id]
    project_dir = PROJECTS_DIR / project_id
    clean_project_temp_renders(project_dir)
    project.media_assets = []

    media_dir = project_dir / "media"
    media_dir.mkdir(exist_ok=True)
    
    add_log(project_id, "MEDIA", 45, "Starting parallel stock media search...")
    
    scenes = project.storyboard.scenes
    total_scenes = len(scenes) or 1
    aspect_ratio = project.storyboard.aspect_ratio or "16:9"

    media_map = {}
    semaphore = asyncio.Semaphore(5)
    connector = aiohttp.TCPConnector(limit=10)

    async with aiohttp.ClientSession(connector=connector) as session:
        async def fetch_scene_asset(idx: int, scene):
            async with semaphore:
                add_log(project_id, "MEDIA", 45 + int((idx / total_scenes) * 20), f"Scene {idx+1}/{total_scenes}: Searching '{scene.visual_prompt[:30]}...'")
                path, is_placeholder, found_type = await fetch_media(
                    scene.visual_prompt,
                    media_dir,
                    scene_id=scene.scene_id,
                    media_type="video",
                    session=session
                )
                if is_placeholder:
                    placeholder_path = media_dir / f"placeholder_{scene.scene_id}.jpg"
                    create_placeholder(
                        scene.fallback_text or scene.visual_prompt,
                        placeholder_path,
                        size=aspect_ratio,
                        scene_id=scene.scene_id
                    )
                    path = str(placeholder_path)
                    found_type = 'placeholder'
                    add_log(project_id, "MEDIA", 50 + int((idx / total_scenes) * 25), f"Scene {idx+1}: Generated placeholder card")
                else:
                    add_log(project_id, "MEDIA", 50 + int((idx / total_scenes) * 25), f"Scene {idx+1}: {found_type.capitalize()} downloaded")

                return {
                    "scene_id": scene.scene_id,
                    "path": path,
                    "is_placeholder": is_placeholder,
                    "media_type": found_type,
                    "prompt": scene.visual_prompt
                }

        tasks = [fetch_scene_asset(i, sc) for i, sc in enumerate(scenes)]
        results = await asyncio.gather(*tasks)

    for res in results:
        media_map[res["scene_id"]] = res["path"]
        project.media_assets.append(res)
    
    # Save media map
    with open(project_dir / "media_map.json", 'w') as f:
        json.dump(media_map, f)
    
    placeholder_count = sum(1 for m in project.media_assets if m["is_placeholder"])
    stock_count = len(project.media_assets) - placeholder_count
    add_log(project_id, "MEDIA", 75, f"Media fetch complete! ({stock_count} stock clips, {placeholder_count} placeholders)")
    
    return {
        "project_id": project_id,
        "media": project.media_assets,
        "placeholders": [m for m in project.media_assets if m["is_placeholder"]]
    }


@app.post("/api/render/{project_id}")
async def render_video(project_id: str, background_tasks: BackgroundTasks, payload: Optional[dict] = None):
    """Step 3: Assemble final video with FFmpeg"""
    if project_id not in projects:
        raise HTTPException(404, "Project not found")
    
    project = projects[project_id]
    project_dir = PROJECTS_DIR / project_id

    # If payload contains updated storyboard, sync it first
    if payload:
        raw_sb = payload.get("storyboard", payload)
        if raw_sb and isinstance(raw_sb, dict) and "scenes" in raw_sb:
            try:
                sanitized = sanitize_storyboard_dict(raw_sb)
                project.storyboard = Storyboard.model_validate(sanitized)
                with open(project_dir / "storyboard.json", 'w') as f:
                    f.write(project.storyboard.model_dump_json(indent=2))
            except Exception as e:
                print(f"[RENDER] Note: Storyboard payload update failed: {e}")
    
    if not project.storyboard:
        raise HTTPException(400, "No storyboard found")
    
    media_map_path = project_dir / "media_map.json"
    if not media_map_path.exists():
        raise HTTPException(400, "Media not fetched yet. Please fetch media first.")
    
    with open(media_map_path) as f:
        media_map = {int(k): v for k, v in json.load(f).items()}
    
    project.render_status = "rendering"
    add_log(project_id, "RENDER", 78, "Starting parallel FFmpeg video assembly...")
    
    def do_render():
        try:
            def on_progress(pct: int, msg: str):
                add_log(project_id, "RENDER", pct, msg)

            final_path = render_storyboard(
                project.storyboard,
                media_map,
                project_dir,
                progress_callback=on_progress
            )
            
            clean_project_temp_renders(project_dir)

            output_rel = f"/videos/{project_id}/final_video.mp4"
            project.output_path = output_rel
            project.render_status = "done"
            add_log(project_id, "RENDER", 100, "Video render complete! Ready for download.")
        except Exception as e:
            add_log(project_id, "ERROR", 0, f"Render failed: {str(e)}")
            project.render_status = "error"
    
    background_tasks.add_task(do_render)
    
    return {
        "project_id": project_id,
        "status": "rendering_started",
        "message": "Video is being assembled."
    }

@app.get("/api/status/{project_id}")
async def get_status(project_id: str):
    """Check render status and get logs"""
    if project_id not in projects:
        raise HTTPException(404, "Project not found")
    
    project = projects[project_id]
    logs = project_logs.get(project_id, [])
    
    # Get latest percent
    latest_percent = 0
    if logs:
        latest_percent = logs[-1]["percent"]
    
    return {
        "project_id": project_id,
        "status": project.render_status,
        "output_path": project.output_path,
        "percent": latest_percent,
        "logs": logs,
        "storyboard": project.storyboard.model_dump() if project.storyboard else None,
        "media_assets": project.media_assets
    }

@app.get("/api/logs/{project_id}")
async def get_logs(project_id: str):
    """Get just the logs"""
    if project_id not in project_logs:
        return {"logs": []}
    return {"logs": project_logs[project_id]}

@app.post("/api/update-storyboard/{project_id}")
async def update_storyboard(project_id: str, payload: dict):
    """Manual correction: Update storyboard before render"""
    if project_id not in projects:
        raise HTTPException(404, "Project not found")
    
    sanitized = sanitize_storyboard_dict(payload.get("storyboard", payload))
    storyboard = Storyboard.model_validate(sanitized)
    projects[project_id].storyboard = storyboard
    project_dir = PROJECTS_DIR / project_id
    
    with open(project_dir / "storyboard.json", 'w') as f:
        f.write(storyboard.model_dump_json(indent=2))
    
    add_log(project_id, "EDIT", 50, "Storyboard updated by user")
    
    return {"message": "Storyboard updated", "project_id": project_id}

@app.post("/api/cleanup-media/{project_id}")
async def cleanup_project_media_endpoint(project_id: str):
    """Deletes temporary source media files and placeholder assets for a project, while preserving the rendered final_video.mp4 and storyboard.json."""
    if project_id not in projects:
        raise HTTPException(404, "Project not found")

    project_dir = PROJECTS_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(404, "Project directory not found")

    clean_project_media(project_dir)
    projects[project_id].media_assets = []

    add_log(project_id, "CLEANUP", 100, "Temporary source media assets deleted. Final video preserved!")

    return {
        "message": "Temporary source media assets deleted successfully. Final video preserved.",
        "project_id": project_id,
        "media_assets": []
    }


@app.post("/api/cleanup")
async def cleanup_projects():
    """Manual cleanup endpoint to free disk space"""
    cleanup_old_projects()
    check_disk_usage()
    return {
        "message": "Cleanup completed successfully",
        "max_project_age_hours": MAX_PROJECT_AGE_HOURS,
        "max_disk_size_mb": MAX_TOTAL_DISK_SIZE_MB
    }

@app.get("/api/disk-usage")
async def get_disk_usage():
    """Get current disk usage statistics"""
    if not PROJECTS_DIR.exists():
        return {"total_size_mb": 0, "project_count": 0, "limit_mb": MAX_TOTAL_DISK_SIZE_MB}
    
    try:
        total_size = sum(f.stat().st_size for f in PROJECTS_DIR.rglob('*') if f.is_file())
        total_size_mb = total_size / (1024 * 1024)
        project_count = len([d for d in PROJECTS_DIR.iterdir() if d.is_dir()])
        
        return {
            "total_size_mb": round(total_size_mb, 2),
            "project_count": project_count,
            "limit_mb": MAX_TOTAL_DISK_SIZE_MB,
            "usage_percent": round((total_size_mb / MAX_TOTAL_DISK_SIZE_MB) * 100, 1)
        }
    except Exception as e:
        return {"error": str(e), "limit_mb": MAX_TOTAL_DISK_SIZE_MB}

@app.post("/api/add-captions/{project_id}")
async def add_captions(project_id: str, captions: list[dict]):
    """Add or edit captions manually"""
    if project_id not in projects:
        raise HTTPException(404, "Project not found")
    
    projects[project_id].captions = captions
    return {"message": "Captions updated", "count": len(captions)}

app.mount("/videos", StaticFiles(directory="projects"), name="videos")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)




