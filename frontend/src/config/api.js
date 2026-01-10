// API Configuration

// In development, use the proxy (configured in package.json)
// In production, use the same origin or configure via environment
export const API_URL = process.env.REACT_APP_API_URL || '/api';

// Helper function for API calls
export async function apiCall(endpoint, options = {}) {
  const token = localStorage.getItem('token');

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

// Convenience methods
export const api = {
  get: (endpoint) => apiCall(endpoint),
  post: (endpoint, data) => apiCall(endpoint, { method: 'POST', body: JSON.stringify(data) }),
  put: (endpoint, data) => apiCall(endpoint, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (endpoint) => apiCall(endpoint, { method: 'DELETE' }),
};
