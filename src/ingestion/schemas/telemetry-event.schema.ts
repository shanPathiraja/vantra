import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TelemetryEventDocument = TelemetryEvent & Document;

@Schema({ timestamps: { createdAt: 'receivedAt', updatedAt: false } })
export class TelemetryEvent {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true, index: true })
  vehicleId: string;

  @Prop({ required: true })
  recordedAt: Date;

  // Populated by the { timestamps: { createdAt: 'receivedAt' } } option
  // above - declared explicitly here so it's typed on the class.
  receivedAt?: Date;

  @Prop({ type: { lat: Number, lng: Number }, required: true })
  location: { lat: number; lng: number };

  // Populated out-of-band by the partner battery-reporting integration.
  // NOTE: originally always a percentage string ("87%"). Newer device
  // firmware sends this as a plain number instead - older documents were
  // never backfilled, so this field is inconsistently typed across the
  // collection. Type widened to Mixed to stop Mongoose from coercing/
  // dropping the newer numeric values. See VANTRA-512.
  @Prop({ type: Object, required: false })
  batteryLevel?: string | number;

  // Engine diagnostics (fault codes, temperature, RPM) are on the device
  // firmware roadmap but not yet sent by any fleet. Field reserved so the
  // schema doesn't need another migration once they start arriving.
  // Ingestion/validation for this is not yet implemented - VANTRA-538.
  @Prop({ type: Object, required: false })
  engineDiagnostics?: Record<string, unknown>;
}

export const TelemetryEventSchema = SchemaFactory.createForClass(TelemetryEvent);
