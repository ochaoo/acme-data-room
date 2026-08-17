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
    return this.prisma.file.findUnique({ where: { id } });
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
