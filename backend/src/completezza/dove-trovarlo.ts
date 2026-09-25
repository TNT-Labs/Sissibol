/** Dove l'operatore trova, sulla carta di circolazione, il dato mancante. */
export const DOVE_TROVARLO: Record<string, string> = {
  tipoVeicolo: 'Carta di circolazione, riquadro J (categoria del veicolo)',
  potenzaKw: 'Carta di circolazione, riquadro P.2 (potenza netta massima)',
  classeAmbientale: 'Carta di circolazione, riquadro V.9 (classe ambientale)',
  cilindrata: 'Carta di circolazione, riquadro P.1 (cilindrata)',
  portataKg: 'Carta di circolazione, differenza fra F.2 e G',
  pesoComplessivoKg: 'Carta di circolazione, riquadro F.2 (massa massima ammissibile)',
  numeroAssi: 'Carta di circolazione, riquadro L (numero di assi)',
  tipoSospensione: 'Carta di circolazione, annotazioni (sospensioni pneumatiche)',
  numeroPosti: 'Carta di circolazione, riquadro S.1 (numero di posti)',
  massaRimorchiabileKg: 'Carta di circolazione, riquadro O.1 (massa rimorchiabile)',
  regione: 'Residenza o sede del proprietario',
  alimentazione: 'Carta di circolazione, riquadro P.3 (tipo di alimentazione)',
  dataImmatricolazione: 'Carta di circolazione, riquadro B (prima immatricolazione)',
};

/** Motivi che dipendono dal tariffario, non dai dati del veicolo. */
export const MOTIVI_TARIFFARIO = new Set([
  'TARIFFA_MANCANTE',
  'TARIFFA_AMBIGUA',
  'FUORI_FASCIA',
  'PERIODICITA_NON_PREVISTA',
  'TARIFFARIO_ASSENTE',
]);
