/**
 * Estrae un messaggio d'errore leggibile da un errore sconosciuto.
 *
 * Gestisce il formato tipico delle risposte Axios del backend
 * (`{ response: { data: { message } } }`), dove `message` può essere una
 * stringa o un array di stringhe (validazione class-validator), e ricade
 * su `error.message` o su un messaggio di fallback.
 */
export function getErrorMessage(error: unknown, fallback = 'Si è verificato un errore'): string {
  if (typeof error === 'object' && error !== null) {
    const err = error as {
      response?: { data?: { message?: string | string[] } };
      message?: string;
    };

    const apiMessage = err.response?.data?.message;
    if (Array.isArray(apiMessage) && apiMessage.length > 0) {
      return apiMessage.join(', ');
    }
    if (typeof apiMessage === 'string' && apiMessage) {
      return apiMessage;
    }
    if (typeof err.message === 'string' && err.message) {
      return err.message;
    }
  }

  return fallback;
}
