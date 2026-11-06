/**
 * Populates local MongoDB with a realistic volume of historical fleet data.
 *
 * Run with: npm run seed
 *
 * Generates:
 *  - ~2,000 vehicles
 *  - ~1,000,000 telemetry events across those vehicles, spanning ~60 days
 *  - one demo login user
 *
 * This is meant to resemble a fleet that's been operating for a while
 * rather than a clean synthetic dataset - firmware and integrations have
 * changed over that time, retries and delays happen on real networks, and
 * a handful of historical writes didn't fully succeed. None of that has
 * been cleaned up retroactively, which matches how the real system got
 * here.
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/vantra';

const VEHICLE_COUNT = Number(process.env.VANTRA_SEED_VEHICLE_COUNT_OVERRIDE) || 2000;
const READINGS_PER_VEHICLE = Number(process.env.VANTRA_SEED_READINGS_OVERRIDE) || 500;
const SPAN_DAYS = 60;
const BATCH_SIZE = 10_000;

// Cutover point (in reading-index terms) where firmware switched from
// string battery percentages to numeric. Roughly 40% of history is "old".
const STRING_BATTERY_CUTOVER_RATIO = 0.4;

const DUPLICATE_RATE = 0.005; // ~0.5% of events get an exact duplicate
const OUT_OF_ORDER_RATE = 0.02; // ~2% of events land out of device-timestamp order
const MISSING_FIELD_RATE = 0.01; // ~1% of events are missing a field entirely

function randomFleetName(i: number): string {
  const fleets = ['Northbound Logistics', 'Coastal Freight', 'Metro Delivery', 'Highland Transit'];
  return fleets[i % fleets.length];
}

function randomLatLng() {
  // Rough bounding box, doesn't need to be geographically meaningful.
  return {
    lat: 6.9 + Math.random() * 0.2,
    lng: 79.8 + Math.random() * 0.2,
  };
}

async function main() {
  console.log(`Connecting to ${MONGO_URI} ...`);
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Failed to acquire database handle');
  }

  console.log('Clearing existing seed collections...');
  await db.collection('vehicles').deleteMany({});
  await db.collection('telemetryevents').deleteMany({});
  await db.collection('users').deleteMany({});

  console.log(`Seeding ${VEHICLE_COUNT} vehicles...`);
  const vehicleDocs = Array.from({ length: VEHICLE_COUNT }, (_, i) => ({
    vehicleId: `VH-${String(i + 1).padStart(5, '0')}`,
    fleetName: randomFleetName(i),
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  await db.collection('vehicles').insertMany(vehicleDocs);

  console.log('Seeding demo user (demo@vantra.internal / demo-password-123)...');
  const passwordHash = await bcrypt.hash('demo-password-123', 10);
  await db.collection('users').insertOne({
    email: 'demo@vantra.internal',
    passwordHash,
    role: 'dispatcher',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(
    `Seeding ~${(VEHICLE_COUNT * READINGS_PER_VEHICLE).toLocaleString()} telemetry events...`,
  );

  const spanMs = SPAN_DAYS * 24 * 60 * 60 * 1000;
  const stepMs = spanMs / READINGS_PER_VEHICLE;
  const now = Date.now();
  const start = now - spanMs;

  let batch: Record<string, unknown>[] = [];
  let totalInserted = 0;

  for (let v = 0; v < VEHICLE_COUNT; v++) {
    const vehicleId = vehicleDocs[v].vehicleId;

    for (let r = 0; r < READINGS_PER_VEHICLE; r++) {
      const isOld = r < READINGS_PER_VEHICLE * STRING_BATTERY_CUTOVER_RATIO;
      const numericBattery = Math.max(5, 100 - r * 0.15 + (Math.random() * 6 - 3));

      let recordedAtMs = start + r * stepMs + (Math.random() * stepMs * 0.2 - stepMs * 0.1);

      // Real devices occasionally retry/delay delivery, so recordedAt isn't
      // always monotonic with arrival.
      if (Math.random() < OUT_OF_ORDER_RATE && r > 0) {
        recordedAtMs -= stepMs * (1 + Math.random() * 3);
      }

      const doc: Record<string, unknown> = {
        vehicleId,
        recordedAt: new Date(recordedAtMs),
        receivedAt: new Date(now - (READINGS_PER_VEHICLE - r) * stepMs),
        location: randomLatLng(),
        batteryLevel: isOld ? `${Math.round(numericBattery)}%` : Math.round(numericBattery * 10) / 10,
      };

      if (Math.random() < MISSING_FIELD_RATE) {
        // Simulate a historical partial write - drop a field entirely
        // rather than sending it as null/empty.
        if (Math.random() < 0.5) {
          delete doc.batteryLevel;
        } else {
          delete doc.location;
        }
      }

      batch.push(doc);

      if (Math.random() < DUPLICATE_RATE) {
        batch.push({ ...doc });
      }

      if (batch.length >= BATCH_SIZE) {
        await db.collection('telemetryevents').insertMany(batch, { ordered: false });
        totalInserted += batch.length;
        process.stdout.write(`\r  inserted ${totalInserted.toLocaleString()} events...`);
        batch = [];
      }
    }
  }

  if (batch.length > 0) {
    await db.collection('telemetryevents').insertMany(batch, { ordered: false });
    totalInserted += batch.length;
  }

  console.log(`\nInserted ${totalInserted.toLocaleString()} telemetry events total.`);

  console.log('Done.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
