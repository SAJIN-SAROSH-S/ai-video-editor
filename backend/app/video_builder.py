import subprocess
import json
import os
import re
from pathlib import Path
from typing import List, Tuple, Optional, Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from .models import Storyboard, Scene

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
FRAMERATE = 25


def get_dimensions(aspect_ratio: str) -> Tuple[int, int]:
    """Returns (width, height) for the given aspect ratio"""
    ar = str(aspect_ratio or "16:9").strip().lower()
    if ar in ["9:16", "portrait"]:
        return (1080, 1920)
    elif ar in ["1:1", "square"]:
        return (1080, 1080)
    elif ar in ["4:5"]:
        return (1080, 1350)
    # Default 16:9 Landscape
    return (1920, 1080)


def get_font_file_arg() -> str:
    """Finds an existing font file path and formats it for FFmpeg drawtext filter"""
    candidates = [
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\segoeui.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFProText-Bold.otf"
    ]
    for font_path in candidates:
        if os.path.exists(font_path):
            # Posix path with escaped colon for Windows drive letter
            posix_path = Path(font_path).as_posix().replace(":", "\\:")
            return f":fontfile='{posix_path}'"
    return ""


def escape_drawtext(text: str) -> str:
    """Safely escapes text for FFmpeg drawtext filter parser"""
    if not text:
        return ""
    # Escape backslash, single quotes, colons, percent, commas, semicolons, brackets
    escaped = text.replace("\\", "\\\\")
    escaped = escaped.replace("'", "\\'")
    escaped = escaped.replace(":", "\\:")
    escaped = escaped.replace("%", "\\%")
    escaped = escaped.replace(",", "\\,")
    escaped = escaped.replace(";", "\\;")
    escaped = escaped.replace("[", "\\[")
    escaped = escaped.replace("]", "\\]")
    return escaped


def build_scene_command(scene: Scene, media_path: str, output_path: Path, aspect_ratio: str = "16:9", text_file_path: Optional[Path] = None):
    """Builds FFmpeg command for a single scene with full effects, motion, and typography"""
    duration = max(1.0, float(scene.duration_seconds))
    is_image = Path(media_path).suffix.lower() in IMAGE_EXTENSIONS
    width, height = get_dimensions(aspect_ratio)
    scale_factor = min(width, height) / 1080.0

    filters = []

    # 1. Trim & Speed (if specified)
    effects = scene.effects
    if effects.trim_start > 0:
        filters.append(f"trim=start={effects.trim_start}")
    if effects.speed_factor > 0 and effects.speed_factor != 1.0:
        filters.append(f"setpts=PTS/{effects.speed_factor}")

    # 2. Aspect Ratio Scaling & Centering
    filters.append(f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1")

    # 3. Camera Movement Simulation
    cam = (scene.camera_movement or "static").lower()

    if is_image:
        # Still Image: Use zoompan to animate still frame into video stream
        if cam == "zoom in":
            filters.append(f"zoompan=z='min(zoom+0.0015,1.4)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={width}x{height}:fps={FRAMERATE}")
        elif cam == "zoom out":
            filters.append(f"zoompan=z='if(lte(on,1),1.4,max(1.0,zoom-0.0015))':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={width}x{height}:fps={FRAMERATE}")
        elif cam == "ken burns":
            filters.append(f"zoompan=z='min(zoom+0.0010,1.25)':x='if(lte(on,1),0,min(x+0.5,iw-iw/zoom))':y='if(lte(on,1),0,min(y+0.3,ih-ih/zoom))':d=1:s={width}x{height}:fps={FRAMERATE}")
        elif cam == "pan left":
            filters.append(f"zoompan=z=1.2:x='max(0,iw-(iw/zoom)-(on*1.5))':y='ih/2-(ih/zoom/2)':d=1:s={width}x{height}:fps={FRAMERATE}")
        elif cam == "pan right":
            filters.append(f"zoompan=z=1.2:x='min(iw-iw/zoom,on*1.5)':y='ih/2-(ih/zoom/2)':d=1:s={width}x{height}:fps={FRAMERATE}")
        else:
            # Static camera on image
            filters.append(f"zoompan=z=1.0:d=1:s={width}x{height}:fps={FRAMERATE}")
    else:
        # Video clip: normalize fps to FRAMERATE
        filters.append(f"fps={FRAMERATE}")
        if cam == "zoom in":
            filters.append(f"scale=w='{width}*1.15':h='{height}*1.15',crop={width}:{height}")
        elif cam == "zoom out":
            filters.append(f"scale=w='{width}*1.15':h='{height}*1.15',crop={width}:{height}")

    # 4. Color Grading & Adjustments
    b = effects.brightness
    c = effects.contrast
    s = effects.saturation
    g = effects.gamma
    if b != 0.0 or c != 1.0 or s != 1.0 or g != 1.0:
        filters.append(f"eq=brightness={b:.2f}:contrast={c:.2f}:saturation={s:.2f}:gamma={g:.2f}")

    # Preset Color Grading
    grade = (effects.color_grade_preset or "none").lower()
    if grade == "warm":
        filters.append("colorbalance=rs=0.12:gs=0.04:bs=-0.12:rm=0.08:gm=0.02:bm=-0.08")
    elif grade == "cool":
        filters.append("colorbalance=rs=-0.08:gs=0.02:bs=0.12:rm=-0.06:gm=0.02:bm=0.10")
    elif grade == "cinematic":
        filters.append("eq=contrast=1.15:saturation=1.1:gamma=0.95")
    elif grade == "vintage":
        filters.append("colorbalance=rs=0.08:gs=0.04:bs=-0.04:rm=0.05:gm=0.02:bm=-0.02,eq=contrast=1.05:saturation=0.85")
    elif grade == "teal_orange":
        filters.append("colorbalance=rs=0.10:gs=0.02:bs=-0.10:rh=-0.08:gh=0.04:bh=0.12")
    elif grade == "bw":
        filters.append("hue=s=0,eq=contrast=1.15")
    elif grade == "golden_hour":
        filters.append("colorbalance=rs=0.18:gs=0.06:bs=-0.18:rm=0.12:gm=0.04:bm=-0.12")
    elif grade == "horror":
        filters.append("eq=saturation=0.45:contrast=1.25:brightness=-0.04")

    # 5. Visual FX: Vignette, Film Grain, Letterbox
    if effects.vignette or "vignette" in scene.motion_graphics:
        filters.append("vignette=PI/4")

    if effects.film_grain or "film-grain" in scene.motion_graphics:
        intensity = min(30, max(2, effects.film_grain_intensity))
        filters.append(f"noise=alls={intensity}:allf=t+u")

    if effects.letterbox or "letterbox" in scene.motion_graphics:
        bar_h = int(height * 0.10)
        filters.append(f"drawbox=y=0:h={bar_h}:color=black:t=fill,drawbox=y=ih-{bar_h}:h={bar_h}:color=black:t=fill")

    # 6. Lower Third Motion Graphic
    if "lower-third" in scene.motion_graphics or "lower third" in scene.motion_graphics or scene.typography.position == "lower-third":
        lh = int(height * 0.16)
        filters.append(f"drawbox=y=ih-{lh}:color=black@0.75:width=iw:height={lh}:t=fill")

    # 7. Typography Overlay (Using textfile for robust cross-platform parsing)
    if scene.typography and scene.typography.text and text_file_path:
        with open(text_file_path, "w", encoding="utf-8") as tf:
            tf.write(scene.typography.text.strip())

        safe_tf_path = text_file_path.resolve().as_posix().replace(":", "\\:")
        font_size = max(24, int(scene.typography.font_size * scale_factor))
        color = scene.typography.color or "#FFFFFF"
        pos = scene.typography.position

        if pos == "top-center":
            pos_y = int(height * 0.12)
        elif pos in ["bottom-center", "lower-third"]:
            pos_y = int(height * 0.82)
        else:  # center
            pos_y = int((height - font_size) / 2)

        anim = ""
        if scene.typography.animation == "fade-in":
            # Note escaped comma for filter syntax inside alpha
            anim = r":alpha='if(lt(t\,0.6)\,t/0.6\,1)'"

        font_arg = get_font_file_arg()
        box_arg = ":box=1:boxcolor=black@0.5:boxborderw=8" if scene.typography.background_box and pos != "lower-third" else ""
        filters.append(f"drawtext=textfile='{safe_tf_path}':expansion=none:fontsize={font_size}:fontcolor={color}:x=(w-text_w)/2:y={pos_y}{box_arg}{anim}{font_arg}")

    # Build command
    filter_str = ",".join(filters)

    cmd = ["ffmpeg", "-y", "-threads", "0"]
    if is_image:
        cmd += ["-loop", "1", "-framerate", str(FRAMERATE)]
    cmd += ["-i", str(media_path)]
    cmd += [
        "-vf", filter_str,
        "-t", str(duration),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
        "-pix_fmt", "yuv420p",
        "-an",
        str(output_path)
    ]

    return cmd


def render_single_scene(args: Tuple[Scene, str, Path, int, str, Optional[Path]]) -> Tuple[int, Path]:
    """Worker function for parallel scene rendering"""
    scene, media_path, output_path, index, aspect_ratio, text_file_path = args
    cmd = build_scene_command(scene, media_path, output_path, aspect_ratio, text_file_path)
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg error in scene {index + 1}: {res.stderr}")
    return index, output_path


def render_storyboard(
    storyboard: Storyboard,
    media_map: dict,
    project_dir: Path,
    progress_callback: Optional[Callable[[int, str], None]] = None
) -> Path:
    """
    Renders storyboard into final video using parallel scene rendering,
    correct transition assembly, and web-optimized faststart MP4 export.
    """
    scenes = storyboard.scenes
    if not scenes:
        raise ValueError("Storyboard has no scenes to render")

    aspect_ratio = storyboard.aspect_ratio or "16:9"
    total_scenes = len(scenes)

    # 1. Parallel Render for each scene
    scene_tasks = []
    for i, scene in enumerate(scenes):
        media = media_map.get(scene.scene_id)
        if not media or not os.path.exists(media):
            raise ValueError(f"No media found for scene {scene.scene_id}")
        scene_output = project_dir / f"scene_{i:03d}.mp4"
        text_file = project_dir / f"scene_{i:03d}_text.txt"
        scene_tasks.append((scene, media, scene_output, i, aspect_ratio, text_file))

    max_workers = min(4, max(1, os.cpu_count() or 2))
    scene_files = [None] * total_scenes
    completed = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(render_single_scene, task) for task in scene_tasks]
        for future in as_completed(futures):
            idx, out_path = future.result()
            scene_files[idx] = out_path
            completed += 1
            if progress_callback:
                pct = 80 + int((completed / total_scenes) * 14)
                progress_callback(pct, f"Rendered scene {completed}/{total_scenes}")

    # 2. Assemble Final Video with Transitions
    final_output = project_dir / "final_video.mp4"
    temp_concat = project_dir / "concat_intermediate.mp4"

    # Check if there are transitions other than 'cut'
    has_complex_transitions = any(
        (s.transition_out and s.transition_out != "cut") or
        (s.transition_in and s.transition_in != "cut")
        for s in scenes
    )

    if total_scenes == 1 or not has_complex_transitions:
        # Fast direct concatenation via FFmpeg concat demuxer
        concat_txt = project_dir / "concat_list.txt"
        with open(concat_txt, "w", encoding="utf-8") as f:
            for s_file in scene_files:
                # Use forward slash and escape single quotes for ffmpeg concat file
                safe_path = s_file.resolve().as_posix().replace("'", "'\\''")
                f.write(f"file '{safe_path}'\n")

        # Concat video and multiplex with silent AAC audio
        cmd = [
            "ffmpeg", "-y", "-threads", "0",
            "-f", "concat", "-safe", "0", "-i", str(concat_txt),
            "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
            "-c:a", "aac", "-b:a", "128k", "-shortest",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            str(final_output)
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"FFmpeg concat failed: {res.stderr}")

    else:
        # Single-pass xfade transition graph with exact offset calculations
        filter_complex = []
        inputs = []
        for s_file in scene_files:
            inputs.extend(["-i", str(s_file)])

        # Calculate offsets
        current_stream = "[0:v]"
        accumulated_offset = max(1.0, float(scenes[0].duration_seconds))
        transition_duration = 0.75

        for i in range(1, total_scenes):
            prev_scene = scenes[i - 1]
            curr_scene = scenes[i]
            trans = (prev_scene.transition_out or curr_scene.transition_in or "dissolve").lower()
            
            # Map transition names to xfade types
            xfade_type = "fade"
            if "slide left" in trans:
                xfade_type = "slideleft"
            elif "slide right" in trans:
                xfade_type = "slideright"
            elif "dissolve" in trans or "fade" in trans:
                xfade_type = "fade"
            else:
                xfade_type = "fade"

            offset = max(0.1, accumulated_offset - transition_duration)
            out_stream = f"[v{i}]" if i < total_scenes - 1 else "[outv]"
            filter_complex.append(
                f"{current_stream}[{i}:v]xfade=transition={xfade_type}:duration={transition_duration}:offset={offset:.2f}{out_stream}"
            )
            current_stream = out_stream
            accumulated_offset = offset + max(1.0, float(curr_scene.duration_seconds))

        filter_str = ";".join(filter_complex)

        cmd = [
            "ffmpeg", "-y", "-threads", "0",
            *inputs,
            "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-filter_complex", filter_str,
            "-map", "[outv]",
            "-map", f"{total_scenes}:a",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
            "-c:a", "aac", "-b:a", "128k", "-shortest",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            str(final_output)
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"FFmpeg xfade transition failed: {res.stderr}")

    return final_output