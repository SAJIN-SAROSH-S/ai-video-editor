import { useState, useRef, useEffect, useMemo } from 'react';
import { formatTimecode } from '../utils/timelineConverter';
import { uploadCustomMedia } from '../api';

export default function OpenCutTimeline({
  timeline,
  projectId,
  mediaAssets = [],
  onUpdateTimeline,
  onRenderTimeline,
  onMediaUploaded,
  isRendering = false
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState(null);
  const [pxPerSecond, setPxPerSecond] = useState(40); // Zoom level
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState('inspector'); // inspector | media | tracks
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [targetDurationInput, setTargetDurationInput] = useState(timeline?.duration || 15);

  const animationFrameRef = useRef(null);
  const lastTimeRef = useRef(null);
  const timelineTracksRef = useRef(null);
  const isDraggingPlayheadRef = useRef(false);

  // Fallback safe timeline
  const safeTimeline = useMemo(() => {
    if (!timeline || !Array.isArray(timeline.tracks)) {
      return {
        id: 'timeline-default',
        title: 'OpenCut Studio',
        duration: 15.0,
        aspect_ratio: '16:9',
        tracks: []
      };
    }
    return timeline;
  }, [timeline]);

  const totalDuration = safeTimeline.duration || 15.0;

  // Find currently selected clip across all tracks
  const selectedClip = useMemo(() => {
    if (!selectedClipId) return null;
    for (const track of safeTimeline.tracks) {
      const found = track.clips?.find(c => c.id === selectedClipId);
      if (found) return { clip: found, track };
    }
    return null;
  }, [selectedClipId, safeTimeline]);

  // Find active clips at currentTime for live preview
  const activeClipsAtPlayhead = useMemo(() => {
    const active = {
      video: null,
      overlay: null,
      text: null,
      voiceover: null,
      audio: null
    };

    safeTimeline.tracks.forEach(track => {
      if (track.muted) return;
      const currentClip = track.clips?.find(
        c => currentTime >= c.start_time && currentTime < (c.start_time + c.duration)
      );

      if (currentClip) {
        if (track.type === 'video') {
          if (track.order === 1 || track.id.includes('v1')) {
            active.video = currentClip;
          } else {
            active.overlay = currentClip;
          }
        } else if (track.type === 'text') {
          active.text = currentClip;
        } else if (track.type === 'audio') {
          if (track.name.toLowerCase().includes('voice') || track.id.includes('a1')) {
            active.voiceover = currentClip;
          } else {
            active.audio = currentClip;
          }
        }
      }
    });

    return active;
  }, [safeTimeline, currentTime]);

  // Compute playable / viewable media source URL for live monitor
  const activeMediaSrc = useMemo(() => {
    const vClip = activeClipsAtPlayhead.video;
    if (!vClip) return null;
    if (vClip.source_url) {
      if (vClip.source_url.startsWith('http')) return vClip.source_url;
      const parts = vClip.source_url.replace(/\\/g, '/').split('/');
      const fname = parts[parts.length - 1];
      const projIdx = parts.indexOf('projects');
      if (projIdx !== -1 && parts[projIdx + 1]) {
        const pId = parts[projIdx + 1];
        return `http://localhost:8000/videos/${pId}/media/${fname}`;
      }
    }
    const matched = mediaAssets.find(m => 
      vClip.id?.includes(`-${m.scene_id}`) || 
      (m.prompt && vClip.name?.toLowerCase().includes(m.prompt.slice(0, 15).toLowerCase()))
    );
    if (matched?.url) {
      return matched.url.startsWith('http') ? matched.url : `http://localhost:8000${matched.url}`;
    }
    return null;
  }, [activeClipsAtPlayhead.video, mediaAssets]);

  // Playhead animation loop
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    lastTimeRef.current = performance.now();

    const loop = (now) => {
      const delta = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      setCurrentTime((prev) => {
        const next = prev + delta;
        if (next >= totalDuration) {
          setIsPlaying(false);
          return totalDuration;
        }
        return next;
      });

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, totalDuration]);

  // Keyboard shortcuts (Space: Play/Pause, Del: Delete, Split: Ctrl+B)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedClipId) {
          e.preventDefault();
          handleDeleteClip(selectedClipId);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyB') {
        e.preventDefault();
        handleSplitAtPlayhead();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClipId, currentTime, safeTimeline]);

  // ─── Track & Clip Actions ──────────────────────────────────────────────────

  const updateTimelineState = (newTimeline) => {
    onUpdateTimeline?.(newTimeline);
  };

  const handleScaleTimelineDuration = (newTotal) => {
    const target = Math.max(5, parseFloat(newTotal) || 15);
    const currentTotal = safeTimeline.duration || 15;
    const ratio = target / currentTotal;

    const updatedTracks = safeTimeline.tracks.map(track => {
      let currentStart = 0;
      const updatedClips = (track.clips || []).map(clip => {
        const newDur = Math.max(0.5, parseFloat((clip.duration * ratio).toFixed(2)));
        const newStart = parseFloat(currentStart.toFixed(2));
        currentStart += newDur;
        return {
          ...clip,
          start_time: newStart,
          duration: newDur
        };
      });
      return {
        ...track,
        clips: updatedClips
      };
    });

    const updated = {
      ...safeTimeline,
      duration: target,
      tracks: updatedTracks
    };
    setTargetDurationInput(target);
    updateTimelineState(updated);
  };

  const handleCustomFileUpload = async (file) => {
    if (!file || !projectId || !selectedClip) return;
    let sceneId = 1;
    const match = selectedClip.clip.id.match(/\d+/);
    if (match) sceneId = parseInt(match[0]);

    setIsUploadingMedia(true);
    try {
      const res = await uploadCustomMedia(projectId, sceneId, file);
      if (res.asset) {
        handleUpdateClip(selectedClip.clip.id, {
          source_url: res.asset.path || res.asset.url,
          media_type: res.asset.media_type === 'video' ? 'video' : 'image',
          name: `Custom: ${res.asset.filename || file.name}`
        });
        onMediaUploaded?.(res.asset, res.timeline);
      }
    } catch (err) {
      alert("Media upload failed: " + err.message);
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleCustomUrlSubmit = async () => {
    if (!customUrlInput.trim() || !projectId || !selectedClip) return;
    let sceneId = 1;
    const match = selectedClip.clip.id.match(/\d+/);
    if (match) sceneId = parseInt(match[0]);

    setIsUploadingMedia(true);
    try {
      const res = await uploadCustomMedia(projectId, sceneId, customUrlInput.trim());
      if (res.asset) {
        handleUpdateClip(selectedClip.clip.id, {
          source_url: res.asset.path || res.asset.url,
          media_type: res.asset.media_type === 'video' ? 'video' : 'image',
          name: `Custom URL: ${res.asset.filename || 'Visual'}`
        });
        onMediaUploaded?.(res.asset, res.timeline);
        setCustomUrlInput('');
      }
    } catch (err) {
      alert("Failed to download media from URL: " + err.message);
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleUpdateClip = (clipId, patch) => {
    const updatedTracks = safeTimeline.tracks.map(track => {
      const clipIndex = track.clips.findIndex(c => c.id === clipId);
      if (clipIndex === -1) return track;

      const updatedClips = [...track.clips];
      updatedClips[clipIndex] = {
        ...updatedClips[clipIndex],
        ...patch
      };
      return { ...track, clips: updatedClips };
    });

    updateTimelineState({
      ...safeTimeline,
      tracks: updatedTracks
    });
  };

  const handleUpdateAspectRatio = (newAr) => {
    updateTimelineState({
      ...safeTimeline,
      aspect_ratio: newAr
    });
  };

  const handleDeleteClip = (clipId) => {
    const updatedTracks = safeTimeline.tracks.map(track => ({
      ...track,
      clips: track.clips.filter(c => c.id !== clipId)
    }));

    setSelectedClipId(null);
    updateTimelineState({
      ...safeTimeline,
      tracks: updatedTracks
    });
  };

  const handleDuplicateClip = (clipId) => {
    const target = selectedClip?.clip;
    if (!target) return;

    const newClip = {
      ...JSON.parse(JSON.stringify(target)),
      id: `clip-${Date.now()}`,
      name: `${target.name} (Copy)`,
      start_time: Number((target.start_time + target.duration).toFixed(2))
    };

    const updatedTracks = safeTimeline.tracks.map(track => {
      if (track.id !== selectedClip.track.id) return track;
      return {
        ...track,
        clips: [...track.clips, newClip]
      };
    });

    setSelectedClipId(newClip.id);
    updateTimelineState({
      ...safeTimeline,
      tracks: updatedTracks
    });
  };

  const handleSplitAtPlayhead = () => {
    if (!selectedClip) {
      alert('Select a clip first to split at the playhead position.');
      return;
    }

    const { clip, track } = selectedClip;
    if (currentTime <= clip.start_time || currentTime >= (clip.start_time + clip.duration)) {
      alert('The playhead is outside the selected clip boundaries.');
      return;
    }

    const firstDuration = Number((currentTime - clip.start_time).toFixed(2));
    const secondDuration = Number((clip.duration - firstDuration).toFixed(2));

    const firstClip = {
      ...clip,
      duration: firstDuration
    };

    const secondClip = {
      ...JSON.parse(JSON.stringify(clip)),
      id: `clip-${Date.now()}`,
      name: `${clip.name} (Part 2)`,
      start_time: Number(currentTime.toFixed(2)),
      duration: secondDuration,
      trim_in: Number(((clip.trim_in || 0) + firstDuration).toFixed(2))
    };

    const updatedTracks = safeTimeline.tracks.map(t => {
      if (t.id !== track.id) return t;
      const filtered = t.clips.filter(c => c.id !== clip.id);
      return {
        ...t,
        clips: [...filtered, firstClip, secondClip].sort((a, b) => a.start_time - b.start_time)
      };
    });

    setSelectedClipId(secondClip.id);
    updateTimelineState({
      ...safeTimeline,
      tracks: updatedTracks
    });
  };

  const handleAddTrack = (type) => {
    const existingTypeTracks = safeTimeline.tracks.filter(t => t.type === type);
    const count = existingTypeTracks.length + 1;
    const prefix = type === 'video' ? 'V' : type === 'text' ? 'T' : 'A';
    const newTrack = {
      id: `track-${prefix.toLowerCase()}${count}`,
      name: `${type === 'video' ? 'Video' : type === 'text' ? 'Text' : 'Audio'} Track (${prefix}${count})`,
      type: type,
      muted: false,
      locked: false,
      volume: 1.0,
      order: safeTimeline.tracks.length + 1,
      clips: []
    };

    updateTimelineState({
      ...safeTimeline,
      tracks: [...safeTimeline.tracks, newTrack]
    });
  };

  const handleToggleMute = (trackId) => {
    const updated = safeTimeline.tracks.map(t =>
      t.id === trackId ? { ...t, muted: !t.muted } : t
    );
    updateTimelineState({ ...safeTimeline, tracks: updated });
  };

  const handleToggleLock = (trackId) => {
    const updated = safeTimeline.tracks.map(t =>
      t.id === trackId ? { ...t, locked: !t.locked } : t
    );
    updateTimelineState({ ...safeTimeline, tracks: updated });
  };

  const handleDeleteTrack = (trackId) => {
    if (safeTimeline.tracks.length <= 1) {
      alert('Cannot delete the only track.');
      return;
    }
    const updated = safeTimeline.tracks.filter(t => t.id !== trackId);
    updateTimelineState({ ...safeTimeline, tracks: updated });
  };

  // ─── Ruler & Playhead Dragging ─────────────────────────────────────────────

  const handleRulerClick = (e) => {
    if (!timelineTracksRef.current) return;
    const rect = timelineTracksRef.current.getBoundingClientRect();
    const clickX = Math.max(0, e.clientX - rect.left);
    const newTime = Math.min(totalDuration, Math.max(0, clickX / pxPerSecond));
    setCurrentTime(Number(newTime.toFixed(2)));
  };

  const handleRulerMouseDown = (e) => {
    isDraggingPlayheadRef.current = true;
    handleRulerClick(e);

    const onMouseMove = (moveEvent) => {
      if (!isDraggingPlayheadRef.current || !timelineTracksRef.current) return;
      const rect = timelineTracksRef.current.getBoundingClientRect();
      const moveX = Math.max(0, moveEvent.clientX - rect.left);
      const newTime = Math.min(totalDuration, Math.max(0, moveX / pxPerSecond));
      setCurrentTime(Number(newTime.toFixed(2)));
    };

    const onMouseUp = () => {
      isDraggingPlayheadRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // ─── Clip Dragging & Trimming Engine ───────────────────────────────────────

  const handleClipMouseDown = (e, clip, track) => {
    if (track.locked) return;
    e.stopPropagation();
    setSelectedClipId(clip.id);

    const startClientX = e.clientX;
    const originalStartTime = clip.start_time;

    const onMouseMove = (moveEvent) => {
      const deltaPx = moveEvent.clientX - startClientX;
      let newStart = Math.max(0, originalStartTime + (deltaPx / pxPerSecond));

      // Magnetic Snapping to playhead or 0
      if (snapEnabled) {
        if (Math.abs(newStart - currentTime) < 0.2) {
          newStart = currentTime;
        } else if (newStart < 0.2) {
          newStart = 0;
        }
      }

      handleUpdateClip(clip.id, { start_time: Number(newStart.toFixed(2)) });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleTrimLeft = (e, clip, track) => {
    if (track.locked) return;
    e.stopPropagation();
    const startClientX = e.clientX;
    const origStart = clip.start_time;
    const origDur = clip.duration;

    const onMouseMove = (moveEvent) => {
      const deltaPx = moveEvent.clientX - startClientX;
      const deltaSec = deltaPx / pxPerSecond;
      const newStart = Math.max(0, origStart + deltaSec);
      const newDur = Math.max(0.3, origDur - deltaSec);

      handleUpdateClip(clip.id, {
        start_time: Number(newStart.toFixed(2)),
        duration: Number(newDur.toFixed(2))
      });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleTrimRight = (e, clip, track) => {
    if (track.locked) return;
    e.stopPropagation();
    const startClientX = e.clientX;
    const origDur = clip.duration;

    const onMouseMove = (moveEvent) => {
      const deltaPx = moveEvent.clientX - startClientX;
      const newDur = Math.max(0.3, origDur + (deltaPx / pxPerSecond));
      handleUpdateClip(clip.id, { duration: Number(newDur.toFixed(2)) });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Generate tick markers for timeline ruler
  const rulerTicks = useMemo(() => {
    const ticks = [];
    const step = pxPerSecond > 60 ? 0.5 : 1.0;
    const maxSec = Math.ceil(totalDuration) + 5;
    for (let t = 0; t <= maxSec; t += step) {
      ticks.push(t);
    }
    return ticks;
  }, [totalDuration, pxPerSecond]);

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
      {/* ── 1. Top OpenCut Studio Toolbar ── */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Left: Branding & Playback Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-xl">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold tracking-wide text-white uppercase">OpenCut NLE Studio</span>
            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-semibold px-2 py-0.5 rounded-full">
              Multi-Track
            </span>
          </div>

          <div className="h-5 w-[1px] bg-slate-800 mx-1" />

          {/* Transport Controls */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentTime(Math.max(0, currentTime - 0.1))}
              title="Step Backward (0.1s)"
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition text-xs font-bold"
            >
              ⏮️
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              title="Play / Pause (Space)"
              className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition ${
                isPlaying
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
              }`}
            >
              <span>{isPlaying ? '⏸️ Pause' : '▶️ Play'}</span>
            </button>
            <button
              onClick={() => setCurrentTime(Math.min(totalDuration, currentTime + 0.1))}
              title="Step Forward (0.1s)"
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition text-xs font-bold"
            >
              ⏭️
            </button>
            <button
              onClick={() => { setIsPlaying(false); setCurrentTime(0); }}
              title="Rewind to Start"
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition text-xs font-bold"
            >
              🔄
            </button>
          </div>

          {/* Timecode Digital Counter */}
          <div className="font-mono bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-400">
            {formatTimecode(currentTime)} <span className="text-slate-600">/</span> {formatTimecode(totalDuration)}
          </div>
        </div>

        {/* Center: Editing Tools */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSplitAtPlayhead}
            disabled={!selectedClip}
            title="Split Clip at Playhead (Ctrl+B)"
            className="flex items-center gap-1.5 bg-slate-800/90 hover:bg-slate-700 disabled:opacity-40 text-slate-200 hover:text-white px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-700 transition"
          >
            <span>✂️ Split</span>
          </button>

          <button
            onClick={() => selectedClipId && handleDuplicateClip(selectedClipId)}
            disabled={!selectedClip}
            title="Duplicate Clip"
            className="flex items-center gap-1.5 bg-slate-800/90 hover:bg-slate-700 disabled:opacity-40 text-slate-200 hover:text-white px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-700 transition"
          >
            <span>📑 Copy</span>
          </button>

          <button
            onClick={() => selectedClipId && handleDeleteClip(selectedClipId)}
            disabled={!selectedClip}
            title="Delete Selected Clip (Del)"
            className="flex items-center gap-1.5 bg-rose-950/40 hover:bg-rose-900/60 disabled:opacity-40 text-rose-300 hover:text-rose-100 px-3 py-1.5 rounded-xl text-xs font-semibold border border-rose-800/50 transition"
          >
            <span>🗑️ Delete</span>
          </button>

          <div className="h-5 w-[1px] bg-slate-800 mx-1" />

          {/* Add Track Menu */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleAddTrack('video')}
              className="bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border border-blue-800/50 px-2.5 py-1.5 rounded-xl text-xs font-medium transition"
            >
              + Video
            </button>
            <button
              onClick={() => handleAddTrack('text')}
              className="bg-amber-900/40 hover:bg-amber-800/60 text-amber-300 border border-amber-800/50 px-2.5 py-1.5 rounded-xl text-xs font-medium transition"
            >
              + Text
            </button>
            <button
              onClick={() => handleAddTrack('audio')}
              className="bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 border border-emerald-800/50 px-2.5 py-1.5 rounded-xl text-xs font-medium transition"
            >
              + Audio
            </button>
          </div>
        </div>

        {/* Right: Zoom Slider, Snapping & Render Trigger */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 px-2.5 py-1 rounded-xl">
            <span className="text-[11px] text-slate-400">🔍</span>
            <input
              type="range"
              min="20"
              max="100"
              value={pxPerSecond}
              onChange={(e) => setPxPerSecond(Number(e.target.value))}
              className="w-20 accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
          </div>

          <button
            onClick={() => setSnapEnabled(!snapEnabled)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1 ${
              snapEnabled
                ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            <span>🧲 Snap</span>
          </button>

          <button
            onClick={() => onRenderTimeline?.(safeTimeline)}
            disabled={isRendering}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs px-5 py-2 rounded-xl shadow-lg shadow-purple-500/20 transition disabled:opacity-50 flex items-center gap-1.5"
          >
            <span>{isRendering ? 'Rendering...' : 'Render Video 🎬'}</span>
          </button>
        </div>
      </div>

      {/* ── 1b. Video Length Duration Scaling Bar ── */}
      <div className="bg-slate-900/60 border-b border-slate-800/80 px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">⏱️ Video Length:</span>
          <div className="flex items-center gap-1">
            {[15, 30, 45, 60, 90, 120].map(sec => (
              <button
                key={sec}
                onClick={() => handleScaleTimelineDuration(sec)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                  Math.round(totalDuration) === sec
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                }`}
              >
                {sec}s
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">Custom Duration:</span>
          <input
            type="number"
            min="5"
            max="600"
            value={targetDurationInput}
            onChange={e => setTargetDurationInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleScaleTimelineDuration(targetDurationInput);
            }}
            className="w-16 bg-slate-950 border border-slate-800 px-2 py-0.5 rounded-lg text-white font-mono text-[11px] text-center"
          />
          <span className="text-[11px] text-slate-400">sec</span>
          <button
            onClick={() => handleScaleTimelineDuration(targetDurationInput)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-slate-700 transition"
          >
            Scale
          </button>
        </div>
      </div>

      {/* ── 2. Live Canvas Preview & Inspector Split Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 border-b border-slate-800 bg-slate-950">
        {/* Left Preview Screen (7 cols) */}
        <div className="lg:col-span-7 p-6 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col items-center justify-center bg-slate-950/60 min-h-[360px]">
          {/* Canvas Aspect Ratio Toolbar */}
          <div className="flex flex-wrap items-center justify-between w-full max-w-[500px] mb-3 gap-2">
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl">
              {[
                { id: '16:9', label: '16:9', icon: '🖥️' },
                { id: '9:16', label: '9:16', icon: '📱' },
                { id: '1:1', label: '1:1', icon: '⬛' },
                { id: '4:5', label: '4:5', icon: '📊' },
                { id: '21:9', label: '21:9', icon: '🎬' },
              ].map(arItem => (
                <button
                  key={arItem.id}
                  onClick={() => handleUpdateAspectRatio(arItem.id)}
                  title={`Switch to ${arItem.label}`}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition flex items-center gap-1 ${
                    safeTimeline.aspect_ratio === arItem.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <span>{arItem.icon}</span>
                  <span>{arItem.label}</span>
                </button>
              ))}
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              {safeTimeline.aspect_ratio === '9:16' ? '1080×1920 (Reel)' : safeTimeline.aspect_ratio === '1:1' ? '1080×1080 (Square)' : safeTimeline.aspect_ratio === '4:5' ? '1080×1350 (Post)' : safeTimeline.aspect_ratio === '21:9' ? '2560×1080 (Cinematic)' : '1920×1080 (Full HD)'}
            </span>
          </div>

          {/* Canvas Container */}
          {(() => {
            const vClip = activeClipsAtPlayhead.video;
            const tform = vClip?.transform || {};
            const scaleVal = tform.scale !== undefined ? tform.scale : 1.0;
            const posX = tform.position_x || 0;
            const posY = tform.position_y || 0;
            const rotVal = tform.rotation || 0;
            const flipHVal = tform.flip_h ? -1 : 1;
            const flipVVal = tform.flip_v ? -1 : 1;
            const opacityVal = tform.opacity !== undefined ? tform.opacity : 1.0;
            const fitModeVal = tform.fit_mode || 'cover';
            const bgFillVal = tform.bg_fill_mode || 'black';

            const ar = safeTimeline.aspect_ratio || '16:9';
            const containerClasses =
              ar === '9:16'
                ? 'w-[200px] h-[356px]'
                : ar === '1:1'
                ? 'w-[290px] h-[290px]'
                : ar === '4:5'
                ? 'w-[240px] h-[300px]'
                : ar === '21:9'
                ? 'w-full max-w-[500px] aspect-[21/9]'
                : 'w-full max-w-[480px] aspect-video';

            return (
              <div className={`relative bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center transition-all ${containerClasses}`}>
                {/* Background Blurred Fill Layer (when bg_fill_mode is blur_fill) */}
                {bgFillVal === 'blur_fill' && activeMediaSrc && (
                  <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                    <img
                      src={activeMediaSrc}
                      alt=""
                      className="w-full h-full object-cover filter blur-xl scale-125 opacity-40"
                    />
                  </div>
                )}

                {/* Visual Media Layer */}
                {vClip ? (
                  <div className="w-full h-full relative flex items-center justify-center overflow-hidden z-10">
                    {activeMediaSrc ? (
                      vClip.media_type === 'video' ? (
                        <video
                          key={activeMediaSrc}
                          src={activeMediaSrc}
                          muted
                          loop
                          autoPlay
                          style={{
                            transform: `translate(${posX}px, ${posY}px) scale(${scaleVal}) rotate(${rotVal}deg) scale(${flipHVal}, ${flipVVal})`,
                            opacity: opacityVal,
                            objectFit: fitModeVal === 'contain' ? 'contain' : fitModeVal === 'stretch' ? 'fill' : 'cover',
                            transition: 'transform 0.15s ease-out, opacity 0.15s ease-out'
                          }}
                          className="w-full h-full"
                        />
                      ) : (
                        <img
                          key={activeMediaSrc}
                          src={activeMediaSrc}
                          alt={vClip.name}
                          style={{
                            transform: `translate(${posX}px, ${posY}px) scale(${scaleVal}) rotate(${rotVal}deg) scale(${flipHVal}, ${flipVVal})`,
                            opacity: opacityVal,
                            objectFit: fitModeVal === 'contain' ? 'contain' : fitModeVal === 'stretch' ? 'fill' : 'cover',
                            transition: 'transform 0.15s ease-out, opacity 0.15s ease-out'
                          }}
                          className="w-full h-full"
                        />
                      )
                    ) : (
                      <div className="text-center p-4">
                        <div className="text-3xl mb-1">🎬</div>
                        <p className="text-xs font-bold text-white max-w-[240px] truncate">
                          {vClip.name}
                        </p>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Scale: {Math.round(scaleVal * 100)}% · Pos: ({posX}, {posY}) · {rotVal}°
                        </span>
                      </div>
                    )}

                    {/* Active Selected Clip Bounding Box Indicator */}
                    {selectedClipId === vClip.id && (
                      <div className="absolute inset-0 pointer-events-none border border-indigo-400/40 rounded-xl m-1">
                        <div className="absolute top-1 left-1 bg-indigo-600 text-[9px] font-bold text-white px-1.5 py-0.5 rounded shadow">
                          {Math.round(scaleVal * 100)}%
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-slate-600 z-10">
                    <span className="text-2xl">⬛</span>
                    <p className="text-[11px] font-mono mt-1">No Active Visual Clip</p>
                  </div>
                )}

                {/* Typography / Subtitle Overlay */}
                {activeClipsAtPlayhead.text && (
                  <div
                    className={`absolute w-full px-4 text-center pointer-events-none transition-all z-20 ${
                      activeClipsAtPlayhead.text.typography?.position === 'top-center'
                        ? 'top-4'
                        : activeClipsAtPlayhead.text.typography?.position === 'bottom-center'
                        ? 'bottom-4'
                        : activeClipsAtPlayhead.text.typography?.position === 'lower-third'
                        ? 'bottom-6 text-left left-4'
                        : 'top-1/2 -translate-y-1/2'
                    }`}
                  >
                    <span
                      style={{
                        color: activeClipsAtPlayhead.text.typography?.color || '#FFFFFF',
                        backgroundColor: activeClipsAtPlayhead.text.typography?.background_box !== false ? 'rgba(0, 0, 0, 0.7)' : 'transparent',
                        fontSize: `${Math.max(12, Math.min(22, (activeClipsAtPlayhead.text.typography?.font_size || 48) / 3.5))}px`,
                        fontWeight: activeClipsAtPlayhead.text.typography?.font_style || 'bold'
                      }}
                      className="inline-block px-3 py-1 rounded-lg font-bold shadow-lg"
                    >
                      {activeClipsAtPlayhead.text.text_content || activeClipsAtPlayhead.text.typography?.text}
                    </span>
                  </div>
                )}

                {/* Voiceover Indicator Badge */}
                {activeClipsAtPlayhead.voiceover && (
                  <div className="absolute top-3 left-3 bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 font-mono backdrop-blur z-20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>VO: {activeClipsAtPlayhead.voiceover.text_content?.slice(0, 18)}...</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Right Clip Inspector & Effects Drawer (5 cols) */}
        <div className="lg:col-span-5 p-5 bg-slate-900/30 overflow-y-auto max-h-[420px] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <span>⚙️</span> Clip Inspector & Transforms
            </h4>
            <span className="text-[11px] text-indigo-400 font-mono truncate max-w-[180px]">
              {selectedClip ? `${selectedClip.clip.name}` : 'No Clip Selected'}
            </span>
          </div>

          {selectedClip ? (
            <div className="space-y-4 text-xs">
              {/* 1. Timing & Playback */}
              <div className="grid grid-cols-2 gap-3 bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase">Start Time (sec)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={selectedClip.clip.start_time}
                    onChange={(e) => handleUpdateClip(selectedClip.clip.id, { start_time: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-900 border border-slate-700 p-1.5 rounded-lg text-white font-mono text-xs mt-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase">Duration (sec)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.3"
                    value={selectedClip.clip.duration}
                    onChange={(e) => handleUpdateClip(selectedClip.clip.id, { duration: parseFloat(e.target.value) || 1 })}
                    className="w-full bg-slate-900 border border-slate-700 p-1.5 rounded-lg text-white font-mono text-xs mt-1"
                  />
                </div>
              </div>

              {/* 2. Visual Resizing, Scale, PiP & Transform Controls (for Video Clips) */}
              {selectedClip.track.type === 'video' && (
                <div className="space-y-3">
                  {/* Transform & Sizing Panel */}
                  <div className="space-y-3 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                        <span>📐</span> Visual Scale & Transform
                      </label>
                      <button
                        onClick={() => handleUpdateClip(selectedClip.clip.id, {
                          transform: { scale: 1.0, position_x: 0, position_y: 0, rotation: 0, flip_h: false, flip_v: false, opacity: 1.0, fit_mode: 'cover', bg_fill_mode: 'black' }
                        })}
                        className="text-[10px] text-slate-400 hover:text-white underline font-mono"
                      >
                        Reset All
                      </button>
                    </div>

                    {/* Scale (Zoom) */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase">Scale (Zoom)</span>
                        <span className="font-mono text-indigo-300 text-[11px] font-bold">
                          {Math.round((selectedClip.clip.transform?.scale || 1.0) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="3.0"
                        step="0.05"
                        value={selectedClip.clip.transform?.scale || 1.0}
                        onChange={(e) => handleUpdateClip(selectedClip.clip.id, {
                          transform: { ...selectedClip.clip.transform, scale: parseFloat(e.target.value) }
                        })}
                        className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg mb-2"
                      />
                      <div className="grid grid-cols-6 gap-1">
                        {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(sVal => (
                          <button
                            key={sVal}
                            onClick={() => handleUpdateClip(selectedClip.clip.id, {
                              transform: { ...selectedClip.clip.transform, scale: sVal }
                            })}
                            className={`py-1 rounded-lg border text-[10px] font-mono transition ${
                              (selectedClip.clip.transform?.scale || 1.0) === sVal
                                ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300 font-bold'
                                : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            {Math.round(sVal * 100)}%
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Position Offsets & 1-Click PiP */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase">Position & Picture-in-Picture</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          X: {selectedClip.clip.transform?.position_x || 0}px | Y: {selectedClip.clip.transform?.position_y || 0}px
                        </span>
                      </div>

                      {/* 1-Click PiP Presets */}
                      <div className="grid grid-cols-5 gap-1 mb-2.5">
                        {[
                          { label: '🎯 Center', x: 0, y: 0, s: 1.0 },
                          { label: '↖ Top-L', x: -160, y: -100, s: 0.45 },
                          { label: '↗ Top-R', x: 160, y: -100, s: 0.45 },
                          { label: '↙ Btm-L', x: -160, y: 100, s: 0.45 },
                          { label: '↘ Btm-R', x: 160, y: 100, s: 0.45 },
                        ].map(pip => (
                          <button
                            key={pip.label}
                            onClick={() => handleUpdateClip(selectedClip.clip.id, {
                              transform: { ...selectedClip.clip.transform, position_x: pip.x, position_y: pip.y, scale: pip.s }
                            })}
                            className="py-1 px-1 rounded-lg border border-slate-800 bg-slate-900 hover:border-indigo-500 text-slate-300 text-[10px] font-medium transition text-center"
                          >
                            {pip.label}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] text-slate-500 block mb-0.5">X Offset (px)</label>
                          <input
                            type="number"
                            step="5"
                            value={selectedClip.clip.transform?.position_x || 0}
                            onChange={(e) => handleUpdateClip(selectedClip.clip.id, {
                              transform: { ...selectedClip.clip.transform, position_x: parseInt(e.target.value) || 0 }
                            })}
                            className="w-full bg-slate-900 border border-slate-700 p-1.5 rounded-lg text-white font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-slate-500 block mb-0.5">Y Offset (px)</label>
                          <input
                            type="number"
                            step="5"
                            value={selectedClip.clip.transform?.position_y || 0}
                            onChange={(e) => handleUpdateClip(selectedClip.clip.id, {
                              transform: { ...selectedClip.clip.transform, position_y: parseInt(e.target.value) || 0 }
                            })}
                            className="w-full bg-slate-900 border border-slate-700 p-1.5 rounded-lg text-white font-mono text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Rotation & Flip */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/60">
                      <div>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">Rotation</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleUpdateClip(selectedClip.clip.id, {
                              transform: { ...selectedClip.clip.transform, rotation: ((selectedClip.clip.transform?.rotation || 0) - 90 + 360) % 360 }
                            })}
                            className="flex-1 py-1 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 text-[10px] hover:border-slate-700 transition"
                          >
                            ↺ -90°
                          </button>
                          <button
                            onClick={() => handleUpdateClip(selectedClip.clip.id, {
                              transform: { ...selectedClip.clip.transform, rotation: ((selectedClip.clip.transform?.rotation || 0) + 90) % 360 }
                            })}
                            className="flex-1 py-1 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 text-[10px] hover:border-slate-700 transition"
                          >
                            ↻ +90°
                          </button>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">Flip Mirror</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleUpdateClip(selectedClip.clip.id, {
                              transform: { ...selectedClip.clip.transform, flip_h: !selectedClip.clip.transform?.flip_h }
                            })}
                            className={`flex-1 py-1 rounded-lg border text-[10px] font-medium transition ${
                              selectedClip.clip.transform?.flip_h
                                ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300 font-bold'
                                : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            ⇄ Horiz
                          </button>
                          <button
                            onClick={() => handleUpdateClip(selectedClip.clip.id, {
                              transform: { ...selectedClip.clip.transform, flip_v: !selectedClip.clip.transform?.flip_v }
                            })}
                            className={`flex-1 py-1 rounded-lg border text-[10px] font-medium transition ${
                              selectedClip.clip.transform?.flip_v
                                ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300 font-bold'
                                : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            ⇅ Vert
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Framing Mode & Background Fill */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/60">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">Framing Fit</label>
                        <select
                          value={selectedClip.clip.transform?.fit_mode || 'cover'}
                          onChange={(e) => handleUpdateClip(selectedClip.clip.id, {
                            transform: { ...selectedClip.clip.transform, fit_mode: e.target.value }
                          })}
                          className="w-full bg-slate-900 border border-slate-700 p-1.5 rounded-lg text-white text-[11px]"
                        >
                          <option value="cover">Cover (Fill Frame)</option>
                          <option value="contain">Contain (Fit In Frame)</option>
                          <option value="stretch">Stretch (Exact Size)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">Background Fill</label>
                        <select
                          value={selectedClip.clip.transform?.bg_fill_mode || 'black'}
                          onChange={(e) => handleUpdateClip(selectedClip.clip.id, {
                            transform: { ...selectedClip.clip.transform, bg_fill_mode: e.target.value }
                          })}
                          className="w-full bg-slate-900 border border-slate-700 p-1.5 rounded-lg text-white text-[11px]"
                        >
                          <option value="black">Black Letterbox</option>
                          <option value="blur_fill">Blurred Visual (Frosted)</option>
                        </select>
                      </div>
                    </div>

                    {/* Opacity */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase">Opacity</span>
                        <span className="font-mono text-slate-300 text-[10px]">
                          {Math.round((selectedClip.clip.transform?.opacity !== undefined ? selectedClip.clip.transform.opacity : 1.0) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={selectedClip.clip.transform?.opacity !== undefined ? selectedClip.clip.transform.opacity : 1.0}
                        onChange={(e) => handleUpdateClip(selectedClip.clip.id, {
                          transform: { ...selectedClip.clip.transform, opacity: parseFloat(e.target.value) }
                        })}
                        className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Custom Media Replacement */}
                  <div className="space-y-2.5 bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold text-slate-300 uppercase flex items-center gap-1.5">
                        <span>🖼️</span> Replace Visual Media
                      </label>
                      {isUploadingMedia && (
                        <span className="text-[10px] text-blue-400 font-mono animate-pulse">Uploading...</span>
                      )}
                    </div>

                    {/* File Uploader */}
                    <label className="cursor-pointer block bg-slate-900 hover:bg-slate-850 border border-dashed border-slate-700 hover:border-blue-500 rounded-xl p-2.5 text-center transition">
                      <span className="text-[11px] text-blue-400 font-semibold block">📁 Choose Local Image / Video</span>
                      <span className="text-[9px] text-slate-500 block">PNG, JPG, WEBP, MP4, MOV</span>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={e => {
                          if (e.target.files?.[0]) handleCustomFileUpload(e.target.files[0]);
                        }}
                      />
                    </label>

                    {/* URL Input */}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="url"
                        placeholder="Or paste image/video URL..."
                        value={customUrlInput}
                        onChange={e => setCustomUrlInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleCustomUrlSubmit();
                        }}
                        className="flex-1 bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-lg text-[11px] text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={handleCustomUrlSubmit}
                        disabled={!customUrlInput.trim() || isUploadingMedia}
                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold transition"
                      >
                        Set
                      </button>
                    </div>
                  </div>

                  {/* Camera & Motion */}
                  <div className="space-y-3 bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">Camera Motion</label>
                      <select
                        value={selectedClip.clip.camera_movement || 'static'}
                        onChange={(e) => handleUpdateClip(selectedClip.clip.id, {
                          camera_movement: e.target.value
                        })}
                        className="w-full bg-slate-900 border border-slate-700 p-1.5 rounded-lg text-white text-xs"
                      >
                        <option value="static">Static (No Motion)</option>
                        <option value="zoom in">Zoom In</option>
                        <option value="zoom out">Zoom Out</option>
                        <option value="ken burns">Ken Burns Pan & Zoom</option>
                        <option value="pan left">Pan Left</option>
                        <option value="pan right">Pan Right</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase">Speed Factor</label>
                      <span className="font-mono text-indigo-300 text-[11px]">{selectedClip.clip.effects?.speed_factor || 1.0}x</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {[0.25, 0.5, 1.0, 2.0, 4.0].map(sp => (
                        <button
                          key={sp}
                          onClick={() => handleUpdateClip(selectedClip.clip.id, {
                            effects: { ...selectedClip.clip.effects, speed_factor: sp }
                          })}
                          className={`py-1 rounded-lg border text-[10px] font-mono transition ${
                            (selectedClip.clip.effects?.speed_factor || 1.0) === sp
                              ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300 font-bold'
                              : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          {sp}x
                        </button>
                      ))}
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">Color Grade Preset</label>
                      <select
                        value={selectedClip.clip.effects?.color_grade_preset || 'none'}
                        onChange={(e) => handleUpdateClip(selectedClip.clip.id, {
                          effects: { ...selectedClip.clip.effects, color_grade_preset: e.target.value }
                        })}
                        className="w-full bg-slate-900 border border-slate-700 p-2 rounded-xl text-white text-xs"
                      >
                        <option value="none">None (Natural)</option>
                        <option value="cinematic">Cinematic Contrast</option>
                        <option value="warm">Warm Sunlight</option>
                        <option value="cool">Cool Blue</option>
                        <option value="vintage">Vintage Film</option>
                        <option value="teal_orange">Teal & Orange</option>
                        <option value="golden_hour">Golden Hour</option>
                        <option value="bw">Black & White</option>
                        <option value="horror">Dramatic Dark</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Text / Subtitle Inspector (for Text Clips) */}
              {selectedClip.track.type === 'text' && (
                <div className="space-y-3 bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">Text Content</label>
                    <input
                      value={selectedClip.clip.text_content || ''}
                      onChange={(e) => handleUpdateClip(selectedClip.clip.id, {
                        text_content: e.target.value,
                        typography: { ...selectedClip.clip.typography, text: e.target.value }
                      })}
                      placeholder="Overlay text string..."
                      className="w-full bg-slate-900 border border-slate-700 p-2 rounded-xl text-white text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">Position</label>
                      <select
                        value={selectedClip.clip.typography?.position || 'center'}
                        onChange={(e) => handleUpdateClip(selectedClip.clip.id, {
                          typography: { ...selectedClip.clip.typography, position: e.target.value }
                        })}
                        className="w-full bg-slate-900 border border-slate-700 p-1.5 rounded-lg text-white text-xs"
                      >
                        <option value="top-center">Top Center</option>
                        <option value="center">Center</option>
                        <option value="bottom-center">Bottom Center</option>
                        <option value="lower-third">Lower Third</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">Animation</label>
                      <select
                        value={selectedClip.clip.typography?.animation || 'fade-in'}
                        onChange={(e) => handleUpdateClip(selectedClip.clip.id, {
                          typography: { ...selectedClip.clip.typography, animation: e.target.value }
                        })}
                        className="w-full bg-slate-900 border border-slate-700 p-1.5 rounded-lg text-white text-xs"
                      >
                        <option value="fade-in">Fade In</option>
                        <option value="slide-up">Slide Up</option>
                        <option value="typewriter">Typewriter</option>
                        <option value="bounce">Bounce</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">Font Color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={selectedClip.clip.typography?.color || '#FFFFFF'}
                          onChange={(e) => handleUpdateClip(selectedClip.clip.id, {
                            typography: { ...selectedClip.clip.typography, color: e.target.value }
                          })}
                          className="w-8 h-8 rounded-lg border border-slate-700 bg-slate-900 cursor-pointer p-0.5"
                        />
                        <span className="text-[11px] font-mono text-slate-300">
                          {selectedClip.clip.typography?.color || '#FFFFFF'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">Font Style</label>
                      <select
                        value={selectedClip.clip.typography?.font_style || 'bold'}
                        onChange={(e) => handleUpdateClip(selectedClip.clip.id, {
                          typography: { ...selectedClip.clip.typography, font_style: e.target.value }
                        })}
                        className="w-full bg-slate-900 border border-slate-700 p-1.5 rounded-lg text-white text-xs"
                      >
                        <option value="bold">Bold</option>
                        <option value="normal">Normal</option>
                        <option value="italic">Italic</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-10 text-slate-500">
              <span className="text-3xl block mb-2">🖱️</span>
              <p className="text-xs">Click any clip in the timeline below to open its non-linear inspector.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── 3. Multi-Track Canvas & Time Ruler ── */}
      <div className="relative flex flex-col overflow-hidden bg-slate-950">
        <div className="flex">
          {/* Left Track Control Headers */}
          <div className="w-56 shrink-0 bg-slate-900 border-r border-slate-800 z-20">
            {/* Top Empty Header for Ruler alignment */}
            <div className="h-8 border-b border-slate-800 flex items-center justify-between px-3 text-[10px] font-bold text-slate-400 uppercase">
              <span>Tracks ({safeTimeline.tracks.length})</span>
            </div>

            {/* Individual Track Header Rows */}
            {safeTimeline.tracks.map((track) => (
              <div
                key={track.id}
                className="h-16 border-b border-slate-800/80 px-3 flex items-center justify-between bg-slate-900/60"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="text-sm">
                    {track.type === 'video' ? '🎥' : track.type === 'text' ? '💬' : track.name.toLowerCase().includes('voice') ? '🎙️' : '🎵'}
                  </span>
                  <span className="text-xs font-semibold text-slate-200 truncate" title={track.name}>
                    {track.name}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleToggleMute(track.id)}
                    title={track.muted ? 'Unmute Track' : 'Mute Track'}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                      track.muted ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    M
                  </button>
                  <button
                    onClick={() => handleToggleLock(track.id)}
                    title={track.locked ? 'Unlock Track' : 'Lock Track'}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                      track.locked ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🔒
                  </button>
                  <button
                    onClick={() => handleDeleteTrack(track.id)}
                    title="Delete Track"
                    className="text-slate-500 hover:text-rose-400 px-1 text-xs"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Right Scrollable Tracks Viewport */}
          <div className="flex-1 overflow-x-auto relative" ref={timelineTracksRef}>
            <div style={{ width: `${Math.max(1000, (totalDuration + 4) * pxPerSecond)}px` }} className="relative">
              {/* Top Time Ruler */}
              <div
                onMouseDown={handleRulerMouseDown}
                className="h-8 border-b border-slate-800 bg-slate-900/90 relative cursor-pointer select-none"
              >
                {rulerTicks.map(t => {
                  const isMajor = t % 1 === 0;
                  return (
                    <div
                      key={t}
                      style={{ left: `${t * pxPerSecond}px` }}
                      className="absolute top-0 bottom-0 pointer-events-none flex flex-col justify-end"
                    >
                      <div className={`w-[1px] bg-slate-700 ${isMajor ? 'h-3' : 'h-1.5'}`} />
                      {isMajor && (
                        <span className="text-[9px] font-mono text-slate-500 absolute top-0.5 -translate-x-1/2">
                          {t}s
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Multi-Track Clip Rows */}
              {safeTimeline.tracks.map((track) => (
                <div
                  key={track.id}
                  className="h-16 border-b border-slate-800/80 relative bg-slate-950/40"
                >
                  {/* Background gridlines */}
                  {rulerTicks.filter(t => t % 5 === 0).map(t => (
                    <div
                      key={t}
                      style={{ left: `${t * pxPerSecond}px` }}
                      className="absolute top-0 bottom-0 w-[1px] bg-slate-900/60 pointer-events-none"
                    />
                  ))}

                  {/* Render Track Clips */}
                  {track.clips?.map((clip) => {
                    const left = clip.start_time * pxPerSecond;
                    const width = Math.max(16, clip.duration * pxPerSecond);
                    const isSelected = selectedClipId === clip.id;

                    const colorClasses =
                      track.type === 'video'
                        ? 'from-blue-600 to-indigo-700 border-blue-400'
                        : track.type === 'text'
                        ? 'from-amber-600 to-yellow-700 border-amber-400'
                        : track.name.toLowerCase().includes('voice')
                        ? 'from-emerald-600 to-teal-700 border-emerald-400'
                        : 'from-cyan-600 to-sky-700 border-cyan-400';

                    return (
                      <div
                        key={clip.id}
                        onMouseDown={(e) => handleClipMouseDown(e, clip, track)}
                        style={{
                          left: `${left}px`,
                          width: `${width}px`
                        }}
                        className={`absolute top-2 bottom-2 rounded-xl bg-gradient-to-r ${colorClasses} border text-white select-none cursor-move px-2.5 py-1.5 flex items-center justify-between shadow-lg transition-shadow group ${
                          isSelected
                            ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-950 z-10 shadow-indigo-500/30'
                            : 'opacity-90 hover:opacity-100'
                        }`}
                      >
                        {/* Left Trim Handle */}
                        <div
                          onMouseDown={(e) => handleTrimLeft(e, clip, track)}
                          className="absolute left-0 top-0 bottom-0 w-2.5 bg-black/30 hover:bg-white/40 cursor-ew-resize rounded-l-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                        >
                          <div className="w-[1px] h-3 bg-white/70" />
                        </div>

                        {/* Clip Content Summary */}
                        <div className="flex-1 overflow-hidden pointer-events-none pr-2">
                          <p className="text-[11px] font-bold truncate leading-tight">
                            {clip.name || 'Clip'}
                          </p>
                          <span className="text-[9px] opacity-80 font-mono">
                            {clip.duration.toFixed(1)}s
                          </span>
                        </div>

                        {/* Right Trim Handle */}
                        <div
                          onMouseDown={(e) => handleTrimRight(e, clip, track)}
                          className="absolute right-0 top-0 bottom-0 w-2.5 bg-black/30 hover:bg-white/40 cursor-ew-resize rounded-r-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                        >
                          <div className="w-[1px] h-3 bg-white/70" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* ── Red Synchronized Playhead Line ── */}
              <div
                style={{ left: `${currentTime * pxPerSecond}px` }}
                className="absolute top-0 bottom-0 pointer-events-none z-30 flex flex-col items-center"
              >
                {/* Playhead Scrubber Pin */}
                <div className="w-4 h-4 -mt-1 bg-rose-500 rotate-45 rounded-sm shadow-md" />
                <div className="w-[2px] h-full bg-rose-500 shadow-sm shadow-rose-500/50" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
