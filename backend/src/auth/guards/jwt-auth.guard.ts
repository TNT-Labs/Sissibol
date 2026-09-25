import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { CONSENTITO_CON_PASSWORD_DA_CAMBIARE } from '../decorators/password-da-cambiare.decorator';

/** Codice d'errore con cui il frontend riconosce il cambio password obbligatorio. */
export const CODICE_PASSWORD_DA_CAMBIARE = 'PASSWORD_DA_CAMBIARE';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  handleRequest<T>(err: unknown, user: T, info: unknown, context: ExecutionContext): T {
    const utente = super.handleRequest(err, user, info, context) as T & { deveCambiarePassword?: boolean };

    // Finché la password non è cambiata, l'utente può solo cambiarla.
    if (utente?.deveCambiarePassword) {
      const consentito = this.reflector.getAllAndOverride<boolean>(CONSENTITO_CON_PASSWORD_DA_CAMBIARE, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!consentito) {
        throw new ForbiddenException({
          statusCode: 403,
          codice: CODICE_PASSWORD_DA_CAMBIARE,
          message: 'Prima di continuare è necessario scegliere una nuova password',
        });
      }
    }
    return utente;
  }
}
