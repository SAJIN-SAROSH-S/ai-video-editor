import { useState } from 'react';
import { uploadCustomMedia } from '../api';

const CAMERAS = ['static', 'zoom in', 'zoom out', 'ken burns', 'pan left', 'pan right'];
const TRANSITIONS = ['cut', 'fade', 'dissolve', 'slide left', 'slide right'];
const COLOR_GRADES = [
  { value: 'none', label: 'None (Standard)' },
  { value: 'warm', label: '🌅 Warm Golden' },
  { value: 'cool', label: '❄️ Cool Crisp' },
  { value: 'cinematic', label: '🎬 Cinematic Punch' },
  { value: 'vintage', label: '📽️ Vintage Film' },
  { value: 'teal_orange', label: '🎨 Teal & Orange' },
  { value: 'bw', label: '⬛ Black & White' },
  { value: 'golden_hour', label: '🌇 Golden Hour' },
  { value: 'horror', label: '👻 Dark/Horror' }
];

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

function formatTimeSec(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function StoryboardViewer({
  storyboard,
  projectId,
  mediaAssets = [],
  onUpdate,
  onMediaUploaded
}) {
  const [editingScene, setEditingScene] = useState(null);
  const [customUrls, setCustomUrls] = useState({});
  const [uploadingSceneId, setUploadingSceneId] = useState(null);
  const [targetDurationInput, setTargetDurationInput] = useState(storyboard?.total_duration || 15);

  // Recalculate timecodes across all scenes
  const recalculateTimecodes = (scenes) => {
    let currentT = 0.0;
    return scenes.map(s => {
      const dur = Math.max(1.0, parseFloat(s.duration_seconds) || 3.0);
      const start = currentT;
      const end = currentT + dur;
      currentT = end;
      return {
        ...s,
        duration_seconds: dur,
        start_time: formatTimeSec(start),
        end_time: formatTimeSec(end)
      };
    });
  };

  const updateScene = (sceneId, field, value) => {
    const rawScenes = storyboard.scenes.map(s =>
      s.scene_id === sceneId ? { ...s, [field]: value } : s
    );
    const updatedScenes = field === 'duration_seconds' ? recalculateTimecodes(rawScenes) : rawScenes;
    const newTotal = updatedScenes.reduce((acc, s) => acc + (parseFloat(s.duration_seconds) || 0), 0);
    
    const updated = {
      ...storyboard,
      total_duration: Number(newTotal.toFixed(1)),
      scenes: updatedScenes
    };
    onUpdate(updated);
  };

  const updateSceneNested = (sceneId, parentKey, childKey, value) => {
    const updated = {
      ...storyboard,
      scenes: storyboard.scenes.map(s => {
        if (s.scene_id === sceneId) {
          const currentParent = s[parentKey] || {};
          return {
            ...s,
            [parentKey]: {
              ...currentParent,
              [childKey]: value
            }
          };
        }
        return s;
      })
    };
    onUpdate(updated);
  };

  // Scale all scenes proportionally to match a new total video duration
  const handleScaleDuration = (newTotal) => {
    const target = Math.max(5, parseFloat(newTotal) || 15);
    const currentTotal = storyboard.total_duration || storyboard.scenes.reduce((a, s) => a + (parseFloat(s.duration_seconds) || 0), 0) || 15;
    const ratio = target / currentTotal;

    const scaledScenes = storyboard.scenes.map(s => ({
      ...s,
      duration_seconds: Math.max(1.0, parseFloat(((parseFloat(s.duration_seconds) || 3) * ratio).toFixed(1)))
    }));

    const finalScenes = recalculateTimecodes(scaledScenes);
    const actualTotal = finalScenes.reduce((acc, s) => acc + (parseFloat(s.duration_seconds) || 0), 0);

    const updated = {
      ...storyboard,
      total_duration: Number(actualTotal.toFixed(1)),
      scenes: finalScenes
    };
    setTargetDurationInput(actualTotal);
    onUpdate(updated);
  };

  // Handle local file upload (Image / Video) for a scene
  const handleFileUpload = async (sceneId, event) => {
    const file = event.target.files?.[0];
    if (!file || !projectId) return;

    setUploadingSceneId(sceneId);
    try {
      const res = await uploadCustomMedia(projectId, sceneId, file);
      if (res.asset) {
        onMediaUploaded?.(res.asset, res.timeline);
      }
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploadingSceneId(null);
      event.target.value = '';
    }
  };

  // Handle external URL submission for a scene
  const handleUrlSubmit = async (sceneId) => {
    const url = customUrls[sceneId]?.trim();
    if (!url || !projectId) return;

    setUploadingSceneId(sceneId);
    try {
      const res = await uploadCustomMedia(projectId, sceneId, url);
      if (res.asset) {
        onMediaUploaded?.(res.asset, res.timeline);
        setCustomUrls(prev => ({ ...prev, [sceneId]: '' }));
      }
    } catch (err) {
      alert(`Failed to apply media URL: ${err.message}`);
    } finally {
      setUploadingSceneId(null);
    }
  };

  const audioCfg = storyboard.audio_config || {};

  return (
    <div className="space-y-5">
      {/* ── 1. Video Metadata & Length Scaler Header ── */}
      <div className="bg-slate-900/70 border border-slate-800 p-5 rounded-2xl space-y-4 backdrop-blur shadow-xl">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">{storyboard.title}</h2>
              <span className="bg-blue-900/40 border border-blue-700/50 text-blue-300 text-[11px] px-2.5 py-0.5 rounded-full font-mono">
                {storyboard.aspect_ratio || '16:9'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mt-2 text-xs">
              <span className="bg-slate-800/80 border border-slate-700/60 px-3 py-1 rounded-full text-emerald-300 font-bold">
                ⏱️ {storyboard.total_duration}s Video Length
              </span>
              <span className="bg-slate-800/80 border border-slate-700/60 px-3 py-1 rounded-full text-slate-300 font-medium">
                🎬 {storyboard.scenes.length} Scenes
              </span>
              {audioCfg.voiceover_enabled !== false && (
                <span className="bg-emerald-900/30 border border-emerald-800/40 px-3 py-1 rounded-full text-emerald-300 font-medium">
                  🎙️ {audioCfg.voiceover_gender || 'Male'} ({audioCfg.voiceover_type || 'Narrator'})
                </span>
              )}
              <span className="bg-purple-900/30 border border-purple-800/40 px-3 py-1 rounded-full text-purple-300 font-medium">
                🎵 {audioCfg.background_music || 'Upbeat Tech'}
              </span>
            </div>
          </div>
        </div>

        {/* Video Length Scaling Toolbar */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <span>⏱️</span> Scale Video Length:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {DURATION_PRESETS.map(dur => (
                <button
                  key={dur}
                  onClick={() => handleScaleDuration(dur)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold border transition ${
                    Math.round(storyboard.total_duration) === dur
                      ? 'bg-blue-600 border-blue-500 text-white shadow-sm shadow-blue-500/20'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  {dur}s
                </button>
              ))}
            </div>
          </div>

          {/* Custom Length Input */}
          <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-xl">
            <span className="text-xs text-slate-400">Custom (sec):</span>
            <input
              type="number"
              min="3"
              max="600"
              value={targetDurationInput}
              onChange={(e) => setTargetDurationInput(e.target.value)}
              className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5 text-xs text-white text-center focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => handleScaleDuration(targetDurationInput)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-1 rounded-lg transition"
            >
              Scale
            </button>
          </div>
        </div>
      </div>

      {/* ── 2. Scene Cards Grid ── */}
      <div className="grid gap-4">
        {storyboard.scenes.map((scene, idx) => {
          const isEditing = editingScene === scene.scene_id;
          const mediaItem = mediaAssets.find(m => m.scene_id === scene.scene_id);
          const mediaUrl = mediaItem?.url
            ? (mediaItem.url.startsWith('http') ? mediaItem.url : `http://localhost:8000${mediaItem.url}`)
            : null;
          const isUploading = uploadingSceneId === scene.scene_id;

          return (
            <div
              key={scene.scene_id}
              className={`border rounded-2xl p-5 transition ${
                isEditing
                  ? 'bg-slate-900 border-blue-500/80 shadow-xl shadow-blue-500/5'
                  : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              {/* Scene Top Toolbar */}
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-800/70">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-blue-600 font-bold text-xs px-2.5 py-1 rounded-lg text-white">
                    Scene {idx + 1}
                  </span>
                  <span className="text-slate-400 text-xs font-mono">
                    {scene.start_time} - {scene.end_time} ({scene.duration_seconds}s)
                  </span>
                  {scene.camera_movement && scene.camera_movement !== 'static' && (
                    <span className="bg-purple-900/30 text-purple-300 text-[11px] px-2.5 py-0.5 rounded-full border border-purple-800/40 font-medium">
                      🎥 {scene.camera_movement}
                    </span>
                  )}
                  {scene.transition_out && scene.transition_out !== 'cut' && (
                    <span className="bg-amber-900/30 text-amber-300 text-[11px] px-2.5 py-0.5 rounded-full border border-amber-800/40 font-medium">
                      ✂️ {scene.transition_out}
                    </span>
                  )}
                  {mediaItem && (
                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono border ${
                      mediaItem.is_placeholder
                        ? 'bg-amber-950/40 border-amber-800/50 text-amber-300'
                        : 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                    }`}>
                      {mediaItem.is_placeholder ? '📋 Placeholder' : `🖼️ ${mediaItem.media_type === 'video' ? 'Stock Video' : 'Visual Photo'}`}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingScene(isEditing ? null : scene.scene_id)}
                    className={`text-xs px-3.5 py-1.5 rounded-xl font-semibold transition ${
                      isEditing
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
                    }`}
                  >
                    {isEditing ? '✓ Done Editing' : '✏️ Edit Scene'}
                  </button>
                </div>
              </div>

              {/* Scene Content (Editing vs Display Mode) */}
              {isEditing ? (
                <div className="space-y-4">
                  {/* Visual Stock Prompt & Fallback */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                        Visual Stock Search Prompt
                      </label>
                      <input
                        value={scene.visual_prompt}
                        onChange={(e) => updateScene(scene.scene_id, 'visual_prompt', e.target.value)}
                        placeholder="e.g. drone view snowy mountains at sunrise"
                        className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                        Fallback Text (Graphic Card)
                      </label>
                      <input
                        value={scene.fallback_text}
                        onChange={(e) => updateScene(scene.scene_id, 'fallback_text', e.target.value)}
                        placeholder="e.g. Mountain peaks in sunrise"
                        className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* Timing & Motion Controls */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                        Scene Duration (s)
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="0.5"
                        value={scene.duration_seconds}
                        onChange={(e) => updateScene(scene.scene_id, 'duration_seconds', parseFloat(e.target.value) || 3)}
                        className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                        Camera Motion
                      </label>
                      <select
                        value={scene.camera_movement || 'static'}
                        onChange={(e) => updateScene(scene.scene_id, 'camera_movement', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        {CAMERAS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                        Transition Out
                      </label>
                      <select
                        value={scene.transition_out || 'cut'}
                        onChange={(e) => updateScene(scene.scene_id, 'transition_out', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        {TRANSITIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                        Color Grade Preset
                      </label>
                      <select
                        value={scene.effects?.color_grade_preset || 'none'}
                        onChange={(e) => updateSceneNested(scene.scene_id, 'effects', 'color_grade_preset', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        {COLOR_GRADES.map(cg => <option key={cg.value} value={cg.value}>{cg.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Typography & Subtitle Overlays */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                        On-Screen Typography Overlay
                      </label>
                      <input
                        value={scene.typography?.text || ''}
                        onChange={(e) => updateSceneNested(scene.scene_id, 'typography', 'text', e.target.value)}
                        placeholder="Headline or title to overlay on this scene"
                        className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                        Overlay Position
                      </label>
                      <select
                        value={scene.typography?.position || 'center'}
                        onChange={(e) => updateSceneNested(scene.scene_id, 'typography', 'position', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        <option value="center">Center</option>
                        <option value="top-center">Top Center</option>
                        <option value="bottom-center">Bottom Center</option>
                        <option value="lower-third">Lower Third Banner</option>
                      </select>
                    </div>
                  </div>

                  {/* Voiceover Script */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Voiceover Narration Script
                    </label>
                    <textarea
                      value={scene.voiceover_text || ''}
                      onChange={(e) => updateScene(scene.scene_id, 'voiceover_text', e.target.value)}
                      placeholder="Narrator narration script for this scene..."
                      rows={2}
                      className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 resize-none"
                    />
                  </div>
                  {/* Visual Framing & Transform Controls */}
                  <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <span>📐</span> Visual Framing & Transform (Resize, Pan, Rotate, Flip)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const resetTransform = {
                            scale: 1.0,
                            position_x: 0,
                            position_y: 0,
                            rotation: 0,
                            opacity: 1.0,
                            flip_h: false,
                            flip_v: false,
                            fit_mode: 'cover',
                            bg_fill_mode: 'black'
                          };
                          updateScene(scene.scene_id, 'transform', resetTransform);
                        }}
                        className="text-[10px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800/70 border border-slate-700/60 transition"
                      >
                        Reset Transform
                      </button>
                    </div>

                    {/* Scale & Fit Mode */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="flex justify-between text-[11px] font-semibold text-slate-400 mb-1">
                          <span>Scale / Zoom</span>
                          <span className="font-mono text-blue-400 font-bold">{Math.round((scene.transform?.scale ?? 1.0) * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="3.0"
                          step="0.05"
                          value={scene.transform?.scale ?? 1.0}
                          onChange={(e) => updateSceneNested(scene.scene_id, 'transform', 'scale', parseFloat(e.target.value))}
                          className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                        />
                        <div className="flex gap-1 mt-1.5">
                          {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(s => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => updateSceneNested(scene.scene_id, 'transform', 'scale', s)}
                              className={`text-[10px] flex-1 py-0.5 rounded font-mono ${
                                (scene.transform?.scale ?? 1.0) === s ? 'bg-blue-600 text-white font-bold' : 'bg-slate-900 text-slate-400 hover:text-white'
                              }`}
                            >
                              {s * 100}%
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                          Fit / Framing Mode
                        </label>
                        <div className="grid grid-cols-3 gap-1">
                          {[
                            { value: 'cover', label: 'Cover (Fill)' },
                            { value: 'contain', label: 'Contain (Fit)' },
                            { value: 'stretch', label: 'Stretch' }
                          ].map(mode => (
                            <button
                              key={mode.value}
                              type="button"
                              onClick={() => updateSceneNested(scene.scene_id, 'transform', 'fit_mode', mode.value)}
                              className={`text-[10px] py-1.5 rounded-lg border font-medium transition ${
                                (scene.transform?.fit_mode || 'cover') === mode.value
                                  ? 'bg-blue-600/30 border-blue-500 text-blue-300 font-bold'
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                              }`}
                            >
                              {mode.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] text-slate-400">Background Fill:</span>
                          <button
                            type="button"
                            onClick={() => updateSceneNested(scene.scene_id, 'transform', 'bg_fill_mode', 'black')}
                            className={`text-[10px] px-2 py-0.5 rounded border ${
                              (scene.transform?.bg_fill_mode || 'black') === 'black'
                                ? 'bg-slate-800 border-slate-600 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-400'
                            }`}
                          >
                            ⬛ Black
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSceneNested(scene.scene_id, 'transform', 'bg_fill_mode', 'blur_fill')}
                            className={`text-[10px] px-2 py-0.5 rounded border ${
                              scene.transform?.bg_fill_mode === 'blur_fill'
                                ? 'bg-indigo-900/60 border-indigo-500 text-indigo-300 font-bold'
                                : 'bg-slate-900 border-slate-800 text-slate-400'
                            }`}
                          >
                            ✨ Blur Fill
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Quick Picture-in-Picture Presets & Position */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-900">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                          1-Click PiP Presets (Corner Placement)
                        </label>
                        <div className="grid grid-cols-3 gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              updateScene(scene.scene_id, 'transform', {
                                ...(scene.transform || {}),
                                scale: 1.0,
                                position_x: 0,
                                position_y: 0
                              });
                            }}
                            className="text-[10px] py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                          >
                            🎯 Center
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateScene(scene.scene_id, 'transform', {
                                ...(scene.transform || {}),
                                scale: 0.45,
                                position_x: -220,
                                position_y: -120
                              });
                            }}
                            className="text-[10px] py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                          >
                            ↖ Top-L
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateScene(scene.scene_id, 'transform', {
                                ...(scene.transform || {}),
                                scale: 0.45,
                                position_x: 220,
                                position_y: -120
                              });
                            }}
                            className="text-[10px] py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                          >
                            ↗ Top-R
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateScene(scene.scene_id, 'transform', {
                                ...(scene.transform || {}),
                                scale: 0.45,
                                position_x: -220,
                                position_y: 120
                              });
                            }}
                            className="text-[10px] py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                          >
                            ↙ Btm-L
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateScene(scene.scene_id, 'transform', {
                                ...(scene.transform || {}),
                                scale: 0.45,
                                position_x: 220,
                                position_y: 120
                              });
                            }}
                            className="text-[10px] py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                          >
                            ↘ Btm-R
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                          Rotation & Flip
                        </label>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateSceneNested(scene.scene_id, 'transform', 'rotation', ((scene.transform?.rotation ?? 0) - 90 + 360) % 360)}
                            className="px-2 py-1 text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded"
                          >
                            ↺ -90°
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSceneNested(scene.scene_id, 'transform', 'rotation', ((scene.transform?.rotation ?? 0) + 90) % 360)}
                            className="px-2 py-1 text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded"
                          >
                            ↻ +90°
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSceneNested(scene.scene_id, 'transform', 'flip_h', !(scene.transform?.flip_h))}
                            className={`px-2 py-1 text-[10px] rounded border transition ${
                              scene.transform?.flip_h ? 'bg-blue-600 border-blue-500 text-white font-bold' : 'bg-slate-900 border-slate-800 text-slate-300'
                            }`}
                          >
                            ↔ Flip H
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSceneNested(scene.scene_id, 'transform', 'flip_v', !(scene.transform?.flip_v))}
                            className={`px-2 py-1 text-[10px] rounded border transition ${
                              scene.transform?.flip_v ? 'bg-blue-600 border-blue-500 text-white font-bold' : 'bg-slate-900 border-slate-800 text-slate-300'
                            }`}
                          >
                            ↕ Flip V
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid md:grid-cols-12 gap-4 items-center text-xs">
                  {/* Left Column: Visual Media Preview with Live Transforms */}
                  <div className="md:col-span-4">
                    {mediaUrl ? (
                      <div className="rounded-xl overflow-hidden border border-slate-800 aspect-video bg-black relative flex items-center justify-center shadow-lg group">
                        {/* Blur Background if enabled */}
                        {scene.transform?.bg_fill_mode === 'blur_fill' && (
                          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
                            {mediaItem?.media_type === 'video' ? (
                              <video src={mediaUrl} className="w-full h-full object-cover blur-md scale-125" muted loop autoPlay />
                            ) : (
                              <img src={mediaUrl} alt="" className="w-full h-full object-cover blur-md scale-125" />
                            )}
                          </div>
                        )}
                        {mediaItem?.media_type === 'video' ? (
                          <video
                            src={mediaUrl}
                            style={{
                              transform: `translate(${(scene.transform?.position_x || 0) * 0.15}px, ${(scene.transform?.position_y || 0) * 0.15}px) scale(${scene.transform?.scale ?? 1.0}) rotate(${scene.transform?.rotation || 0}deg) scaleX(${scene.transform?.flip_h ? -1 : 1}) scaleY(${scene.transform?.flip_v ? -1 : 1})`,
                              opacity: scene.transform?.opacity ?? 1.0,
                              objectFit: scene.transform?.fit_mode === 'stretch' ? 'fill' : (scene.transform?.fit_mode || 'cover')
                            }}
                            className="w-full h-full relative z-10 transition-transform duration-200"
                            muted
                            loop
                            autoPlay
                          />
                        ) : (
                          <img
                            src={mediaUrl}
                            alt={scene.visual_prompt}
                            style={{
                              transform: `translate(${(scene.transform?.position_x || 0) * 0.15}px, ${(scene.transform?.position_y || 0) * 0.15}px) scale(${scene.transform?.scale ?? 1.0}) rotate(${scene.transform?.rotation || 0}deg) scaleX(${scene.transform?.flip_h ? -1 : 1}) scaleY(${scene.transform?.flip_v ? -1 : 1})`,
                              opacity: scene.transform?.opacity ?? 1.0,
                              objectFit: scene.transform?.fit_mode === 'stretch' ? 'fill' : (scene.transform?.fit_mode || 'cover')
                            }}
                            className="w-full h-full relative z-10 transition-transform duration-200"
                          />
                        )}
                        <span className="absolute bottom-1 right-1 text-[9px] bg-slate-950/80 px-1.5 py-0.5 rounded text-slate-300 font-mono z-20">
                          {mediaItem?.media_type === 'video' ? '🎬 Video' : '🖼️ Image'}
                        </span>
                        {(scene.transform?.scale !== undefined && scene.transform?.scale !== 1.0) && (
                          <span className="absolute top-1 left-1 text-[9px] bg-blue-900/80 border border-blue-700/50 px-1.5 py-0.5 rounded text-blue-200 font-mono z-20">
                            🔍 {Math.round(scene.transform.scale * 100)}%
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-800 aspect-video bg-slate-950/60 flex flex-col items-center justify-center text-slate-500 p-3 text-center">
                        <span className="text-xl mb-1">🎞️</span>
                        <span className="text-[10px]">No visual asset loaded</span>
                      </div>
                    )}
                  </div>

                  {/* Center Column: Visual Info & Motion */}
                  <div className="md:col-span-4 space-y-2">
                    <p>
                      <span className="text-slate-400 font-medium">Visual:</span>{' '}
                      <span className="text-white font-semibold">{scene.visual_prompt}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="bg-slate-800/80 text-slate-300 px-2.5 py-1 rounded-lg">
                        Motion: <strong className="text-purple-300">{scene.camera_movement || 'static'}</strong>
                      </span>
                      {scene.effects?.color_grade_preset && scene.effects.color_grade_preset !== 'none' && (
                        <span className="bg-slate-800/80 text-slate-300 px-2.5 py-1 rounded-lg">
                          Grade: <strong className="text-amber-300">{scene.effects.color_grade_preset}</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Typography & VO Script */}
                  <div className="md:col-span-4 space-y-2">
                    {scene.typography?.text ? (
                      <p>
                        <span className="text-slate-400 font-medium">Overlay:</span>{' '}
                        <span className="text-blue-300 font-semibold">"{scene.typography.text}"</span>{' '}
                        <span className="text-slate-500">({scene.typography.position || 'center'})</span>
                      </p>
                    ) : (
                      <p className="text-slate-500 italic">No text overlay</p>
                    )}
                    {scene.voiceover_text && (
                      <p>
                        <span className="text-slate-400 font-medium">Voiceover:</span>{' '}
                        <span className="text-emerald-300">"{scene.voiceover_text}"</span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* ── 3. Custom Visual Media Uploader Bar for this Scene ── */}
              <div className="mt-4 pt-3 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-950/40 p-3 rounded-xl">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider flex items-center gap-1">
                    <span>📁</span> Custom Visual Media:
                  </span>

                  {/* Local File Picker */}
                  <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white px-3 py-1.5 rounded-lg font-medium border border-slate-700 transition flex items-center gap-1">
                    <span>{isUploading ? 'Uploading...' : 'Upload File (JPG/MP4)'}</span>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      disabled={isUploading || !projectId}
                      onChange={(e) => handleFileUpload(scene.scene_id, e)}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* External Media URL Input */}
                <div className="flex items-center gap-1.5 flex-1 max-w-sm">
                  <input
                    type="url"
                    placeholder="Or paste image/video URL..."
                    value={customUrls[scene.scene_id] || ''}
                    disabled={isUploading || !projectId}
                    onChange={(e) => setCustomUrls(prev => ({ ...prev, [scene.scene_id]: e.target.value }))}
                    className="flex-1 bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={() => handleUrlSubmit(scene.scene_id)}
                    disabled={isUploading || !customUrls[scene.scene_id]?.trim() || !projectId}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg font-semibold text-xs transition"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}