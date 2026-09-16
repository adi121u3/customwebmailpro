import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('customwebmail_app_token');
  if (token) {
    config.headers['x-app-token'] = token;
  }
  return config;
});

api.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status;
    let message = error.response?.data?.error?.message || error.message || 'An unexpected error occurred.';
    
    if (status === 401) {
      message = 'Unauthorized access or session expired. Please verify your authentication token or credentials.';
      console.warn('[API 401 Unauthorized]', message);
    } else if (status === 403) {
      message = 'Forbidden request. You do not have permission to access this resource.';
      console.warn('[API 403 Forbidden]', message);
    } else if (status >= 500) {
      message = `Server error (${status}): ${message}. Please check your server logs and mail server configuration.`;
      console.error('[API 500 Server Error]', message);
    }

    // Dispatch global custom event for toast notification
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('app-toast', {
          detail: { type: status >= 500 ? 'error' : 'warning', message, status }
        })
      );
    }

    return Promise.reject(error);
  }
);

export default api;
