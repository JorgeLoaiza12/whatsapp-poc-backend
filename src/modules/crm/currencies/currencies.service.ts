import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

const ALL_CURRENCIES = ['CLP', 'USD', 'VES'] as const;
type Currency = (typeof ALL_CURRENCIES)[number];

@Injectable()
export class CurrenciesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    const rows = await this.prisma.tenantCurrency.findMany({
      where: { tenantId },
    });

    // Return all supported currencies with their active status
    return ALL_CURRENCIES.map((currency) => {
      const row = rows.find((r) => r.currency === currency);
      // CLP is active by default if no record exists
      const isActive = row ? row.isActive : currency === 'CLP';
      return { currency, isActive };
    });
  }

  async toggle(tenantId: string, currency: string, isActive: boolean) {
    if (!ALL_CURRENCIES.includes(currency as Currency)) {
      throw new BadRequestException(`Unsupported currency: ${currency}`);
    }

    // Prevent disabling the last active currency
    if (!isActive) {
      const activeCurrencies = await this.prisma.tenantCurrency.findMany({
        where: { tenantId, isActive: true },
      });
      // Count how many are active (including defaults not in DB)
      const activeCount = ALL_CURRENCIES.filter((c) => {
        const row = activeCurrencies.find((r) => r.currency === c);
        return row ? row.isActive : c === 'CLP';
      }).length;

      if (activeCount <= 1) {
        throw new BadRequestException('At least one currency must remain active');
      }
    }

    return this.prisma.tenantCurrency.upsert({
      where: { tenantId_currency: { tenantId, currency } },
      update: { isActive },
      create: { tenantId, currency, isActive },
    });
  }

  async getActiveCurrencies(tenantId: string): Promise<string[]> {
    const all = await this.findAll(tenantId);
    return all.filter((c) => c.isActive).map((c) => c.currency);
  }
}
