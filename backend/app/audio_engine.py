import os
import subprocess
import shutil
import json
from pathlib import Path
from typing import Optional, List, Tuple

from .models import Storyboard, Scene, AudioConfig


def ensure_ffmpeg_in_path():
    if shutil.which("ffmpeg"):
        return
    potential_paths = [
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0-full_build/bin",
        Path("C:/ffmpeg/bin"),
        Path("C:/Program Files/ffmpeg/bin")
    ]
    for p in potential_paths:
        if p.exists() and (p / "ffmpeg.exe").exists():
            os.environ["PATH"] = str(p) + os.pathsep + os.environ.get("PATH", "")
            return

ensure_ffmpeg_in_path()


def sanitize_speech_text(text: str) -> str:
    """Cleans text for speech synthesis, removing special symbols and quotes"""
    if not text:
        return ""
    cleaned = text.replace('"', '').replace("'", "").replace("`", "")
    cleaned = cleaned.replace("&", " and ").replace("%", " percent ")
    cleaned = cleaned.replace("#", " number ").replace("@", " at ")
    cleaned = " ".join(cleaned.split())
    return cleaned


def generate_scene_voiceover_windows(
    text: str,
    output_wav: Path,
    gender: str = "male",
    tone: str = "professional"
) -> bool:
    """
    Generates TTS voiceover audio using Windows SAPI SpeechSynthesizer via PowerShell.
    Works natively on Windows with 0 external dependencies.
    """
    clean_text = sanitize_speech_text(text)
    if not clean_text:
        return False

    rate = 0
    t = tone.lower()
    if "energetic" in t or "fast" in t or "hype" in t:
        rate = 2
    elif "calm" in t or "storyteller" in t or "slow" in t:
        rate = -2
    elif "cinematic" in t or "deep" in t:
        rate = -1

    g = gender.lower()
    gender_enum = "Female" if "female" in g else "Male"

    # PowerShell script to select gender and render wav
    ps_lines = [
        "Add-Type -AssemblyName System.Speech",
        "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
        f"$synth.Rate = {rate}",
        f"try {{ $synth.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::{gender_enum}) }} catch {{ }}",
        f"$synth.SetOutputToWaveFile('{output_wav.resolve().as_posix()}')",
        f"$synth.Speak('{clean_text}')",
        "$synth.Dispose()"
    ]
    ps_script = "\n".join(ps_lines)

    try:
        res = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
            capture_output=True,
            text=True,
            timeout=15
        )
        return output_wav.exists() and output_wav.stat().st_size > 1000
    except Exception as e:
        print(f"[AUDIO] Windows SAPI TTS error: {e}")
        return False


def generate_procedural_bgm(
    genre: str,
    duration: float,
    output_wav: Path,
    volume: float = 0.15
) -> Path:
    """
    Generates royalty-free open-source synthesized background music using FFmpeg audio synthesis filtergraphs.
    Completely procedural with 0 external audio assets required.
    """
    dur = max(2.0, float(duration))
    vol = max(0.01, min(1.0, float(volume)))
    genre_key = (genre or "upbeat_tech").lower()

    if genre_key in ["none", "mute", "off"]:
        # Generate silent audio stream
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", f"anullsrc=r=44100:cl=stereo",
            "-t", str(dur),
            "-c:a", "pcm_s16le",
            str(output_wav)
        ]
    elif "cinematic" in genre_key or "ambient" in genre_key:
        # Cinematic Ambient: Lush sub-bass drone + evolving minor 9th pads with chorus & reverb
        filt = (
            f"aevalsrc='0.35*sin(2*PI*65.4*t) + 0.25*sin(2*PI*98*t) + 0.2*sin(2*PI*155.6*t) + 0.15*sin(2*PI*233*t) + 0.1*sin(2*PI*293.7*t*1.002)':s=44100:d={dur},"
            f"flanger=delay=15:depth=4:regen=20:width=80:speed=0.2,"
            f"lowpass=f=1200,"
            f"volume={vol * 0.9:.3f},"
            f"afade=t=in:ss=0:d=1.5,afade=t=out:st={max(0.5, dur - 2.0)}:d=2.0"
        )
        cmd = ["ffmpeg", "-y", "-f", "lavfi", "-i", filt, "-c:a", "pcm_s16le", str(output_wav)]
    elif "lofi" in genre_key or "chill" in genre_key:
        # Lo-Fi Chill: Warm retro Rhodes chord progression + vinyl tape texture
        filt = (
            f"aevalsrc='0.25*sin(2*PI*174.6*t)*exp(-3*mod(t,2)) + 0.2*sin(2*PI*220*t)*exp(-3*mod(t,2)) + 0.2*sin(2*PI*261.6*t)*exp(-3*mod(t,2)) + 0.15*sin(2*PI*329.6*t)*exp(-3*mod(t,2)) + 0.04*(random(0)-0.5)':s=44100:d={dur},"
            f"tremolo=f=3.5:d=0.35,"
            f"lowpass=f=900,"
            f"volume={vol * 1.1:.3f},"
            f"afade=t=in:ss=0:d=1.0,afade=t=out:st={max(0.5, dur - 1.5)}:d=1.5"
        )
        cmd = ["ffmpeg", "-y", "-f", "lavfi", "-i", filt, "-c:a", "pcm_s16le", str(output_wav)]
    elif "high_energy" in genre_key or "electronic" in genre_key:
        # High Energy Electronic: 130 BPM pulsing synth bass + octave lead
        filt = (
            f"aevalsrc='0.4*sin(2*PI*55*t*(1+0.5*mod(floor(t*4.33),2)))*exp(-4*mod(t,0.23)) + 0.25*sin(2*PI*220*t*(1+0.25*mod(floor(t*8.66),4)))*exp(-6*mod(t,0.115))':s=44100:d={dur},"
            f"volume={vol * 0.85:.3f},"
            f"afade=t=in:ss=0:d=0.5,afade=t=out:st={max(0.5, dur - 1.0)}:d=1.0"
        )
        cmd = ["ffmpeg", "-y", "-f", "lavfi", "-i", filt, "-c:a", "pcm_s16le", str(output_wav)]
    elif "corporate" in genre_key or "inspire" in genre_key:
        # Corporate Inspiring: Uplifting Major harmony with rhythmic acoustic attack
        filt = (
            f"aevalsrc='0.3*sin(2*PI*146.8*t)*exp(-2*mod(t,1)) + 0.25*sin(2*PI*185.0*t)*exp(-2*mod(t,1)) + 0.25*sin(2*PI*220.0*t)*exp(-2*mod(t,1)) + 0.2*sin(2*PI*293.7*t)*exp(-2*mod(t,1))':s=44100:d={dur},"
            f"chorus=0.7:0.9:55:0.4:0.25:2,"
            f"volume={vol * 1.0:.3f},"
            f"afade=t=in:ss=0:d=1.0,afade=t=out:st={max(0.5, dur - 1.5)}:d=1.5"
        )
        cmd = ["ffmpeg", "-y", "-f", "lavfi", "-i", filt, "-c:a", "pcm_s16le", str(output_wav)]
    else:
        # Upbeat Tech (Default): Modern futuristic arpeggio progression
        filt = (
            f"aevalsrc='0.3*sin(2*PI*110*t*(1+0.5*mod(floor(t*4),4)))*exp(-3*mod(t,0.25)) + 0.2*sin(2*PI*220*t*(1+0.25*mod(floor(t*8),8)))*exp(-5*mod(t,0.125)) + 0.15*sin(2*PI*440*t*(1+0.125*mod(floor(t*8),4)))':s=44100:d={dur},"
            f"flanger=delay=5:depth=2:speed=0.5,"
            f"volume={vol * 0.95:.3f},"
            f"afade=t=in:ss=0:d=0.8,afade=t=out:st={max(0.5, dur - 1.5)}:d=1.5"
        )
        cmd = ["ffmpeg", "-y", "-f", "lavfi", "-i", filt, "-c:a", "pcm_s16le", str(output_wav)]

    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[AUDIO] Procedural BGM generation error: {res.stderr}")
        subprocess.run([
            "ffmpeg", "-y", "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo", "-t", str(dur), "-c:a", "pcm_s16le", str(output_wav)
        ], capture_output=True)

    return output_wav


def build_audio_track(
    storyboard: Storyboard,
    project_dir: Path
) -> Optional[Path]:
    """
    Builds the complete master soundtrack for the video:
    1. Synthesizes voiceover narration for each scene.
    2. Synthesizes open-source royalty-free background music matching genre and duration.
    3. Mixes down to a single clean master AAC stereo track.
    """
    total_dur = max(2.0, float(storyboard.total_duration))
    audio_cfg = storyboard.audio_config or AudioConfig()
    
    audio_dir = project_dir / "audio"
    audio_dir.mkdir(exist_ok=True)
    master_audio_path = project_dir / "master_audio.wav"

    # 1. Background Music Track
    bgm_path = audio_dir / "bgm.wav"
    generate_procedural_bgm(
        genre=audio_cfg.background_music,
        duration=total_dur,
        output_wav=bgm_path,
        volume=audio_cfg.music_volume
    )

    # 2. Voiceover Track
    voiceover_files = []
    current_time = 0.0

    if audio_cfg.voiceover_enabled:
        for idx, scene in enumerate(storyboard.scenes):
            vo_text = scene.voiceover_text or ""
            if vo_text.strip():
                scene_vo_path = audio_dir / f"scene_{idx:03d}_vo.wav"
                success = generate_scene_voiceover_windows(
                    text=vo_text,
                    output_wav=scene_vo_path,
                    gender=audio_cfg.voiceover_gender,
                    tone=audio_cfg.voiceover_tone
                )
                if success:
                    voiceover_files.append((current_time, scene_vo_path))
            current_time += float(scene.duration_seconds or 5.0)

    # 3. Assemble Voiceover Full Track
    full_vo_path = audio_dir / "voiceover_full.wav"
    has_voiceover = len(voiceover_files) > 0

    if has_voiceover:
        inputs = []
        filter_parts = []
        for i, (offset_sec, vo_file) in enumerate(voiceover_files):
            inputs.extend(["-i", str(vo_file)])
            delay_ms = int(offset_sec * 1000)
            filter_parts.append(f"[{i}]adelay={delay_ms}|{delay_ms}[v{i}]")

        mix_inputs = "".join(f"[v{i}]" for i in range(len(voiceover_files)))
        filter_parts.append(f"{mix_inputs}amix=inputs={len(voiceover_files)}:duration=first:dropout_transition=0,volume=1.3[vo_out]")

        vo_filter_str = ";".join(filter_parts)
        cmd = ["ffmpeg", "-y"] + inputs + [
            "-filter_complex", vo_filter_str,
            "-map", "[vo_out]",
            "-t", str(total_dur),
            "-c:a", "pcm_s16le",
            str(full_vo_path)
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            has_voiceover = False

    # 4. Master Mixdown: BGM + Voiceover
    if has_voiceover and full_vo_path.exists():
        mix_filter = (
            f"[0:a]volume=1.0[bgm];"
            f"[1:a]volume=1.2[vo];"
            f"[bgm][vo]amix=inputs=2:duration=first:dropout_transition=2,volume=1.1[out]"
        )
        cmd = [
            "ffmpeg", "-y",
            "-i", str(bgm_path),
            "-i", str(full_vo_path),
            "-filter_complex", mix_filter,
            "-map", "[out]",
            "-t", str(total_dur),
            "-c:a", "pcm_s16le",
            str(master_audio_path)
        ]
        subprocess.run(cmd, capture_output=True)
    else:
        shutil.copyfile(bgm_path, master_audio_path)

    return master_audio_path if master_audio_path.exists() else None
