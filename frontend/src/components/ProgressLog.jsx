import { useState, useEffect } from 'react';
import { getLogs } from '../api';

export default function ProgressLog({ projectId, isActive }) {
  const [logs, setLogs] = useState([]);
  const [currentPercent, setCurrentPercent] = useState(0);

  useEffect(() => {
    if (!isActive || !projectId) return;

    const interval = setInterval(async () => {
      try {
        const data = await getLogs(projectId);
        if (data.logs && data.logs.length > 0) {
          setLogs(data.logs);
          setCurrentPercent(data.logs[data.logs.length - 1].percent);
        }
      } catch (e) {
        console.error("Failed to fetch logs:", e);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [projectId, isActive]);

  if (!isActive || logs.length === 0) return null;

  const latestLog = logs[logs.length - 1];

  return (
    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Progress</h3>
        <span className="text-2xl font-bold text-blue-400">{currentPercent}%</span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-700 rounded-full h-4 mb-4">
        <div 
          className="bg-blue-600 h-4 rounded-full transition-all duration-500"
          style={{ width: `${currentPercent}%` }}
        ></div>
      </div>

      {/* Current Stage */}
      <div className="mb-3">
        <span className="text-xs uppercase tracking-wider text-gray-400">Current Stage</span>
        <p className="text-lg font-medium text-white">{latestLog.stage}</p>
        <p className="text-sm text-gray-300">{latestLog.message}</p>
      </div>

      {/* Log History */}
      <div className="max-h-48 overflow-y-auto space-y-1 bg-gray-900/50 p-2 rounded">
        {logs.slice(-10).map((log, idx) => (
          <div key={idx} className="flex items-start gap-2 text-xs">
            <span className="text-gray-500 font-mono">{log.timestamp}</span>
            <span className={`font-semibold ${
              log.stage === 'ERROR' ? 'text-red-400' :
              log.stage === 'RENDER' ? 'text-purple-400' :
              log.stage === 'MEDIA' ? 'text-green-400' :
              'text-blue-400'
            }`}>[{log.stage}]</span>
            <span className="text-gray-300">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}