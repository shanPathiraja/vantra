import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  async register(
    email: string,
    password: string,
    tenantId: string,
    role = 'dispatcher',
  ): Promise<{ id: string; email: string; tenantId: string; role: string }> {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.userModel.create({ email, passwordHash, tenantId, role });
    return {
      id: user._id.toString(),
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    };
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; mustChangePassword: boolean }> {
    const user = await this.userModel.findOne({ email }).exec();
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.tenantId) {
      throw new UnauthorizedException('Account is not associated with an active tenant');
    }

    const mustChangePassword = Boolean(user.mustChangePassword);

    const accessToken = this.jwtService.sign({
      sub: user._id.toString(),
      email: user.email,
      tenantId: user.tenantId,
      role: user.role || 'dispatcher',
      mustChangePassword,
    });

    return {
      accessToken,
      mustChangePassword,
    };
  }
}
