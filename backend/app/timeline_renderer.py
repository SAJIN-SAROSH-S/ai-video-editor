import subprocess
import json
import os
import re
import asyncio
import aiohttp
from pathlib import Path
import shutil
from typing import List, Tuple, Optional, Callable, Dict, Union
from concurrent.futures import ThreadPoolExecutor, as_completed

from .models import (
    Storyboard, Scene, Typography, SFX, SceneEffects, AudioConfig,
    TimelineProject, Track, Clip, ClipTransform, ClipTransition
)
from .video_builder import (
    ensure_ffmpeg_in_path, get_dimensions, get_font_file_arg,
    escape_drawtext, IMAGE_EXTENSIONS, FRAMERATE
)
from .placeholder import create_placeholder
from .stock_fetcher import fetch_media
from .audio_engine import build_audio_track

ensure_ffmpeg_in_path()


def storyboard_to_timeline(storyboard: Storyboard, media_map: Optional[Union[Dict[int, str], List[dict]]] = None) -> TimelineProject:
    """
    Converts a standard AI Storyboard into a rich OpenCut Multi-Track TimelineProject.
    Creates 5 organized tracks:
      - Track 1 (video): Main Video Footage (Scenes V1)
      - Track 2 (video): Visual Overlays / B-Roll (V2)
      - Track 3 (text): Typography / Subtitles / Lower-Thirds (T1)
      - Track 4 (audio): Voiceover Speech (A1)
      - Track 5 (audio): BGM & Sound FX (A2)
    """
    if isinstance(media_map, list):
        media_dict = {}
        for item in media_map:
            if isinstance(item, dict):
                sid = item.get("scene_id")
                path = item.get("file_path") or item.get("url")
                if sid is not None and path:
                    media_dict[sid] = str(path)
                    try:
                        media_dict[int(sid)] = str(path)
                    except (ValueError, TypeError):
                        pass
        media_map = media_dict
    else:
        media_map = media_map or {}
    total_duration = float(storyboard.total_duration or 15.0)
    aspect_ratio = storyboard.aspect_ratio or "16:9"

    # Track 1: Main Video
    v1_clips: List[Clip] = []
    # Track 3: Typography & Text
    t1_clips: List[Clip] = []
    # Track 4: Voiceover
    a1_clips: List[Clip] = []
    # Track 5: SFX
    a2_clips: List[Clip] = []

    current_time = 0.0
    for idx, scene in enumerate(storyboard.scenes):
        dur = max(1.0, float(scene.duration_seconds or 5.0))
        scene_id = scene.scene_id or (idx + 1)
        source_path = media_map.get(scene_id) or media_map.get(str(scene_id))

        # 1. Main Video Clip
        v1_clip = Clip(
            id=f"clip-v1-{scene_id}",
            track_id="track-v1",
            name=f"Scene {idx + 1}: {scene.visual_prompt[:24]}",
            media_type="image" if (source_path and Path(source_path).suffix.lower() in IMAGE_EXTENSIONS) else "video",
            start_time=round(current_time, 2),
            duration=round(dur, 2),
            trim_in=round(scene.effects.trim_start, 2),
            source_url=source_path,
            effects=scene.effects,
            transform=getattr(scene, "transform", None) or ClipTransform(),
            camera_movement=scene.camera_movement or "static",
            transition_in=ClipTransition(transition_type=scene.transition_in or "cut", duration=0.5),
            transition_out=ClipTransition(transition_type=scene.transition_out or "cut", duration=0.5)
        )
        v1_clips.append(v1_clip)

        # 2. Typography / Text Clip
        if scene.typography and scene.typography.text:
            t1_clip = Clip(
                id=f"clip-t1-{scene_id}",
                track_id="track-t1",
                name=f"Text: {scene.typography.text[:20]}",
                media_type="text",
                start_time=round(current_time, 2),
                duration=round(dur, 2),
                text_content=scene.typography.text,
                typography=scene.typography
            )
            t1_clips.append(t1_clip)

        # 3. Voiceover Clip
        if scene.voiceover_text:
            a1_clip = Clip(
                id=f"clip-a1-{scene_id}",
                track_id="track-a1",
                name=f"VO: {scene.voiceover_text[:20]}",
                media_type="audio",
                start_time=round(current_time, 2),
                duration=round(dur, 2),
                text_content=scene.voiceover_text,
                volume=1.0
            )
            a1_clips.append(a1_clip)

        # 4. SFX Clip
        if scene.sfx and scene.sfx.description:
            a2_clip = Clip(
                id=f"clip-a2-{scene_id}",
                track_id="track-a2",
                name=f"SFX: {scene.sfx.description[:20]}",
                media_type="audio",
                start_time=round(current_time, 2),
                duration=round(min(dur, 2.5), 2),
                volume=0.7
            )
            a2_clips.append(a2_clip)

        current_time += dur

    total_calculated_dur = max(total_duration, current_time)

    # Build Tracks
    tracks = [
        Track(id="track-v1", name="Main Video (V1)", type="video", order=1, clips=v1_clips),
        Track(id="track-v2", name="Overlays / B-Roll (V2)", type="video", order=2, clips=[]),
        Track(id="track-t1", name="Captions & Titles (T1)", type="text", order=3, clips=t1_clips),
        Track(id="track-a1", name="Voiceover Narration (A1)", type="audio", order=4, volume=1.0, clips=a1_clips),
        Track(id="track-a2", name="Music & Sound FX (A2)", type="audio", order=5, volume=storyboard.audio_config.music_volume or 0.15, clips=a2_clips),
    ]

    return TimelineProject(
        id=f"timeline-{int(total_calculated_dur)}s",
        title=storyboard.title or "OpenCut Project",
        aspect_ratio=aspect_ratio,
        duration=round(total_calculated_dur, 2),
        fps=FRAMERATE,
        tracks=tracks,
        audio_config=storyboard.audio_config
    )


def timeline_to_storyboard(timeline: TimelineProject, existing_storyboard: Optional[Storyboard] = None) -> Storyboard:
    """
    Converts a modified OpenCut TimelineProject back into a Storyboard object.
    Preserves clip adjustments, text changes, voiceover text, transforms, and durations.
    """
    # Find main video track
    v_track = next((t for t in timeline.tracks if t.type == "video" and len(t.clips) > 0), None)
    t_track = next((t for t in timeline.tracks if t.type == "text"), None)
    a1_track = next((t for t in timeline.tracks if t.type == "audio" and "voice" in t.name.lower()), None)
    if not a1_track:
        a1_track = next((t for t in timeline.tracks if t.type == "audio"), None)

    scenes: List[Scene] = []
    if v_track and v_track.clips:
        # Sort clips by start_time
        sorted_clips = sorted(v_track.clips, key=lambda c: c.start_time)
        for idx, clip in enumerate(sorted_clips):
            # Find matching text clip
            text_clip = next((tc for tc in (t_track.clips if t_track else []) if abs(tc.start_time - clip.start_time) < 0.5), None)
            # Find matching VO clip
            vo_clip = next((ac for ac in (a1_track.clips if a1_track else []) if abs(ac.start_time - clip.start_time) < 0.5), None)

            start_m = int(clip.start_time // 60)
            start_s = int(clip.start_time % 60)
            end_t = clip.start_time + clip.duration
            end_m = int(end_t // 60)
            end_s = int(end_t % 60)

            scene = Scene(
                scene_id=idx + 1,
                start_time=f"{start_m}:{start_s:02d}",
                end_time=f"{end_m}:{end_s:02d}",
                duration_seconds=clip.duration,
                visual_prompt=clip.name or f"Scene {idx + 1}",
                fallback_text=clip.name or f"Scene {idx + 1}",
                camera_movement=clip.camera_movement or "static",
                transition_in=clip.transition_in.transition_type if clip.transition_in else "cut",
                transition_out=clip.transition_out.transition_type if clip.transition_out else "cut",
                typography=text_clip.typography if text_clip else (clip.typography or Typography()),
                voiceover_text=vo_clip.text_content if vo_clip else clip.text_content,
                effects=clip.effects or SceneEffects(),
                transform=clip.transform or ClipTransform()
            )
            if text_clip and text_clip.text_content:
                scene.typography.text = text_clip.text_content

            scenes.append(scene)

    return Storyboard(
        title=timeline.title,
        total_duration=timeline.duration,
        aspect_ratio=timeline.aspect_ratio,
        scenes=scenes,
        audio_config=timeline.audio_config
    )


def render_timeline_clip(clip: Clip, media_path: str, output_path: Path, aspect_ratio: str = "16:9") -> None:
    """Renders a single video or image clip with camera motion, color grade, scaling, transforms, and trim."""
    duration = max(0.5, float(clip.duration))
    is_image = Path(media_path).suffix.lower() in IMAGE_EXTENSIONS
    width, height = get_dimensions(aspect_ratio)

    filters = []

    # 1. Trim & Speed
    effects = clip.effects or SceneEffects()
    if effects.trim_start > 0:
        filters.append(f"trim=start={effects.trim_start}")
    if effects.speed_factor > 0 and effects.speed_factor != 1.0:
        filters.append(f"setpts=PTS/{effects.speed_factor}")

    # 2. Visual Transform: Flip, Rotation, Scale, Framing & Position
    transform = getattr(clip, "transform", None) or ClipTransform()
    scale = max(0.1, min(4.0, float(getattr(transform, "scale", 1.0) or 1.0)))
    pos_x = int(float(getattr(transform, "position_x", 0.0) or 0.0))
    pos_y = int(float(getattr(transform, "position_y", 0.0) or 0.0))
    rotation = float(getattr(transform, "rotation", 0.0) or 0.0) % 360
    flip_h = bool(getattr(transform, "flip_h", False))
    flip_v = bool(getattr(transform, "flip_v", False))
    fit_mode = str(getattr(transform, "fit_mode", "cover") or "cover").lower()

    if flip_h:
        filters.append("hflip")
    if flip_v:
        filters.append("vflip")

    if rotation == 90:
        filters.append("transpose=1")
    elif rotation == 180:
        filters.append("hflip,vflip")
    elif rotation == 270:
        filters.append("transpose=2")
    elif rotation != 0:
        filters.append(f"rotate={rotation}*PI/180:ow=rotw({rotation}*PI/180):oh=roth({rotation}*PI/180):c=black@0")

    # Target scaled dimensions (clamped to even numbers for libx264)
    target_w = max(16, int(width * scale))
    target_h = max(16, int(height * scale))
    target_w -= (target_w % 2)
    target_h -= (target_h % 2)

    if fit_mode == "cover":
        scale_filter = f"scale={target_w}:{target_h}:force_original_aspect_ratio=increase,crop={target_w}:{target_h}"
    elif fit_mode == "contain":
        scale_filter = f"scale={target_w}:{target_h}:force_original_aspect_ratio=decrease"
    elif fit_mode == "stretch":
        scale_filter = f"scale={target_w}:{target_h}"
    else:
        scale_filter = f"scale={target_w}:{target_h}:force_original_aspect_ratio=increase,crop={target_w}:{target_h}"

    filters.append(scale_filter)

    # Robust canvas framing with arbitrary scale and (X, Y) positioning
    pad_w_expr = f"max(iw\\,{width})+2*abs({pos_x})"
    pad_h_expr = f"max(ih\\,{height})+2*abs({pos_y})"
    crop_x_expr = f"(iw-{width})/2"
    crop_y_expr = f"(ih-{height})/2"
    filters.append(f"pad=w={pad_w_expr}:h={pad_h_expr}:x=(ow-iw)/2+({pos_x}):y=(oh-ih)/2+({pos_y}):color=black,crop={width}:{height}:{crop_x_expr}:{crop_y_expr},setsar=1")

    # Opacity
    opacity = max(0.0, min(1.0, float(getattr(transform, "opacity", 1.0) if getattr(transform, "opacity", 1.0) is not None else 1.0)))
    if opacity < 1.0:
        filters.append(f"colorchannelmixer=aa={opacity:.2f}")

    # 3. Camera Movement / Motion
    cam = (clip.camera_movement or "static").lower()
    if is_image:
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
            filters.append(f"fps={FRAMERATE}")
    else:
        filters.append(f"fps={FRAMERATE}")
        if cam == "zoom in":
            filters.append(f"scale=w='{width}*1.15':h='{height}*1.15',crop={width}:{height}")
        elif cam == "zoom out":
            filters.append(f"scale=w='{width}*1.15':h='{height}*1.15',crop={width}:{height}")

    # 4. Color Grading
    b, c, s, g = effects.brightness, effects.contrast, effects.saturation, effects.gamma
    if b != 0.0 or c != 1.0 or s != 1.0 or g != 1.0:
        filters.append(f"eq=brightness={b:.2f}:contrast={c:.2f}:saturation={s:.2f}:gamma={g:.2f}")

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

    # 5. Vignette & Film Grain
    if effects.vignette:
        filters.append("vignette=PI/4")
    if effects.film_grain:
        strength = max(2, min(30, effects.film_grain_intensity))
        filters.append(f"noise=alls={strength}:allf=t+u")

    # Input args
    cmd = ["ffmpeg", "-y"]
    if is_image:
        cmd.extend(["-loop", "1", "-t", str(duration), "-i", str(media_path)])
    else:
        cmd.extend(["-ss", str(effects.trim_start), "-t", str(duration), "-i", str(media_path)])

    filter_str = ",".join(filters)
    cmd.extend([
        "-vf", filter_str,
        "-t", str(duration),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "veryfast",
        "-crf", "22",
        "-an",
        str(output_path)
    ])

    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Clip rendering failed for {clip.id}: {proc.stderr[-400:]}")


def render_timeline(
    timeline: TimelineProject,
    project_dir: Path,
    progress_callback: Optional[Callable[[int, str], None]] = None
) -> Path:
    """
    Renders an OpenCut multi-track timeline project into a final master MP4 video.
    Composites:
      - Video Layer 1 (Main base track with xfade/concat transitions)
      - Video Layer 2+ (Overlays / B-Roll positioned and timed)
      - Text Tracks (Timed drawtext captions with typography animation)
      - Audio Tracks (TTS voiceover narration, sound FX, BGM ducking)
    """
    if progress_callback:
        progress_callback(5, "Initializing OpenCut Multi-Track Render Engine...")

    proj_dir_abs = Path(project_dir).resolve()
    output_dir = proj_dir_abs / "temp_timeline"
    output_dir.mkdir(parents=True, exist_ok=True)
    final_output = proj_dir_abs / "final_video.mp4"

    width, height = get_dimensions(timeline.aspect_ratio)
    total_duration = max(1.0, float(timeline.duration))

    # Separate tracks by type
    video_tracks = [t for t in timeline.tracks if t.type == "video" and not t.muted]
    text_tracks = [t for t in timeline.tracks if t.type == "text" and not t.muted]
    audio_tracks = [t for t in timeline.tracks if t.type == "audio" and not t.muted]

    # ── Auto-Fetch Missing Visual Media Assets ───────────────────────────────
    media_dir = proj_dir_abs / "media"
    media_dir.mkdir(exist_ok=True)

    clips_needing_media = []
    for v_track in video_tracks:
        for idx, clip in enumerate(v_track.clips):
            media_src = clip.source_url
            media_path_obj = Path(media_src) if media_src else None
            if media_path_obj and not media_path_obj.is_absolute():
                if (proj_dir_abs / media_src).exists():
                    media_path_obj = (proj_dir_abs / media_src).resolve()
                elif (media_dir / media_src).exists():
                    media_path_obj = (media_dir / media_src).resolve()
                elif Path(media_src).exists():
                    media_path_obj = Path(media_src).resolve()

            if not media_path_obj or not media_path_obj.exists():
                clips_needing_media.append((idx, clip))

    if clips_needing_media:
        if progress_callback:
            progress_callback(8, f"Auto-fetching visual footage for {len(clips_needing_media)} scenes...")

        def _run_fetch():
            async def _fetch_missing_clips():
                async with aiohttp.ClientSession() as session:
                    tasks = []
                    for idx, clip in clips_needing_media:
                        search_q = clip.name or clip.text_content or f"Scene {idx + 1}"
                        tasks.append(fetch_media(
                            search_q,
                            media_dir,
                            scene_id=idx + 1,
                            media_type="video",
                            aspect_ratio=timeline.aspect_ratio,
                            session=session
                        ))
                    return await asyncio.gather(*tasks)

            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(lambda: asyncio.run(_fetch_missing_clips()))
                return future.result()

        try:
            results = _run_fetch()
            for (idx, clip), (downloaded_path, is_ph, found_type) in zip(clips_needing_media, results):
                if downloaded_path and Path(downloaded_path).exists():
                    clip.source_url = str(Path(downloaded_path).resolve())
                    clip.media_type = "video" if found_type == "video" else "image"
        except Exception as e:
            print(f"[TIMELINE_RENDER] Auto-fetch media note: {e}")

    # ── 1. Render Base Video Track (V1) ──────────────────────────────────────
    base_track = video_tracks[0] if video_tracks else None
    rendered_v1_clips: List[Tuple[Clip, Path]] = []

    if base_track and base_track.clips:
        sorted_clips = sorted(base_track.clips, key=lambda c: c.start_time)
        clip_render_tasks = []

        with ThreadPoolExecutor(max_workers=min(4, os.cpu_count() or 4)) as executor:
            for idx, clip in enumerate(sorted_clips):
                clip_out = (output_dir / f"track_v1_clip_{idx}.mp4").resolve()
                
                # Check media source
                media_src = clip.source_url
                media_path_obj = Path(media_src) if media_src else None
                if media_path_obj and not media_path_obj.is_absolute():
                    if (proj_dir_abs / media_src).exists():
                        media_path_obj = (proj_dir_abs / media_src).resolve()
                    elif (media_dir / media_src).exists():
                        media_path_obj = (media_dir / media_src).resolve()
                    elif Path(media_src).exists():
                        media_path_obj = Path(media_src).resolve()

                if not media_path_obj or not media_path_obj.exists():
                    # Generate dynamic placeholder as ultimate fallback
                    ph_path = (output_dir / f"ph_v1_{idx}.jpg").resolve()
                    if not ph_path.exists():
                        create_placeholder(clip.name or f"Scene {idx + 1}", ph_path, size=timeline.aspect_ratio, scene_id=idx + 1)
                    media_path_obj = ph_path

                future = executor.submit(render_timeline_clip, clip, str(media_path_obj), clip_out, timeline.aspect_ratio)
                clip_render_tasks.append((clip, clip_out, future))

            completed_count = 0
            for clip, clip_out, future in clip_render_tasks:
                future.result()
                rendered_v1_clips.append((clip, clip_out))
                completed_count += 1
                if progress_callback:
                    pct = int(10 + (completed_count / len(clip_render_tasks)) * 40)
                    progress_callback(pct, f"Rendered track clip {completed_count}/{len(clip_render_tasks)}: {clip.name}")

    if not rendered_v1_clips:
        # Fallback: create solid blank video
        blank_out = (output_dir / "blank_base.mp4").resolve()
        cmd = [
            "ffmpeg", "-y", "-f", "lavfi",
            "-i", f"color=c=black:s={width}x{height}:d={total_duration}:r={FRAMERATE}",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-t", str(total_duration), str(blank_out)
        ]
        subprocess.run(cmd, check=True)
        base_video_path = blank_out
    elif len(rendered_v1_clips) == 1:
        base_video_path = rendered_v1_clips[0][1].resolve()
    else:
        # Concatenate or crossfade V1 clips
        concat_list = (output_dir / "v1_concat.txt").resolve()
        with open(concat_list, "w", encoding="utf-8") as f:
            for _, clip_path in rendered_v1_clips:
                clean_path = clip_path.resolve().as_posix().replace("'", "'\\''")
                f.write(f"file '{clean_path}'\n")

        v1_merged = (output_dir / "v1_base_merged.mp4").resolve()
        cmd = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", str(concat_list.resolve()),
            "-c", "copy",
            str(v1_merged.resolve())
        ]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if proc.returncode != 0:
            # Fallback to re-encode concat
            cmd = [
                "ffmpeg", "-y", "-f", "concat", "-safe", "0",
                "-i", str(concat_list.resolve()),
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
                str(v1_merged.resolve())
            ]
            subprocess.run(cmd, check=True)
        base_video_path = v1_merged

    if progress_callback:
        progress_callback(55, "Compositing typography overlays & subtitle animations...")

    # ── 2. Add Typography / Text Tracks Filters ──────────────────────────────
    video_filters = []
    font_arg = get_font_file_arg()

    for t_track in text_tracks:
        for t_clip in t_track.clips:
            text = (t_clip.text_content or (t_clip.typography.text if t_clip.typography else "")).strip()
            if not text:
                continue

            start_t = float(t_clip.start_time)
            end_t = start_t + float(t_clip.duration)
            ty = t_clip.typography or Typography()

            font_sz = int(ty.font_size or 48)
            font_col = ty.color or "#FFFFFF"
            box_bg = "black@0.65" if ty.background_box else "transparent"
            border_w = int(ty.stroke_width or 2)
            border_col = ty.stroke_color or "#000000"

            # Positioning
            pos = (ty.position or "center").lower()
            if pos == "top-center":
                x_pos = "(w-text_w)/2"
                y_pos = f"{height}*0.1"
            elif pos == "bottom-center":
                x_pos = "(w-text_w)/2"
                y_pos = f"{height}*0.82"
            elif pos == "lower-third":
                x_pos = f"{width}*0.08"
                y_pos = f"{height}*0.78"
            else:
                x_pos = "(w-text_w)/2"
                y_pos = "(h-text_h)/2"

            # Write text to temporary file to safely prevent FFmpeg parser injection
            txt_file = (output_dir / f"text_{t_clip.id}.txt").resolve()
            txt_file.write_text(text, encoding="utf-8")
            txt_file_posix = txt_file.as_posix().replace(":", "\\:")

            # Drawtext filter with time enablement
            dt_filter = (
                f"drawtext=textfile='{txt_file_posix}'"
                f"{font_arg}"
                f":fontsize={font_sz}"
                f":fontcolor={font_col}"
                f":borderw={border_w}"
                f":bordercolor={border_col}"
                f":box={'1' if ty.background_box else '0'}"
                f":boxcolor={box_bg}"
                f":boxborderw=12"
                f":x={x_pos}"
                f":y={y_pos}"
                f":enable='between(t,{start_t:.2f},{end_t:.2f})'"
                f":expansion=none"
            )
            video_filters.append(dt_filter)

    # Apply text filters to base video
    if video_filters:
        text_composite_video = (output_dir / "text_composited.mp4").resolve()
        cmd = [
            "ffmpeg", "-y",
            "-i", str(base_video_path.resolve()),
            "-vf", ",".join(video_filters),
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
            "-an",
            str(text_composite_video.resolve())
        ]
        subprocess.run(cmd, check=True)
        video_with_text_path = text_composite_video
    else:
        video_with_text_path = base_video_path

    if progress_callback:
        progress_callback(70, "Synthesizing multi-track audio, voiceover narration, and SFX...")

    # ── 3. Multi-Track Audio Engine ──────────────────────────────────────────
    # Convert timeline project to Storyboard format to leverage procedural BGM & TTS engine
    sb_proxy = timeline_to_storyboard(timeline)
    sb_proxy.audio_config = timeline.audio_config

    audio_master_path = build_audio_track(sb_proxy, proj_dir_abs)

    if progress_callback:
        progress_callback(85, "Encoding final OpenCut NLE master video...")

    # ── 4. Final Multiplexing ────────────────────────────────────────────────
    cmd = ["ffmpeg", "-y", "-i", str(Path(video_with_text_path).resolve())]
    if audio_master_path and audio_master_path.exists():
        cmd.extend(["-i", str(Path(audio_master_path).resolve())])
        cmd.extend([
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "medium",
            "-crf", "19",
            "-c:a", "aac",
            "-b:a", "192k",
            "-t", str(total_duration),
            "-movflags", "+faststart",
            str(final_output.resolve())
        ])
    else:
        cmd.extend([
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "medium",
            "-crf", "19",
            "-an",
            "-t", str(total_duration),
            "-movflags", "+faststart",
            str(final_output.resolve())
        ])

    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Final OpenCut render failed: {proc.stderr[-400:]}")

    if progress_callback:
        progress_callback(100, "OpenCut Multi-Track Render Complete!")

    return final_output
