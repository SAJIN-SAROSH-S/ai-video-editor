import { useState, useEffect } from 'react';
import { getStatus } from '../api';

export default function VideoPreview({ projectId }) {
  const [videoUrl, setVideoUrl] = useState(null);

  useEffect(() => {
    const load = async () => {
      const s = await getStatus(projectId);
      if (s.output_path) {
        setVideoUrl(`http://localhost:8000/videos/${projectId}/final_video.mp4`);
      }
    };
    load();
  }, [projectId]);

  if (!videoUrl) {
    return <div className="text-center py-20">Loading video...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-gray-800 p-4 rounded-lg">
        <h2 className="text-xl font-bold mb-4">🎉 Your Video is Ready!</h2>
        
        <div className="aspect-video bg-black rounded-lg overflow-hidden">
          <video 
            src={videoUrl}
            controls
            className="w-full h-full"
          />
        </div>
        
        <div className="flex gap-4 mt-4">
          <a 
            href={videoUrl}
            download
            className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded font-semibold"
          >
            Download MP4
          </a>
        </div>
      </div>
    </div>
  );
}