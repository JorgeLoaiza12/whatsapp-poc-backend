import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(tenantId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Current month totals
    const [monthIncomeAgg, monthExpenseAgg, totalClients] = await Promise.all([
      this.prisma.income.aggregate({
        where: { tenantId, date: { gte: startOfMonth, lt: startOfNextMonth } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.expense.aggregate({
        where: { tenantId, date: { gte: startOfMonth, lt: startOfNextMonth } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.contact.count({ where: { tenantId } }),
    ]);

    const monthIncome = Number(monthIncomeAgg._sum.amount ?? 0);
    const monthExpense = Number(monthExpenseAgg._sum.amount ?? 0);

    // Last 6 months chart data
    const months: { month: string; income: number; expense: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const label = d.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' });

      const [inc, exp] = await Promise.all([
        this.prisma.income.aggregate({
          where: { tenantId, date: { gte: start, lt: end } },
          _sum: { amount: true },
        }),
        this.prisma.expense.aggregate({
          where: { tenantId, date: { gte: start, lt: end } },
          _sum: { amount: true },
        }),
      ]);

      months.push({
        month: label,
        income: Number(inc._sum.amount ?? 0),
        expense: Number(exp._sum.amount ?? 0),
      });
    }

    // Expense category breakdown (current month)
    const categoryRows = await this.prisma.expense.groupBy({
      by: ['category'],
      where: { tenantId, date: { gte: startOfMonth, lt: startOfNextMonth } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    });
    const expenseByCategory = categoryRows.map((r) => ({
      category: r.category,
      total: Number(r._sum.amount ?? 0),
    }));

    // Recent transactions (last 10, mixed incomes + expenses)
    const [recentIncomes, recentExpenses] = await Promise.all([
      this.prisma.income.findMany({
        where: { tenantId },
        orderBy: { date: 'desc' },
        take: 10,
        include: { contact: { select: { name: true, waPhone: true } } },
      }),
      this.prisma.expense.findMany({
        where: { tenantId },
        orderBy: { date: 'desc' },
        take: 10,
      }),
    ]);

    const recentTransactions = [
      ...recentIncomes.map((i) => ({
        id: i.id,
        type: 'income' as const,
        amount: Number(i.amount),
        currency: i.currency,
        description: i.serviceNames,
        clientName: i.contact?.name ?? i.contact?.waPhone ?? null,
        date: i.date,
      })),
      ...recentExpenses.map((e) => ({
        id: e.id,
        type: 'expense' as const,
        amount: Number(e.amount),
        currency: e.currency,
        description: e.description,
        clientName: null,
        date: e.date,
      })),
    ]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 10);

    return {
      monthIncome,
      monthExpense,
      monthNet: monthIncome - monthExpense,
      monthIncomeCount: monthIncomeAgg._count,
      monthExpenseCount: monthExpenseAgg._count,
      totalClients,
      chart: months,
      expenseByCategory,
      recentTransactions,
    };
  }
}
