import subprocess
import json
import os
from pathlib import Path
from typing import List
from .models import Storyboard, Scene

def build_scene_command(scene: Scene, media_path: str, output_path: Path, index: int):
    """Builds FFmpeg command for a single scene"""
    duration = scene.duration_seconds
    
    # Base filters
    filters = []
    
    # Input scaling and padding (ensure 1920x1080)
    filters.append("scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2")
    
    # Camera movement simulation
    if scene.camera_movement == "zoom in":
        filters.append("zoompan=z='min(zoom+0.0015,1.5)':d={}:s=1920x1080".format(int(duration * 25)))
    elif scene.camera_movement == "ken burns":
        filters.append("zoompan=z='if(lte(on,1),1.0,1.05)':x='if(lte(on,1),0,iw/100)':y='if(lte(on,1),0,ih/100)':d={}:s=1920x1080".format(int(duration * 25)))
    elif scene.camera_movement == "pan left":
        filters.append("zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={}:s=1920x1080".format(int(duration * 25)))
    
    # Typography overlay
    if scene.typography and scene.typography.text:
        text = scene.typography.text.replace("'", "\\\\'").replace(":", "\\\\:")
        pos_y = 100 if scene.typography.position == "top-center" else 900 if scene.typography.position == "bottom-center" else 540
        anim = ""
        if scene.typography.animation == "fade-in":
            anim = ":alpha='if(lt(t,0.5),t*2,1)'"
        
        filters.append(f"drawtext=text='{text}':fontsize=48:fontcolor={scene.typography.color}:x=(w-text_w)/2:y={pos_y}{anim}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
    
    # Lower third motion graphic
    if "lower third" in scene.motion_graphics:
        filters.append("drawbox=y=ih-120:color=black@0.7:width=iw:height=120:t=fill")
    
    # Build command
    filter_str = ",".join(filters)
    
    cmd = [
        "ffmpeg", "-y",
        "-i", media_path,
        "-vf", filter_str,
        "-t", str(duration),
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-an",  # No audio in scene files
        str(output_path)
    ]
    
    return cmd

def apply_transition(scene1_path: Path, scene2_path: Path, transition: str, output_path: Path):
    """Applies transition between two scenes"""
    if transition == "fade":
        cmd = [
            "ffmpeg", "-y",
            "-i", str(scene1_path), "-i", str(scene2_path),
            "-filter_complex", 
            "[0:v]fade=t=out:st=0:d=1[va];[1:v]fade=t=in:st=0:d=1[vb];[va][vb]concat=n=2:v=1:a=0[outv]",
            "-map", "[outv]",
            str(output_path)
        ]
    elif transition == "dissolve":
        cmd = [
            "ffmpeg", "-y",
            "-i", str(scene1_path), "-i", str(scene2_path),
            "-filter_complex",
            "[0:v][1:v]xfade=transition=fade:duration=1:offset=0[outv]",
            "-map", "[outv]",
            str(output_path)
        ]
    else:  # cut or default
        cmd = [
            "ffmpeg", "-y",
            "-i", str(scene1_path), "-i", str(scene2_path),
            "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[outv]",
            "-map", "[outv]",
            str(output_path)
        ]
    
    subprocess.run(cmd, check=True, capture_output=True)
    return output_path

def render_storyboard(storyboard: Storyboard, media_map: dict, project_dir: Path) -> Path:
    """
    media_map: {scene_id: local_media_path}
    Returns final video path
    """
    scene_files = []
    
    # Render each scene individually
    for i, scene in enumerate(storyboard.scenes):
        media = media_map.get(scene.scene_id)
        if not media:
            raise ValueError(f"No media for scene {scene.scene_id}")
        
        scene_output = project_dir / f"scene_{i:03d}.mp4"
        cmd = build_scene_command(scene, media, scene_output, i)
        subprocess.run(cmd, check=True, capture_output=True)
        scene_files.append(scene_output)
    
    # Concatenate all scenes with transitions
    if len(scene_files) == 1:
        final_output = project_dir / "final_video.mp4"
        os.rename(scene_files[0], final_output)
        return final_output
    
    # Build concat list
    concat_list = project_dir / "concat_list.txt"
    with open(concat_list, 'w') as f:
        for sf in scene_files:
            f.write(f"file '{sf.absolute()}'\n")
    
    final_output = project_dir / "final_video.mp4"
    cmd = [
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", str(concat_list),
        "-c", "copy",
        str(final_output)
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    
    return final_output