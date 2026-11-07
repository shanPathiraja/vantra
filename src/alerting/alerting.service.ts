import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Alert, AlertDocument } from './schemas/alert.schema';
import { TelemetryEvent, TelemetryEventDocument } from '../ingestion/schemas/telemetry-event.schema';

const OFFLINE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
// Widened from 15min -> 6h after ops reported repeated alert noise for
// flapping vehicles (VANTRA-441).
const DEBOUNCE_WINDOW_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class AlertingService {
  private readonly logger = new Logger(AlertingService.name);

  constructor(
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    // Reaching directly into ingestion's collection here rather than going
    // through IngestionService/VehiclesService - convenient short-term, but
    // means this module now knows about telemetry's schema shape directly.
    @InjectModel(TelemetryEvent.name) private telemetryModel: Model<TelemetryEventDocument>,
  ) { }

  async checkVehicleOffline(vehicleId: string, lastSeenAt: Date, tenantId: string) {
    const staleFor = Date.now() - lastSeenAt.getTime();
    if (staleFor <= OFFLINE_THRESHOLD_MS) {
      return null;
    }

    // Suppress if this vehicle raised an offline alert recently, full stop -
    // resolved or not. Cuts down on repeat notifications for flapping vehicles.
    const recent = await this.alertModel
      .findOne({
        vehicleId,
        type: 'vehicle-offline',
        createdAt: { $gte: new Date(Date.now() - DEBOUNCE_WINDOW_MS) },
      })
      .exec();

    if (recent) {
      return null;
    }

    return this.alertModel.create({
      vehicleId,
      type: 'vehicle-offline',
      message: `Vehicle ${vehicleId} has not reported telemetry in over 15 minutes`,
      tenantId
    });
  }

  findActiveForVehicle(vehicleId: string, tenantId?: string) {
    const filter: Record<string, unknown> = { vehicleId, resolvedAt: null };
    if (tenantId) {
      filter.tenantId = tenantId;
    }
    return this.alertModel.find(filter).exec();
  }

  resolve(alertId: string) {
    return this.alertModel.findByIdAndUpdate(alertId, { resolvedAt: new Date() }).exec();
  }

  /**
   * Sweeps every vehicle's most recent telemetry event and raises offline
   * alerts as needed. Called on a schedule.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweepFleetForOffline() {
    this.logger.debug('Running fleet offline sweep');
    const vehicleIds: string[] = await this.telemetryModel.distinct('vehicleId').exec();
    for (const vehicleId of vehicleIds) {
      const latest = await this.telemetryModel
        .findOne({ vehicleId })
        .sort({ recordedAt: -1 })
        .exec();
      if (latest) {
        await this.checkVehicleOffline(vehicleId, latest.recordedAt, latest.tenantId);
      }
    }
  }
}
