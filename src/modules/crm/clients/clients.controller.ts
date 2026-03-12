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
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import { ClientsService } from './clients.service';
import { UpsertClientDto } from './dto/upsert-client.dto';

@UseGuards(JwtAuthGuard)
@Controller('crm/clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('search') search?: string) {
    return this.clientsService.findAll(user.tenantId, search);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clientsService.findOne(user.tenantId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertClientDto) {
    return this.clientsService.create(user.tenantId, dto);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpsertClientDto,
  ) {
    return this.clientsService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clientsService.remove(user.tenantId, id);
  }

  @Post(':id/stamp')
  adjustStamp(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body('delta', new DefaultValuePipe(1), ParseIntPipe) delta: number,
  ) {
    return this.clientsService.adjustStamp(user.tenantId, id, delta);
  }
}
