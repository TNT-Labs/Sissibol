import { useRegisterSW } from 'virtual:pwa-register/react';

declare const __BUILD_TIME__: string;

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      console.log(`SW registrato: ${swUrl}`);
      // Controlla aggiornamenti ogni 60 secondi
      if (r) {
        setInterval(() => {
          r.update();
        }, 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('Errore registrazione SW:', error);
    },
  });

  const close = () => {
    setNeedRefresh(false);
  };

  const update = () => {
    updateServiceWorker(true);
  };

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-white rounded-lg shadow-lg border border-gray-200 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900">
            Aggiornamento disponibile
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Una nuova versione dell'app è disponibile. Aggiorna per ottenere le ultime funzionalità.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Build: {__BUILD_TIME__}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={update}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Aggiorna ora
            </button>
            <button
              onClick={close}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Più tardi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
