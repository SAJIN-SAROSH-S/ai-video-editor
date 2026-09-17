import { useState } from 'react';
import { createProject, fetchMedia, updateStoryboard, renderVideo, getStatus, generateStoryboard } from './api';
import StoryboardViewer from './components/StoryboardViewer';
import TimelineEditor from './components/TimelineEditor';
import VideoPreview from './components/VideoPreview';
import ProgressLog from './components/ProgressLog';
import { SAMPLE_TEMPLATES, LLM_PROMPT_SKILLS } from './data/templates';

// ─── Helpers ───────────────────────────────────────────────────────────────

const VALID_CAMERAS = ['static', 'pan left', 'pan right', 'zoom in', 'zoom out', 'ken burns'];
const VALID_TRANSITIONS = ['cut', 'fade', 'dissolve', 'slide left', 'slide right'];
const VALID_ANIMATIONS = ['typewriter', 'fade-in', 'slide-up', 'bounce', 'none'];
const VALID_POSITIONS = ['top-center', 'bottom-center', 'lower-third', 'center'];

function normalizeCamera(v) {
  const c = String(v || '').toLowerCase();
  if (VALID_CAMERAS.includes(c)) return c;
  if (c.includes('zoom') || c.includes('push forward')) return 'zoom in';
  if (c.includes('pull') || c.includes('zoom out')) return 'zoom out';
  if (c.includes('left')) return 'pan left';
  if (c.includes('right')) return 'pan right';
  if (c.includes('burn') || c.includes('whip') || c.includes('tilt') || c.includes('orbit')) return 'ken burns';
  return 'static';
}

function normalizeTransition(v) {
  const t = String(v || '').toLowerCase();
  if (VALID_TRANSITIONS.includes(t)) return t;
  if (t.includes('fade')) return 'fade';
  if (t.includes('dissolv')) return 'dissolve';
  if (t.includes('left')) return 'slide left';
  if (t.includes('right')) return 'slide right';
  return 'cut';
}

function normalizeAnimation(v) {
  const a = String(v || '').toLowerCase();
  if (VALID_ANIMATIONS.includes(a)) return a;
  if (a.includes('type') || a.includes('write')) return 'typewriter';
  if (a.includes('fade') || a.includes('appear') || a.includes('pop')) return 'fade-in';
  if (a.includes('slide') || a.includes('up')) return 'slide-up';
  if (a.includes('bounce') || a.includes('spring')) return 'bounce';
  return 'fade-in';
}

function normalizePosition(v) {
  const p = String(v || '').toLowerCase();
  if (VALID_POSITIONS.includes(p)) return p;
  if (p.includes('top')) return 'top-center';
  if (p.includes('bottom') || p.includes('lower')) return 'bottom-center';
  return 'center';
}

function sanitizeStoryboard(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const s = { ...raw };
  s.title = String(s.title || 'Untitled Video');
  s.total_duration = parseFloat(s.total_duration) || 15;
  s.aspect_ratio = String(s.aspect_ratio || '16:9');

  if (Array.isArray(s.scenes)) {
    s.scenes = s.scenes.map((scene, idx) => {
      const sc = { ...scene };
      sc.scene_id = parseInt(sc.scene_id) || (idx + 1);
      sc.duration_seconds = parseFloat(sc.duration_seconds) || 5;
      sc.visual_prompt = String(sc.visual_prompt || 'stock footage');
      sc.fallback_text = String(sc.fallback_text || sc.visual_prompt);
      sc.start_time = String(sc.start_time || '0:00');
      sc.end_time = String(sc.end_time || '0:05');
      sc.camera_movement = normalizeCamera(sc.camera_movement);
      sc.transition_in = normalizeTransition(sc.transition_in);
      sc.transition_out = normalizeTransition(sc.transition_out);
      sc.motion_graphics = Array.isArray(sc.motion_graphics)
        ? sc.motion_graphics.map(String)
        : [];

      const ty = sc.typography && typeof sc.typography === 'object' ? sc.typography : {};
      sc.typography = {
        text: String(ty.text || ''),
        position: normalizePosition(ty.position),
        animation: normalizeAnimation(ty.animation),
        font_style: String(ty.font_style || 'bold'),
        color: String(ty.color || '#FFFFFF'),
      };
      return sc;
    });
  }
  return s;
}

// ─── Video Options Config ──────────────────────────────────────────────────

const VIDEO_ORIENTATIONS = [
  { value: '16:9', label: '🖥️ Landscape (16:9)', desc: 'YouTube, TV' },
  { value: '9:16', label: '📱 Portrait (9:16)', desc: 'TikTok, Reels' },
  { value: '1:1', label: '⬛ Square (1:1)', desc: 'Instagram Feed' },
];

const VIDEO_DURATIONS = [
  { value: 15, label: '15 sec', desc: 'Viral / Reel' },
  { value: 30, label: '30 sec', desc: 'Short-form' },
  { value: 60, label: '1 min', desc: 'Explainer' },
  { value: 120, label: '2 min', desc: 'Deep Dive' },
];

const VIDEO_STYLES = [
  { value: 'cinematic', label: '🎬 Cinematic', color: '#8B5CF6' },
  { value: 'educational', label: '📚 Educational', color: '#3B82F6' },
  { value: 'vlog', label: '🎤 Vlog/Casual', color: '#10B981' },
  { value: 'promotional', label: '📣 Promotional', color: '#F59E0B' },
];

const APP_STEPS = [
  { id: 'input', label: 'Plan' },
  { id: 'storyboard', label: 'Storyboard' },
  { id: 'media', label: 'Media' },
  { id: 'rendering', label: 'Render' },
  { id: 'done', label: 'Complete' },
];

const MOTION_GRAPHIC_EFFECTS = [
  { id: 'lower-third', label: '📝 Lower Third', desc: 'Black bar + name/title at bottom' },
  { id: 'letterbox', label: '🎞️ Letterbox Bars', desc: 'Cinematic black bars top & bottom' },
  { id: 'vignette', label: '🔦 Vignette', desc: 'Dark edges for drama' },
  { id: 'counter', label: '🔢 Stat Counter', desc: 'Animated number reveal overlay' },
  { id: 'color-grade-warm', label: '🌅 Warm Grade', desc: 'Cozy, golden tone' },
  { id: 'color-grade-cool', label: '❄️ Cool Grade', desc: 'Sleek, cinematic blue' },
  { id: 'color-grade-bw', label: '⬛ B&W Grade', desc: 'Classic black & white' },
  { id: 'glitch', label: '⚡ Glitch Text', desc: 'Digital distortion on typography' },
  { id: 'film-grain', label: '📽️ Film Grain', desc: 'Vintage analogue texture' },
  { id: 'speed-ramp', label: '🏎️ Speed Ramp', desc: 'Slow-mo → fast burst' },
];

const AUTO_EDITING_SKILLS = [
  {
    id: 'jump-cuts',
    label: '✂️ Jump Cut Rhythm',
    desc: 'All cuts — fast, punchy, high-energy feel',
    apply: (storyboard) => ({
      ...storyboard,
      scenes: storyboard.scenes.map(s => ({ ...s, transition_in: 'cut', transition_out: 'cut', camera_movement: 'static' }))
    })
  },
  {
    id: 'cinematic-flow',
    label: '🎥 Cinematic Flow',
    desc: 'Fades + zooms for a film-like experience',
    apply: (storyboard) => ({
      ...storyboard,
      scenes: storyboard.scenes.map((s, i) => ({
        ...s,
        transition_in: i === 0 ? 'fade' : 'dissolve',
        transition_out: 'fade',
        camera_movement: ['zoom in', 'ken burns', 'pan right', 'zoom out'][i % 4]
      }))
    })
  },
  {
    id: 'slide-show',
    label: '📊 Slide Show Style',
    desc: 'Slide left transitions, static camera',
    apply: (storyboard) => ({
      ...storyboard,
      scenes: storyboard.scenes.map(s => ({ ...s, transition_in: 'slide left', transition_out: 'slide left', camera_movement: 'static' }))
    })
  },
  {
    id: 'ken-burns',
    label: '🖼️ Ken Burns Documentary',
    desc: 'Slow Ken Burns on every scene',
    apply: (storyboard) => ({
      ...storyboard,
      scenes: storyboard.scenes.map(s => ({ ...s, camera_movement: 'ken burns', transition_in: 'dissolve', transition_out: 'dissolve' }))
    })
  },
  {
    id: 'pan-sequence',
    label: '↔️ Pan Sequence',
    desc: 'Alternating pan left/right with dissolves',
    apply: (storyboard) => ({
      ...storyboard,
      scenes: storyboard.scenes.map((s, i) => ({
        ...s,
        camera_movement: i % 2 === 0 ? 'pan left' : 'pan right',
        transition_in: 'dissolve',
        transition_out: 'dissolve'
      }))
    })
  },
  {
    id: 'zoom-drama',
    label: '🔭 Zoom Drama',
    desc: 'Alternating zoom in & out for tension',
    apply: (storyboard) => ({
      ...storyboard,
      scenes: storyboard.scenes.map((s, i) => ({
        ...s,
        camera_movement: i % 2 === 0 ? 'zoom in' : 'zoom out',
        transition_in: 'cut',
        transition_out: 'cut'
      }))
    })
  },
  {
    id: 'music-driven',
    label: '🎶 Music-Driven Flow',
    desc: 'Rhythmic cuts and camera movement for a musical edit',
    apply: (storyboard) => ({
      ...storyboard,
      scenes: storyboard.scenes.map((s, i) => ({
        ...s,
        transition_in: i % 2 === 0 ? 'cut' : 'dissolve',
        transition_out: 'cut',
        camera_movement: ['zoom in', 'pan right', 'zoom out', 'pan left'][i % 4]
      }))
    })
  },
  {
    id: 'social-reel',
    label: '📱 Social Reel Punch',
    desc: 'Fast cuts and bold zooms for short-form social content',
    apply: (storyboard) => ({
      ...storyboard,
      scenes: storyboard.scenes.map((s, i) => ({
        ...s,
        transition_in: 'cut',
        transition_out: 'cut',
        camera_movement: i % 2 === 0 ? 'zoom in' : 'pan right'
      }))
    })
  },
  {
    id: 'documentary',
    label: '🎞️ Documentary Flow',
    desc: 'Gentle dissolves and steady motion for a narrative tone',
    apply: (storyboard) => ({
      ...storyboard,
      scenes: storyboard.scenes.map((s, i) => ({
        ...s,
        transition_in: 'dissolve',
        transition_out: 'dissolve',
        camera_movement: i % 2 === 0 ? 'ken burns' : 'pan left'
      }))
    })
  },
  {
    id: 'product-demo',
    label: '💡 Product Demo',
    desc: 'Clean slides and measured motion for showcase storytelling',
    apply: (storyboard) => ({
      ...storyboard,
      scenes: storyboard.scenes.map((s, i) => ({
        ...s,
        transition_in: i % 2 === 0 ? 'slide left' : 'slide right',
        transition_out: i % 2 === 0 ? 'slide right' : 'slide left',
        camera_movement: i % 2 === 0 ? 'static' : 'zoom in'
      }))
    })
  },
  {
    id: 'motion-graphics',
    label: '🎛️ Motion Graphics Surge',
    desc: 'Add motion graphic accents and animated text to every scene',
    apply: (storyboard) => ({
      ...storyboard,
      scenes: storyboard.scenes.map((s, i) => ({
        ...s,
        transition_in: i % 2 === 0 ? 'dissolve' : 'cut',
        transition_out: 'cut',
        camera_movement: i % 2 === 0 ? 'pan left' : 'pan right',
        motion_graphics: ['lower-third', 'film-grain', 'letterbox'].slice(0, 2)
      }))
    })
  },
];

// ─── Component ─────────────────────────────────────────────────────────────

function App() {
  const [step, setStep] = useState('input');
  const [projectId, setProjectId] = useState(null);
  const [storyboard, setStoryboard] = useState(null);
  const [mediaAssets, setMediaAssets] = useState([]);
  const [jsonText, setJsonText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [renderStatus, setRenderStatus] = useState('idle');
  const [showLog, setShowLog] = useState(false);
  const [copiedPromptId, setCopiedPromptId] = useState(null);
  const [activeTab, setActiveTab] = useState('templates');
  const [appliedSkillId, setAppliedSkillId] = useState(null);
  const [aiTopic, setAiTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Video Options state
  const [selectedOrientation, setSelectedOrientation] = useState('16:9');
  const [selectedDuration, setSelectedDuration] = useState(60);
  const [selectedStyle, setSelectedStyle] = useState('educational');
  const [selectedMotionFx, setSelectedMotionFx] = useState([]);

  const applySelectedMotionFx = (storyboard) => {
    if (!storyboard?.scenes) return storyboard;
    return {
      ...storyboard,
      scenes: storyboard.scenes.map(scene => ({
        ...scene,
        motion_graphics: selectedMotionFx.length > 0 
          ? Array.from(new Set([...(scene.motion_graphics || []), ...selectedMotionFx]))
          : []
      }))
    };
  };

  const handleCreateFromData = async (dataToSubmit) => {
    const sanitized = sanitizeStoryboard(dataToSubmit);
    // Apply user's orientation override
    sanitized.aspect_ratio = selectedOrientation;

    setIsLoading(true);
    setShowLog(true);
    try {
      const data = await createProject(applySelectedMotionFx(sanitized));
      setProjectId(data.project_id);
      setStoryboard(data.storyboard);
      setShowLog(false);
      setStep('storyboard');
    } catch (e) {
      alert('Failed to initialize project: ' + e.message);
      setShowLog(false);
    }
    setIsLoading(false);
  };

  const handleJsonSubmit = () => {
    try {
      const parsed = JSON.parse(jsonText);
      handleCreateFromData(parsed);
    } catch (e) {
      alert('Invalid JSON syntax: ' + e.message);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        setJsonText(evt.target.result);
        handleCreateFromData(parsed);
      } catch (err) {
        alert('Invalid JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleLoadTemplate = (template) => {
    const clone = JSON.parse(JSON.stringify(template.storyboard));
    clone.aspect_ratio = selectedOrientation;
    const targetDuration = selectedDuration;
    const ratio = targetDuration / (clone.total_duration || 15);
    clone.total_duration = targetDuration;
    clone.scenes = clone.scenes.map(s => ({
      ...s,
      duration_seconds: Math.max(3, parseFloat((s.duration_seconds * ratio).toFixed(1)))
    }));
    setJsonText(JSON.stringify(clone, null, 2));
    handleCreateFromData(clone);
  };

  const handleCopyPrompt = (item) => {
    const enriched = item.prompt
      .replace('[YOUR TOPIC HERE]', 'YOUR VIDEO TOPIC')
      .replace(/"total_duration": \d+/, `"total_duration": ${selectedDuration}`)
      .replace(/"aspect_ratio": "[\d:]+"/,`"aspect_ratio": "${selectedOrientation}"`);
    navigator.clipboard.writeText(enriched);
    setCopiedPromptId(item.id);
    setTimeout(() => setCopiedPromptId(null), 2500);
  };

  const handleGenerateStoryboard = async (item) => {
    if (!aiTopic.trim()) {
      alert('Enter a topic to generate a storyboard.');
      return;
    }

    setIsGenerating(true);
    setShowLog(true);

    try {
      const data = await generateStoryboard({
        topic: aiTopic.trim(),
        duration_seconds: selectedDuration,
        aspect_ratio: selectedOrientation,
        style: selectedStyle,
        prompt_template: item.prompt,
        prompt_id: item.id
      });
      setProjectId(data.project_id);
      setStoryboard(applySelectedMotionFx(data.storyboard));
      setStep('storyboard');
    } catch (e) {
      alert('AI generation failed: ' + e.message);
    } finally {
      setIsGenerating(false);
      setShowLog(false);
    }
  };

  const handleApplySkill = (skill) => {
    if (!storyboard || !storyboard.scenes || storyboard.scenes.length === 0) {
      alert('No valid storyboard to apply skill to');
      return;
    }
    const updated = skill.apply(storyboard);
    setStoryboard(updated);
    setAppliedSkillId(skill.id);
    setTimeout(() => setAppliedSkillId(null), 2000);
  };

  const toggleMotionFx = (fxId) => {
    setSelectedMotionFx(prev =>
      prev.includes(fxId) ? prev.filter(id => id !== fxId) : [...prev, fxId]
    );
  };

  const handleFetchMedia = async () => {
    setIsLoading(true);
    setShowLog(true);
    try {
      if (storyboard) {
        await updateStoryboard(projectId, storyboard).catch(() => {});
      }
      const data = await fetchMedia(projectId);
      setMediaAssets(data.media || []);
      setShowLog(false);
      setStep('media');
    } catch (e) {
      alert('Failed to fetch media: ' + e.message);
      setShowLog(false);
    }
    setIsLoading(false);
  };

  const handleRender = async () => {
    setStep('rendering');
    setShowLog(true);
    try {
      await renderVideo(projectId, storyboard);
    } catch (e) {
      alert('Render initiation failed: ' + e.message);
      setStep('media');
      setShowLog(false);
      return;
    }
    const interval = setInterval(async () => {
      try {
        const status = await getStatus(projectId);
        setRenderStatus(status.status);
        if (status.media_assets && status.media_assets.length > 0) {
          setMediaAssets(status.media_assets);
        }
        if (status.status === 'done') {
          clearInterval(interval);
          setShowLog(false);
          setStep('done');
        } else if (status.status === 'error') {
          clearInterval(interval);
          setShowLog(false);
          alert('Render failed during processing.');
          setStep('media');
        }
      } catch (err) { console.error(err); }
    }, 1500);
  };

  const handleStoryboardUpdate = (updated) => {
    setStoryboard(updated);
    if (projectId) {
      updateStoryboard(projectId, updated).catch(err => console.error("Auto-sync error:", err));
    }
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear all data? This will reset the entire project.')) {
      setStep('input');
      setProjectId(null);
      setStoryboard(null);
      setMediaAssets([]);
      setJsonText('');
      setRenderStatus('idle');
      setAppliedSkillId(null);
      setAiTopic('');
      setSelectedMotionFx([]);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xl shadow-lg shadow-blue-500/20">
              🎬
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight">StudioPro AI</h1>
                <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase">
                  Video Editor
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Automated assembly & motion graphics video builder</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {step !== 'input' && (
              <button
                onClick={() => { setStep('input'); setProjectId(null); setStoryboard(null); setMediaAssets([]); }}
                className="text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 px-3.5 py-2 rounded-xl text-slate-300 transition flex items-center gap-1.5 font-medium"
              >
                <span>←</span> New Project
              </button>
            )}
            <button
              onClick={handleClearAll}
              className="text-xs bg-red-950/30 hover:bg-red-950/60 border border-red-900/40 hover:border-red-800 text-red-300 px-3 py-2 rounded-xl transition flex items-center gap-1.5 font-medium"
            >
              <span>🗑️</span> Reset
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Minimalist Connected Step Tracker */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-2 sm:p-3">
          <div className="grid grid-cols-5 gap-1 sm:gap-2">
            {APP_STEPS.map((stepItem, idx) => {
              const isActive = step === stepItem.id;
              const isPast = APP_STEPS.findIndex(s => s.id === step) > idx;

              return (
                <div
                  key={stepItem.id}
                  className={`relative rounded-xl px-2 sm:px-4 py-2.5 text-center transition ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-bold'
                      : isPast
                      ? 'bg-slate-800/60 text-slate-300 font-medium'
                      : 'text-slate-500 font-normal'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span className={`text-[11px] w-4 h-4 rounded-full flex items-center justify-center font-bold ${
                      isActive ? 'bg-white text-blue-600' : isPast ? 'bg-slate-700 text-slate-300' : 'bg-slate-800 text-slate-500'
                    }`}>
                      {idx + 1}
                    </span>
                    <span className="text-xs tracking-wide capitalize">{stepItem.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Global Live Progress Log */}
        {showLog && projectId && step !== 'rendering' && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            <ProgressLog projectId={projectId} isActive={showLog} />
          </div>
        )}

        {/* ═══════════════ STEP 1: INPUT / PLAN ══════════════════ */}
        {step === 'input' && (
          <div className="space-y-6">

            {/* ── Video Options Configuration ── */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur">
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-800/60">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <span>⚙️</span> Video Configuration
                </h2>
                <span className="text-xs text-slate-500">Preset Settings for Output Video</span>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                {/* 1. Orientation */}
                <div className="space-y-2.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                    1. Aspect Ratio
                  </label>
                  <div className="space-y-2">
                    {VIDEO_ORIENTATIONS.map(o => (
                      <button
                        key={o.value}
                        onClick={() => setSelectedOrientation(o.value)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs transition ${
                          selectedOrientation === o.value
                            ? 'border-blue-500 bg-blue-500/10 text-white font-semibold shadow-sm'
                            : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <span className="font-medium">{o.label}</span>
                        <span className="text-[11px] opacity-60">{o.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Duration */}
                <div className="space-y-2.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                    2. Target Duration
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {VIDEO_DURATIONS.map(d => (
                      <button
                        key={d.value}
                        onClick={() => setSelectedDuration(d.value)}
                        className={`flex flex-col items-center justify-center py-3 px-2 rounded-xl border text-xs transition ${
                          selectedDuration === d.value
                            ? 'border-purple-500 bg-purple-500/10 text-white font-bold shadow-sm'
                            : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <span className="font-bold text-sm text-purple-300">{d.label}</span>
                        <span className="text-[10px] opacity-60 mt-0.5">{d.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Style & FX */}
                <div className="space-y-2.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                    3. Visual Style & Overlays
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {VIDEO_STYLES.map(s => (
                      <button
                        key={s.value}
                        onClick={() => setSelectedStyle(s.value)}
                        className={`flex items-center justify-center py-2 px-2 rounded-xl border text-xs font-semibold transition ${
                          selectedStyle === s.value
                            ? 'border-opacity-100 text-white'
                            : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                        }`}
                        style={selectedStyle === s.value ? { borderColor: s.color, background: `${s.color}15`, color: s.color } : {}}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  <div className="pt-2">
                    <span className="text-[11px] text-slate-400 block mb-1.5 font-medium">Motion FX Accents:</span>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                      {MOTION_GRAPHIC_EFFECTS.slice(0, 6).map(fx => (
                        <button
                          key={fx.id}
                          onClick={() => toggleMotionFx(fx.id)}
                          className={`text-[11px] px-2.5 py-1 rounded-lg border transition ${
                            selectedMotionFx.includes(fx.id)
                              ? 'border-amber-500/80 bg-amber-500/10 text-amber-300 font-medium'
                              : 'border-slate-800 bg-slate-950/30 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          {fx.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Tabs Navigation ── */}
            <div className="flex gap-2 p-1.5 bg-slate-900/80 border border-slate-800/80 rounded-2xl w-fit">
              {[
                { id: 'templates', label: '✨ Pre-Built Templates' },
                { id: 'json', label: '📄 Upload / Paste JSON' },
                { id: 'prompts', label: '⚡ AI Storyboard Generator' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── Tab 1: Pre-Built Templates ── */}
            {activeTab === 'templates' && (
              <div className="grid md:grid-cols-3 gap-5">
                {SAMPLE_TEMPLATES.map(tmpl => (
                  <div
                    key={tmpl.id}
                    className="bg-slate-900/60 border border-slate-800/80 hover:border-blue-500/50 rounded-2xl p-5 flex flex-col justify-between transition group hover:shadow-xl hover:shadow-blue-500/5"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs bg-slate-800/80 text-slate-300 px-2.5 py-1 rounded-full font-medium">
                          {tmpl.storyboard.scenes.length} Scenes
                        </span>
                        <span className="text-xs text-blue-400 font-mono">
                          {selectedDuration}s · {selectedOrientation}
                        </span>
                      </div>
                      <h3 className="font-bold text-base text-white group-hover:text-blue-400 transition">
                        {tmpl.name}
                      </h3>
                      <p className="text-slate-400 text-xs leading-relaxed">
                        {tmpl.description}
                      </p>
                    </div>

                    <button
                      onClick={() => handleLoadTemplate(tmpl)}
                      disabled={isLoading}
                      className="mt-6 w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl font-bold text-xs shadow-lg shadow-blue-500/10 transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <span>Create Video</span>
                      <span>→</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ── Tab 2: Upload / Paste JSON ── */}
            {activeTab === 'json' && (
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Upload .json Storyboard File
                  </label>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    className="block w-full text-xs text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer bg-slate-950 rounded-xl p-1.5 border border-slate-800"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-slate-800" />
                  <span className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">Or Paste Storyboard JSON</span>
                  <div className="flex-1 border-t border-slate-800" />
                </div>

                <textarea
                  rows={9}
                  value={jsonText}
                  onChange={e => setJsonText(e.target.value)}
                  placeholder={`{\n  "title": "My Video Project",\n  "total_duration": ${selectedDuration},\n  "aspect_ratio": "${selectedOrientation}",\n  "scenes": [...]\n}`}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-emerald-400 focus:outline-none focus:border-blue-500 resize-none"
                />

                <button
                  onClick={handleJsonSubmit}
                  disabled={!jsonText.trim() || isLoading}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold text-xs transition disabled:opacity-50 shadow-lg shadow-blue-500/10"
                >
                  {isLoading ? 'Initializing...' : 'Initialize Project from JSON 🎬'}
                </button>
              </div>
            )}

            {/* ── Tab 3: AI Storyboard Generator ── */}
            {activeTab === 'prompts' && (
              <div className="space-y-5">
                {/* AI Prompt Input Bar */}
                <div className="bg-gradient-to-r from-blue-950/40 via-indigo-950/40 to-purple-950/40 border border-indigo-500/30 rounded-2xl p-5 shadow-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span>✨</span> AI Video Generator
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Target: {selectedDuration}s · {selectedOrientation} · {selectedStyle}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      value={aiTopic}
                      onChange={(e) => setAiTopic(e.target.value)}
                      placeholder="Describe your video topic (e.g. 5 Morning habits of top entrepreneurs)..."
                      className="flex-1 bg-slate-950/90 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 shadow-inner"
                    />
                    <button
                      onClick={() => handleGenerateStoryboard(LLM_PROMPT_SKILLS[0])}
                      disabled={!aiTopic.trim() || isGenerating}
                      className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white px-6 py-3 rounded-xl font-bold text-xs transition disabled:opacity-50 shadow-lg shadow-indigo-500/20 whitespace-nowrap"
                    >
                      {isGenerating ? 'Generating Storyboard...' : 'Generate with AI ✨'}
                    </button>
                  </div>
                </div>

                {/* Prompt Skill Cards Grid */}
                <div className="grid md:grid-cols-2 gap-4">
                  {LLM_PROMPT_SKILLS.map(item => (
                    <div key={item.id} className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                      <div>
                        <h3 className="font-bold text-sm text-white">{item.name}</h3>
                        <p className="text-slate-400 text-xs mt-1">{item.description}</p>
                        <pre className="mt-3 bg-slate-950 p-3 rounded-xl text-[10px] font-mono text-slate-400 max-h-32 overflow-y-auto whitespace-pre-wrap border border-slate-800">
                          {item.prompt}
                        </pre>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <button
                          onClick={() => handleCopyPrompt(item)}
                          className={`py-2 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 border ${
                            copiedPromptId === item.id
                              ? 'bg-green-600 border-green-500 text-white'
                              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                          }`}
                        >
                          {copiedPromptId === item.id ? '✓ Copied!' : '📋 Copy Prompt'}
                        </button>
                        <button
                          onClick={() => handleGenerateStoryboard(item)}
                          disabled={!aiTopic.trim() || isGenerating}
                          className="py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition disabled:opacity-50"
                        >
                          {isGenerating ? 'Generating...' : '⚡ Generate'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ STEP 2: STORYBOARD ══════════════════ */}
        {step === 'storyboard' && storyboard && (
          <div className="space-y-6">

            {/* Auto-Editing Skills Toolbar */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🎬</span> Auto Editing Presets (Apply to All Scenes)
                </span>
                <span className="text-[11px] text-slate-500">1-Click Pacing & Camera Overrides</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {AUTO_EDITING_SKILLS.map(skill => (
                  <button
                    key={skill.id}
                    onClick={() => handleApplySkill(skill)}
                    title={skill.desc}
                    className={`text-xs px-3.5 py-2 rounded-xl border font-semibold transition ${
                      appliedSkillId === skill.id
                        ? 'border-green-500 bg-green-500/10 text-green-300'
                        : 'border-slate-800 bg-slate-950/40 text-slate-300 hover:border-blue-500/60 hover:text-white'
                    }`}
                  >
                    {appliedSkillId === skill.id ? '✓ Applied!' : skill.label}
                  </button>
                ))}
              </div>
            </div>

            <StoryboardViewer storyboard={storyboard} onUpdate={handleStoryboardUpdate} />

            <div className="flex items-center justify-center gap-3 pt-4">
              <button
                onClick={() => setStep('input')}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-6 py-3 rounded-xl text-xs font-semibold transition"
              >
                ← Back to Config
              </button>
              <button
                onClick={handleFetchMedia}
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-500 text-white px-8 py-3 rounded-xl font-bold text-xs shadow-lg shadow-green-500/20 transition disabled:opacity-50 flex items-center gap-2"
              >
                <span>{isLoading ? 'Searching Stock Footage...' : 'Fetch Media Assets 🎞️'}</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════ STEP 3: MEDIA & TIMELINE ══════════════════ */}
        {step === 'media' && (
          <div className="space-y-6">
            <TimelineEditor storyboard={storyboard} mediaAssets={mediaAssets} onUpdate={handleStoryboardUpdate} />

            <div className="flex items-center justify-center gap-3 pt-4">
              <button
                onClick={() => setStep('storyboard')}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-6 py-3 rounded-xl text-xs font-semibold transition"
              >
                ← Back to Storyboard
              </button>
              <button
                onClick={handleRender}
                className="bg-purple-600 hover:bg-purple-500 text-white px-9 py-3 rounded-xl font-bold text-xs shadow-lg shadow-purple-500/20 transition flex items-center gap-2"
              >
                <span>Render Final 1080p Video 🎬</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════ STEP 4: RENDERING ══════════════════ */}
        {step === 'rendering' && (
          <div className="max-w-2xl mx-auto py-12 space-y-6">
            <div className="text-center space-y-3">
              <div className="animate-spin w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full mx-auto" />
              <h2 className="text-2xl font-bold text-white">Rendering Your Video</h2>
              <p className="text-slate-400 text-xs">FFmpeg is encoding scenes, typography, motion graphics, and audio in parallel...</p>
            </div>
            {projectId && <ProgressLog projectId={projectId} isActive={true} />}
          </div>
        )}

        {/* ═══════════════ STEP 5: DONE / PREVIEW ══════════════════ */}
        {step === 'done' && (
          <div className="space-y-6">
            <VideoPreview projectId={projectId} />
            <div className="text-center pt-2">
              <button
                onClick={() => { setStep('input'); setProjectId(null); setStoryboard(null); setMediaAssets([]); }}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-6 py-3 rounded-xl text-xs font-semibold transition"
              >
                ✨ Create Another Video
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;