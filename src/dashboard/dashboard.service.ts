import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VehiclesService } from '../vehicles/vehicles.service';
import { TelemetryEvent, TelemetryEventDocument } from '../ingestion/schemas/telemetry-event.schema';

@Injectable()
export class DashboardService {
  constructor(
    private readonly vehiclesService: VehiclesService,
    @InjectModel(TelemetryEvent.name) private telemetryModel: Model<TelemetryEventDocument>,
  ) {}

  async getFleetOverview(tenantId?: string) {
    return this.vehiclesService.findAll(tenantId);
  }

  /**
   * Returns the latest known telemetry reading for every vehicle in the fleet.
   * Scoped to tenantId when provided.
   */
  async getVehicleStatuses(tenantId?: string) {
    const vehicles = await this.vehiclesService.findAll(tenantId);
    const statuses: { vehicle: unknown; latest: unknown }[] = [];
    for (const vehicle of vehicles) {
      const filter: Record<string, unknown> = { vehicleId: vehicle.vehicleId };
      if (tenantId) {
        filter.tenantId = tenantId;
      }
      const latest = await this.telemetryModel
        .findOne(filter)
        .sort({ recordedAt: -1 })
        .exec();
      statuses.push({ vehicle, latest });
    }
    return statuses;
  }
}
