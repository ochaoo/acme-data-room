import { Injectable } from '@nestjs/common';
import { ShareResourceType, ShareRole, ShareType } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class SharingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findDataRoomById(id: string) {
    return this.prisma.dataRoom.findUnique({ where: { id } });
  }

  findFolderById(id: string) {
    return this.prisma.folder.findUnique({ where: { id } });
  }

  findFileById(id: string) {
    return this.prisma.file.findUnique({ where: { id } });
  }

  async findFolderAncestry(folderId: string) {
    const ancestry = [];
    let current = await this.findFolderById(folderId);

    while (current) {
      ancestry.push(current);
      current = current.parentId ? await this.findFolderById(current.parentId) : null;
    }

    return ancestry;
  }

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findActiveUserShares(userId: string, dataRoomId: string, resourceIds: string[], resourceTypes: ShareResourceType[]) {
    return this.prisma.share.findMany({
      where: {
        granteeUserId: userId,
        revokedAt: null,
        dataRoomId,
        OR: [
          { resourceType: ShareResourceType.DATA_ROOM, resourceId: dataRoomId },
          {
            resourceType: { in: resourceTypes },
            resourceId: { in: resourceIds },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  findActivePublicShare(tokenHash: string) {
    return this.prisma.share.findFirst({
      where: {
        tokenHash,
        shareType: ShareType.PUBLIC,
        revokedAt: null,
      },
    });
  }

  findActiveMatchingUserShare(dataRoomId: string, resourceType: ShareResourceType, resourceId: string, userId: string) {
    return this.prisma.share.findFirst({
      where: {
        dataRoomId,
        resourceType,
        resourceId,
        shareType: ShareType.USER,
        granteeUserId: userId,
        revokedAt: null,
      },
    });
  }

  create(data: {
    dataRoomId: string;
    resourceType: ShareResourceType;
    resourceId: string;
    shareType: ShareType;
    granteeUserId?: string;
    tokenHash?: string;
    role: ShareRole;
  }) {
    return this.prisma.share.create({ data });
  }

  findById(id: string) {
    return this.prisma.share.findUnique({
      where: { id },
      include: { granteeUser: { select: { email: true, displayName: true } } },
    });
  }

  listActiveForResource(dataRoomId: string, resourceType: ShareResourceType, resourceId: string) {
    return this.prisma.share.findMany({
      where: { dataRoomId, resourceType, resourceId, revokedAt: null },
      include: { granteeUser: { select: { email: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  listReceivedBy(userId: string) {
    return this.prisma.share.findMany({
      where: { granteeUserId: userId, revokedAt: null },
      include: { dataRoom: { select: { id: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  revoke(id: string) {
    return this.prisma.share.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  deleteForResources(folderIds: string[], fileIds: string[]) {
    return this.prisma.share.deleteMany({
      where: {
        OR: [
          ...(folderIds.length ? [{ resourceType: ShareResourceType.FOLDER, resourceId: { in: folderIds } }] : []),
          ...(fileIds.length ? [{ resourceType: ShareResourceType.FILE, resourceId: { in: fileIds } }] : []),
        ],
      },
    });
  }

  deleteForFile(fileId: string) {
    return this.prisma.share.deleteMany({
      where: { resourceType: ShareResourceType.FILE, resourceId: fileId },
    });
  }
}
