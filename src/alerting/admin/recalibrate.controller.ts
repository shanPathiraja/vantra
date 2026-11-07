import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../../auth/decorators/current-user.decorator';
import { AlertingService } from '../alerting.service';

@Controller('admin/vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecalibrateController {
  constructor(private readonly alertingService: AlertingService) {}

  @Post(':vehicleId/force-recalibrate')
  @Roles('admin')
  async forceRecalibrate(
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const active = await this.alertingService.findActiveForVehicle(vehicleId, user.tenantId);
    await Promise.all(active.map((a) => this.alertingService.resolve(a._id.toString())));
    return { vehicleId, recalibrated: true, clearedAlerts: active.length };
  }
}
