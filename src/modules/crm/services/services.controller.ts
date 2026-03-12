import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import { ServicesService } from './services.service';
import { UpsertServiceDto } from './dto/upsert-service.dto';

@UseGuards(JwtAuthGuard)
@Controller('crm/services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.servicesService.findAll(user.tenantId, activeOnly === 'true');
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.servicesService.findOne(user.tenantId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertServiceDto) {
    return this.servicesService.create(user.tenantId, dto);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpsertServiceDto,
  ) {
    return this.servicesService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.servicesService.remove(user.tenantId, id);
  }
}
