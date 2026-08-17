import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class DataRoomsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(ownerId: string, name: string) {
    return this.prisma.dataRoom.create({ data: { ownerId, name } });
  }

  findById(id: string) {
    return this.prisma.dataRoom.findUnique({ where: { id } });
  }

  findOwnedBy(ownerId: string) {
    return this.prisma.dataRoom.findMany({
      where: { ownerId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  updateName(id: string, name: string) {
    return this.prisma.dataRoom.update({ where: { id }, data: { name } });
  }
}
