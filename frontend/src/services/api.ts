import axios, { AxiosError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Storage keys
const TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'user';

// Flag per evitare loop di refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

/**
 * Processa la coda di richieste fallite dopo il refresh
 */
const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Necessario per inviare/ricevere il cookie httpOnly del refresh token
  withCredentials: true,
});

// Interceptor per aggiungere il token JWT a ogni richiesta
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor per gestire errori di autenticazione con refresh token automatico
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Se non c'è risposta (errore di rete), propaga l'errore
    if (!error.response) {
      return Promise.reject(error);
    }

    // Se 401 e non è un retry e non è la richiesta di refresh stessa
    if (
      error.response.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/refresh') &&
      !originalRequest.url?.includes('/auth/login')
    ) {
      // Se c'è già un refresh in corso, accoda la richiesta
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

      // Il refresh token vive in un cookie httpOnly; il valore in localStorage
      // è solo un residuo legacy di sessioni create prima della migrazione
      const legacyRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

      try {
        // Tenta il refresh: il cookie httpOnly viaggia con withCredentials
        const response = await axios.post(
          `${API_URL}/auth/refresh`,
          legacyRefreshToken ? { refresh_token: legacyRefreshToken } : {},
          { withCredentials: true },
        );

        const { access_token } = response.data;

        // Salva il nuovo access token; il refresh token è nel cookie httpOnly
        localStorage.setItem(TOKEN_KEY, access_token);
        localStorage.removeItem(REFRESH_TOKEN_KEY); // Pulizia residuo legacy

        // Aggiorna l'header e processa la coda
        api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
        processQueue(null, access_token);

        // Riprova la richiesta originale
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);

      } catch (refreshError) {
        // Refresh fallito - logout
        processQueue(refreshError, null);
        handleLogout();
        return Promise.reject(refreshError);

      } finally {
        isRefreshing = false;
      }
    }

    // Altri errori 401 (login fallito, etc.)
    if (error.response.status === 401) {
      // Solo se non è una richiesta di login/register
      if (
        !originalRequest.url?.includes('/auth/login') &&
        !originalRequest.url?.includes('/auth/register') &&
        !originalRequest.url?.includes('/auth/setup')
      ) {
        handleLogout();
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Svuota la cache API del service worker: le risposte autenticate non devono
 * restare leggibili in Cache Storage dopo il logout.
 */
export const clearApiCache = async (): Promise<void> => {
  try {
    if ('caches' in window) {
      await caches.delete('api-cache');
    }
  } catch {
    // Cache Storage non disponibile (browser vecchio/contesto insicuro): ignora
  }
};

/**
 * Gestisce il logout pulendo tutti i dati locali
 * BUG FIX: Emette un evento per notificare la UI (toast) della sessione scaduta
 */
function handleLogout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  void clearApiCache();

  // Emetti evento per mostrare toast nella UI
  window.dispatchEvent(new CustomEvent('auth:session-expired'));

  // Redirect solo se non siamo già sulla pagina di login
  if (!window.location.pathname.includes('/login')) {
    window.location.href = '/login';
  }
}

/**
 * Utility per salvare l'access token dopo il login.
 * Il refresh token NON viene più salvato: vive in un cookie httpOnly.
 */
export const saveTokens = (accessToken: string) => {
  localStorage.setItem(TOKEN_KEY, accessToken);
  // Rimuovi eventuale refresh token legacy di versioni precedenti
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

/**
 * Utility per verificare se l'utente ha token salvati
 */
export const hasTokens = (): boolean => {
  return !!localStorage.getItem(TOKEN_KEY);
};

/**
 * Utility per la pulizia dei token (logout)
 */
export const clearTokens = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  void clearApiCache();
};
