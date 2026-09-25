/**
 * Requisiti della password, per guidare l'utente mentre la scrive.
 *
 * Replica di backend/src/auth/politica-password.ts: il controllo che conta è
 * quello del server, questo evita solo di scoprire i requisiti per tentativi.
 */

export const LUNGHEZZA_MINIMA_PASSWORD = 12;

const PAROLE_VIETATE = [
  'password', 'passw0rd', 'qwerty', 'azerty', 'asdfgh', '123456', '654321', 'abcdef',
  'admin', 'amministratore', 'sissibol', 'bollo', 'bolli', 'welcome', 'benvenuto',
  'letmein', 'iloveyou', 'changeme', 'cambiami', 'segreto', 'shopbeautylab',
];

export interface Requisito {
  testo: string;
  soddisfatto: boolean;
}

export function requisitiPassword(password: string, email?: string): Requisito[] {
  const minuscola = password.toLowerCase();
  const nomeEmail = email?.split('@')[0]?.toLowerCase() ?? '';
  return [
    { testo: `Almeno ${LUNGHEZZA_MINIMA_PASSWORD} caratteri`, soddisfatto: password.length >= LUNGHEZZA_MINIMA_PASSWORD && password.length <= 128 },
    { testo: 'Una lettera minuscola e una maiuscola', soddisfatto: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { testo: 'Un numero', soddisfatto: /[0-9]/.test(password) },
    { testo: 'Un simbolo (es. ! ? # @ -)', soddisfatto: /[^A-Za-z0-9]/.test(password) },
    {
      testo: 'Niente parole ovvie, ripetizioni o il nome dell\'email',
      soddisfatto:
        password.length > 0 &&
        !PAROLE_VIETATE.some((p) => minuscola.includes(p)) &&
        !/(.)\1{3,}/.test(password) &&
        !(nomeEmail.length >= 3 && minuscola.includes(nomeEmail)),
    },
  ];
}

export const passwordValida = (password: string, email?: string) =>
  requisitiPassword(password, email).every((r) => r.soddisfatto);
