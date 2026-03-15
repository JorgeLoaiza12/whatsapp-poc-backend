import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { ClinicalService } from './clinical.service';
import { UpsertProfileDto } from './dto/upsert-profile.dto';
import { CreateEntryDto } from './dto/create-entry.dto';

@UseGuards(JwtAuthGuard)
@Controller('clinical')
export class ClinicalController {
  constructor(private readonly clinicalService: ClinicalService) {}

  @Get(':contactId')
  getProfile(@CurrentUser() user: AuthUser, @Param('contactId') contactId: string) {
    return this.clinicalService.getProfile(user.tenantId, contactId);
  }

  @Put(':contactId')
  upsertProfile(@CurrentUser() user: AuthUser, @Param('contactId') contactId: string, @Body() dto: UpsertProfileDto) {
    return this.clinicalService.upsertProfile(user.tenantId, contactId, dto);
  }

  @Post(':contactId/entries')
  addEntry(@CurrentUser() user: AuthUser, @Param('contactId') contactId: string, @Body() dto: CreateEntryDto) {
    return this.clinicalService.addEntry(user.tenantId, contactId, dto);
  }

  @Put('entries/:entryId')
  updateEntry(@CurrentUser() user: AuthUser, @Param('entryId') entryId: string, @Body() dto: CreateEntryDto) {
    return this.clinicalService.updateEntry(user.tenantId, entryId, dto);
  }

  @Delete('entries/:entryId')
  removeEntry(@CurrentUser() user: AuthUser, @Param('entryId') entryId: string) {
    return this.clinicalService.removeEntry(user.tenantId, entryId);
  }
}
