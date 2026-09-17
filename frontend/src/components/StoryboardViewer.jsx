import { useState } from 'react';

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

export default function StoryboardViewer({ storyboard, onUpdate }) {
  const [editingScene, setEditingScene] = useState(null);

  const updateScene = (sceneId, field, value) => {
    const updated = {
      ...storyboard,
      scenes: storyboard.scenes.map(s => 
        s.scene_id === sceneId ? { ...s, [field]: value } : s
      )
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

  return (
    <div className="space-y-4">
      {/* Title & Metadata Header */}
      <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl flex flex-wrap justify-between items-center gap-4 backdrop-blur">
        <div>
          <h2 className="text-lg font-bold text-white">{storyboard.title}</h2>
          <div className="flex flex-wrap gap-2.5 mt-2 text-xs">
            <span className="bg-slate-800/80 border border-slate-700/60 px-3 py-1 rounded-full text-slate-300 font-medium">
              ⏱️ {storyboard.total_duration}s Total
            </span>
            <span className="bg-slate-800/80 border border-slate-700/60 px-3 py-1 rounded-full text-slate-300 font-medium">
              🎬 {storyboard.scenes.length} Scenes
            </span>
            <span className="bg-blue-900/30 border border-blue-800/40 px-3 py-1 rounded-full text-blue-300 font-medium">
              📐 {storyboard.aspect_ratio || '16:9'}
            </span>
          </div>
        </div>
      </div>

      {/* Scene Cards List */}
      <div className="grid gap-3.5">
        {storyboard.scenes.map((scene, idx) => {
          const isEditing = editingScene === scene.scene_id;

          return (
            <div
              key={scene.scene_id}
              className={`border rounded-2xl p-5 transition ${
                isEditing
                  ? 'bg-slate-900 border-blue-500/80 shadow-lg shadow-blue-500/5'
                  : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700'
              }`}
            >
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
                </div>
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

              {isEditing ? (
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                        Visual Stock Prompt
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
                        Fallback Text (for Placeholder Graphic)
                      </label>
                      <input 
                        value={scene.fallback_text}
                        onChange={(e) => updateScene(scene.scene_id, 'fallback_text', e.target.value)}
                        placeholder="e.g. Mountain peaks in sunrise"
                        className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                        Duration (s)
                      </label>
                      <input 
                        type="number"
                        min="1"
                        step="0.5"
                        value={scene.duration_seconds}
                        onChange={(e) => updateScene(scene.scene_id, 'duration_seconds', parseFloat(e.target.value) || 3)}
                        className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
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
                        Color Grade
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

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                        On-Screen Typography
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
                        Text Position
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

                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Voiceover Script Text
                    </label>
                    <textarea 
                      value={scene.voiceover_text || ''}
                      onChange={(e) => updateScene(scene.scene_id, 'voiceover_text', e.target.value)}
                      placeholder="Narrator narration script for this scene..."
                      rows={2}
                      className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 resize-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-2">
                    <p><span className="text-slate-400 font-medium">Visual:</span> <span className="text-white font-semibold">{scene.visual_prompt}</span></p>
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
                  <div className="space-y-2">
                    {scene.typography?.text ? (
                      <p><span className="text-slate-400 font-medium">Overlay:</span> <span className="text-blue-300 font-semibold">"{scene.typography.text}"</span> <span className="text-slate-500">({scene.typography.position || 'center'})</span></p>
                    ) : (
                      <p className="text-slate-500 italic">No text overlay</p>
                    )}
                    {scene.voiceover_text && (
                      <p><span className="text-slate-400 font-medium">Voiceover:</span> <span className="text-emerald-300">"{scene.voiceover_text}"</span></p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}