import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class FilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    dataRoomId: string;
    folderId: string | null;
    folderScope: string;
    name: string;
    normalizedName: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: bigint;
  }) {
    return this.prisma.file.create({ data });
  }

  findById(id: string) {
    return this.prisma.file.findUnique({
      where: { id },
      include: { _count: { select: { versions: true } } },
    });
  }

  findByFolderIds(folderIds: string[]) {
    return this.prisma.file.findMany({ where: { folderId: { in: folderIds } } });
  }

  findNameInLocation(dataRoomId: string, folderScope: string, normalizedName: string, excludeFileId?: string) {
    return this.prisma.file.findFirst({
      where: {
        dataRoomId,
        folderScope,
        normalizedName,
        ...(excludeFileId ? { id: { not: excludeFileId } } : {}),
      },
    });
  }

  findVersions(fileId: string) {
    return this.prisma.fileVersion.findMany({
      where: { fileId },
      orderBy: { versionNumber: 'desc' },
    });
  }

  findVersionsForFiles(fileIds: string[]) {
    if (!fileIds.length) {
      return Promise.resolve([]);
    }
    return this.prisma.fileVersion.findMany({ where: { fileId: { in: fileIds } } });
  }

  findVersionById(fileId: string, versionId: string) {
    return this.prisma.fileVersion.findFirst({ where: { id: versionId, fileId } });
  }

  async createWithInitialVersion(data: {
    dataRoomId: string;
    folderId: string | null;
    folderScope: string;
    name: string;
    normalizedName: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: bigint;
  }) {
    return this.prisma.$transaction(async (transaction) => {
      const file = await transaction.file.create({ data });
      await transaction.fileVersion.create({
        data: {
          fileId: file.id,
          versionNumber: 1,
          storageKey: data.storageKey,
          mimeType: data.mimeType,
          sizeBytes: data.sizeBytes,
        },
      });
      return transaction.file.findUniqueOrThrow({
        where: { id: file.id },
        include: { _count: { select: { versions: true } } },
      });
    });
  }

  async appendVersion(
    file: { id: string; storageKey: string; mimeType: string; sizeBytes: bigint },
    data: { storageKey: string; mimeType: string; sizeBytes: bigint },
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const latest = await transaction.fileVersion.findFirst({
        where: { fileId: file.id },
        orderBy: { versionNumber: 'desc' },
      });
      const versionNumber = (latest?.versionNumber ?? 1) + 1;
      await transaction.fileVersion.create({
        data: {
          fileId: file.id,
          versionNumber,
          storageKey: data.storageKey,
          mimeType: data.mimeType,
          sizeBytes: data.sizeBytes,
        },
      });
      return transaction.file.update({
        where: { id: file.id },
        data,
        include: { _count: { select: { versions: true } } },
      });
    });
  }

  updateName(id: string, name: string, normalizedName: string) {
    return this.prisma.file.update({ where: { id }, data: { name, normalizedName } });
  }

  move(id: string, folderId: string | null, folderScope: string, name: string, normalizedName: string) {
    return this.prisma.file.update({
      where: { id },
      data: { folderId, folderScope, name, normalizedName },
    });
  }

  delete(id: string) {
    return this.prisma.file.delete({ where: { id } });
  }

  async listForLocation(
    dataRoomId: string,
    folderId: string | null,
    cursor: string | undefined,
    limit: number,
  ) {
    const items = await this.prisma.file.findMany({
      where: { dataRoomId, folderId },
      include: { _count: { select: { versions: true } } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return {
      items: page,
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    };
  }

  async searchByName(dataRoomId: string, query: string, cursor: string | undefined, limit: number) {
    const items = await this.prisma.file.findMany({
      where: {
        dataRoomId,
        normalizedName: { contains: query.toLocaleLowerCase() },
      },
      include: {
        folder: { select: { id: true, name: true } },
        _count: { select: { versions: true } },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return {
      items: page,
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    };
  }
}
