import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';

interface FolderIdRow {
  id: string;
}

interface FolderStatsRow {
  folderId: string;
  fileCount: number;
  sizeBytes: string;
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

  async findSubtreeStats(folderIds: string[]): Promise<Map<string, { fileCount: number; sizeBytes: number }>> {
    if (!folderIds.length) {
      return new Map();
    }

    const typedFolderIds = Prisma.join(folderIds.map((folderId) => Prisma.sql`${folderId}::uuid`));
    const rows = await this.prisma.$queryRaw<FolderStatsRow[]>(Prisma.sql`
      WITH RECURSIVE folder_tree AS (
        SELECT id AS root_id, id AS folder_id
        FROM folders
        WHERE id IN (${typedFolderIds})
        UNION ALL
        SELECT tree.root_id, child.id
        FROM folder_tree tree
        INNER JOIN folders child ON child."parentId" = tree.folder_id
      )
      SELECT
        tree.root_id::text AS "folderId",
        COUNT(files.id)::int AS "fileCount",
        COALESCE(SUM(files."sizeBytes"), 0)::text AS "sizeBytes"
      FROM folder_tree tree
      LEFT JOIN files ON files."folderId" = tree.folder_id
      GROUP BY tree.root_id
    `);

    return new Map(rows.map((row) => [row.folderId, { fileCount: Number(row.fileCount), sizeBytes: Number(row.sizeBytes) }]));
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
