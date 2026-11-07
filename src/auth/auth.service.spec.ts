import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let userModel: any;
  let jwtService: JwtService;

  beforeEach(() => {
    userModel = {
      create: jest.fn(),
      findOne: jest.fn(),
    };
    jwtService = new JwtService({ secret: 'test-secret' });
    service = new AuthService(userModel, jwtService);
  });

  it('registers a new user with a hashed password and tenantId', async () => {
    userModel.create.mockResolvedValue({
      _id: 'abc123',
      email: 'a@b.com',
      tenantId: 'tenant-123',
      role: 'dispatcher',
    });
    const result = await service.register('a@b.com', 'password123', 'tenant-123');
    expect(result).toEqual({
      id: 'abc123',
      email: 'a@b.com',
      tenantId: 'tenant-123',
      role: 'dispatcher',
    });
    expect(userModel.create).toHaveBeenCalled();
  });

  it('throws on login with unknown email', async () => {
    userModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    await expect(service.login('nope@b.com', 'x')).rejects.toThrow(UnauthorizedException);
  });

  it('throws on login with wrong password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10);
    userModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: '1',
        email: 'a@b.com',
        passwordHash,
        tenantId: 'tenant-123',
      }),
    });
    await expect(service.login('a@b.com', 'wrong-password')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws on login if user has no tenantId', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10);
    userModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: '1',
        email: 'a@b.com',
        passwordHash,
        tenantId: null,
      }),
    });
    await expect(service.login('a@b.com', 'correct-password')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('returns accessToken and signs tenantId and role', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10);
    userModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: 'user-1',
        email: 'admin@fleet.com',
        passwordHash,
        tenantId: 'tenant-456',
        role: 'admin',
        mustChangePassword: true,
      }),
    });
    const result = await service.login('admin@fleet.com', 'correct-password');
    expect(result.accessToken).toBeDefined();
    expect(result.mustChangePassword).toBe(true);
    const decoded: any = jwtService.decode(result.accessToken);
    expect(decoded.tenantId).toBe('tenant-456');
    expect(decoded.role).toBe('admin');
  });
});
