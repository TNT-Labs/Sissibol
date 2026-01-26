import { SetMetadata } from '@nestjs/common';
import { Ruolo } from '../../prisma/types';

export const Roles = (...roles: Ruolo[]) => SetMetadata('roles', roles);
