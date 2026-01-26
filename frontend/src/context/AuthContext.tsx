import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { Utente } from '../types';
import { authService } from '../services/auth.service';
import { offlineQueue } from '../services/offline-queue.service';

interface AuthContextType {
  user: Utente | null;
  isAuthenticated: boolean;
  isOnline: boolean;
  pendingSync: number;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<{ sessionsRevoked: number }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Utente | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);

  // Gestione stato online/offline
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Aggiorna contatore richieste pendenti
  useEffect(() => {
    const updatePendingCount = async () => {
      try {
        const count = await offlineQueue.getPendingCount();
        setPendingSync(count);
      } catch {
        // Ignora errori IndexedDB
      }
    };

    updatePendingCount();
    const interval = setInterval(updatePendingCount, 30000); // Ogni 30 secondi

    return () => clearInterval(interval);
  }, []);

  // Inizializzazione auth
  useEffect(() => {
    const initAuth = async () => {
      // Controlla se c'è un utente salvato localmente
      const currentUser = authService.getCurrentUser();

      if (currentUser && authService.isAuthenticated()) {
        // Imposta l'utente immediatamente (dati locali)
        setUser(currentUser);

        // Se online, verifica il profilo sul server
        if (navigator.onLine) {
          try {
            const profile = await authService.getProfile();
            setUser(profile);
            // Aggiorna i dati locali se diversi
            localStorage.setItem('user', JSON.stringify(profile));
          } catch (error) {
            // Token scaduto o invalido - il refresh automatico in api.ts gestirà questo
            // Se anche il refresh fallisce, verrà fatto logout automatico
            console.warn('Errore verifica profilo:', error);
          }
        }
      }

      setLoading(false);
    };

    initAuth();
  }, []);

  /**
   * Login con email e password
   */
  const login = useCallback(async (email: string, password: string) => {
    const response = await authService.login({ email, password });
    setUser(response.user);
  }, []);

  /**
   * Logout - revoca token e pulisce stato
   */
  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
    }
  }, []);

  /**
   * Logout da tutti i dispositivi
   */
  const logoutAll = useCallback(async () => {
    const result = await authService.logoutAll();
    setUser(null);
    return result;
  }, []);

  /**
   * Aggiorna il profilo utente dal server
   */
  const refreshProfile = useCallback(async () => {
    if (!authService.isAuthenticated()) return;

    try {
      const profile = await authService.getProfile();
      setUser(profile);
      localStorage.setItem('user', JSON.stringify(profile));
    } catch (error) {
      console.error('Errore aggiornamento profilo:', error);
    }
  }, []);

  // Memoizza il valore del context per evitare re-render inutili
  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isAuthenticated: !!user,
      isOnline,
      pendingSync,
      loading,
      login,
      logout,
      logoutAll,
      refreshProfile,
    }),
    [user, isOnline, pendingSync, loading, login, logout, logoutAll, refreshProfile]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Hook per accedere al contesto di autenticazione
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/**
 * Hook per verificare se l'utente ha un ruolo specifico
 */
export const useHasRole = (role: 'ADMIN' | 'OPERATORE'): boolean => {
  const { user } = useAuth();
  return user?.ruolo === role;
};

/**
 * Hook per verificare se l'utente è admin
 */
export const useIsAdmin = (): boolean => {
  return useHasRole('ADMIN');
};
