const API_BASE = 'http://localhost:8000/api';

export const createProject = async (topic, duration = 60, style = 'educational', platform = 'youtube') => {
  const res = await fetch(`${API_BASE}/create-project`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, duration_seconds: duration, style, platform })
  });
  return res.json();
};

export const fetchMedia = async (projectId) => {
  const res = await fetch(`${API_BASE}/fetch-media/${projectId}`, { method: 'POST' });
  return res.json();
};

export const renderVideo = async (projectId) => {
  const res = await fetch(`${API_BASE}/render/${projectId}`, { method: 'POST' });
  return res.json();
};

export const getStatus = async (projectId) => {
  const res = await fetch(`${API_BASE}/status/${projectId}`);
  return res.json();
};

export const getLogs = async (projectId) => {
  const res = await fetch(`${API_BASE}/logs/${projectId}`);
  return res.json();
};

export const updateStoryboard = async (projectId, storyboard) => {
  const res = await fetch(`${API_BASE}/update-storyboard/${projectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(storyboard)
  });
  return res.json();
};