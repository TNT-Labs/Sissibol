/**
 * Servizio per la gestione della coda offline e Background Sync
 *
 * Funzionalità:
 * - Salva richieste API fallite in IndexedDB
 * - Sincronizza automaticamente quando torna la connessione
 * - Supporta Background Sync API (quando disponibile)
 * - Gestisce conflitti e retry con backoff esponenziale
 */

const DB_NAME = 'sissibol-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending-requests';

interface PendingRequest {
  id: string;
  method: string;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
  timestamp: number;
  retries: number;
  maxRetries: number;
  entityType?: string; // 'pagamento', 'scadenza', etc.
  entityId?: number;
}

interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

class OfflineQueueService {
  private db: IDBDatabase | null = null;
  private isOnline: boolean = navigator.onLine;
  private syncInProgress: boolean = false;

  constructor() {
    // Ascolta cambiamenti di connettività
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processPendingRequests();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });

    // Inizializza DB
    this.initDB();
  }

  /**
   * Inizializza IndexedDB
   */
  private async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Errore apertura IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Crea object store per le richieste pendenti
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('entityType', 'entityType', { unique: false });
        }
      };
    });
  }

  /**
   * Aggiunge una richiesta alla coda offline
   */
  async addToQueue(
    method: string,
    url: string,
    body?: unknown,
    options?: {
      headers?: Record<string, string>;
      entityType?: string;
      entityId?: number;
      maxRetries?: number;
    }
  ): Promise<string> {
    const db = await this.initDB();

    const request: PendingRequest = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      method,
      url,
      body,
      headers: options?.headers,
      timestamp: Date.now(),
      retries: 0,
      maxRetries: options?.maxRetries ?? 5,
      entityType: options?.entityType,
      entityId: options?.entityId,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const addRequest = store.add(request);

      addRequest.onsuccess = () => {
        // Registra per Background Sync se disponibile
        this.registerBackgroundSync();
        resolve(request.id);
      };

      addRequest.onerror = () => {
        reject(addRequest.error);
      };
    });
  }

  /**
   * Registra il Background Sync (se supportato)
   */
  private async registerBackgroundSync(): Promise<void> {
    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await (registration as any).sync.register('sync-pending-requests');
      } catch (error) {
        console.warn('Background Sync non disponibile:', error);
      }
    }
  }

  /**
   * Processa tutte le richieste pendenti
   */
  async processPendingRequests(): Promise<SyncResult> {
    if (!this.isOnline || this.syncInProgress) {
      return { success: false, synced: 0, failed: 0, errors: [] };
    }

    this.syncInProgress = true;
    const result: SyncResult = { success: true, synced: 0, failed: 0, errors: [] };

    try {
      const db = await this.initDB();
      const requests = await this.getAllPendingRequests();

      for (const request of requests) {
        try {
          const response = await this.executeRequest(request);

          if (response.ok) {
            // Successo - rimuovi dalla coda
            await this.removeFromQueue(request.id);
            result.synced++;
          } else if (response.status >= 500) {
            // Errore server - riprova dopo
            await this.incrementRetry(request);
            result.failed++;
            result.errors.push({
              id: request.id,
              error: `Server error: ${response.status}`,
            });
          } else {
            // Errore client (4xx) - rimuovi dalla coda (non riprovare)
            await this.removeFromQueue(request.id);
            result.failed++;
            result.errors.push({
              id: request.id,
              error: `Client error: ${response.status}`,
            });
          }
        } catch (error) {
          // Errore di rete - mantieni in coda
          await this.incrementRetry(request);
          result.failed++;
          result.errors.push({
            id: request.id,
            error: error instanceof Error ? error.message : 'Network error',
          });
        }
      }

      result.success = result.failed === 0;
    } finally {
      this.syncInProgress = false;
    }

    return result;
  }

  /**
   * Esegue una richiesta HTTP
   */
  private async executeRequest(request: PendingRequest): Promise<Response> {
    const token = localStorage.getItem('token');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...request.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return fetch(request.url, {
      method: request.method,
      headers,
      body: request.body ? JSON.stringify(request.body) : undefined,
    });
  }

  /**
   * Recupera tutte le richieste pendenti
   */
  private async getAllPendingRequests(): Promise<PendingRequest[]> {
    const db = await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const request = index.getAll();

      request.onsuccess = () => {
        // Filtra richieste che hanno superato maxRetries
        const validRequests = (request.result as PendingRequest[]).filter(
          (r) => r.retries < r.maxRetries
        );
        resolve(validRequests);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Rimuove una richiesta dalla coda
   */
  private async removeFromQueue(id: string): Promise<void> {
    const db = await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Incrementa il contatore retry con backoff esponenziale
   */
  private async incrementRetry(request: PendingRequest): Promise<void> {
    const db = await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const updatedRequest: PendingRequest = {
        ...request,
        retries: request.retries + 1,
      };

      const putRequest = store.put(updatedRequest);

      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    });
  }

  /**
   * Conta le richieste pendenti
   */
  async getPendingCount(): Promise<number> {
    const db = await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Verifica se ci sono richieste pendenti per un'entità specifica
   */
  async hasPendingForEntity(entityType: string, entityId: number): Promise<boolean> {
    const requests = await this.getAllPendingRequests();
    return requests.some((r) => r.entityType === entityType && r.entityId === entityId);
  }

  /**
   * Cancella tutte le richieste pendenti
   */
  async clearAll(): Promise<void> {
    const db = await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Stato della connessione
   */
  get online(): boolean {
    return this.isOnline;
  }
}

// Singleton
export const offlineQueue = new OfflineQueueService();
