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
    }, 800);

    return () => clearInterval(interval);
  }, [projectId, isActive]);

  if (!isActive || logs.length === 0) return null;

  const latestLog = logs[logs.length - 1];

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-2xl backdrop-blur space-y-4">
      {/* Header & Percentage */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            {latestLog.stage || 'Processing'} Stage
          </span>
        </div>
        <span className="text-xl font-mono font-bold text-blue-400">
          {currentPercent}%
        </span>
      </div>

      {/* Sleek Gradient Progress Bar */}
      <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden p-0.5 border border-slate-800">
        <div 
          className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 h-full rounded-full transition-all duration-500 shadow-sm"
          style={{ width: `${Math.max(4, currentPercent)}%` }}
        />
      </div>

      {/* Latest Status Message */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
        <p className="text-xs text-slate-200 font-medium truncate">
          {latestLog.message}
        </p>
        <span className="text-[10px] text-slate-500 font-mono pl-3 shrink-0">
          {latestLog.timestamp}
        </span>
      </div>

      {/* Collapsible Console Activity Stream */}
      <div className="max-h-36 overflow-y-auto space-y-1.5 bg-slate-950/90 p-3 rounded-xl border border-slate-800/80 font-mono text-[11px]">
        {logs.slice(-8).map((log, idx) => (
          <div key={idx} className="flex items-start gap-2 leading-relaxed">
            <span className="text-slate-600 shrink-0">{log.timestamp}</span>
            <span className={`font-semibold shrink-0 ${
              log.stage === 'ERROR' ? 'text-rose-400' :
              log.stage === 'RENDER' ? 'text-purple-400' :
              log.stage === 'MEDIA' ? 'text-emerald-400' :
              'text-blue-400'
            }`}>
              [{log.stage}]
            </span>
            <span className="text-slate-300 truncate">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}