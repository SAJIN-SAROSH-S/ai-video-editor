import { useState } from 'react';

export default function TimelineEditor({ storyboard, mediaAssets, onUpdate }) {
  const [selectedSceneId, setSelectedSceneId] = useState(storyboard?.scenes?.[0]?.scene_id || 1);

  const getMediaForScene = (sceneId) => {
    return mediaAssets.find(m => m.scene_id === sceneId);
  };

  const totalDuration = storyboard.total_duration || storyboard.scenes.reduce((acc, s) => acc + (s.duration_seconds || 5), 0);
  const selectedScene = storyboard.scenes.find(s => s.scene_id === selectedSceneId) || storyboard.scenes[0];
  const selectedMedia = selectedScene ? getMediaForScene(selectedScene.scene_id) : null;

  return (
    <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-5 space-y-5">
      {/* Header & Stats */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-800/80">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-sm">
            🎬
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Interactive Video Timeline</h3>
            <p className="text-xs text-gray-400">Review sequence, timing, and media asset assignment</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="bg-gray-800/80 border border-gray-700/60 px-3 py-1 rounded-full text-gray-300 font-medium">
            ⏱️ {totalDuration.toFixed(1)}s Total
          </span>
          <span className="bg-gray-800/80 border border-gray-700/60 px-3 py-1 rounded-full text-gray-300 font-medium">
            🎞️ {storyboard.scenes.length} Scenes
          </span>
          <span className="bg-blue-900/30 border border-blue-800/40 px-3 py-1 rounded-full text-blue-300 font-medium">
            📐 {storyboard.aspect_ratio || '16:9'}
          </span>
        </div>
      </div>

      {/* Horizontal Multi-Track Timeline Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-[11px] text-gray-500 font-mono px-1">
          <span>0:00</span>
          <span>{(totalDuration / 2).toFixed(1)}s</span>
          <span>{totalDuration.toFixed(1)}s</span>
        </div>

        {/* Visual Scene Blocks Strip */}
        <div className="h-16 w-full bg-gray-950 rounded-xl p-1.5 border border-gray-800 flex gap-1.5 overflow-x-auto items-stretch">
          {storyboard.scenes.map((scene, index) => {
            const media = getMediaForScene(scene.scene_id);
            const widthPct = Math.max(12, ((scene.duration_seconds || 5) / totalDuration) * 100);
            const isSelected = scene.scene_id === selectedSceneId;

            return (
              <button
                key={scene.scene_id}
                onClick={() => setSelectedSceneId(scene.scene_id)}
                style={{ flexBasis: `${widthPct}%`, flexGrow: widthPct }}
                className={`relative rounded-lg p-2 flex flex-col justify-between text-left transition group border ${
                  isSelected
                    ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-500/10'
                    : 'bg-gray-900/90 border-gray-800 hover:border-gray-700 hover:bg-gray-850'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className={`text-[11px] font-bold ${isSelected ? 'text-blue-400' : 'text-gray-300'}`}>
                    #{index + 1}
                  </span>
                  <span className="text-[10px] font-mono text-gray-400">
                    {scene.duration_seconds}s
                  </span>
                </div>

                <p className="text-[11px] text-gray-300 truncate w-full font-medium">
                  {scene.visual_prompt}
                </p>

                <div className="flex items-center gap-1 mt-0.5">
                  {media?.is_placeholder ? (
                    <span className="w-2 h-2 rounded-full bg-amber-500" title="Placeholder" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-emerald-500" title="Stock Media" />
                  )}
                  {scene.typography?.text && (
                    <span className="text-[9px] bg-blue-900/60 text-blue-300 px-1 rounded">T</span>
                  )}
                  {scene.camera_movement && scene.camera_movement !== 'static' && (
                    <span className="text-[9px] text-purple-400 font-mono">🎥</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Scene Inspector Details Card */}
      {selectedScene && (
        <div className="bg-gray-950/80 border border-gray-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-start justify-between">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2">
              <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded font-bold">
                Scene {storyboard.scenes.findIndex(s => s.scene_id === selectedScene.scene_id) + 1} Details
              </span>
              <span className="text-gray-400 text-xs font-mono">
                Duration: {selectedScene.duration_seconds}s
              </span>
            </div>
            <p className="text-sm font-semibold text-white mt-1">
              {selectedScene.visual_prompt}
            </p>
            {selectedScene.typography?.text && (
              <p className="text-xs text-blue-300">
                <span className="text-gray-400">Overlay:</span> "{selectedScene.typography.text}" ({selectedScene.typography.position || 'center'})
              </p>
            )}
            {selectedScene.voiceover_text && (
              <p className="text-xs text-emerald-300">
                <span className="text-gray-400">Voiceover:</span> "{selectedScene.voiceover_text}"
              </p>
            )}
          </div>

          <div className="flex flex-wrap md:flex-col gap-2 text-xs">
            <div className="flex items-center gap-1.5 bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-800">
              <span className="text-gray-400">Asset:</span>
              {selectedMedia?.is_placeholder ? (
                <span className="text-amber-400 font-medium">⚠️ Graphic Card</span>
              ) : selectedMedia?.media_type === 'photo' ? (
                <span className="text-yellow-400 font-medium">📷 Stock Photo</span>
              ) : (
                <span className="text-emerald-400 font-medium">🎥 Stock Video</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-800">
              <span className="text-gray-400">Motion:</span>
              <span className="text-purple-300 font-medium">{selectedScene.camera_movement || 'static'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}