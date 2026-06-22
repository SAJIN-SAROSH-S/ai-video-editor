from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import uuid
import asyncio
import json
import time

from .models import VideoRequest, ProjectState, Storyboard
from .ai_engine import generate_storyboard
from .stock_fetcher import fetch_media
from .placeholder import create_placeholder
from .video_builder import render_storyboard
from .caption_engine import generate_captions, burn_captions

app = FastAPI(title="AI Video Editor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECTS_DIR = Path("projects")
PROJECTS_DIR.mkdir(exist_ok=True)

projects = {}
project_logs = {}  # Store logs for each project

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

@app.post("/api/create-project")
async def create_project(request: VideoRequest):
    """Step 1: AI generates storyboard from topic"""
    project_id = str(uuid.uuid4())[:8]
    project_dir = PROJECTS_DIR / project_id
    project_dir.mkdir(exist_ok=True)
    
    add_log(project_id, "INIT", 0, "Project created, starting AI storyboard generation...")
    
    # Generate storyboard
    try:
        add_log(project_id, "AI", 10, "Connecting to Ollama (Phi-4-mini)...")
        add_log(project_id, "AI", 15, "Generating storyboard structure...")
        
        storyboard = generate_storyboard(request)
        
        add_log(project_id, "AI", 30, f"Storyboard complete: {len(storyboard.scenes)} scenes")
        add_log(project_id, "AI", 35, "Saving storyboard to project...")
        
        with open(project_dir / "storyboard.json", 'w') as f:
            f.write(storyboard.model_dump_json(indent=2))
        
        project = ProjectState(
            project_id=project_id,
            storyboard=storyboard
        )
        projects[project_id] = project
        
        add_log(project_id, "AI", 40, "Storyboard ready for review!")
        
        return {
            "project_id": project_id,
            "storyboard": storyboard.model_dump(),
            "message": "Storyboard generated. Now fetch media."
        }
    except Exception as e:
        add_log(project_id, "ERROR", 0, f"AI generation failed: {str(e)}")
        raise HTTPException(500, f"AI generation failed: {str(e)}")

@app.post("/api/fetch-media/{project_id}")
async def fetch_project_media(project_id: str):
    """Step 2: Download stock media or generate placeholders"""
    if project_id not in projects:
        raise HTTPException(404, "Project not found")
    
    project = projects[project_id]
    project_dir = PROJECTS_DIR / project_id
    media_dir = project_dir / "media"
    media_dir.mkdir(exist_ok=True)
    
    add_log(project_id, "MEDIA", 45, "Starting stock media fetch...")
    
    media_map = {}
    total_scenes = len(project.storyboard.scenes)
    
    for i, scene in enumerate(project.storyboard.scenes):
        percent = 45 + int((i / total_scenes) * 30)
        add_log(project_id, "MEDIA", percent, f"Scene {i+1}/{total_scenes}: Searching '{scene.visual_prompt}'...")
        
        # Try to fetch media
        path, is_placeholder = await fetch_media(
            scene.visual_prompt, 
            media_dir,
            "video"
        )
        
        if is_placeholder:
            add_log(project_id, "MEDIA", percent, f"Scene {i+1}: No stock found, generating white placeholder...")
            placeholder_path = media_dir / f"placeholder_{scene.scene_id}.jpg"
            create_placeholder(scene.fallback_text, placeholder_path)
            path = str(placeholder_path)
            add_log(project_id, "MEDIA", percent, f"Scene {i+1}: Placeholder created")
        else:
            add_log(project_id, "MEDIA", percent, f"Scene {i+1}: Stock media downloaded!")
        
        media_map[scene.scene_id] = path
        project.media_assets.append({
            "scene_id": scene.scene_id,
            "path": path,
            "is_placeholder": is_placeholder,
            "prompt": scene.visual_prompt
        })
    
    # Save media map
    with open(project_dir / "media_map.json", 'w') as f:
        json.dump(media_map, f)
    
    placeholder_count = sum(1 for m in project.media_assets if m["is_placeholder"])
    add_log(project_id, "MEDIA", 75, f"Media fetch complete! {placeholder_count} placeholders, {len(project.media_assets) - placeholder_count} stock clips")
    
    return {
        "project_id": project_id,
        "media": project.media_assets,
        "placeholders": [m for m in project.media_assets if m["is_placeholder"]]
    }

@app.post("/api/render/{project_id}")
async def render_video(project_id: str, background_tasks: BackgroundTasks):
    """Step 3: Assemble final video with FFmpeg"""
    if project_id not in projects:
        raise HTTPException(404, "Project not found")
    
    project = projects[project_id]
    project_dir = PROJECTS_DIR / project_id
    
    if not project.storyboard:
        raise HTTPException(400, "No storyboard found")
    
    media_map_path = project_dir / "media_map.json"
    if not media_map_path.exists():
        raise HTTPException(400, "Media not fetched yet")
    
    with open(media_map_path) as f:
        media_map = {int(k): v for k, v in json.load(f).items()}
    
    project.render_status = "rendering"
    add_log(project_id, "RENDER", 80, "Starting FFmpeg video assembly...")
    
    def do_render():
        try:
            total_scenes = len(project.storyboard.scenes)
            for i, scene in enumerate(project.storyboard.scenes):
                percent = 80 + int((i / total_scenes) * 15)
                add_log(project_id, "RENDER", percent, f"Rendering scene {i+1}/{total_scenes}...")
            
            add_log(project_id, "RENDER", 95, "Finalizing video output...")
            final_path = render_storyboard(project.storyboard, media_map, project_dir)
            
            add_log(project_id, "RENDER", 100, "Video render complete!")
            project.output_path = str(final_path)
            project.render_status = "done"
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
async def update_storyboard(project_id: str, storyboard: Storyboard):
    """Manual correction: Update storyboard before render"""
    if project_id not in projects:
        raise HTTPException(404, "Project not found")
    
    projects[project_id].storyboard = storyboard
    project_dir = PROJECTS_DIR / project_id
    
    with open(project_dir / "storyboard.json", 'w') as f:
        f.write(storyboard.model_dump_json(indent=2))
    
    add_log(project_id, "EDIT", 50, "Storyboard updated by user")
    
    return {"message": "Storyboard updated", "project_id": project_id}

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