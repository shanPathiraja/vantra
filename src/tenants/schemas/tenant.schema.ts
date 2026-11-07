import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TenantDocument = Tenant & Document;

@Schema({ timestamps: true })
export class Tenant {
  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @Prop({ default: 'active', enum: ['active', 'suspended'] })
  status: string;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);

