import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, ShareResourceType } from '@prisma/client';

import { ApiException } from '../../../common/errors/api-exception';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AuthenticatedUser } from '../../auth/interfaces';
import { FilesRepository } from '../../files/repositories';
import { AccessScope } from '../../sharing/interfaces';
import { SharingRepository } from '../../sharing/repositories';
import { AccessControlService } from '../../sharing/services';
import { StorageService } from '../../storage/services';
import { CreateFolderDto, ListContentsQueryDto, UpdateFolderDto } from '../dto';
import { FoldersRepository } from '../repositories';

const ROOT_SCOPE = 'root';

@Injectable()
export class FoldersService {
  constructor(
    private readonly foldersRepository: FoldersRepository,
    private readonly filesRepository: FilesRepository,
    private readonly sharingRepository: SharingRepository,
    private readonly accessControlService: AccessControlService,
    private readonly storageService: StorageService,
  ) {}

  async create(user: AuthenticatedUser, dataRoomId: string, dto: CreateFolderDto) {
    await this.accessControlService.assertOwner(user.id, dataRoomId);
    const parent = dto.parentId ? await this.getFolderInDataRoom(dto.parentId, dataRoomId) : null;
    const name = this.cleanName(dto.name);

    try {
      return await this.foldersRepository.create({
        dataRoomId,
        parentId: parent?.id ?? null,
        parentScope: parent?.id ?? ROOT_SCOPE,
        name,
        normalizedName: this.normalizeName(name),
      });
    } catch (error) {
      this.throwNameConflict(error);
    }
  }

  async update(user: AuthenticatedUser, folderId: string, dto: UpdateFolderDto) {
    const folder = await this.getFolder(folderId);
    await this.accessControlService.assertOwner(user.id, folder.dataRoomId);
    const name = this.cleanName(dto.name);

    try {
      return await this.foldersRepository.update(folder.id, {
        name,
        normalizedName: this.normalizeName(name),
      });
    } catch (error) {
      this.throwNameConflict(error);
    }
  }

  async getContents(user: AuthenticatedUser, folderId: string, query: ListContentsQueryDto) {
    const folder = await this.getFolder(folderId);
    const scope = await this.accessControlService.assertCanViewFolder(user.id, folder);
    return this.getFolderContents(folder, scope, query);
  }

  async getDataRoomContents(user: AuthenticatedUser, dataRoomId: string, query: ListContentsQueryDto) {
    const dataRoom = await this.sharingRepository.findDataRoomById(dataRoomId);
    if (!dataRoom) {
      throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.DATA_ROOM_NOT_FOUND);
    }
    await this.accessControlService.assertCanViewDataRoom(user.id, dataRoom);
    return this.getContentsForLocation(dataRoomId, null, query, [this.dataRoomBreadcrumb(dataRoom)]);
  }

  async getDeletionSummary(user: AuthenticatedUser, folderId: string) {
    const folder = await this.getFolder(folderId);
    await this.accessControlService.assertOwner(user.id, folder.dataRoomId);
    const descendantIds = await this.foldersRepository.findDescendantIds(folder.id);
    const files = await this.filesRepository.findByFolderIds(descendantIds);

    return {
      folderCount: descendantIds.length,
      fileCount: files.length,
      sizeBytes: files.reduce((total, file) => total + file.sizeBytes, BigInt(0)).toString(),
    };
  }

  async delete(user: AuthenticatedUser, folderId: string) {
    const folder = await this.getFolder(folderId);
    await this.accessControlService.assertOwner(user.id, folder.dataRoomId);
    const descendantIds = await this.foldersRepository.findDescendantIds(folder.id);
    const files = await this.filesRepository.findByFolderIds(descendantIds);
    const versions = await this.filesRepository.findVersionsForFiles(files.map((file) => file.id));

    await this.storageService.removeFiles([
      ...new Set([...files.map((file) => file.storageKey), ...versions.map((version) => version.storageKey)]),
    ]);
    await this.sharingRepository.deleteForResources(descendantIds, files.map((file) => file.id));
    await this.foldersRepository.delete(folder.id);
  }

  async getPublicContents(token: string, query: ListContentsQueryDto) {
    const share = await this.accessControlService.getPublicShare(token);
    if (share.resourceType === ShareResourceType.DATA_ROOM) {
      const dataRoom = await this.sharingRepository.findDataRoomById(share.dataRoomId);
      if (!dataRoom) throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.DATA_ROOM_NOT_FOUND);
      return this.getContentsForLocation(dataRoom.id, null, query, [this.dataRoomBreadcrumb(dataRoom)]);
    }
    if (share.resourceType === ShareResourceType.FOLDER) {
      const folder = await this.getFolder(share.resourceId);
      await this.accessControlService.assertPublicCanViewFolder(share, folder);
      return this.getFolderContents(
        folder,
        { resourceType: ShareResourceType.FOLDER, resourceId: folder.id },
        query,
      );
    }

    throw new ApiException(HttpStatus.FORBIDDEN, ERROR_CODE.ACCESS_DENIED);
  }

  async getPublicFolderContents(token: string, folderId: string, query: ListContentsQueryDto) {
    const share = await this.accessControlService.getPublicShare(token);
    const folder = await this.getFolder(folderId);
    await this.accessControlService.assertPublicCanViewFolder(share, folder);

    const scope =
      share.resourceType === ShareResourceType.DATA_ROOM
        ? { resourceType: ShareResourceType.DATA_ROOM, resourceId: share.dataRoomId }
        : { resourceType: ShareResourceType.FOLDER, resourceId: share.resourceId };
    return this.getFolderContents(folder, scope, query);
  }

  private async getFolderContents(folder: { id: string; dataRoomId: string }, scope: AccessScope, query: ListContentsQueryDto) {
    const breadcrumbs = await this.buildBreadcrumbs(folder.id, folder.dataRoomId, scope);
    return this.getContentsForLocation(folder.dataRoomId, folder.id, query, breadcrumbs);
  }

  private async getContentsForLocation(
    dataRoomId: string,
    folderId: string | null,
    query: ListContentsQueryDto,
    breadcrumbs: Array<{ id: string; name: string; type: 'DATA_ROOM' | 'FOLDER' }>,
  ) {
    const [folderPage, filePage] = await Promise.all([
      this.foldersRepository.listChildren(dataRoomId, folderId, query.folderCursor, query.limit),
      this.filesRepository.listForLocation(dataRoomId, folderId, query.fileCursor, query.limit),
    ]);

    const statsByFolder = await this.foldersRepository.findSubtreeStats(folderPage.items.map((folder) => folder.id));

    return {
      breadcrumbs,
      folders: folderPage.items.map((folder) => {
        const stats = statsByFolder.get(folder.id) ?? { fileCount: 0, sizeBytes: 0 };
        return { ...folder, ...stats };
      }),
      files: filePage.items.map((file) => ({ ...file, sizeBytes: Number(file.sizeBytes) })),
      nextFolderCursor: folderPage.nextCursor,
      nextFileCursor: filePage.nextCursor,
    };
  }

  private async buildBreadcrumbs(folderId: string, dataRoomId: string, scope: AccessScope) {
    const ancestry = await this.sharingRepository.findFolderAncestry(folderId);
    const visibleAncestry =
      scope.resourceType === ShareResourceType.FOLDER
        ? ancestry.slice(0, ancestry.findIndex((folder) => folder.id === scope.resourceId) + 1)
        : ancestry;
    const folderCrumbs = visibleAncestry
      .reverse()
      .map((folder) => ({ id: folder.id, name: folder.name, type: 'FOLDER' as const }));

    if (scope.resourceType === ShareResourceType.DATA_ROOM) {
      const dataRoom = await this.sharingRepository.findDataRoomById(dataRoomId);
      if (!dataRoom) throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.DATA_ROOM_NOT_FOUND);
      return [this.dataRoomBreadcrumb(dataRoom), ...folderCrumbs];
    }

    return folderCrumbs;
  }

  private dataRoomBreadcrumb(dataRoom: { id: string; name: string }) {
    return { id: dataRoom.id, name: dataRoom.name, type: 'DATA_ROOM' as const };
  }

  private async getFolder(folderId: string) {
    const folder = await this.foldersRepository.findById(folderId);
    if (!folder) {
      throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.FOLDER_NOT_FOUND);
    }
    return folder;
  }

  private async getFolderInDataRoom(folderId: string, dataRoomId: string) {
    const folder = await this.getFolder(folderId);
    if (folder.dataRoomId !== dataRoomId) {
      throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.FOLDER_NOT_FOUND);
    }
    return folder;
  }

  private cleanName(name: string): string {
    return name.trim();
  }

  private normalizeName(name: string): string {
    return name.trim().toLocaleLowerCase();
  }

  private throwNameConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApiException(HttpStatus.CONFLICT, ERROR_CODE.NAME_CONFLICT);
    }
    throw error;
  }
}
