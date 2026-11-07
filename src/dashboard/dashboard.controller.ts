import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('fleet-overview')
  getFleetOverview(@CurrentUser() user: RequestUser) {
    return this.dashboardService.getFleetOverview(user.tenantId);
  }

  @Get('vehicle-statuses')
  getVehicleStatuses(@CurrentUser() user: RequestUser) {
    return this.dashboardService.getVehicleStatuses(user.tenantId);
  }
}
