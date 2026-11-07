import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RequestUser } from '../decorators/current-user.decorator';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<{ user?: RequestUser }>();

    if (!user || !user.tenantId || typeof user.tenantId !== 'string' || user.tenantId.trim() === '') {
      throw new UnauthorizedException('Tenant context missing or invalid in credential');
    }

    return true;
  }
}

