import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Vehicle, VehicleDocument } from './schemas/vehicle.schema';

@Injectable()
export class VehiclesService {
  constructor(@InjectModel(Vehicle.name) private vehicleModel: Model<VehicleDocument>) {}

  findAll(tenantId?: string) {
    const filter = tenantId ? { tenantId } : {};
    return this.vehicleModel.find(filter).exec();
  }

  findByVehicleId(vehicleId: string, tenantId?: string) {
    const filter: Record<string, unknown> = { vehicleId };
    if (tenantId) {
      filter.tenantId = tenantId;
    }
    return this.vehicleModel.findOne(filter).exec();
  }

  create(vehicleId: string, fleetName: string, tenantId?: string) {
    return this.vehicleModel.create({ vehicleId, fleetName, tenantId });
  }
}
