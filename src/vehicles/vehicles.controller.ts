import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { VehiclesService } from './vehicles.service';

@Controller('vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.vehiclesService.findAll(user.tenantId);
  }

  @Get(':vehicleId')
  async findOne(
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const vehicle = await this.vehiclesService.findByVehicleId(vehicleId, user.tenantId);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${vehicleId} not found`);
    }
    return vehicle;
  }

  @Post()
  @Roles('admin')
  create(
    @Body('vehicleId') vehicleId: string,
    @Body('fleetName') fleetName: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vehiclesService.create(vehicleId, fleetName, user.tenantId);
  }
}
