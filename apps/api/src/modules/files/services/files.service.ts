import { HttpStatus, Injectable } from '@nestjs/common';
import { File, Prisma } from '@prisma/client';

import { ApiException } from '../../../common/errors/api-exception';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AuthenticatedUser } from '../../auth/interfaces';
import { SharingRepository } from '../../sharing/repositories';
import { AccessControlService } from '../../sharing/services';
import { StorageService } from '../../storage/services';
import { CompleteUploadDto, CreateUploadIntentDto, MoveFileDto, RenameFileDto } from '../dto';
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
    const name = await this.fileNamingService.resolveAvailableName(dto.dataRoomId, folderScope, dto.fileName);

    try {
      const file = await this.filesRepository.create({
        dataRoomId: dto.dataRoomId,
        folderId: folder?.id ?? null,
        folderScope,
        name,
        normalizedName: this.fileNamingService.normalizeName(name),
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
    await this.storageService.removeFiles([file.storageKey]);
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

  private async getFile(fileId: string): Promise<File> {
    const file = await this.filesRepository.findById(fileId);
    if (!file) {
      throw new ApiException(HttpStatus.NOT_FOUND, ERROR_CODE.FILE_NOT_FOUND);
    }
    return file;
  }

  private isExpectedStorageKey(dataRoomId: string, storageKey: string): boolean {
    return new RegExp(`^rooms/${dataRoomId}/files/[0-9a-f-]{36}\\.pdf$`, 'i').test(storageKey);
  }

  private fileResponse(file: File) {
    return { ...file, sizeBytes: Number(file.sizeBytes) };
  }
}
