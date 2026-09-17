/**
 * OpenCut Timeline Converter & Utilities
 * Converts seamlessly between AI Storyboard representations and OpenCut Multi-Track NLE Timelines.
 */

export function formatTimecode(seconds) {
  if (typeof seconds !== 'number' || isNaN(seconds)) return '00:00.00';
  const totalSec = Math.max(0, seconds);
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  const ms = Math.floor((totalSec % 1) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

export function parseTimecode(str) {
  if (!str) return 0;
  const parts = str.split(':');
  if (parts.length === 2) {
    const mins = parseFloat(parts[0]) || 0;
    const secs = parseFloat(parts[1]) || 0;
    return mins * 60 + secs;
  }
  return parseFloat(str) || 0;
}

export function storyboardToTimeline(storyboard, mediaAssets = []) {
  if (!storyboard || !Array.isArray(storyboard.scenes)) {
    return {
      id: 'timeline-default',
      title: 'Untitled Timeline',
      aspect_ratio: '16:9',
      duration: 15.0,
      fps: 25,
      tracks: [
        { id: 'track-v1', name: 'Main Video (V1)', type: 'video', muted: false, locked: false, volume: 1.0, order: 1, clips: [] },
        { id: 'track-v2', name: 'Overlays / B-Roll (V2)', type: 'video', muted: false, locked: false, volume: 1.0, order: 2, clips: [] },
        { id: 'track-t1', name: 'Captions & Titles (T1)', type: 'text', muted: false, locked: false, volume: 1.0, order: 3, clips: [] },
        { id: 'track-a1', name: 'Voiceover Narration (A1)', type: 'audio', muted: false, locked: false, volume: 1.0, order: 4, clips: [] },
        { id: 'track-a2', name: 'Music & Sound FX (A2)', type: 'audio', muted: false, locked: false, volume: 0.15, order: 5, clips: [] },
      ],
      audio_config: storyboard?.audio_config || {}
    };
  }

  const mediaMap = {};
  if (Array.isArray(mediaAssets)) {
    mediaAssets.forEach(m => {
      if (m && m.scene_id !== undefined) {
        mediaMap[m.scene_id] = m;
      }
    });
  }

  let currentTime = 0;
  const v1Clips = [];
  const t1Clips = [];
  const a1Clips = [];
  const a2Clips = [];

  storyboard.scenes.forEach((scene, index) => {
    const sceneId = scene.scene_id || (index + 1);
    const dur = Math.max(0.5, parseFloat(scene.duration_seconds) || 5.0);
    const media = mediaMap[sceneId];

    // 1. Video Clip (V1)
    v1Clips.push({
      id: `clip-v1-${sceneId}`,
      track_id: 'track-v1',
      name: `Scene ${index + 1}: ${scene.visual_prompt || 'Visual Clip'}`,
      media_type: media?.media_type === 'photo' || media?.is_placeholder ? 'image' : 'video',
      start_time: Number(currentTime.toFixed(2)),
      duration: Number(dur.toFixed(2)),
      trim_in: Number((scene.effects?.trim_start || 0).toFixed(2)),
      source_url: media?.path || null,
      effects: {
        trim_start: scene.effects?.trim_start || 0,
        speed_factor: scene.effects?.speed_factor || 1.0,
        brightness: scene.effects?.brightness || 0,
        contrast: scene.effects?.contrast || 1.0,
        saturation: scene.effects?.saturation || 1.0,
        gamma: scene.effects?.gamma || 1.0,
        color_grade_preset: scene.effects?.color_grade_preset || 'none',
        vignette: !!scene.effects?.vignette,
        film_grain: !!scene.effects?.film_grain,
        letterbox: !!scene.effects?.letterbox,
        audio_volume: scene.effects?.audio_volume || 1.0
      },
      transform: {
        scale: scene.transform?.scale !== undefined ? scene.transform.scale : 1.0,
        position_x: scene.transform?.position_x || 0,
        position_y: scene.transform?.position_y || 0,
        rotation: scene.transform?.rotation || 0,
        opacity: scene.transform?.opacity !== undefined ? scene.transform.opacity : 1.0,
        flip_h: !!scene.transform?.flip_h,
        flip_v: !!scene.transform?.flip_v,
        fit_mode: scene.transform?.fit_mode || 'cover',
        bg_fill_mode: scene.transform?.bg_fill_mode || 'black'
      },
      transition_in: {
        transition_type: scene.transition_in || 'cut',
        duration: 0.5
      },
      transition_out: {
        transition_type: scene.transition_out || 'cut',
        duration: 0.5
      },
      camera_movement: scene.camera_movement || 'static',
      volume: 1.0
    });

    // 2. Text / Typography Clip (T1)
    if (scene.typography && scene.typography.text) {
      t1Clips.push({
        id: `clip-t1-${sceneId}`,
        track_id: 'track-t1',
        name: `Text: ${scene.typography.text.slice(0, 20)}`,
        media_type: 'text',
        start_time: Number(currentTime.toFixed(2)),
        duration: Number(dur.toFixed(2)),
        text_content: scene.typography.text,
        typography: {
          text: scene.typography.text,
          position: scene.typography.position || 'center',
          animation: scene.typography.animation || 'fade-in',
          font_style: scene.typography.font_style || 'bold',
          font_size: scene.typography.font_size || 48,
          color: scene.typography.color || '#FFFFFF',
          stroke_color: scene.typography.stroke_color || '#000000',
          stroke_width: scene.typography.stroke_width || 2,
          background_box: scene.typography.background_box !== false
        }
      });
    }

    // 3. Voiceover Clip (A1)
    if (scene.voiceover_text) {
      a1Clips.push({
        id: `clip-a1-${sceneId}`,
        track_id: 'track-a1',
        name: `VO: ${scene.voiceover_text.slice(0, 25)}`,
        media_type: 'audio',
        start_time: Number(currentTime.toFixed(2)),
        duration: Number(dur.toFixed(2)),
        text_content: scene.voiceover_text,
        volume: 1.0
      });
    }

    // 4. Sound FX Clip (A2)
    if (scene.sfx && scene.sfx.description) {
      a2Clips.push({
        id: `clip-a2-${sceneId}`,
        track_id: 'track-a2',
        name: `SFX: ${scene.sfx.description.slice(0, 20)}`,
        media_type: 'audio',
        start_time: Number(currentTime.toFixed(2)),
        duration: Number(Math.min(dur, 2.5).toFixed(2)),
        volume: 0.7
      });
    }

    currentTime += dur;
  });

  const totalCalculated = Math.max(parseFloat(storyboard.total_duration) || 15.0, currentTime);

  return {
    id: `timeline-${Math.round(totalCalculated)}s`,
    title: storyboard.title || 'OpenCut Project',
    aspect_ratio: storyboard.aspect_ratio || '16:9',
    duration: Number(totalCalculated.toFixed(2)),
    fps: 25,
    tracks: [
      { id: 'track-v1', name: 'Main Video (V1)', type: 'video', muted: false, locked: false, volume: 1.0, order: 1, clips: v1Clips },
      { id: 'track-v2', name: 'Overlays / B-Roll (V2)', type: 'video', muted: false, locked: false, volume: 1.0, order: 2, clips: [] },
      { id: 'track-t1', name: 'Captions & Titles (T1)', type: 'text', muted: false, locked: false, volume: 1.0, order: 3, clips: t1Clips },
      { id: 'track-a1', name: 'Voiceover Narration (A1)', type: 'audio', muted: false, locked: false, volume: 1.0, order: 4, clips: a1Clips },
      { id: 'track-a2', name: 'Music & Sound FX (A2)', type: 'audio', muted: false, locked: false, volume: storyboard.audio_config?.music_volume || 0.15, order: 5, clips: a2Clips },
    ],
    audio_config: storyboard.audio_config || {
      voiceover_enabled: true,
      voiceover_gender: 'male',
      voiceover_tone: 'professional',
      voiceover_type: 'narrator',
      background_music: 'upbeat_tech',
      music_volume: 0.15,
      sfx_enabled: true,
      sfx_pack: 'whoosh_hits'
    }
  };
}

export function timelineToStoryboard(timeline) {
  if (!timeline || !Array.isArray(timeline.tracks)) {
    return null;
  }

  const vTrack = timeline.tracks.find(t => t.type === 'video' && t.clips && t.clips.length > 0) || timeline.tracks[0];
  const tTrack = timeline.tracks.find(t => t.type === 'text');
  const a1Track = timeline.tracks.find(t => t.type === 'audio' && (t.name.toLowerCase().includes('voice') || t.id.includes('a1'))) || timeline.tracks.find(t => t.type === 'audio');

  const sortedVClips = vTrack && vTrack.clips ? [...vTrack.clips].sort((a, b) => a.start_time - b.start_time) : [];

  const scenes = sortedVClips.map((clip, index) => {
    const textClip = tTrack?.clips?.find(tc => Math.abs(tc.start_time - clip.start_time) < 0.5);
    const voClip = a1Track?.clips?.find(ac => Math.abs(ac.start_time - clip.start_time) < 0.5);

    const startMin = Math.floor(clip.start_time / 60);
    const startSec = Math.floor(clip.start_time % 60);
    const endT = clip.start_time + clip.duration;
    const endMin = Math.floor(endT / 60);
    const endSec = Math.floor(endT % 60);

    return {
      scene_id: index + 1,
      start_time: `${startMin}:${String(startSec).padStart(2, '0')}`,
      end_time: `${endMin}:${String(endSec).padStart(2, '0')}`,
      duration_seconds: clip.duration,
      visual_prompt: clip.name || `Scene ${index + 1}`,
      fallback_text: clip.name || `Scene ${index + 1}`,
      camera_movement: clip.camera_movement || 'static',
      transition_in: clip.transition_in?.transition_type || 'cut',
      transition_out: clip.transition_out?.transition_type || 'cut',
      typography: {
        text: textClip?.text_content || textClip?.typography?.text || clip.typography?.text || '',
        position: textClip?.typography?.position || clip.typography?.position || 'center',
        animation: textClip?.typography?.animation || clip.typography?.animation || 'fade-in',
        font_style: textClip?.typography?.font_style || clip.typography?.font_style || 'bold',
        font_size: textClip?.typography?.font_size || clip.typography?.font_size || 48,
        color: textClip?.typography?.color || clip.typography?.color || '#FFFFFF',
        stroke_color: textClip?.typography?.stroke_color || clip.typography?.stroke_color || '#000000',
        stroke_width: textClip?.typography?.stroke_width || clip.typography?.stroke_width || 2,
        background_box: textClip?.typography?.background_box !== undefined ? textClip.typography.background_box : true
      },
      voiceover_text: voClip?.text_content || clip.text_content || null,
      effects: clip.effects || {
        trim_start: clip.trim_in || 0,
        speed_factor: 1.0,
        brightness: 0,
        contrast: 1.0,
        saturation: 1.0,
        gamma: 1.0,
        color_grade_preset: 'none',
        vignette: false,
        film_grain: false,
        letterbox: false,
        audio_volume: 1.0
      },
      transform: {
        scale: clip.transform?.scale !== undefined ? clip.transform.scale : 1.0,
        position_x: clip.transform?.position_x || 0,
        position_y: clip.transform?.position_y || 0,
        rotation: clip.transform?.rotation || 0,
        opacity: clip.transform?.opacity !== undefined ? clip.transform.opacity : 1.0,
        flip_h: !!clip.transform?.flip_h,
        flip_v: !!clip.transform?.flip_v,
        fit_mode: clip.transform?.fit_mode || 'cover',
        bg_fill_mode: clip.transform?.bg_fill_mode || 'black'
      }
    };
  });

  return {
    title: timeline.title || 'OpenCut Project',
    total_duration: timeline.duration || 15.0,
    aspect_ratio: timeline.aspect_ratio || '16:9',
    scenes: scenes,
    audio_config: timeline.audio_config || {
      voiceover_enabled: true,
      voiceover_gender: 'male',
      voiceover_tone: 'professional',
      voiceover_type: 'narrator',
      background_music: 'upbeat_tech',
      music_volume: 0.15,
      sfx_enabled: true,
      sfx_pack: 'whoosh_hits'
    }
  };
}
