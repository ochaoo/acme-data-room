import { HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { ShareResourceType, ShareRole, ShareType } from '@prisma/client';

import { ApiException } from '../../../common/errors/api-exception';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AuthenticatedUser } from '../../auth/interfaces';
import { AuthService } from '../../auth/services';
import { CreateShareDto } from '../dto';
import { SharingRepository } from '../repositories';
import { AccessControlService } from './access-control.service';

@Injectable()
export class SharingService {
  constructor(
    private readonly sharingRepository: SharingRepository,
    private readonly accessControlService: AccessControlService,
    private readonly authService: AuthService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateShareDto) {
    const dataRoomId = await this.getDataRoomIdForResource(dto.resourceType, dto.resourceId);
    await this.accessControlService.assertOwner(user.id, dataRoomId);

    if (dto.shareType === ShareType.USER) {
      const recipient = await this.authService.findOrProvisionUserByEmail(dto.granteeEmail!.trim());
      if (!recipient) {
        throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.SHARE_RECIPIENT_NOT_FOUND);
      }

      const existingShare = await this.sharingRepository.findActiveMatchingUserShare(
        dataRoomId,
        dto.resourceType,
        dto.resourceId,
        recipient.id,
      );
      if (existingShare) {
        return { share: existingShare, publicToken: null };
      }

      const share = await this.sharingRepository.create({
        dataRoomId,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        shareType: ShareType.USER,
        granteeUserId: recipient.id,
        role: ShareRole.VIEWER,
      });
      return { share, publicToken: null };
    }

    const publicToken = randomBytes(32).toString('base64url');
    const share = await this.sharingRepository.create({
      dataRoomId,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      shareType: ShareType.PUBLIC,
      tokenHash: createHash('sha256').update(publicToken).digest('hex'),
      role: ShareRole.VIEWER,
    });

    return { share, publicToken };
  }

  async listForResource(user: AuthenticatedUser, resourceType: ShareResourceType, resourceId: string) {
    const dataRoomId = await this.getDataRoomIdForResource(resourceType, resourceId);
    await this.accessControlService.assertOwner(user.id, dataRoomId);
    return this.sharingRepository.listActiveForResource(dataRoomId, resourceType, resourceId);
  }

  listReceived(user: AuthenticatedUser) {
    return this.sharingRepository.listReceivedBy(user.id);
  }

  async revoke(user: AuthenticatedUser, shareId: string) {
    const share = await this.sharingRepository.findById(shareId);
    if (!share || share.revokedAt) {
      throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.SHARE_NOT_FOUND);
    }
    await this.accessControlService.assertOwner(user.id, share.dataRoomId);
    await this.sharingRepository.revoke(share.id);
  }

  async getPublicShare(token: string) {
    const share = await this.accessControlService.getPublicShare(token);
    const resource = await this.getResourceSummary(share.resourceType, share.resourceId);
    return { share: this.publicShareResponse(share), resource };
  }

  private async getDataRoomIdForResource(resourceType: ShareResourceType, resourceId: string): Promise<string> {
    if (resourceType === ShareResourceType.DATA_ROOM) {
      const dataRoom = await this.sharingRepository.findDataRoomById(resourceId);
      if (!dataRoom) {
        throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.DATA_ROOM_NOT_FOUND);
      }
      return dataRoom.id;
    }
    if (resourceType === ShareResourceType.FOLDER) {
      const folder = await this.sharingRepository.findFolderById(resourceId);
      if (!folder) {
        throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.FOLDER_NOT_FOUND);
      }
      return folder.dataRoomId;
    }

    const file = await this.sharingRepository.findFileById(resourceId);
    if (!file) {
      throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.FILE_NOT_FOUND);
    }
    return file.dataRoomId;
  }

  private async getResourceSummary(resourceType: ShareResourceType, resourceId: string) {
    if (resourceType === ShareResourceType.DATA_ROOM) {
      const dataRoom = await this.sharingRepository.findDataRoomById(resourceId);
      if (!dataRoom) throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.DATA_ROOM_NOT_FOUND);
      return { id: dataRoom.id, name: dataRoom.name, type: resourceType, dataRoomId: dataRoom.id };
    }
    if (resourceType === ShareResourceType.FOLDER) {
      const folder = await this.sharingRepository.findFolderById(resourceId);
      if (!folder) throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.FOLDER_NOT_FOUND);
      return { id: folder.id, name: folder.name, type: resourceType, dataRoomId: folder.dataRoomId };
    }

    const file = await this.sharingRepository.findFileById(resourceId);
    if (!file) throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.FILE_NOT_FOUND);
    return { id: file.id, name: file.name, type: resourceType, dataRoomId: file.dataRoomId };
  }

  private publicShareResponse(share: { id: string; resourceType: ShareResourceType; resourceId: string; dataRoomId: string }) {
    return {
      id: share.id,
      resourceType: share.resourceType,
      resourceId: share.resourceId,
      dataRoomId: share.dataRoomId,
    };
  }
}
