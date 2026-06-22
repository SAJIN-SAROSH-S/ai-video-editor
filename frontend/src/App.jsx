import { useState } from 'react';
import { createProject, fetchMedia, renderVideo, getStatus } from './api';
import StoryboardViewer from './components/StoryboardViewer';
import TimelineEditor from './components/TimelineEditor';
import VideoPreview from './components/VideoPreview';
import ProgressLog from './components/ProgressLog';

function App() {
  const [step, setStep] = useState('input');
  const [projectId, setProjectId] = useState(null);
  const [storyboard, setStoryboard] = useState(null);
  const [mediaAssets, setMediaAssets] = useState([]);
  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [renderStatus, setRenderStatus] = useState('idle');
  const [showLog, setShowLog] = useState(false);

  const handleCreate = async () => {
    setIsLoading(true);
    setShowLog(true);
    try {
      const data = await createProject(topic);
      setProjectId(data.project_id);
      setStoryboard(data.storyboard);
      setShowLog(false);
      setStep('storyboard');
    } catch (e) {
      alert('Failed to generate storyboard: ' + e.message);
      setShowLog(false);
    }
    setIsLoading(false);
  };

  const handleFetchMedia = async () => {
    setIsLoading(true);
    setShowLog(true);
    try {
      const data = await fetchMedia(projectId);
      setMediaAssets(data.media);
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
    await renderVideo(projectId);
    
    const interval = setInterval(async () => {
      const status = await getStatus(projectId);
      setRenderStatus(status.status);
      if (status.status === 'done') {
        clearInterval(interval);
        setShowLog(false);
        setStep('done');
      } else if (status.status === 'error') {
        clearInterval(interval);
        setShowLog(false);
        alert('Render failed');
        setStep('media');
      }
    }, 2000);
  };

  const handleStoryboardUpdate = (updatedStoryboard) => {
    setStoryboard(updatedStoryboard);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-3xl font-bold mb-8 text-center">🎬 AI Video Editor</h1>
      
      {/* Progress Log - Shows during active operations */}
      {showLog && projectId && (
        <ProgressLog projectId={projectId} isActive={showLog} />
      )}

      {step === 'input' && (
        <div className="max-w-xl mx-auto space-y-4">
          <div>
            <label className="block text-sm mb-2">Video Topic</label>
            <input 
              type="text" 
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Climate Change Explained"
              className="w-full p-3 rounded bg-gray-800 border border-gray-700 text-white"
            />
          </div>
          <button 
            onClick={handleCreate}
            disabled={!topic || isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 p-3 rounded font-semibold disabled:opacity-50"
          >
            {isLoading ? 'Generating Storyboard...' : 'Generate Storyboard'}
          </button>
        </div>
      )}

      {step === 'storyboard' && storyboard && (
        <div className="space-y-6">
          <StoryboardViewer 
            storyboard={storyboard} 
            onUpdate={handleStoryboardUpdate}
          />
          <div className="flex gap-4 justify-center">
            <button 
              onClick={handleFetchMedia}
              className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded font-semibold"
            >
              Fetch Stock Media
            </button>
          </div>
        </div>
      )}

      {step === 'media' && (
        <div className="space-y-6">
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="text-xl font-semibold mb-4">Media Assets</h3>
            <div className="grid grid-cols-2 gap-4">
              {mediaAssets.map(asset => (
                <div key={asset.scene_id} className={`p-3 rounded ${asset.is_placeholder ? 'bg-red-900/30 border border-red-500' : 'bg-green-900/30 border border-green-500'}`}>
                  <p className="text-sm font-mono">{asset.prompt}</p>
                  <p className="text-xs mt-1">{asset.is_placeholder ? '⚠️ Placeholder' : '✅ Stock Media'}</p>
                  {asset.is_placeholder && (
                    <p className="text-xs text-red-300 mt-1">Search manually: {asset.path}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          <TimelineEditor 
            storyboard={storyboard}
            mediaAssets={mediaAssets}
            onUpdate={handleStoryboardUpdate}
          />
          
          <div className="flex gap-4 justify-center">
            <button 
              onClick={() => setStep('storyboard')}
              className="bg-gray-600 hover:bg-gray-700 px-6 py-3 rounded"
            >
              Back to Storyboard
            </button>
            <button 
              onClick={handleRender}
              className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded font-semibold"
            >
              Render Final Video
            </button>
          </div>
        </div>
      )}

      {step === 'rendering' && (
        <div className="text-center py-20">
          <div className="animate-spin w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-xl">Rendering your video... ({renderStatus})</p>
          <p className="text-gray-400 mt-2">This may take a few minutes on budget hardware</p>
        </div>
      )}

      {step === 'done' && (
        <VideoPreview projectId={projectId} />
      )}
    </div>
  );
}

export default App;