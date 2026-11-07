import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RequestUser } from './decorators/current-user.decorator';

interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
  mustChangePassword?: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'change-me',
    });
  }

  async validate(payload: JwtPayload): Promise < RequestUser > {
      if(!payload.sub || !payload.tenantId) {
      throw new UnauthorizedException('Token missing required tenant or identity claims');
    }
    return {
      userId: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      role: payload.role || 'dispatcher',
      mustChangePassword: payload.mustChangePassword ?? false,
    };
  }
}
