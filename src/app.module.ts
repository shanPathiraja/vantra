import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AlertingModule } from './alerting/alerting.module';
import { CommonModule } from './common/common.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    MongooseModule.forRoot(process.env.MONGO_URI || 'mongodb://localhost:27017/vantra'),
    AuthModule,
    VehiclesModule,
    IngestionModule,
    DashboardModule,
    AlertingModule,
    CommonModule,
  ],
})
export class AppModule { }
