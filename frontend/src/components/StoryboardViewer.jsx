import { useState } from 'react';

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

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 p-4 rounded-lg">
        <h2 className="text-2xl font-bold">{storyboard.title}</h2>
        <div className="flex gap-4 mt-2 text-sm text-gray-400">
          <span>{storyboard.total_duration}s</span>
          <span>{storyboard.scenes.length} scenes</span>
          <span>{storyboard.music?.genre}</span>
        </div>
      </div>

      <div className="grid gap-4">
        {storyboard.scenes.map((scene, idx) => (
          <div key={scene.scene_id} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <div className="flex justify-between items-start mb-3">
              <div>
                <span className="bg-blue-600 text-xs px-2 py-1 rounded">Scene {idx + 1}</span>
                <span className="ml-2 text-gray-400 text-sm">{scene.start_time} - {scene.end_time}</span>
              </div>
              <button 
                onClick={() => setEditingScene(editingScene === scene.scene_id ? null : scene.scene_id)}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                {editingScene === scene.scene_id ? 'Done' : 'Edit'}
              </button>
            </div>

            {editingScene === scene.scene_id ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400">Visual Prompt</label>
                  <input 
                    value={scene.visual_prompt}
                    onChange={(e) => updateScene(scene.scene_id, 'visual_prompt', e.target.value)}
                    className="w-full bg-gray-900 p-2 rounded mt-1 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Fallback Text</label>
                  <input 
                    value={scene.fallback_text}
                    onChange={(e) => updateScene(scene.scene_id, 'fallback_text', e.target.value)}
                    className="w-full bg-gray-900 p-2 rounded mt-1 text-sm text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400">Duration (s)</label>
                    <input 
                      type="number"
                      value={scene.duration_seconds}
                      onChange={(e) => updateScene(scene.scene_id, 'duration_seconds', parseFloat(e.target.value))}
                      className="w-full bg-gray-900 p-2 rounded mt-1 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Camera</label>
                    <select 
                      value={scene.camera_movement}
                      onChange={(e) => updateScene(scene.scene_id, 'camera_movement', e.target.value)}
                      className="w-full bg-gray-900 p-2 rounded mt-1 text-sm text-white"
                    >
                      <option>static</option>
                      <option>zoom in</option>
                      <option>zoom out</option>
                      <option>ken burns</option>
                      <option>pan left</option>
                      <option>pan right</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400">On-Screen Text</label>
                  <input 
                    value={scene.typography?.text || ''}
                    onChange={(e) => updateScene(scene.scene_id, 'typography', {...scene.typography, text: e.target.value})}
                    className="w-full bg-gray-900 p-2 rounded mt-1 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Voiceover</label>
                  <textarea 
                    value={scene.voiceover_text || ''}
                    onChange={(e) => updateScene(scene.scene_id, 'voiceover_text', e.target.value)}
                    className="w-full bg-gray-900 p-2 rounded mt-1 text-sm text-white h-20"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <p><span className="text-gray-400">Visual:</span> {scene.visual_prompt}</p>
                <p><span className="text-gray-400">Fallback:</span> {scene.fallback_text}</p>
                <p><span className="text-gray-400">Movement:</span> {scene.camera_movement}</p>
                {scene.typography?.text && (
                  <p><span className="text-gray-400">Text:</span> "{scene.typography.text}"</p>
                )}
                {scene.voiceover_text && (
                  <p><span className="text-gray-400">Voice:</span> {scene.voiceover_text}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}