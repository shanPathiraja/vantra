import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type VehicleDocument = Vehicle & Document;

@Schema({ timestamps: true })
export class Vehicle {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true })
  vehicleId: string;

  @Prop({ required: true })
  fleetName: string;

  @Prop({ default: 'active' })
  status: string;
}

export const VehicleSchema = SchemaFactory.createForClass(Vehicle);
