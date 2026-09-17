from pydantic import BaseModel, Field
from typing import List, Optional


class Typography(BaseModel):
    text: Optional[str] = None
    position: str = "center"          # top-center, center, bottom-center, lower-third
    animation: str = "fade-in"        # typewriter, fade-in, slide-up, bounce, none
    font_style: str = "bold"
    font_size: int = 48
    color: str = "#FFFFFF"
    stroke_color: str = "#000000"
    stroke_width: int = 2
    background_box: bool = True


class SFX(BaseModel):
    description: str = ""
    mood: str = "calm"
    volume_db: int = -12


class SceneEffects(BaseModel):
    # ── Trim & Speed ──────────────────────────────
    trim_start: float = 0.0         # seconds to skip from media start
    speed_factor: float = 1.0       # 0.25=4×slow, 0.5=2×slow, 1=normal, 2=2×fast, 4=4×fast

    # ── Color Correction (FFmpeg eq filter) ───────
    brightness: float = 0.0         # -0.5 to 0.5
    contrast: float = 1.0           # 0.5 to 2.0
    saturation: float = 1.0         # 0.0 to 3.0
    gamma: float = 1.0              # 0.5 to 2.5

    # ── Color Grade Preset ────────────────────────
    color_grade_preset: str = "none"  # none, warm, cool, cinematic, bw, vintage, teal_orange, horror, golden_hour

    # ── Visual FX ─────────────────────────────────
    vignette: bool = False
    film_grain: bool = False
    film_grain_intensity: int = 8   # 2–30
    letterbox: bool = False         # cinematic black bars

    # ── VFX – Chroma Key ─────────────────────────
    chroma_key: bool = False
    chroma_key_color: str = "#00FF00"
    chroma_key_similarity: float = 0.15

    # ── Audio (scene level) ───────────────────────
    audio_volume: float = 1.0       # 0.0–2.0


class Scene(BaseModel):
    scene_id: int = 1
    start_time: str = "0:00"
    end_time: str = "0:05"
    duration_seconds: float = 5.0
    visual_prompt: str = ""
    fallback_text: str = ""
    shot_type: str = "medium"
    camera_movement: str = "static"
    transition_in: str = "cut"
    transition_out: str = "cut"
    motion_graphics: List[str] = []
    typography: Typography = Field(default_factory=Typography)
    sfx: Optional[SFX] = None
    voiceover_text: Optional[str] = None
    caption_highlight_words: List[str] = []
    effects: SceneEffects = Field(default_factory=SceneEffects)


class Storyboard(BaseModel):
    title: str = "Untitled Video"
    total_duration: float = 15.0
    aspect_ratio: str = "16:9"
    scenes: List[Scene] = []
    music: dict = Field(default_factory=dict)
    color_grade: dict = Field(default_factory=dict)


class VideoRequest(BaseModel):
    topic: str
    duration_seconds: int = 60
    style: str = "educational"
    platform: str = "youtube"


class ProjectState(BaseModel):
    project_id: str
    storyboard: Optional[Storyboard] = None
    media_assets: List[dict] = []
    captions: List[dict] = []
    render_status: str = "idle"
    output_path: Optional[str] = None