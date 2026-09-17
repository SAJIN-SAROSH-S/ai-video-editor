import { useState, useEffect } from 'react';
import { getStatus, SERVER_ROOT, cleanupProjectMedia } from '../api';

export default function VideoPreview({ projectId, onEdit }) {
  const [videoUrl, setVideoUrl] = useState(null);
  const [storyboard, setStoryboard] = useState(null);
  const [isCleaning, setIsCleaning] = useState(false);
  const [assetsCleaned, setAssetsCleaned] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const s = await getStatus(projectId);
        if (s.output_path) {
          // Normalize URL
          const path = s.output_path.startsWith('/') ? s.output_path : `/${s.output_path}`;
          setVideoUrl(`${SERVER_ROOT}${path}`);
        } else {
          setVideoUrl(`${SERVER_ROOT}/videos/${projectId}/final_video.mp4`);
        }
        if (s.storyboard) {
          setStoryboard(s.storyboard);
        }
        if (!s.media_assets || s.media_assets.length === 0) {
          // Already cleaned or no raw media stored
          setAssetsCleaned(true);
        }
      } catch (err) {
        console.error("Failed to load video status:", err);
      }
    };
    load();
  }, [projectId]);

  const handleDeleteAssets = async () => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete the temporary stock media and placeholder files for this project?\n\n✓ The final exported video (MP4) will be kept safe!\n✓ This will free up your disk space."
    );
    if (!confirmDelete) return;

    setIsCleaning(true);
    try {
      await cleanupProjectMedia(projectId);
      setAssetsCleaned(true);
      alert("✅ Temporary source assets deleted successfully!\nYour final video is preserved.");
    } catch (err) {
      alert("Failed to delete assets: " + err.message);
    } finally {
      setIsCleaning(false);
    }
  };

  if (!videoUrl) {
    return <div className="text-center py-20 text-gray-400">Loading video player...</div>;
  }

  const ar = storyboard?.aspect_ratio || '16:9';
  const containerClass = ar === '9:16'
    ? 'max-w-xs mx-auto aspect-[9/16]'
    : ar === '1:1'
    ? 'max-w-md mx-auto aspect-square'
    : 'max-w-3xl mx-auto aspect-video';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span>🎉</span> Video Ready for Export
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              {storyboard?.title || 'Your Video'} · {storyboard?.total_duration || 15}s · {ar}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {assetsCleaned && (
              <span className="bg-blue-900/40 text-blue-300 text-xs px-3 py-1 rounded-full border border-blue-800/40 font-medium">
                🧹 Raw Assets Cleaned
              </span>
            )}
            <span className="bg-green-900/40 text-green-300 text-xs px-3 py-1 rounded-full border border-green-800/40 font-semibold">
              ✓ 1080p MP4 Ready
            </span>
          </div>
        </div>
        
        <div className={`${containerClass} bg-black rounded-xl overflow-hidden shadow-2xl border border-gray-800 flex items-center justify-center`}>
          <video 
            src={videoUrl}
            controls
            autoPlay
            playsInline
            className="w-full h-full object-contain"
          />
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6 pt-4 border-t border-gray-800">
          <a 
            href={videoUrl}
            download={`video_${projectId}.mp4`}
            className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-xl font-bold text-xs shadow-lg shadow-green-500/20 transition flex items-center gap-2"
          >
            <span>📥</span> Download MP4 Video
          </a>

          {onEdit && (
            <button
              onClick={onEdit}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold text-xs shadow-lg shadow-indigo-500/20 transition flex items-center gap-2"
            >
              <span>✏️</span> Edit Visuals, Text & Length
            </button>
          )}

          {!assetsCleaned ? (
            <button
              onClick={handleDeleteAssets}
              disabled={isCleaning}
              className="bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/50 hover:border-red-700 px-4 py-3 rounded-xl font-semibold text-xs transition flex items-center gap-2 disabled:opacity-50"
            >
              <span>🧹</span> {isCleaning ? 'Deleting...' : 'Delete Raw Assets'}
            </button>
          ) : (
            <button
              disabled
              className="bg-gray-800/40 text-gray-500 border border-gray-800 px-4 py-3 rounded-xl text-xs font-medium flex items-center gap-2 cursor-not-allowed"
            >
              <span>✓</span> Raw Assets Cleaned
            </button>
          )}

          <button
            onClick={() => {
              navigator.clipboard.writeText(videoUrl);
              alert('Video link copied to clipboard!');
            }}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-3 rounded-xl font-semibold text-xs transition flex items-center gap-1.5"
          >
            <span>🔗</span> Copy Link
          </button>
        </div>
      </div>
    </div>
  );
}