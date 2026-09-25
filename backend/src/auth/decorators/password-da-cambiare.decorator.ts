import { SetMetadata } from '@nestjs/common';

export const CONSENTITO_CON_PASSWORD_DA_CAMBIARE = 'consentitoConPasswordDaCambiare';

/**
 * Rotte usabili anche da chi deve ancora cambiare la password (cambio
 * password, profilo, logout). Tutte le altre rispondono 403 finché la
 * password non è stata cambiata.
 */
export const ConsentitoConPasswordDaCambiare = () => SetMetadata(CONSENTITO_CON_PASSWORD_DA_CAMBIARE, true);
