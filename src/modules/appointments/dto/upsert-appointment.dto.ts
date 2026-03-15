// use context7
import { IsString, IsDateString, IsOptional, IsInt, IsEnum, Min } from 'class-validator';
import { AppointmentStatus } from '@prisma/client';

export class UpsertAppointmentDto {
  @IsString() contactId: string;
  @IsString() serviceName: string;
  @IsDateString() scheduledAt: string;
  @IsOptional() @IsInt() @Min(15) durationMins?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsEnum(AppointmentStatus) status?: AppointmentStatus;
}
