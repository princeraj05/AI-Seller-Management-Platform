import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true, // Always transmit HttpOnly cookies for refresh token & session
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

// Request interceptor to attach Access Token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle 401 and refresh access token safely via HttpOnly cookie
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // If there is no response (network error) or no error config, bubble up without logging out
    if (!error.response || !originalRequest) {
      return Promise.reject(error);
    }

    const status = error.response.status;
    const isAuthRoute =
      originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/register') ||
      originalRequest.url?.includes('/auth/refresh') ||
      originalRequest.url?.includes('/auth/google') ||
      originalRequest.url?.includes('/auth/logout');

    // Handle 401 Unauthorized, excluding auth endpoints themselves
    if (status === 401 && !originalRequest._retry && !isAuthRoute) {
      // Single-flight lock: concurrent expired requests join queue
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Refresh token resides strictly in HttpOnly cookie; never read from or sent via localStorage
        const refreshResponse = await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const newAccessToken = refreshResponse.data?.token;

        if (newAccessToken) {
          localStorage.setItem('authToken', newAccessToken);
          // Safety cleanup: ensure no stale refresh token is kept in storage
          localStorage.removeItem('refreshToken');
          sessionStorage.removeItem('refreshToken');

          api.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

          processQueue(null, newAccessToken);
          return api(originalRequest);
        } else {
          throw new Error('Refresh response missing access token');
        }
      } catch (refreshErr) {
        const isAuthInvalid =
          refreshErr.response &&
          (refreshErr.response.status === 401 || refreshErr.response.status === 403);

        processQueue(refreshErr, null);

        // Explicit authentication state machine:
        // 1. Unrecoverable token invalidation (401 or 403): Session expired or revoked.
        // Clear local tokens and redirect to /login. Never bypass revocation with silent re-auth.
        if (isAuthInvalid) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
          localStorage.removeItem('refreshToken');
          sessionStorage.removeItem('refreshToken');

          if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
            window.location.href = '/login';
          }
        }
        // 2. Transient network error (!refreshErr.response) or 5xx server error:
        // DO NOT wipe local session. Keep credentials so user stays logged in once connectivity resumes.

        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
