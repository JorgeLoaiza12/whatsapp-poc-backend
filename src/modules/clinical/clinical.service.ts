import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpsertProfileDto } from './dto/upsert-profile.dto';
import { CreateEntryDto } from './dto/create-entry.dto';

@Injectable()
export class ClinicalService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(tenantId: string, contactId: string) {
    await this.assertContact(tenantId, contactId);
    const profile = await this.prisma.clinicalProfile.findUnique({
      where: { contactId },
      include: { entries: { orderBy: { date: 'desc' } } },
    });
    return profile ?? { contactId, allergies: null, skinType: null, conditions: null, medications: null, notes: null, entries: [] };
  }

  async upsertProfile(tenantId: string, contactId: string, dto: UpsertProfileDto) {
    await this.assertContact(tenantId, contactId);
    return this.prisma.clinicalProfile.upsert({
      where: { contactId },
      create: { tenantId, contactId, ...dto },
      update: { ...dto },
    });
  }

  async addEntry(tenantId: string, contactId: string, dto: CreateEntryDto) {
    const profile = await this.ensureProfile(tenantId, contactId);
    return this.prisma.clinicalEntry.create({
      data: {
        tenantId,
        profileId: profile.id,
        treatment: dto.treatment,
        products: dto.products,
        technique: dto.technique,
        observations: dto.observations,
        nextVisitNotes: dto.nextVisitNotes,
        date: dto.date ? new Date(dto.date) : new Date(),
      },
    });
  }

  async updateEntry(tenantId: string, entryId: string, dto: Partial<CreateEntryDto>) {
    const entry = await this.prisma.clinicalEntry.findFirst({ where: { id: entryId, tenantId } });
    if (!entry) throw new NotFoundException('Entry not found');
    return this.prisma.clinicalEntry.update({
      where: { id: entryId },
      data: {
        ...dto,
        date: dto.date ? new Date(dto.date) : undefined,
      },
    });
  }

  async removeEntry(tenantId: string, entryId: string) {
    const entry = await this.prisma.clinicalEntry.findFirst({ where: { id: entryId, tenantId } });
    if (!entry) throw new NotFoundException('Entry not found');
    await this.prisma.clinicalEntry.delete({ where: { id: entryId } });
    return { ok: true };
  }

  private async assertContact(tenantId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id: contactId, tenantId } });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  private async ensureProfile(tenantId: string, contactId: string) {
    await this.assertContact(tenantId, contactId);
    return this.prisma.clinicalProfile.upsert({
      where: { contactId },
      create: { tenantId, contactId },
      update: {},
    });
  }
}
