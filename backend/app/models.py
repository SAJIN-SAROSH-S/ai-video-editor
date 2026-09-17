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
    transform: 'ClipTransform' = Field(default_factory=lambda: ClipTransform())


class AudioConfig(BaseModel):
    voiceover_enabled: bool = True
    voiceover_gender: str = "male"          # male, female, neutral, none
    voiceover_type: str = "narrator"        # narrator, storyteller, host, deep_authority, friendly_guide
    voiceover_tone: str = "professional"    # professional, energetic, cinematic, warm, calm, inspiring
    background_music: str = "upbeat_tech"   # upbeat_tech, cinematic_ambient, lofi_chill, high_energy, corporate_inspire, none
    music_volume: float = 0.15              # 0.0 to 1.0 (subtle background mix)
    sfx_enabled: bool = True
    sfx_pack: str = "whoosh_hits"           # whoosh_hits, cyber_glitch, subtle_pops, risers, none


class Storyboard(BaseModel):
    title: str = "Untitled Video"
    total_duration: float = 15.0
    aspect_ratio: str = "16:9"
    scenes: List[Scene] = []
    audio_config: AudioConfig = Field(default_factory=AudioConfig)
    music: dict = Field(default_factory=dict)
    color_grade: dict = Field(default_factory=dict)


class ClipTransform(BaseModel):
    scale: float = 1.0                # 0.1 to 3.0x
    position_x: float = 0.0           # Horizontal offset (-500 to +500 px or normalized)
    position_y: float = 0.0           # Vertical offset (-500 to +500 px or normalized)
    rotation: float = 0.0             # Rotation in degrees (0, 90, 180, 270, or arbitrary angle)
    opacity: float = 1.0              # 0.0 to 1.0
    flip_h: bool = False              # Horizontal mirror
    flip_v: bool = False              # Vertical flip
    fit_mode: str = "cover"           # cover (fill frame), contain (fit with letterbox), stretch, center_crop
    bg_fill_mode: str = "black"       # black, blur_fill, transparent


class ClipTransition(BaseModel):
    transition_type: str = "cut"
    duration: float = 0.5


class Clip(BaseModel):
    id: str
    track_id: str
    name: str = ""
    media_type: str = "video"         # video, image, audio, text, color
    start_time: float = 0.0           # timeline offset (seconds)
    duration: float = 5.0             # duration on timeline (seconds)
    trim_in: float = 0.0              # source in-point (seconds)
    trim_out: Optional[float] = None  # source out-point (seconds)
    source_url: Optional[str] = None
    text_content: Optional[str] = None
    typography: Typography = Field(default_factory=Typography)
    effects: SceneEffects = Field(default_factory=SceneEffects)
    transform: ClipTransform = Field(default_factory=ClipTransform)
    transition_in: ClipTransition = Field(default_factory=ClipTransition)
    transition_out: ClipTransition = Field(default_factory=ClipTransition)
    volume: float = 1.0
    camera_movement: str = "static"


class Track(BaseModel):
    id: str
    name: str = "Track"
    type: str = "video"               # video, audio, text, effect
    muted: bool = False
    locked: bool = False
    volume: float = 1.0
    order: int = 0
    clips: List[Clip] = Field(default_factory=list)


class TimelineProject(BaseModel):
    id: str = ""
    title: str = "Untitled Timeline"
    aspect_ratio: str = "16:9"
    duration: float = 15.0
    fps: int = 25
    tracks: List[Track] = Field(default_factory=list)
    audio_config: AudioConfig = Field(default_factory=AudioConfig)


class VideoRequest(BaseModel):
    topic: str
    duration_seconds: int = 60
    style: str = "educational"
    platform: str = "youtube"


class ProjectState(BaseModel):
    project_id: str
    storyboard: Optional[Storyboard] = None
    timeline: Optional[TimelineProject] = None
    media_assets: List[dict] = []
    captions: List[dict] = []
    render_status: str = "idle"
    output_path: Optional[str] = None