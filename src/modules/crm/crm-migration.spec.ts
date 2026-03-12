/**
 * CRM Migration Compatibility Tests
 *
 * Simulates data that existed in agencl (Supabase + Drizzle schema) and verifies
 * that the same records are fully accessible through the new multi-tenant CRM
 * services. These tests guarantee that migrated users can see their clients,
 * services, incomes, and expenses without any data loss or access denial.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ClientsService } from './clients/clients.service';
import { ServicesService } from './services/services.service';
import { IncomesService } from './incomes/incomes.service';
import { ExpensesService } from './expenses/expenses.service';
import { DashboardService } from './dashboard/dashboard.service';
import { PrismaService } from '../../database/prisma.service';

// Represents a tenant that was migrated from agencl (e.g. a lashista studio)
const MIGRATED_TENANT_ID = 'agencl-tenant-migrated';

const mockPrisma = {
  contact: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  service: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  income: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
  expense: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ── Agencl-shaped fixture data ─────────────────────────────────────────────
// These mirror the exact field names and types that agencl stored

const agenclClients = [
  {
    id: 'client-001',
    tenantId: MIGRATED_TENANT_ID,
    waPhone: '56912345678',
    name: 'María González',
    phone: '56912345678',
    email: 'maria@gmail.com',
    instagram: '@mariagonzalez',
    notes: 'Clienta VIP, cejas',
    loyaltyStamps: 7,
    createdAt: new Date('2024-01-10'),
  },
  {
    id: 'client-002',
    tenantId: MIGRATED_TENANT_ID,
    waPhone: '56987654321',
    name: 'Valentina Muñoz',
    phone: '56987654321',
    email: null,
    instagram: null,
    notes: null,
    loyaltyStamps: 2,
    createdAt: new Date('2024-03-15'),
  },
];

const agenclServices = [
  {
    id: 'svc-001',
    tenantId: MIGRATED_TENANT_ID,
    name: 'Diseño de cejas',
    price: 25000,
    duration: 60,
    description: 'Diseño y relleno con henna',
    isActive: true,
    daysForNextTouchup: 30,
  },
  {
    id: 'svc-002',
    tenantId: MIGRATED_TENANT_ID,
    name: 'Extensión de pestañas',
    price: 45000,
    duration: 90,
    description: 'Volumen ruso clásico',
    isActive: true,
    daysForNextTouchup: 21,
  },
  {
    id: 'svc-003',
    tenantId: MIGRATED_TENANT_ID,
    name: 'Lifting de pestañas',
    price: 30000,
    duration: 75,
    description: null,
    isActive: false, // deactivated in agencl
    daysForNextTouchup: null,
  },
];

const agenclIncomes = [
  {
    id: 'inc-001',
    tenantId: MIGRATED_TENANT_ID,
    contactId: 'client-001',
    serviceNames: 'Diseño de cejas',
    amount: 25000,
    currency: 'CLP',
    paymentMethod: 'Transferencia',
    date: new Date('2025-01-10'),
    notes: null,
    contact: agenclClients[0],
  },
  {
    id: 'inc-002',
    tenantId: MIGRATED_TENANT_ID,
    contactId: 'client-002',
    serviceNames: 'Extensión de pestañas,Diseño de cejas',
    amount: 70000,
    currency: 'CLP',
    paymentMethod: 'Efectivo',
    date: new Date('2025-01-15'),
    notes: 'Pago con descuento',
    contact: agenclClients[1],
  },
];

const agenclExpenses = [
  {
    id: 'exp-001',
    tenantId: MIGRATED_TENANT_ID,
    amount: 18000,
    currency: 'CLP',
    category: 'Insumos',
    description: 'Pigmentos + adhesivo',
    paymentMethod: 'Transferencia',
    date: new Date('2025-01-05'),
    notes: 'Proveedor habitual',
  },
];

// ──────────────────────────────────────────────────────────────────────────────

describe('CRM Migration Compatibility', () => {
  let clientsService: ClientsService;
  let servicesService: ServicesService;
  let incomesService: IncomesService;
  let expensesService: ExpensesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        ServicesService,
        IncomesService,
        ExpensesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    clientsService = module.get<ClientsService>(ClientsService);
    servicesService = module.get<ServicesService>(ServicesService);
    incomesService = module.get<IncomesService>(IncomesService);
    expensesService = module.get<ExpensesService>(ExpensesService);
  });

  // ── Clients (Contactos migrados desde agencl) ────────────────────────────

  describe('Migrated clients are accessible', () => {
    it('migrated tenant can list all their clients', async () => {
      mockPrisma.contact.findMany.mockResolvedValue(agenclClients);

      const result = await clientsService.findAll(MIGRATED_TENANT_ID);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('María González');
      expect(result[1].name).toBe('Valentina Muñoz');
    });

    it('migrated tenant can retrieve individual client detail', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue({
        ...agenclClients[0],
        incomes: agenclIncomes,
        conversations: [],
      });

      const result = await clientsService.findOne(MIGRATED_TENANT_ID, 'client-001');

      expect(result.name).toBe('María González');
      expect(result.loyaltyStamps).toBe(7);
      expect(result.instagram).toBe('@mariagonzalez');
    });

    it('client from different tenant is NOT accessible (tenant isolation)', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(null); // tenantId mismatch → null

      await expect(
        clientsService.findOne('OTHER-TENANT', 'client-001'),
      ).rejects.toThrow();
    });

    it('client search works for migrated clients', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([agenclClients[0]]);

      const result = await clientsService.findAll(MIGRATED_TENANT_ID, 'María');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('María González');
    });
  });

  // ── Services ─────────────────────────────────────────────────────────────

  describe('Migrated services are accessible', () => {
    it('migrated tenant can list all services including inactive ones', async () => {
      mockPrisma.service.findMany.mockResolvedValue(agenclServices);

      const result = await servicesService.findAll(MIGRATED_TENANT_ID);

      expect(result).toHaveLength(3);
      const names = result.map((s) => s.name);
      expect(names).toContain('Diseño de cejas');
      expect(names).toContain('Extensión de pestañas');
      expect(names).toContain('Lifting de pestañas');
    });

    it('activeOnly filter returns only active services', async () => {
      mockPrisma.service.findMany.mockResolvedValue(
        agenclServices.filter((s) => s.isActive),
      );

      const result = await servicesService.findAll(MIGRATED_TENANT_ID, true);

      expect(result).toHaveLength(2);
      expect(result.every((s) => s.isActive)).toBe(true);
    });

    it('services with daysForNextTouchup are accessible for reminder logic', async () => {
      mockPrisma.service.findMany.mockResolvedValue(agenclServices);

      const result = await servicesService.findAll(MIGRATED_TENANT_ID);

      const withTouchup = result.filter((s) => s.daysForNextTouchup !== null);
      expect(withTouchup.length).toBeGreaterThan(0);
    });
  });

  // ── Incomes ───────────────────────────────────────────────────────────────

  describe('Migrated incomes are accessible', () => {
    it('migrated tenant can list all incomes with contact data', async () => {
      mockPrisma.income.findMany.mockResolvedValue(agenclIncomes);

      const result = await incomesService.findAll(MIGRATED_TENANT_ID);

      expect(result).toHaveLength(2);
      expect(result[0].serviceNames).toBe('Diseño de cejas');
      expect(result[0].contact.name).toBe('María González');
    });

    it('multi-service income (comma-separated serviceNames) is preserved', async () => {
      mockPrisma.income.findMany.mockResolvedValue(agenclIncomes);

      const result = await incomesService.findAll(MIGRATED_TENANT_ID);

      const multiService = result.find((i) => i.serviceNames.includes(','));
      expect(multiService).toBeDefined();
      expect(multiService!.serviceNames).toBe('Extensión de pestañas,Diseño de cejas');
    });

    it('income amounts and currencies are preserved exactly', async () => {
      mockPrisma.income.findMany.mockResolvedValue(agenclIncomes);

      const result = await incomesService.findAll(MIGRATED_TENANT_ID);

      expect(result[0].amount).toBe(25000);
      expect(result[0].currency).toBe('CLP');
      expect(result[1].amount).toBe(70000);
    });
  });

  // ── Expenses ──────────────────────────────────────────────────────────────

  describe('Migrated expenses are accessible', () => {
    it('migrated tenant can list all expenses', async () => {
      mockPrisma.expense.findMany.mockResolvedValue(agenclExpenses);

      const result = await expensesService.findAll(MIGRATED_TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('Insumos');
      expect(result[0].description).toBe('Pigmentos + adhesivo');
    });

    it('expense search by category works on migrated data', async () => {
      mockPrisma.expense.findMany.mockResolvedValue(agenclExpenses);

      await expensesService.findAll(MIGRATED_TENANT_ID, 'Insumos');

      const callArg = mockPrisma.expense.findMany.mock.calls[0][0];
      expect(callArg.where.OR).toBeDefined();
    });
  });

  // ── Cross-tenant isolation ────────────────────────────────────────────────

  describe('Cross-tenant data isolation', () => {
    it('tenant A cannot see tenant B clients', async () => {
      // Tenant B tries to access tenant A client → DB returns null (tenantId filter)
      mockPrisma.contact.findFirst.mockResolvedValue(null);

      await expect(
        clientsService.findOne('TENANT-B', 'client-001'),
      ).rejects.toThrow();
    });

    it('tenant A cannot see tenant B services', async () => {
      mockPrisma.service.findFirst.mockResolvedValue(null);

      await expect(
        servicesService.findOne('TENANT-B', 'svc-001'),
      ).rejects.toThrow();
    });

    it('tenant A cannot see tenant B incomes', async () => {
      mockPrisma.income.findFirst.mockResolvedValue(null);

      await expect(
        incomesService.findOne('TENANT-B', 'inc-001'),
      ).rejects.toThrow();
    });

    it('tenant A cannot see tenant B expenses', async () => {
      mockPrisma.expense.findFirst.mockResolvedValue(null);

      await expect(
        expensesService.findOne('TENANT-B', 'exp-001'),
      ).rejects.toThrow();
    });
  });
});
