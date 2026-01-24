import { SetMetadata } from '@nestjs/common';
import { Ruolo } from '@prisma/client';

export const Roles = (...roles: Ruolo[]) => SetMetadata('roles', roles);
