import { HttpStatus, Injectable } from '@nestjs/common';
import { DataRoom, File, Folder, Share, ShareResourceType } from '@prisma/client';

import { ApiException } from '../../../common/errors/api-exception';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AccessScope } from '../interfaces';
import { SharingRepository } from '../repositories';

@Injectable()
export class AccessControlService {
  constructor(private readonly sharingRepository: SharingRepository) {}

  async assertOwner(userId: string, dataRoomId: string): Promise<DataRoom> {
    const dataRoom = await this.sharingRepository.findDataRoomById(dataRoomId);

    if (!dataRoom) {
      throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.DATA_ROOM_NOT_FOUND);
    }

    if (dataRoom.ownerId !== userId) {
      throw new ApiException(HttpStatus.FORBIDDEN, ERROR_CODE.ACCESS_DENIED);
    }

    return dataRoom;
  }

  async assertCanViewDataRoom(userId: string, dataRoom: DataRoom): Promise<void> {
    if (dataRoom.ownerId === userId) {
      return;
    }

    const shares = await this.sharingRepository.findActiveUserShares(userId, dataRoom.id, [], []);
    if (!shares.some((share) => share.resourceType === ShareResourceType.DATA_ROOM)) {
      throw new ApiException(HttpStatus.FORBIDDEN, ERROR_CODE.ACCESS_DENIED);
    }
  }

  async assertCanViewFolder(userId: string, folder: Folder): Promise<AccessScope> {
    const dataRoom = await this.sharingRepository.findDataRoomById(folder.dataRoomId);
    if (!dataRoom) {
      throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.DATA_ROOM_NOT_FOUND);
    }

    if (dataRoom.ownerId === userId) {
      return { resourceType: ShareResourceType.DATA_ROOM, resourceId: dataRoom.id };
    }

    const ancestry = await this.sharingRepository.findFolderAncestry(folder.id);
    const shares = await this.sharingRepository.findActiveUserShares(
      userId,
      folder.dataRoomId,
      ancestry.map((item) => item.id),
      [ShareResourceType.FOLDER],
    );
    const folderShare = ancestry.find((ancestor) =>
      shares.some(
        (share) => share.resourceType === ShareResourceType.FOLDER && share.resourceId === ancestor.id,
      ),
    );

    if (folderShare) {
      return { resourceType: ShareResourceType.FOLDER, resourceId: folderShare.id };
    }

    if (shares.some((share) => share.resourceType === ShareResourceType.DATA_ROOM)) {
      return { resourceType: ShareResourceType.DATA_ROOM, resourceId: dataRoom.id };
    }

    throw new ApiException(HttpStatus.FORBIDDEN, ERROR_CODE.ACCESS_DENIED);
  }

  async assertCanViewFile(userId: string, file: File): Promise<AccessScope> {
    const dataRoom = await this.sharingRepository.findDataRoomById(file.dataRoomId);
    if (!dataRoom) {
      throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.DATA_ROOM_NOT_FOUND);
    }

    if (dataRoom.ownerId === userId) {
      return { resourceType: ShareResourceType.DATA_ROOM, resourceId: dataRoom.id };
    }

    const ancestry = file.folderId ? await this.sharingRepository.findFolderAncestry(file.folderId) : [];
    const shares = await this.sharingRepository.findActiveUserShares(
      userId,
      file.dataRoomId,
      [file.id, ...ancestry.map((item) => item.id)],
      [ShareResourceType.FILE, ShareResourceType.FOLDER],
    );
    const directShare = shares.find(
      (share) => share.resourceType === ShareResourceType.FILE && share.resourceId === file.id,
    );
    if (directShare) {
      return { resourceType: ShareResourceType.FILE, resourceId: file.id };
    }
    const folderShare = ancestry.find((ancestor) =>
      shares.some(
        (share) => share.resourceType === ShareResourceType.FOLDER && share.resourceId === ancestor.id,
      ),
    );
    if (folderShare) {
      return { resourceType: ShareResourceType.FOLDER, resourceId: folderShare.id };
    }
    if (shares.some((share) => share.resourceType === ShareResourceType.DATA_ROOM)) {
      return { resourceType: ShareResourceType.DATA_ROOM, resourceId: dataRoom.id };
    }

    throw new ApiException(HttpStatus.FORBIDDEN, ERROR_CODE.ACCESS_DENIED);
  }

  async getPublicShare(token: string): Promise<Share> {
    const tokenHash = await this.hashToken(token);
    const share = await this.sharingRepository.findActivePublicShare(tokenHash);

    if (!share) {
      throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.SHARE_NOT_FOUND);
    }

    return share;
  }

  async assertPublicCanViewFolder(share: Share, folder: Folder): Promise<void> {
    if (share.dataRoomId !== folder.dataRoomId) {
      throw new ApiException(HttpStatus.FORBIDDEN, ERROR_CODE.ACCESS_DENIED);
    }
    if (share.resourceType === ShareResourceType.DATA_ROOM) {
      return;
    }
    if (share.resourceType === ShareResourceType.FOLDER) {
      const ancestry = await this.sharingRepository.findFolderAncestry(folder.id);
      if (ancestry.some((item) => item.id === share.resourceId)) {
        return;
      }
    }

    throw new ApiException(HttpStatus.FORBIDDEN, ERROR_CODE.ACCESS_DENIED);
  }

  async assertPublicCanViewFile(share: Share, file: File): Promise<void> {
    if (share.dataRoomId !== file.dataRoomId) {
      throw new ApiException(HttpStatus.FORBIDDEN, ERROR_CODE.ACCESS_DENIED);
    }
    if (share.resourceType === ShareResourceType.DATA_ROOM) {
      return;
    }
    if (share.resourceType === ShareResourceType.FILE && share.resourceId === file.id) {
      return;
    }
    if (share.resourceType === ShareResourceType.FOLDER && file.folderId) {
      const ancestry = await this.sharingRepository.findFolderAncestry(file.folderId);
      if (ancestry.some((item) => item.id === share.resourceId)) {
        return;
      }
    }

    throw new ApiException(HttpStatus.FORBIDDEN, ERROR_CODE.ACCESS_DENIED);
  }

  private async hashToken(token: string): Promise<string> {
    const { createHash } = await import('crypto');
    return createHash('sha256').update(token).digest('hex');
  }
}
