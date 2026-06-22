export default function TimelineEditor({ storyboard, mediaAssets, onUpdate }) {
  const getMediaForScene = (sceneId) => {
    return mediaAssets.find(m => m.scene_id === sceneId);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <h3 className="text-lg font-semibold mb-4">Timeline</h3>
      
      <div className="space-y-2">
        {storyboard.scenes.map((scene, index) => {
          const media = getMediaForScene(scene.scene_id);
          return (
            <div 
              key={scene.scene_id}
              className="flex items-center gap-3 bg-gray-900 p-3 rounded border border-gray-700"
            >
              <div className="w-12 h-8 bg-gray-700 rounded flex items-center justify-center text-xs">
                {index + 1}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{scene.visual_prompt}</p>
                <p className="text-xs text-gray-400">{scene.start_time} - {scene.end_time} ({scene.duration_seconds}s)</p>
              </div>
              
              <div className="flex gap-2">
                {scene.typography?.text && <span className="text-blue-400 text-xs">T</span>}
                {media?.is_placeholder ? (
                  <span className="text-xs bg-red-900/50 text-red-300 px-2 py-0.5 rounded">Placeholder</span>
                ) : (
                  <span className="text-xs bg-green-900/50 text-green-300 px-2 py-0.5 rounded">Stock</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-4 p-3 bg-gray-900/50 rounded text-xs text-gray-400">
        <p>Total: {storyboard.total_duration}s | Scenes: {storyboard.scenes.length}</p>
        <p className="mt-1">Placeholders: {mediaAssets.filter(m => m.is_placeholder).length}</p>
      </div>
    </div>
  );
}