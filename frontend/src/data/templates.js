export const SAMPLE_TEMPLATES = [
  {
    id: 'tech-explainer',
    name: '🤖 Tech Explainer (AI Revolution)',
    description: 'Educational 3-scene video about artificial intelligence with sleek captions and zoom effects.',
    storyboard: {
      title: "The AI Revolution Explained",
      total_duration: 15,
      aspect_ratio: "16:9",
      scenes: [
        {
          scene_id: 1,
          start_time: "0:00",
          end_time: "0:05",
          duration_seconds: 5,
          visual_prompt: "futuristic artificial intelligence neural network server room",
          fallback_text: "Futuristic digital neural network with glowing light nodes",
          shot_type: "wide",
          camera_movement: "zoom in",
          transition_in: "cut",
          transition_out: "cut",
          motion_graphics: ["lower third"],
          typography: {
            text: "The AI Revolution is Here",
            position: "center",
            animation: "fade-in",
            font_style: "bold",
            color: "#FFFFFF"
          },
          voiceover_text: "Artificial intelligence is transforming every industry across the globe."
        },
        {
          scene_id: 2,
          start_time: "0:05",
          end_time: "0:10",
          duration_seconds: 5,
          visual_prompt: "robotics arm working high tech factory automation",
          fallback_text: "Automated robotic arms assembling advanced technology",
          shot_type: "medium",
          camera_movement: "pan right",
          transition_in: "cut",
          transition_out: "cut",
          motion_graphics: [],
          typography: {
            text: "Automation & Robotics",
            position: "bottom-center",
            animation: "fade-in",
            font_style: "bold",
            color: "#60A5FA"
          },
          voiceover_text: "From manufacturing to medicine, machine intelligence accelerates innovation."
        },
        {
          scene_id: 3,
          start_time: "0:10",
          end_time: "0:15",
          duration_seconds: 5,
          visual_prompt: "person using laptop with holographic modern interface",
          fallback_text: "Professional using modern workstation with futuristic analytics",
          shot_type: "close-up",
          camera_movement: "ken burns",
          transition_in: "cut",
          transition_out: "cut",
          motion_graphics: [],
          typography: {
            text: "Shape the Future",
            position: "center",
            animation: "fade-in",
            font_style: "bold",
            color: "#34D399"
          },
          voiceover_text: "Are you ready to build the future with AI?"
        }
      ],
      music: { genre: "electronic", mood: "inspiring", volume_db: -18 },
      color_grade: { preset: "cool", contrast: "high" }
    }
  },
  {
    id: 'cinematic-nature',
    name: '🏔️ Cinematic Nature (Alpine Peaks)',
    description: 'Breathtaking 3-scene landscape reel with slow pans and majestic typography.',
    storyboard: {
      title: "Alpine Horizons",
      total_duration: 18,
      aspect_ratio: "16:9",
      scenes: [
        {
          scene_id: 1,
          start_time: "0:00",
          end_time: "0:06",
          duration_seconds: 6,
          visual_prompt: "snowy mountain peaks sunrise aerial drone high resolution",
          fallback_text: "Majestic snow-capped mountain peaks bathed in golden morning sunrise",
          shot_type: "aerial",
          camera_movement: "zoom out",
          transition_in: "fade",
          transition_out: "cut",
          motion_graphics: [],
          typography: {
            text: "Untamed Wilderness",
            position: "center",
            animation: "fade-in",
            font_style: "bold",
            color: "#FFFFFF"
          },
          voiceover_text: "High above the clouds, quiet majesty reigns untouched."
        },
        {
          scene_id: 2,
          start_time: "0:06",
          end_time: "0:12",
          duration_seconds: 6,
          visual_prompt: "pine forest alpine mountain lake reflection clear water",
          fallback_text: "Crystal clear alpine mountain lake reflecting pine tree forest",
          shot_type: "wide",
          camera_movement: "pan left",
          transition_in: "cut",
          transition_out: "cut",
          motion_graphics: [],
          typography: {
            text: "Reflections of Peace",
            position: "bottom-center",
            animation: "fade-in",
            font_style: "bold",
            color: "#FDE047"
          },
          voiceover_text: "Pristine waters mirror timeless natural wonder."
        },
        {
          scene_id: 3,
          start_time: "0:12",
          end_time: "0:18",
          duration_seconds: 6,
          visual_prompt: "hiker standing mountain summit sunset scenic view",
          fallback_text: "Solitary adventurer overlooking vast mountain valley at golden hour",
          shot_type: "wide",
          camera_movement: "ken burns",
          transition_in: "cut",
          transition_out: "cut",
          motion_graphics: [],
          typography: {
            text: "Explore Beyond",
            position: "center",
            animation: "fade-in",
            font_style: "bold",
            color: "#FFFFFF"
          },
          voiceover_text: "Every summit reached opens a horizon of new possibilities."
        }
      ],
      music: { genre: "cinematic", mood: "epic", volume_db: -16 },
      color_grade: { preset: "warm", contrast: "cinematic" }
    }
  },
  {
    id: 'viral-productivity',
    name: '⚡ Viral Short (3 Peak Habits)',
    description: 'Fast-paced vertical/horizontal short with punchy typography and dynamic moves.',
    storyboard: {
      title: "3 Habits of Top Performers",
      total_duration: 15,
      aspect_ratio: "16:9",
      scenes: [
        {
          scene_id: 1,
          start_time: "0:00",
          end_time: "0:05",
          duration_seconds: 5,
          visual_prompt: "person running early morning sunrise focus discipline athlete",
          fallback_text: "Athlete running at dawn with intense determination",
          shot_type: "medium",
          camera_movement: "zoom in",
          transition_in: "cut",
          transition_out: "cut",
          motion_graphics: ["lower third"],
          typography: {
            text: "1. Early Execution",
            position: "top-center",
            animation: "fade-in",
            font_style: "bold",
            color: "#EF4444"
          },
          voiceover_text: "Top performers win the day before the rest of the world wakes up."
        },
        {
          scene_id: 2,
          start_time: "0:05",
          end_time: "0:10",
          duration_seconds: 5,
          visual_prompt: "close up writing notebook strategic planning focus coffee",
          fallback_text: "Writing key strategic goals in notebook with coffee cup nearby",
          shot_type: "close-up",
          camera_movement: "pan right",
          transition_in: "cut",
          transition_out: "cut",
          motion_graphics: [],
          typography: {
            text: "2. Deep Focus Hours",
            position: "center",
            animation: "fade-in",
            font_style: "bold",
            color: "#F59E0B"
          },
          voiceover_text: "Eliminate distractions and dedicate two hours to uninterrupted deep work."
        },
        {
          scene_id: 3,
          start_time: "0:10",
          end_time: "0:15",
          duration_seconds: 5,
          visual_prompt: "team celebrating success high five modern office victory",
          fallback_text: "Energetic team celebrating project completion with high fives",
          shot_type: "medium",
          camera_movement: "zoom out",
          transition_in: "cut",
          transition_out: "cut",
          motion_graphics: [],
          typography: {
            text: "3. Consistent Compound Growth",
            position: "bottom-center",
            animation: "fade-in",
            font_style: "bold",
            color: "#10B981"
          },
          voiceover_text: "Small daily habits compound into extraordinary long-term success."
        }
      ],
      music: { genre: "upbeat", mood: "energetic", volume_db: -15 },
      color_grade: { preset: "vivid", contrast: "high" }
    }
  }
];

export const LLM_PROMPT_SKILLS = [
  {
    id: 'general-explainer',
    name: '🧠 Explainer & Educational Video',
    description: 'Prompt designed for Claude / ChatGPT / Gemini to build structured 30-60s explainers.',
    prompt: `You are an expert video producer and director. Generate a detailed JSON storyboard for a 30-second educational video about: "[YOUR TOPIC HERE]".

CRITICAL REQUIREMENT: Return ONLY raw, valid JSON with NO markdown formatting, NO backticks (\`\`\`json), and NO conversational text.

The JSON MUST conform exactly to this schema:
{
  "title": "Short Descriptive Title",
  "total_duration": 30,
  "aspect_ratio": "16:9",
  "scenes": [
    {
      "scene_id": 1,
      "start_time": "0:00",
      "end_time": "0:06",
      "duration_seconds": 6,
      "visual_prompt": "3-5 stock search words like drone glacier aerial",
      "fallback_text": "Detailed fallback description if stock media is unavailable",
      "shot_type": "aerial",
      "camera_movement": "zoom in",
      "transition_in": "cut",
      "transition_out": "cut",
      "motion_graphics": ["lower third"],
      "typography": {
        "text": "On-Screen Title Overlay",
        "position": "center",
        "animation": "fade-in",
        "font_style": "bold",
        "color": "#FFFFFF"
      },
      "voiceover_text": "Voiceover line for scene 1."
    }
  ],
  "music": { "genre": "cinematic", "mood": "inspirational", "volume_db": -18 },
  "color_grade": { "preset": "cool", "contrast": "high" }
}

Notes for scene building:
- Allowed shot_type: "wide", "medium", "close-up", "aerial"
- Allowed camera_movement: "static", "pan left", "pan right", "zoom in", "zoom out", "ken burns"
- Allowed typography position: "top-center", "bottom-center", "lower-third", "center"
- Make visual_prompt concise (3-5 English words max) so stock media APIs can easily find clips.`
  },
  {
    id: 'viral-reels',
    name: '📱 Viral Shorts & Instagram Reels',
    description: 'High-hook prompt optimized for short-form viral engagement.',
    prompt: `You are an elite short-form video creator for TikTok and Instagram Reels. Create a punchy 15-second storyboard JSON about: "[YOUR TOPIC HERE]".

CRITICAL REQUIREMENT: Return ONLY raw, valid JSON with NO markdown formatting, NO backticks, and NO extra text.

JSON Schema:
{
  "title": "Viral Hook Title",
  "total_duration": 15,
  "aspect_ratio": "16:9",
  "scenes": [
    {
      "scene_id": 1,
      "start_time": "0:00",
      "end_time": "0:05",
      "duration_seconds": 5,
      "visual_prompt": "high energy fast movement action stock search words",
      "fallback_text": "Visual description of strong hook scene",
      "shot_type": "close-up",
      "camera_movement": "zoom in",
      "transition_in": "cut",
      "transition_out": "cut",
      "motion_graphics": ["lower third"],
      "typography": {
        "text": "ATTENTION GRABBING HOOK",
        "position": "top-center",
        "animation": "fade-in",
        "font_style": "bold",
        "color": "#FFD700"
      },
      "voiceover_text": "Did you know this crazy fact?"
    }
  ],
  "music": { "genre": "hip hop", "mood": "energetic", "volume_db": -15 },
  "color_grade": { "preset": "vivid", "contrast": "high" }
}`
  },
  {
    id: 'motion-graphics',
    name: '✨ Motion Graphics & Pacing',
    description: 'Prompt for storytelling with animated text, visual effects, and smooth rhythm.',
    prompt: `You are an elite video editor and motion graphics designer. Create a storyboard JSON about: "[YOUR TOPIC HERE]" for a short informative video.

CRITICAL REQUIREMENT: Return ONLY raw, valid JSON with NO markdown formatting, NO backticks, and NO extra text.

JSON Schema:
{
  "title": "Dynamic Motion Graphic Title",
  "total_duration": 30,
  "aspect_ratio": "16:9",
  "scenes": [
    {
      "scene_id": 1,
      "start_time": "0:00",
      "end_time": "0:06",
      "duration_seconds": 6,
      "visual_prompt": "clean graphic animation scene stock search words",
      "fallback_text": "Animated motion graphic text over a clean background",
      "shot_type": "medium",
      "camera_movement": "zoom in",
      "transition_in": "cut",
      "transition_out": "dissolve",
      "motion_graphics": ["lower third", "film-grain"],
      "typography": {
        "text": "Engaging Animated Highlight",
        "position": "center",
        "animation": "fade-in",
        "font_style": "bold",
        "color": "#FFFFFF"
      },
      "voiceover_text": "This visual sequence keeps the pace moving and the message clear."
    }
  ],
  "music": { "genre": "electronic", "mood": "motivational", "volume_db": -18 },
  "color_grade": { "preset": "cool", "contrast": "medium" }
}`
  }
];
