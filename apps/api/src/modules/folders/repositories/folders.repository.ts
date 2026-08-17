import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';

interface FolderIdRow {
  id: string;
}

@Injectable()
export class FoldersRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    dataRoomId: string;
    parentId: string | null;
    parentScope: string;
    name: string;
    normalizedName: string;
  }) {
    return this.prisma.folder.create({ data });
  }

  findById(id: string) {
    return this.prisma.folder.findUnique({ where: { id } });
  }

  update(id: string, data: { name: string; normalizedName: string }) {
    return this.prisma.folder.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.folder.delete({ where: { id } });
  }

  async findDescendantIds(folderId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<FolderIdRow[]>(Prisma.sql`
      WITH RECURSIVE folder_tree AS (
        SELECT id FROM folders WHERE id = ${folderId}::uuid
        UNION ALL
        SELECT child.id
        FROM folders child
        INNER JOIN folder_tree tree ON child."parentId" = tree.id
      )
      SELECT id FROM folder_tree
    `);

    return rows.map((row) => row.id);
  }

  async listChildren(
    dataRoomId: string,
    parentId: string | null,
    cursor: string | undefined,
    limit: number,
  ) {
    const where = { dataRoomId, parentId };
    const items = await this.prisma.folder.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    return this.toPage(items, limit);
  }

  private toPage<T extends { id: string }>(items: T[], limit: number) {
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return {
      items: page,
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    };
  }
}
