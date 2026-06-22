from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from enum import Enum

class ShotType(str, Enum):
    WIDE = "wide"
    MEDIUM = "medium"
    CLOSE_UP = "close-up"
    AERIAL = "aerial"

class CameraMovement(str, Enum):
    STATIC = "static"
    PAN_LEFT = "pan left"
    PAN_RIGHT = "pan right"
    ZOOM_IN = "zoom in"
    ZOOM_OUT = "zoom out"
    KEN_BURNS = "ken burns"

class Transition(str, Enum):
    CUT = "cut"
    FADE = "fade"
    DISSOLVE = "dissolve"
    SLIDE_LEFT = "slide left"
    SLIDE_RIGHT = "slide right"

class Typography(BaseModel):
    text: Optional[str] = None
    position: Literal["top-center", "bottom-center", "lower-third", "center"] = "center"
    animation: Literal["typewriter", "fade-in", "slide-up", "bounce", "none"] = "fade-in"
    font_style: Literal["bold", "regular", "light"] = "bold"
    color: str = "#FFFFFF"

class SFX(BaseModel):
    description: str
    mood: Literal["calm", "tense", "uplifting", "dramatic"] = "calm"
    volume_db: int = Field(default=-12, ge=-60, le=0)

class Scene(BaseModel):
    scene_id: int
    start_time: str
    end_time: str
    duration_seconds: float = Field(gt=0, le=60)
    visual_prompt: str = Field(max_length=100)
    fallback_text: str = Field(max_length=200)
    shot_type: ShotType = ShotType.MEDIUM
    camera_movement: CameraMovement = CameraMovement.STATIC
    transition_in: Transition = Transition.CUT
    transition_out: Transition = Transition.CUT
    motion_graphics: List[str] = []
    typography: Typography = Field(default_factory=Typography)
    sfx: Optional[SFX] = None
    voiceover_text: Optional[str] = None
    caption_highlight_words: List[str] = []

class Storyboard(BaseModel):
    title: str
    total_duration: float
    aspect_ratio: Literal["16:9", "9:16", "1:1"] = "16:9"
    scenes: List[Scene]
    music: dict = Field(default_factory=dict)
    color_grade: dict = Field(default_factory=dict)

class VideoRequest(BaseModel):
    topic: str
    duration_seconds: int = Field(default=60, ge=15, le=300)
    style: Literal["cinematic", "educational", "vlog", "promotional"] = "educational"
    platform: Literal["youtube", "tiktok", "instagram", "linkedin"] = "youtube"

class ProjectState(BaseModel):
    project_id: str
    storyboard: Optional[Storyboard] = None
    media_assets: List[dict] = []
    captions: List[dict] = []
    render_status: Literal["idle", "rendering", "done", "error"] = "idle"
    output_path: Optional[str] = None