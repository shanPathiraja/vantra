import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AlertDocument = Alert & Document;

@Schema({ timestamps: true })
export class Alert {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true, index: true })
  vehicleId: string;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  message: string;

  @Prop({ type: Date, default: null })
  resolvedAt: Date | null;
}

export const AlertSchema = SchemaFactory.createForClass(Alert);
