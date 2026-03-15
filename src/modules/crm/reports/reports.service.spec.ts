// use context7
import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService, SEGMENT_THRESHOLDS } from './reports.service';
import { PrismaService } from '../../../database/prisma.service';

const TENANT_ID = 'tenant-1';
const NOW = new Date('2026-03-14T12:00:00.000Z');

const daysAgo = (n: number): Date =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

const mockPrisma = {
  contact: { findMany: jest.fn() },
  income: { groupBy: jest.fn(), findMany: jest.fn() },
};

const makeContact = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  tenantId: TENANT_ID,
  waPhone: `56900000${id}`,
  name: `Clienta ${id}`,
  ...overrides,
});

// income.groupBy all-time row
const makeStatRow = (
  contactId: string,
  count: number,
  firstDate: Date,
  lastDate: Date,
  totalAmount = 10000,
) => ({
  contactId,
  _count: { id: count },
  _min: { date: firstDate },
  _max: { date: lastDate },
  _sum: { amount: totalAmount },
});

// income.groupBy last-90-days row
const makeRecentRow = (contactId: string, count: number) => ({
  contactId,
  _count: { id: count },
});

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  afterEach(() => jest.useRealTimers());

  // ── getSegments ────────────────────────────────────────────────────────────

  describe('getSegments', () => {
    it('classifies contact as "nuevas" when first visit is within last 30 days', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([makeContact('1')]);
      mockPrisma.income.groupBy
        .mockResolvedValueOnce([makeStatRow('1', 1, daysAgo(10), daysAgo(10))]) // all-time
        .mockResolvedValueOnce([makeRecentRow('1', 1)]); // last 90 days

      const result = await service.getSegments(TENANT_ID);

      expect(result.segments.nuevas).toHaveLength(1);
      expect(result.segments.nuevas[0].contactId).toBe('1');
    });

    it('classifies contact as "vip" when >= 3 visits in last 90 days and not new', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([makeContact('2')]);
      mockPrisma.income.groupBy
        .mockResolvedValueOnce([makeStatRow('2', 5, daysAgo(200), daysAgo(5))])
        .mockResolvedValueOnce([makeRecentRow('2', 3)]);

      const result = await service.getSegments(TENANT_ID);

      expect(result.segments.vip).toHaveLength(1);
      expect(result.segments.vip[0].contactId).toBe('2');
    });

    it('classifies contact as "regular" when 1-2 visits in last 90 days and not new', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([makeContact('3')]);
      mockPrisma.income.groupBy
        .mockResolvedValueOnce([makeStatRow('3', 2, daysAgo(200), daysAgo(20))])
        .mockResolvedValueOnce([makeRecentRow('3', 2)]);

      const result = await service.getSegments(TENANT_ID);

      expect(result.segments.regular).toHaveLength(1);
    });

    it('classifies contact as "en_riesgo" when last visit was 60-120 days ago', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([makeContact('4')]);
      mockPrisma.income.groupBy
        .mockResolvedValueOnce([makeStatRow('4', 3, daysAgo(300), daysAgo(80))])
        .mockResolvedValueOnce([]); // no recent visits

      const result = await service.getSegments(TENANT_ID);

      expect(result.segments.en_riesgo).toHaveLength(1);
    });

    it('classifies contact as "dormidas" when last visit was more than 120 days ago', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([makeContact('5')]);
      mockPrisma.income.groupBy
        .mockResolvedValueOnce([makeStatRow('5', 1, daysAgo(400), daysAgo(150))])
        .mockResolvedValueOnce([]);

      const result = await service.getSegments(TENANT_ID);

      expect(result.segments.dormidas).toHaveLength(1);
    });

    it('classifies contact as "sin_visitas" when they have no income records', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([makeContact('6')]);
      mockPrisma.income.groupBy
        .mockResolvedValueOnce([]) // no all-time stats
        .mockResolvedValueOnce([]);

      const result = await service.getSegments(TENANT_ID);

      expect(result.segments.sin_visitas).toHaveLength(1);
    });

    it('prioritizes "nuevas" over "vip" when first visit is within 30 days despite 3+ visits', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([makeContact('7')]);
      mockPrisma.income.groupBy
        .mockResolvedValueOnce([makeStatRow('7', 4, daysAgo(15), daysAgo(2))])
        .mockResolvedValueOnce([makeRecentRow('7', 4)]);

      const result = await service.getSegments(TENANT_ID);

      expect(result.segments.nuevas).toHaveLength(1);
      expect(result.segments.vip).toHaveLength(0);
    });

    it('returns correct totals matching sum of each segment', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([
        makeContact('1'),
        makeContact('2'),
        makeContact('3'),
      ]);
      mockPrisma.income.groupBy
        .mockResolvedValueOnce([
          makeStatRow('1', 1, daysAgo(10), daysAgo(10)),
          makeStatRow('2', 5, daysAgo(200), daysAgo(5)),
          makeStatRow('3', 1, daysAgo(400), daysAgo(150)),
        ])
        .mockResolvedValueOnce([
          makeRecentRow('1', 1),
          makeRecentRow('2', 3),
        ]);

      const result = await service.getSegments(TENANT_ID);

      const sumFromSegments =
        result.segments.nuevas.length +
        result.segments.vip.length +
        result.segments.regular.length +
        result.segments.en_riesgo.length +
        result.segments.dormidas.length +
        result.segments.sin_visitas.length;

      expect(result.totals.total).toBe(3);
      expect(result.totals.total).toBe(sumFromSegments);
    });

    it('returns empty segments when tenant has no contacts', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([]);
      mockPrisma.income.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getSegments(TENANT_ID);

      expect(result.totals.total).toBe(0);
    });

    it('exposes visitsLast90Days correctly on each SegmentedContact', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([makeContact('8')]);
      mockPrisma.income.groupBy
        .mockResolvedValueOnce([makeStatRow('8', 10, daysAgo(200), daysAgo(5))])
        .mockResolvedValueOnce([makeRecentRow('8', 5)]);

      const result = await service.getSegments(TENANT_ID);

      const contact = [...result.segments.vip, ...result.segments.nuevas][0];
      expect(contact.visitsLast90Days).toBe(5);
    });
  });

  // ── getTopClients ──────────────────────────────────────────────────────────

  describe('getTopClients', () => {
    const contacts = [makeContact('a'), makeContact('b'), makeContact('c')];
    const allTimeStats = [
      makeStatRow('a', 10, daysAgo(365), daysAgo(5), 50000),
      makeStatRow('b', 3, daysAgo(200), daysAgo(10), 150000),
      makeStatRow('c', 7, daysAgo(100), daysAgo(2), 70000),
    ];

    beforeEach(() => {
      mockPrisma.contact.findMany.mockResolvedValue(contacts);
      mockPrisma.income.groupBy.mockResolvedValue(allTimeStats);
    });

    it('returns top clients sorted by total visits descending when by=visits', async () => {
      const result = await service.getTopClients(TENANT_ID, 'visits', 10);

      expect(result[0].contactId).toBe('a'); // 10 visits
      expect(result[1].contactId).toBe('c'); // 7 visits
      expect(result[2].contactId).toBe('b'); // 3 visits
    });

    it('returns top clients sorted by total revenue descending when by=revenue', async () => {
      const result = await service.getTopClients(TENANT_ID, 'revenue', 10);

      expect(result[0].contactId).toBe('b'); // 150000
      expect(result[1].contactId).toBe('c'); // 70000
      expect(result[2].contactId).toBe('a'); // 50000
    });

    it('respects the limit parameter', async () => {
      const result = await service.getTopClients(TENANT_ID, 'visits', 2);

      expect(result).toHaveLength(2);
    });

    it('includes contactName and waPhone in results', async () => {
      const result = await service.getTopClients(TENANT_ID, 'visits', 10);

      expect(result[0].name).toBe('Clienta a');
      expect(result[0].waPhone).toBe('56900000a');
    });

    it('returns empty array when tenant has no incomes', async () => {
      mockPrisma.income.groupBy.mockResolvedValue([]);

      const result = await service.getTopClients(TENANT_ID, 'visits', 10);

      expect(result).toEqual([]);
    });
  });

  // ── getRetention ───────────────────────────────────────────────────────────

  describe('getRetention', () => {
    it('returns 6 monthly retention entries', async () => {
      mockPrisma.income.findMany.mockResolvedValue([]);

      const result = await service.getRetention(TENANT_ID);

      expect(result).toHaveLength(6);
    });

    it('each entry has month label, returnedClients, totalClients, and retentionRate', async () => {
      mockPrisma.income.findMany.mockResolvedValue([]);

      const result = await service.getRetention(TENANT_ID);

      result.forEach((entry) => {
        expect(entry).toHaveProperty('month');
        expect(entry).toHaveProperty('returnedClients');
        expect(entry).toHaveProperty('totalClients');
        expect(entry).toHaveProperty('retentionRate');
      });
    });

    it('calculates retentionRate as 0 when no clients visited previous month', async () => {
      mockPrisma.income.findMany.mockResolvedValue([]);

      const result = await service.getRetention(TENANT_ID);

      result.forEach((entry) => {
        expect(entry.retentionRate).toBe(0);
      });
    });

    it('computes correct retentionRate when clients return', async () => {
      // contact-1 visits in month N-1 and month N → retained
      // contact-2 visits only in month N-1 → lost
      const prevMonthDate = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 15);
      const currMonthDate = new Date(NOW.getFullYear(), NOW.getMonth(), 5);

      mockPrisma.income.findMany.mockResolvedValue([
        { contactId: 'c1', date: prevMonthDate },
        { contactId: 'c2', date: prevMonthDate },
        { contactId: 'c1', date: currMonthDate },
      ]);

      const result = await service.getRetention(TENANT_ID);
      const currentMonth = result[result.length - 1];

      // 1 returned out of 2 previous month clients = 50%
      expect(currentMonth.returnedClients).toBe(1);
      expect(currentMonth.totalClients).toBe(2);
      expect(currentMonth.retentionRate).toBe(50);
    });
  });

  // ── getServicePopularity ───────────────────────────────────────────────────

  describe('getServicePopularity', () => {
    it('returns services sorted by visit count descending', async () => {
      mockPrisma.income.findMany.mockResolvedValue([
        { serviceNames: 'Diseño de cejas', amount: 25000 },
        { serviceNames: 'Diseño de cejas, Tinte', amount: 30000 },
        { serviceNames: 'Tinte', amount: 10000 },
        { serviceNames: 'Lifting', amount: 20000 },
      ]);

      const result = await service.getServicePopularity(TENANT_ID);

      expect(result[0].serviceName).toBe('Diseño de cejas'); // 2 appearances
      expect(result[1].serviceName).toBe('Tinte');           // 2 appearances
    });

    it('counts each service name individually from comma-separated serviceNames', async () => {
      mockPrisma.income.findMany.mockResolvedValue([
        { serviceNames: 'Servicio A, Servicio B, Servicio A', amount: 10000 },
      ]);

      const result = await service.getServicePopularity(TENANT_ID);

      const servicoA = result.find((r) => r.serviceName === 'Servicio A');
      expect(servicoA?.visitCount).toBe(2);
    });

    it('accumulates revenue per service across all incomes', async () => {
      mockPrisma.income.findMany.mockResolvedValue([
        { serviceNames: 'Cejas', amount: 25000 },
        { serviceNames: 'Cejas', amount: 30000 },
      ]);

      const result = await service.getServicePopularity(TENANT_ID);

      expect(result[0].totalRevenue).toBe(55000);
    });

    it('returns empty array when no incomes exist', async () => {
      mockPrisma.income.findMany.mockResolvedValue([]);

      const result = await service.getServicePopularity(TENANT_ID);

      expect(result).toEqual([]);
    });
  });

  // ── SEGMENT_THRESHOLDS constant ────────────────────────────────────────────

  describe('SEGMENT_THRESHOLDS', () => {
    it('exports thresholds as named constants', () => {
      expect(SEGMENT_THRESHOLDS.NEW_CLIENT_DAYS).toBe(30);
      expect(SEGMENT_THRESHOLDS.VIP_MIN_VISITS).toBe(3);
      expect(SEGMENT_THRESHOLDS.ACTIVE_PERIOD_DAYS).toBe(90);
      expect(SEGMENT_THRESHOLDS.AT_RISK_MIN_DAYS).toBe(60);
      expect(SEGMENT_THRESHOLDS.AT_RISK_MAX_DAYS).toBe(120);
      expect(SEGMENT_THRESHOLDS.DORMANT_MIN_DAYS).toBe(120);
    });
  });
});
