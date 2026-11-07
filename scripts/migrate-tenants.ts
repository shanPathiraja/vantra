/**
 * Vantra — Production Multi-Tenant Migration Script
 *
 * DYNAMIC & NON-DESTRUCTIVE:
 *  - Dynamically extracts all distinct fleet names from the vehicles collection.
 *  - Supports ANY number of fleets present in production (not hardcoded).
 *  - Creates/upserts a Tenant record for each discovered fleet.
 *  - Generates a Temporary Admin Account with `mustChangePassword: true`
 *    and `isTemporary: true` for any fleet without an administrator.
 *  - In-place updates only: NEVER drops or deletes existing data.
 *  - Fully idempotent: safe to re-run multiple times.
 *  - Supports `--dry-run` flag to preview changes without modifying database.
 *
 * Usage:
 *   npx ts-node scripts/migrate-tenants.ts
 *   npx ts-node scripts/migrate-tenants.ts --dry-run
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/vantra';
const isDryRun = process.argv.includes('--dry-run');

interface GeneratedAdminCredential {
  fleetName: string;
  tenantId: string;
  email: string;
  tempPassword?: string;
  status: 'GENERATED_TEMPORARY' | 'EXISTING_ADMIN';
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function runMigration() {
  console.log('======================================================');
  console.log(' VANTRA MULTI-TENANT BACKFILL MIGRATION');
  console.log(` Mode: ${isDryRun ? 'DRY-RUN (Simulated, no writes)' : 'LIVE EXECUTION'}`);
  console.log(` Target: ${MONGO_URI}`);
  if (!isDryRun) {
    console.log(' ⚠️ WARNING: Ensure you have taken a full database backup');
    console.log('            (e.g. mongodump) before running on production.');
  }
  console.log('======================================================\n');

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Failed to acquire database handle');
  }

  // --------------------------------------------------------------------------
  // STEP 1: Dynamically Discover All Fleets from vehicles
  // --------------------------------------------------------------------------
  console.log('▶ Step 1: Discovering all distinct fleet names from vehicles...');
  const rawFleets: (string | null | undefined)[] = await db
    .collection('vehicles')
    .distinct('fleetName');

  const discoveredFleets = rawFleets
    .map((name) => (typeof name === 'string' ? name.trim() : ''))
    .filter((name): name is string => name.length > 0);

  if (discoveredFleets.length === 0) {
    console.warn('⚠️ No fleets found in vehicles collection. Ensure database is populated.');
    await mongoose.disconnect();
    return;
  }

  console.log(`   Found ${discoveredFleets.length} distinct fleets in database:`);
  discoveredFleets.forEach((f, idx) => console.log(`   ${idx + 1}. ${f}`));

  // --------------------------------------------------------------------------
  // STEP 2: Upsert Tenant Records for Each Discovered Fleet
  // --------------------------------------------------------------------------
  console.log('\n▶ Step 2: Ensuring Tenant records exist for all discovered fleets...');
  for (const fleetName of discoveredFleets) {
    if (!isDryRun) {
      await db.collection('tenants').updateOne(
        { name: fleetName },
        {
          $setOnInsert: {
            name: fleetName,
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
    }
  }

  // Build lookup map from database: fleetName -> tenantId
  const tenants = await db.collection('tenants').find({}).toArray();
  const tenantMap: Record<string, string> = {};
  for (const t of tenants) {
    tenantMap[t.name] = t._id.toString();
  }

  // --------------------------------------------------------------------------
  // STEP 3: Backfill Vehicles in-place by fleetName
  // --------------------------------------------------------------------------
  console.log('\n▶ Step 3: Backfilling vehicles in-place with tenantId...');
  let totalVehiclesUpdated = 0;
  for (const [fleetName, tenantId] of Object.entries(tenantMap)) {
    const filter = { fleetName, tenantId: { $exists: false } };
    const pendingCount = await db.collection('vehicles').countDocuments(filter);
    if (pendingCount > 0) {
      if (!isDryRun) {
        const res = await db.collection('vehicles').updateMany(filter, { $set: { tenantId } });
        totalVehiclesUpdated += res.modifiedCount;
      } else {
        totalVehiclesUpdated += pendingCount;
      }
      console.log(`   • ${fleetName}: ${pendingCount} vehicles ${isDryRun ? 'eligible' : 'tagged'}`);
    } else {
      console.log(`   • ${fleetName}: already tagged (0 pending)`);
    }
  }
  console.log(`   Total vehicles ${isDryRun ? 'to update' : 'updated'}: ${totalVehiclesUpdated}`);

  // --------------------------------------------------------------------------
  // STEP 4: Handle Admin Accounts (Generate Temporary Admins if Missing)
  // --------------------------------------------------------------------------
  console.log('\n▶ Step 4: Ensuring Admin accounts for each fleet...');
  const adminCredentialsReport: GeneratedAdminCredential[] = [];

  for (const fleetName of discoveredFleets) {
    const tenantId = tenantMap[fleetName];
    if (!tenantId) continue;

    // Check if an admin already exists for this tenant
    const existingAdmin = await db.collection('users').findOne({ tenantId, role: 'admin' });

    if (existingAdmin) {
      adminCredentialsReport.push({
        fleetName,
        tenantId,
        email: existingAdmin.email,
        status: 'EXISTING_ADMIN',
      });
      console.log(`   • ${fleetName}: Existing admin found (${existingAdmin.email})`);
    } else {
      // Generate a temporary admin account
      const slug = slugify(fleetName);
      const tempEmail = `admin@${slug}.vantra.internal`;
      // High-entropy readable temporary password: Temp-XXXXXX!
      const randomHex = crypto.randomBytes(4).toString('hex');
      const tempPassword = `Temp-${randomHex}!`;
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      if (!isDryRun) {
        await db.collection('users').updateOne(
          { email: tempEmail },
          {
            $setOnInsert: {
              email: tempEmail,
              passwordHash,
              role: 'admin',
              tenantId,
              isTemporary: true,
              mustChangePassword: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { upsert: true },
        );
      }

      adminCredentialsReport.push({
        fleetName,
        tenantId,
        email: tempEmail,
        tempPassword,
        status: 'GENERATED_TEMPORARY',
      });
      console.log(`   + ${fleetName}: Created temporary admin -> ${tempEmail}`);
    }
  }

  // 4b. Backfill existing demo user if present
  const demoUser = await db.collection('users').findOne({ email: 'demo@vantra.internal' });
  if (demoUser && !demoUser.tenantId) {
    const demoTenantName = discoveredFleets.includes('Northbound Logistics')
      ? 'Northbound Logistics'
      : discoveredFleets[0];
    const targetTenantId = tenantMap[demoTenantName];
    if (targetTenantId) {
      if (!isDryRun) {
        await db
          .collection('users')
          .updateOne({ _id: demoUser._id }, { $set: { tenantId: targetTenantId } });
      }
      console.log(`   • Existing demo@vantra.internal mapped to ${demoTenantName} (${targetTenantId})`);
    }
  }

  // --------------------------------------------------------------------------
  // STEP 5: Backfill Telemetry Events in Batches (by vehicleId)
  // --------------------------------------------------------------------------
  console.log('\n▶ Step 5: Backfilling telemetryevents with tenantId in batches...');
  const pendingTelemetryCount = await db
    .collection('telemetryevents')
    .countDocuments({ tenantId: { $exists: false } });

  if (pendingTelemetryCount === 0) {
    console.log('   All telemetry events already tagged. Skipping.');
  } else {
    console.log(`   Found ${pendingTelemetryCount.toLocaleString()} events without tenantId.`);

    const vehicles = await db
      .collection('vehicles')
      .find({}, { projection: { vehicleId: 1, tenantId: 1, fleetName: 1 } })
      .toArray();

    let totalTelemetryTagged = 0;
    const startMs = Date.now();

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      const targetTenantId = v.tenantId || tenantMap[v.fleetName];
      if (!targetTenantId) continue;

      const eventFilter = { vehicleId: v.vehicleId, tenantId: { $exists: false } };
      if (!isDryRun) {
        const updateRes = await db
          .collection('telemetryevents')
          .updateMany(eventFilter, { $set: { tenantId: targetTenantId } });
        totalTelemetryTagged += updateRes.modifiedCount;
      } else {
        // In dry run, count pending events for this vehicle
        totalTelemetryTagged += pendingTelemetryCount / vehicles.length; // estimate or fast aggregate
        break; // don't run 2,000 count queries in dry run
      }

      if ((i + 1) % 200 === 0 || i === vehicles.length - 1) {
        const pct = (((i + 1) / vehicles.length) * 100).toFixed(1);
        process.stdout.write(
          `\r   Progress: ${i + 1}/${vehicles.length} vehicles (${pct}%) — ${totalTelemetryTagged.toLocaleString()} events ${isDryRun ? 'scanned' : 'updated'}`,
        );
      }
    }
    const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
    console.log(`\n   Telemetry backfill finished in ${elapsedSec}s.`);
  }

  // --------------------------------------------------------------------------
  // STEP 6: Backfill Alerts
  // --------------------------------------------------------------------------
  console.log('\n▶ Step 6: Backfilling alerts collection...');
  const pendingAlerts = await db.collection('alerts').countDocuments({ tenantId: { $exists: false } });
  if (pendingAlerts === 0) {
    console.log('   All alerts already tagged. Skipping.');
  } else {
    const vehicles = await db
      .collection('vehicles')
      .find({}, { projection: { vehicleId: 1, tenantId: 1, fleetName: 1 } })
      .toArray();

    let alertsUpdated = 0;
    for (const v of vehicles) {
      const targetTenantId = v.tenantId || tenantMap[v.fleetName];
      if (!targetTenantId) continue;
      const alertFilter = { vehicleId: v.vehicleId, tenantId: { $exists: false } };
      if (!isDryRun) {
        const res = await db.collection('alerts').updateMany(alertFilter, { $set: { tenantId: targetTenantId } });
        alertsUpdated += res.modifiedCount;
      } else {
        alertsUpdated += await db.collection('alerts').countDocuments(alertFilter);
      }
    }
    console.log(`   Alerts ${isDryRun ? 'scanned' : 'updated'}: ${alertsUpdated}`);
  }

  // --------------------------------------------------------------------------
  // STEP 7: Create Compound Indexes (background/non-blocking)
  // --------------------------------------------------------------------------
  if (!isDryRun) {
    console.log('\n▶ Step 7: Creating compound indexes in background...');
    const safeCreateIndex = async (
      collection: any,
      spec: Record<string, 1 | -1>,
      options: Record<string, unknown> = {},
    ) => {
      try {
        await collection.createIndex(spec, options);
      } catch (err: any) {
        if (err.code === 85 || err.code === 86 || err.codeName === 'IndexKeySpecsConflict') {
          console.log(`   • Index on ${JSON.stringify(spec)} already exists.`);
        } else {
          throw err;
        }
      }
    };

    await safeCreateIndex(db.collection('vehicles'), { tenantId: 1, vehicleId: 1 }, { unique: true });
    await safeCreateIndex(db.collection('telemetryevents'), { tenantId: 1, vehicleId: 1, recordedAt: -1 });
    await safeCreateIndex(db.collection('users'), { tenantId: 1, email: 1 }, { unique: true });
    await safeCreateIndex(db.collection('alerts'), { tenantId: 1, vehicleId: 1 });
    console.log('   Compound indexes confirmed.');
  }

  // --------------------------------------------------------------------------
  // STEP 8: Verification Audit
  // --------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(' MIGRATION VERIFICATION AUDIT');
  console.log('======================================================');
  const untaggedVehicles = await db.collection('vehicles').countDocuments({ tenantId: { $exists: false } });
  const untaggedTelemetry = await db.collection('telemetryevents').countDocuments({ tenantId: { $exists: false } });
  const untaggedUsers = await db.collection('users').countDocuments({ tenantId: { $exists: false } });
  const untaggedAlerts = await db.collection('alerts').countDocuments({ tenantId: { $exists: false } });

  console.log(`• Untagged vehicles:         ${untaggedVehicles} ${untaggedVehicles === 0 ? '✅ (PASS)' : '❌ (FAIL)'}`);
  console.log(`• Untagged telemetry events: ${untaggedTelemetry} ${untaggedTelemetry === 0 ? '✅ (PASS)' : '❌ (FAIL)'}`);
  console.log(`• Untagged users:            ${untaggedUsers} ${untaggedUsers === 0 ? '✅ (PASS)' : '❌ (FAIL)'}`);
  console.log(`• Untagged alerts:           ${untaggedAlerts} ${untaggedAlerts === 0 ? '✅ (PASS)' : '❌ (FAIL)'}`);

  // --------------------------------------------------------------------------
  // STEP 9: Temporary Admin Credentials Handover Report
  // --------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(' 🔐 TEMPORARY ADMIN CREDENTIALS REPORT');
  console.log(' Hand over these credentials to fleet administrators.');
  console.log(' Admins must change their email & password on 1st login.');
  console.log('======================================================');

  for (const item of adminCredentialsReport) {
    console.log(`\n• Fleet: ${item.fleetName} (Tenant ID: ${item.tenantId})`);
    console.log(`  Admin Email:  ${item.email}`);
    if (item.tempPassword) {
      console.log(`  Temp Password: ${item.tempPassword}`);
      console.log(`  Action:        Must change email & password on first login (mustChangePassword: true)`);
    } else {
      console.log(`  Status:        Permanent Admin account already configured`);
    }
  }
  console.log('======================================================\n');

  await mongoose.disconnect();
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
