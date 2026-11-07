import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ default: 'dispatcher', enum: ['admin', 'dispatcher'] })
  role: string;

  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ default: false })
  mustChangePassword?: boolean;

  @Prop({ default: false })
  isTemporary?: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
