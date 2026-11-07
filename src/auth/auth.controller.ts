import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { AuthRateLimiter } from './auth-rate-limiter';

@Controller('auth')
export class AuthController {
  private readonly rateLimiter = new AuthRateLimiter();

  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.password, dto.tenantId, dto.role);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    this.rateLimiter.checkAndRecord(dto.email);
    return this.authService.login(dto.email, dto.password);
  }
}
