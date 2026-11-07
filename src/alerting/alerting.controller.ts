import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { AlertingService } from './alerting.service';

@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertingController {
  constructor(private readonly alertingService: AlertingService) {}

  @Get(':vehicleId')
  findActive(
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.alertingService.findActiveForVehicle(vehicleId, user.tenantId);
  }
}
