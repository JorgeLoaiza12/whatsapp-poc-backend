// use context7
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ReminderCron } from './reminder.cron';
import { AppointmentReminderCron } from './appointment-reminder.cron';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { AppointmentsModule } from '../appointments/appointments.module';

@Module({
  imports: [ScheduleModule.forRoot(), WhatsAppModule, AppointmentsModule],
  providers: [ReminderCron, AppointmentReminderCron],
})
export class SchedulerModule {}
