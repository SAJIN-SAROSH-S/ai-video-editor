import subprocess
import json
from pathlib import Path
from typing import List, Dict

def generate_captions(audio_path: Path, project_dir: Path) -> List[Dict]:
    """
    Uses Whisper.cpp to generate word-level timestamps
    Returns: [{"word": "hello", "start": 0.0, "end": 0.5, "scene_id": 1}, ...]
    """
    # Run whisper.cpp (assumes binary is installed)
    output_json = project_dir / "whisper_output.json"
    
    cmd = [
        "whisper-cli",  # or ./main depending on your whisper.cpp build
        "-m", "models/ggml-tiny.bin",  # Download tiny model (~75MB)
        "-f", str(audio_path),
        "-oj",  # Output JSON
        "-of", str(project_dir / "whisper_output")
    ]
    
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=300)
        
        with open(f"{project_dir}/whisper_output.json") as f:
            data = json.load(f)
        
        captions = []
        for segment in data.get("transcription", []):
            for word in segment.get("words", []):
                captions.append({
                    "word": word["word"].strip(),
                    "start": word["start"],
                    "end": word["end"],
                    "confidence": word.get("probability", 1.0)
                })
        return captions
    except Exception as e:
        print(f"Caption generation failed: {e}")
        return []

def burn_captions(video_path: Path, captions: List[Dict], output_path: Path, style: dict = None):
    """Burns captions into video with highlight support"""
    if not captions:
        return video_path
    
    # Generate ASS subtitle file
    ass_path = output_path.with_suffix('.ass')
    
    # Simple ASS header
    ass_content = """[Script Info]
Title: AI Generated Captions
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    
    # Group words into lines (max 6 words per line)
    lines = []
    current_line = []
    for cap in captions:
        current_line.append(cap)
        if len(current_line) >= 6:
            lines.append(current_line)
            current_line = []
    if current_line:
        lines.append(current_line)
    
    for line in lines:
        start = format_time(line[0]["start"])
        end = format_time(line[-1]["end"])
        text = " ".join([c["word"] for c in line])
        # Highlight logic would go here (color changes for highlight words)
        ass_content += f"Dialogue: 0,{start},{end},Default,,0,0,0,,{text}\n"
    
    with open(ass_path, 'w') as f:
        f.write(ass_content)
    
    # Burn subtitles
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-vf", f"ass={ass_path}",
        "-c:a", "copy",
        str(output_path)
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return output_path

def format_time(seconds: float) -> str:
    """Convert seconds to ASS time format H:MM:SS.cc"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int((seconds % 1) * 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"