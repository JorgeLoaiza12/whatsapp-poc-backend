import { Module } from '@nestjs/common';
import { ClientsModule } from './clients/clients.module';
import { ServicesModule } from './services/services.module';
import { IncomesModule } from './incomes/incomes.module';
import { ExpensesModule } from './expenses/expenses.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { RemindersModule } from './reminders/reminders.module';
import { CurrenciesModule } from './currencies/currencies.module';

@Module({
  imports: [
    ClientsModule,
    ServicesModule,
    IncomesModule,
    ExpensesModule,
    DashboardModule,
    RemindersModule,
    CurrenciesModule,
  ],
})
export class CrmModule {}
