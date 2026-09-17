export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';
export const SERVER_ROOT = API_BASE.replace(/\/api\/?$/, '');

const FETCH_TIMEOUT = 30000; // 30 seconds

const withTimeout = (promise, ms) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Request timeout after ${ms}ms`)), ms)
    )
  ]);
};

const handleResponse = async (res) => {
  let data;
  try {
    data = await res.json();
  } catch (parseError) {
    throw new Error(`Failed to parse response as JSON: ${res.statusText || 'Unknown error'}`);
  }
  
  if (!res.ok) {
    const errorMsg = data?.detail || data?.message || data?.error || res.statusText || 'Request failed';
    throw new Error(errorMsg);
  }
  return data;
};

export const createProject = async (storyboardData) => {
  try {
    const res = await withTimeout(
      fetch(`${API_BASE}/create-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storyboardData)
      }),
      FETCH_TIMEOUT
    );
    return handleResponse(res);
  } catch (error) {
    if (error.message.includes('timeout')) {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw new Error(`Failed to create project: ${error.message}`);
  }
};

export const fetchMedia = async (projectId) => {
  try {
    const res = await withTimeout(
      fetch(`${API_BASE}/fetch-media/${projectId}`, { method: 'POST' }),
      FETCH_TIMEOUT
    );
    return handleResponse(res);
  } catch (error) {
    if (error.message.includes('timeout')) {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw new Error(`Failed to fetch media: ${error.message}`);
  }
};

export const renderVideo = async (projectId, storyboardData = null) => {
  try {
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };
    if (storyboardData) {
      options.body = JSON.stringify({ storyboard: storyboardData });
    }
    const res = await withTimeout(
      fetch(`${API_BASE}/render/${projectId}`, options),
      FETCH_TIMEOUT
    );
    return handleResponse(res);
  } catch (error) {
    if (error.message.includes('timeout')) {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw new Error(`Failed to render video: ${error.message}`);
  }
};

export const getStatus = async (projectId) => {
  try {
    const res = await withTimeout(
      fetch(`${API_BASE}/status/${projectId}`),
      FETCH_TIMEOUT
    );
    return handleResponse(res);
  } catch (error) {
    if (error.message.includes('timeout')) {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw new Error(`Failed to get status: ${error.message}`);
  }
};

export const getLogs = async (projectId) => {
  try {
    const res = await withTimeout(
      fetch(`${API_BASE}/logs/${projectId}`),
      FETCH_TIMEOUT
    );
    return handleResponse(res);
  } catch (error) {
    if (error.message.includes('timeout')) {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw new Error(`Failed to get logs: ${error.message}`);
  }
};

export const generateStoryboard = async (request) => {
  try {
    const res = await withTimeout(
      fetch(`${API_BASE}/generate-storyboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      }),
      60000 // AI generation takes longer, 60 seconds
    );
    return handleResponse(res);
  } catch (error) {
    if (error.message.includes('timeout')) {
      throw new Error('AI generation timed out. Please check your connection and try again.');
    }
    throw new Error(`Failed to generate storyboard: ${error.message}`);
  }
};

export const updateStoryboard = async (projectId, storyboard) => {
  try {
    const res = await withTimeout(
      fetch(`${API_BASE}/update-storyboard/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storyboard)
      }),
      FETCH_TIMEOUT
    );
    return handleResponse(res);
  } catch (error) {
    if (error.message.includes('timeout')) {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw new Error(`Failed to update storyboard: ${error.message}`);
  }
};

export const cleanupProjectMedia = async (projectId) => {
  try {
    const res = await withTimeout(
      fetch(`${API_BASE}/cleanup-media/${projectId}`, {
        method: 'POST'
      }),
      FETCH_TIMEOUT
    );
    return handleResponse(res);
  } catch (error) {
    if (error.message.includes('timeout')) {
      throw new Error('Cleanup request timed out. Please try again.');
    }
    throw new Error(`Failed to cleanup project media: ${error.message}`);
  }
};

export const cleanupProjects = async () => {
  try {
    const res = await withTimeout(
      fetch(`${API_BASE}/cleanup`, {
        method: 'POST'
      }),
      FETCH_TIMEOUT
    );
    return handleResponse(res);
  } catch (error) {
    if (error.message.includes('timeout')) {
      throw new Error('Cleanup request timed out. Please try again.');
    }
    throw new Error(`Failed to cleanup projects: ${error.message}`);
  }
};

export const getDiskUsage = async () => {
  try {
    const res = await withTimeout(
      fetch(`${API_BASE}/disk-usage`),
      FETCH_TIMEOUT
    );
    return handleResponse(res);
  } catch (error) {
    if (error.message.includes('timeout')) {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw new Error(`Failed to get disk usage: ${error.message}`);
  }
};