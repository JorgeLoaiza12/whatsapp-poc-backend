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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import { IncomesService } from './incomes.service';
import { UpsertIncomeDto } from './dto/upsert-income.dto';

@UseGuards(JwtAuthGuard)
@Controller('crm/incomes')
export class IncomesController {
  constructor(private readonly incomesService: IncomesService) {}

  @Get('export')
  async exportCsv(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const csv = await this.incomesService.exportCsv(user.tenantId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="incomes.csv"');
    res.send(csv);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('search') search?: string) {
    return this.incomesService.findAll(user.tenantId, search);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.incomesService.findOne(user.tenantId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertIncomeDto) {
    return this.incomesService.create(user.tenantId, dto);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpsertIncomeDto,
  ) {
    return this.incomesService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.incomesService.remove(user.tenantId, id);
  }
}
