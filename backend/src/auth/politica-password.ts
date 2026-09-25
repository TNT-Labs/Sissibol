import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Politica delle password.
 *
 * L'applicazione è raggiungibile da Internet e contiene i dati di clienti e
 * pagamenti: una password indovinabile è la via più semplice a una violazione.
 * Requisiti:
 * - almeno 12 caratteri (al massimo 128: oltre, bcrypt ignora il resto);
 * - lettere minuscole, maiuscole, numeri e simboli;
 * - niente sequenze ripetute (aaaa) né parole ovvie (password, admin...);
 * - non deve contenere il nome dell'indirizzo email dell'utente.
 *
 * La stessa regola è replicata nel frontend (utils/password.ts) per guidare
 * l'utente mentre scrive; quella che conta è questa.
 */

export const LUNGHEZZA_MINIMA_PASSWORD = 12;
export const LUNGHEZZA_MASSIMA_PASSWORD = 128;

// Parole che rendono una password indovinabile anche se lunga e varia.
const PAROLE_VIETATE = [
  'password', 'passw0rd', 'qwerty', 'azerty', 'asdfgh', '123456', '654321', 'abcdef',
  'admin', 'amministratore', 'sissibol', 'bollo', 'bolli', 'welcome', 'benvenuto',
  'letmein', 'iloveyou', 'changeme', 'cambiami', 'segreto', 'shopbeautylab',
];

export function problemiPassword(password: string, email?: string | null): string[] {
  const problemi: string[] = [];
  if (typeof password !== 'string') return ['La password è obbligatoria'];

  if (password.length < LUNGHEZZA_MINIMA_PASSWORD) {
    problemi.push(`Almeno ${LUNGHEZZA_MINIMA_PASSWORD} caratteri`);
  }
  if (password.length > LUNGHEZZA_MASSIMA_PASSWORD) {
    problemi.push(`Al massimo ${LUNGHEZZA_MASSIMA_PASSWORD} caratteri`);
  }
  if (!/[a-z]/.test(password)) problemi.push('Almeno una lettera minuscola');
  if (!/[A-Z]/.test(password)) problemi.push('Almeno una lettera maiuscola');
  if (!/[0-9]/.test(password)) problemi.push('Almeno un numero');
  if (!/[^A-Za-z0-9]/.test(password)) problemi.push('Almeno un simbolo (es. ! ? # @ -)');
  if (/(.)\1{3,}/.test(password)) problemi.push('Nessun carattere ripetuto 4 o più volte di seguito');

  const minuscola = password.toLowerCase();
  if (PAROLE_VIETATE.some((p) => minuscola.includes(p))) {
    problemi.push('Nessuna parola ovvia (password, admin, qwerty, 123456...)');
  }

  const nomeEmail = email?.split('@')[0]?.toLowerCase() ?? '';
  if (nomeEmail.length >= 3 && minuscola.includes(nomeEmail)) {
    problemi.push('Non deve contenere il nome dell\'indirizzo email');
  }

  return problemi;
}

/** Decoratore class-validator: la password rispetta la politica (email esclusa). */
export function PasswordComplessa(opzioni?: ValidationOptions) {
  return (oggetto: object, proprieta: string) =>
    registerDecorator({
      name: 'passwordComplessa',
      target: oggetto.constructor,
      propertyName: proprieta,
      options: opzioni,
      validator: {
        validate: (valore: unknown) => typeof valore === 'string' && problemiPassword(valore).length === 0,
        defaultMessage: (args) =>
          `Password non abbastanza sicura: ${problemiPassword(String(args?.value ?? '')).join('; ')}`,
      },
    });
}
