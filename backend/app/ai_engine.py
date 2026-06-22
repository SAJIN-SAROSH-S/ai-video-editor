import json
import re
import ollama
from .models import VideoRequest, Storyboard

SYSTEM_PROMPT = """You are an expert video producer. Given a topic, create a detailed video storyboard optimized for stock footage assembly.

OUTPUT RULES:
1. Return ONLY valid JSON. No markdown, no explanations.
2. visual_prompt must be 3-5 words, generic enough for stock APIs.
3. Each scene: 3-10 seconds.
4. Sum of scene durations must equal total_duration exactly.
5. fallback_text should describe what's needed if stock isn't found.
6. Include motion_graphics like "lower third", "stat counter", or "none".
7. sfx.description should be searchable on Freesound.org.

JSON SCHEMA:
{
  "title": "string",
  "total_duration": number,
  "aspect_ratio": "16:9",
  "scenes": [
    {
      "scene_id": 1,
      "start_time": "0:00",
      "end_time": "0:08",
      "duration_seconds": 8,
      "visual_prompt": "melting glacier aerial",
      "fallback_text": "Aerial shot of melting glacier with blue ice",
      "shot_type": "aerial",
      "camera_movement": "zoom in",
      "transition_in": "fade",
      "transition_out": "cut",
      "motion_graphics": ["lower third"],
      "typography": {"text": "The Ice is Disappearing", "position": "center", "animation": "fade-in", "font_style": "bold", "color": "#FFFFFF"},
      "sfx": {"description": "wind ambient arctic", "mood": "calm", "volume_db": -15},
      "voiceover_text": "Every year, we lose 36 billion tons of ice.",
      "caption_highlight_words": ["36 billion tons"]
    }
  ],
  "music": {"genre": "cinematic", "bpm_range": "80-100", "mood": "inspirational", "volume_db": -18},
  "color_grade": {"preset": "cool", "contrast": "high"}
}"""

def generate_storyboard(request: VideoRequest) -> Storyboard:
    user_prompt = f"""Create a {request.duration_seconds}s {request.style} video storyboard for: "{request.topic}"
Platform: {request.platform}
Style: {request.style}"""
    
    response = ollama.chat(
        model='phi4-mini',
        messages=[
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': user_prompt}
        ],
        options={'temperature': 0.7, 'num_predict': 4000}
    )
    
    content = response['message']['content']
    
    # Extract JSON from response (handle potential markdown)
    json_match = re.search(r'\{.*\}', content, re.DOTALL)
    if not json_match:
        raise ValueError("AI did not return valid JSON")
    
    data = json.loads(json_match.group())
    return Storyboard(**data)