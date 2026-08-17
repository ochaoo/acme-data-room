import { HttpStatus, Injectable } from '@nestjs/common';
import { File, Prisma } from '@prisma/client';

import { ApiException } from '../../../common/errors/api-exception';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AuthenticatedUser } from '../../auth/interfaces';
import { SharingRepository } from '../../sharing/repositories';
import { AccessControlService } from '../../sharing/services';
import { StorageService } from '../../storage/services';
import {
  CompleteUploadDto,
  CreateUploadIntentDto,
  MoveFileDto,
  RenameFileDto,
  SearchFilesQueryDto,
} from '../dto';
import { FilesRepository } from '../repositories';
import { FileNamingService } from './file-naming.service';

const ROOT_SCOPE = 'root';

@Injectable()
export class FilesService {
  constructor(
    private readonly filesRepository: FilesRepository,
    private readonly fileNamingService: FileNamingService,
    private readonly sharingRepository: SharingRepository,
    private readonly accessControlService: AccessControlService,
    private readonly storageService: StorageService,
  ) {}

  async createUploadIntent(user: AuthenticatedUser, dto: CreateUploadIntentDto) {
    await this.accessControlService.assertOwner(user.id, dto.dataRoomId);
    await this.getTargetFolder(dto.folderId, dto.dataRoomId);

    const storageKey = this.storageService.createStorageKey(dto.dataRoomId);
    const upload = await this.storageService.createSignedUploadUrl(storageKey);
    return { storageKey, ...upload };
  }

  async completeUpload(user: AuthenticatedUser, dto: CompleteUploadDto) {
    await this.accessControlService.assertOwner(user.id, dto.dataRoomId);
    const folder = await this.getTargetFolder(dto.folderId, dto.dataRoomId);

    if (!this.isExpectedStorageKey(dto.dataRoomId, dto.storageKey)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ERROR_CODE.INVALID_UPLOAD);
    }
    if (!(await this.storageService.objectExists(dto.storageKey))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ERROR_CODE.INVALID_UPLOAD);
    }

    const folderScope = folder?.id ?? ROOT_SCOPE;
    const normalizedName = this.fileNamingService.normalizeName(dto.fileName);
    const existingFile = await this.filesRepository.findNameInLocation(
      dto.dataRoomId,
      folderScope,
      normalizedName,
    );

    try {
      const file = existingFile
        ? await this.filesRepository.appendVersion(existingFile, {
            storageKey: dto.storageKey,
            mimeType: dto.mimeType,
            sizeBytes: BigInt(dto.sizeBytes),
          })
        : await this.filesRepository.createWithInitialVersion({
            dataRoomId: dto.dataRoomId,
            folderId: folder?.id ?? null,
            folderScope,
            name: dto.fileName.trim(),
            normalizedName,
            storageKey: dto.storageKey,
            mimeType: dto.mimeType,
            sizeBytes: BigInt(dto.sizeBytes),
          });
      return this.fileResponse(file);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiException(HttpStatus.CONFLICT, ERROR_CODE.NAME_CONFLICT);
      }
      throw error;
    }
  }

  async getById(user: AuthenticatedUser, fileId: string) {
    const file = await this.getFile(fileId);
    await this.accessControlService.assertCanViewFile(user.id, file);
    return this.fileResponse(file);
  }

  async getDownloadUrl(user: AuthenticatedUser, fileId: string) {
    const file = await this.getFile(fileId);
    await this.accessControlService.assertCanViewFile(user.id, file);
    return { signedUrl: await this.storageService.createSignedDownloadUrl(file.storageKey) };
  }

  async getVersions(user: AuthenticatedUser, fileId: string) {
    const file = await this.getFile(fileId);
    await this.accessControlService.assertCanViewFile(user.id, file);
    const versions = await this.filesRepository.findVersions(file.id);
    return versions.map((version) => ({ ...version, sizeBytes: Number(version.sizeBytes) }));
  }

  async getVersionDownloadUrl(user: AuthenticatedUser, fileId: string, versionId: string) {
    const file = await this.getFile(fileId);
    await this.accessControlService.assertCanViewFile(user.id, file);
    const version = await this.filesRepository.findVersionById(file.id, versionId);
    if (!version) {
      throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.FILE_NOT_FOUND);
    }
    return { signedUrl: await this.storageService.createSignedDownloadUrl(version.storageKey) };
  }

  async search(user: AuthenticatedUser, dataRoomId: string, query: SearchFilesQueryDto) {
    const dataRoom = await this.sharingRepository.findDataRoomById(dataRoomId);
    if (!dataRoom) {
      throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.DATA_ROOM_NOT_FOUND);
    }
    await this.accessControlService.assertCanViewDataRoom(user.id, dataRoom);
    const page = await this.filesRepository.searchByName(
      dataRoomId,
      query.query.trim(),
      query.cursor,
      query.limit,
    );
    return {
      files: page.items.map((file) => this.fileResponse(file)),
      nextCursor: page.nextCursor,
    };
  }

  async rename(user: AuthenticatedUser, fileId: string, dto: RenameFileDto) {
    const file = await this.getFile(fileId);
    await this.accessControlService.assertOwner(user.id, file.dataRoomId);
    const name = await this.fileNamingService.resolveAvailableName(
      file.dataRoomId,
      file.folderScope,
      dto.name,
      file.id,
    );

    const renamedFile = await this.filesRepository.updateName(
      file.id,
      name,
      this.fileNamingService.normalizeName(name),
    );
    return this.fileResponse(renamedFile);
  }

  async move(user: AuthenticatedUser, fileId: string, dto: MoveFileDto) {
    const file = await this.getFile(fileId);
    await this.accessControlService.assertOwner(user.id, file.dataRoomId);
    const targetFolder = await this.getTargetFolder(dto.folderId, file.dataRoomId);
    const folderScope = targetFolder?.id ?? ROOT_SCOPE;
    const name = await this.fileNamingService.resolveAvailableName(
      file.dataRoomId,
      folderScope,
      file.name,
      file.id,
    );

    const movedFile = await this.filesRepository.move(
      file.id,
      targetFolder?.id ?? null,
      folderScope,
      name,
      this.fileNamingService.normalizeName(name),
    );
    return this.fileResponse(movedFile);
  }

  async delete(user: AuthenticatedUser, fileId: string) {
    const file = await this.getFile(fileId);
    await this.accessControlService.assertOwner(user.id, file.dataRoomId);
    const versions = await this.filesRepository.findVersions(file.id);
    await this.storageService.removeFiles([...new Set([file.storageKey, ...versions.map((version) => version.storageKey)])]);
    await this.sharingRepository.deleteForFile(file.id);
    await this.filesRepository.delete(file.id);
  }

  async getPublicDownloadUrl(token: string, fileId: string) {
    const share = await this.accessControlService.getPublicShare(token);
    const file = await this.getFile(fileId);
    await this.accessControlService.assertPublicCanViewFile(share, file);
    return { signedUrl: await this.storageService.createSignedDownloadUrl(file.storageKey) };
  }

  private async getTargetFolder(folderId: string | null | undefined, dataRoomId: string) {
    if (!folderId) {
      return null;
    }

    const folder = await this.sharingRepository.findFolderById(folderId);
    if (!folder || folder.dataRoomId !== dataRoomId) {
      throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.FOLDER_NOT_FOUND);
    }
    return folder;
  }

  private async getFile(fileId: string): Promise<File & { _count?: { versions: number } }> {
    const file = await this.filesRepository.findById(fileId);
    if (!file) {
      throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.FILE_NOT_FOUND);
    }
    return file;
  }

  private isExpectedStorageKey(dataRoomId: string, storageKey: string): boolean {
    return new RegExp(`^rooms/${dataRoomId}/files/[0-9a-f-]{36}\\.pdf$`, 'i').test(storageKey);
  }

  private fileResponse(
    file: File & { _count?: { versions: number }; folder?: { id: string; name: string } | null },
  ) {
    const { _count, ...response } = file;
    return {
      ...response,
      sizeBytes: Number(file.sizeBytes),
      versionCount: _count?.versions ?? 1,
    };
  }
}
