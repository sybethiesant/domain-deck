// API Configuration

// In development, use the proxy (configured in package.json)
// In production, use the same origin or configure via environment
export const API_URL = process.env.REACT_APP_API_URL || "/api";

// Rate limit error class for special handling
export class RateLimitError extends Error {
  constructor(retryAfter) {
    super(`Rate limit exceeded. Please wait ${retryAfter} seconds.`);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

// Helper function for API calls with rate limit handling
export async function apiCall(endpoint, options = {}, retries = 0) {
  const token = localStorage.getItem("token");
  const maxRetries = options.maxRetries ?? 2;

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle rate limiting (429)
  if (response.status === 429) {
    const errorData = await response.json().catch(() => ({}));
    const retryAfter = parseInt(response.headers.get("Retry-After") || errorData.retryAfter || "60");
    
    // Auto-retry if we have retries left
    if (retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return apiCall(endpoint, options, retries + 1);
    }
    
    throw new RateLimitError(retryAfter);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}

// Convenience methods
export const api = {
  get: (endpoint, options) => apiCall(endpoint, { ...options }),
  post: (endpoint, data, options) => apiCall(endpoint, { method: "POST", body: JSON.stringify(data), ...options }),
  put: (endpoint, data, options) => apiCall(endpoint, { method: "PUT", body: JSON.stringify(data), ...options }),
  delete: (endpoint, options) => apiCall(endpoint, { method: "DELETE", ...options }),
};
