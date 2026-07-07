import { api, saveTokens, clearTokens, hasTokens } from './api';
import type { AuthResponse, LoginRequest, RegisterRequest, Utente } from '../types';

// Interfaccia estesa per la risposta con refresh token
interface AuthResponseWithRefresh extends AuthResponse {
  refresh_token?: string;
  expires_in?: number;
}

// Interfaccia per le sessioni attive
interface Session {
  id: number;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
}

export const authService = {
  /**
   * Login con salvataggio dell'access token.
   * Il refresh token arriva come cookie httpOnly gestito dal browser.
   */
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    const response = await api.post<AuthResponseWithRefresh>('/auth/login', credentials);

    if (response.data.access_token) {
      saveTokens(response.data.access_token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }

    return response.data;
  },

  /**
   * Registrazione - solo per admin o setup iniziale
   */
  async register(data: RegisterRequest): Promise<Utente> {
    const response = await api.post<Utente>('/auth/register', data);
    return response.data;
  },

  /**
   * Setup iniziale - crea il primo utente admin
   */
  async initialSetup(data: RegisterRequest): Promise<Utente & { isInitialSetup: boolean }> {
    const response = await api.post<Utente & { isInitialSetup: boolean }>('/auth/setup', data);
    return response.data;
  },

  /**
   * Verifica se è necessario il setup iniziale
   */
  async checkSetupRequired(): Promise<boolean> {
    try {
      const response = await api.get<{ required: boolean }>('/auth/setup/check');
      return response.data.required;
    } catch {
      return false;
    }
  },

  /**
   * Ottieni il profilo utente corrente
   */
  async getProfile(): Promise<Utente> {
    const response = await api.get<Utente>('/auth/profile');
    return response.data;
  },

  /**
   * Logout - revoca il token sul server e pulisce i dati locali
   */
  async logout(): Promise<void> {
    try {
      // Tenta di revocare il token sul server
      await api.post('/auth/logout');
    } catch {
      // Ignora errori - procedi comunque con il logout locale
    } finally {
      clearTokens();
    }
  },

  /**
   * Logout da tutti i dispositivi
   */
  async logoutAll(): Promise<{ sessionsRevoked: number }> {
    try {
      const response = await api.post<{ message: string; sessionsRevoked: number }>('/auth/logout/all');
      return { sessionsRevoked: response.data.sessionsRevoked };
    } finally {
      clearTokens();
    }
  },

  /**
   * Cambio password dell'utente corrente
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string; altreSessioniRevocate: number }> {
    const response = await api.post<{ message: string; altreSessioniRevocate: number }>('/auth/change-password', {
      currentPassword,
      newPassword,
    });
    return response.data;
  },

  /**
   * Ottieni lista sessioni attive
   */
  async getSessions(): Promise<Session[]> {
    const response = await api.get<Session[]>('/auth/sessions');
    return response.data;
  },

  /**
   * Revoca una sessione specifica
   */
  async revokeSession(sessionId: number): Promise<void> {
    await api.delete(`/auth/sessions/${sessionId}`);
  },

  /**
   * Ottieni utente corrente da localStorage
   */
  getCurrentUser(): Utente | null {
    const userStr = localStorage.getItem('user');
    try {
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  },

  /**
   * Verifica se l'utente è autenticato
   */
  isAuthenticated(): boolean {
    return hasTokens();
  },
};
