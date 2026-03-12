import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import { CurrenciesService } from './currencies.service';

@UseGuards(JwtAuthGuard)
@Controller('crm/currencies')
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.currenciesService.findAll(user.tenantId);
  }

  @Patch(':currency')
  toggle(
    @CurrentUser() user: AuthUser,
    @Param('currency') currency: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.currenciesService.toggle(user.tenantId, currency, isActive);
  }
}
