/**
 * Versione del motore di calcolo.
 *
 * Viene registrata in ogni snapshot di calcolo associato a un pagamento, così
 * un importo storico resta interpretabile anche dopo che le regole sono
 * cambiate. Va incrementata a ogni modifica che può spostare un importo:
 * - MAJOR: cambia una regola di calcolo o una politica (esenzioni, fasce);
 * - MINOR: nuovo tipo di veicolo o nuovo esito, senza toccare i casi esistenti;
 * - PATCH: solo testi (descrizioni, dettaglio, messaggi).
 *
 * Le voci registrate prima dell'introduzione di questo campo sono del motore
 * 1.x, quello precedente alla riscrittura.
 */
export const VERSIONE_MOTORE = '2.0.0';
