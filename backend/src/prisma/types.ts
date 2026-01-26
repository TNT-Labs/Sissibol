// Tipi condivisi per evitare problemi con il client Prisma non generato
// Questi tipi replicano gli enum definiti in prisma/schema.prisma

export const Ruolo = {
  ADMIN: 'ADMIN',
  OPERATORE: 'OPERATORE',
} as const;
export type Ruolo = (typeof Ruolo)[keyof typeof Ruolo];

export const TipoCliente = {
  PERSONA_FISICA: 'PERSONA_FISICA',
  PERSONA_GIURIDICA: 'PERSONA_GIURIDICA',
} as const;
export type TipoCliente = (typeof TipoCliente)[keyof typeof TipoCliente];

export const StatoScadenza = {
  DA_PAGARE: 'DA_PAGARE',
  PAGATO: 'PAGATO',
  SCADUTO: 'SCADUTO',
} as const;
export type StatoScadenza = (typeof StatoScadenza)[keyof typeof StatoScadenza];

export const Periodicita = {
  QUADRIMESTRALE: 'QUADRIMESTRALE',
  ANNUALE: 'ANNUALE',
} as const;
export type Periodicita = (typeof Periodicita)[keyof typeof Periodicita];
