// use context7
import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AppointmentsService } from './appointments.service';
import { UpsertAppointmentDto } from './dto/upsert-appointment.dto';

@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertAppointmentDto) {
    return this.appointmentsService.create(user.tenantId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.appointmentsService.findAll(user.tenantId, date);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.appointmentsService.findOne(user.tenantId, id);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpsertAppointmentDto,
  ) {
    return this.appointmentsService.update(user.tenantId, id, dto);
  }

  @Post(':id/complete')
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.appointmentsService.markComplete(user.tenantId, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.appointmentsService.remove(user.tenantId, id);
  }
}
