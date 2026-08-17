import { Injectable } from '@nestjs/common';

import { FilesRepository } from '../repositories';

@Injectable()
export class FileNamingService {
  constructor(private readonly filesRepository: FilesRepository) {}

  async resolveAvailableName(
    dataRoomId: string,
    folderScope: string,
    requestedName: string,
    excludeFileId?: string,
  ): Promise<string> {
    const cleanedName = requestedName.trim();
    const { baseName, extension } = this.splitFileName(cleanedName);
    let candidate = cleanedName;
    let duplicateNumber = 1;

    while (
      await this.filesRepository.findNameInLocation(
        dataRoomId,
        folderScope,
        this.normalizeName(candidate),
        excludeFileId,
      )
    ) {
      candidate = `${baseName} (${duplicateNumber})${extension}`;
      duplicateNumber += 1;
    }

    return candidate;
  }

  normalizeName(name: string): string {
    return name.trim().toLocaleLowerCase();
  }

  private splitFileName(name: string): { baseName: string; extension: string } {
    const extensionIndex = name.lastIndexOf('.');
    if (extensionIndex <= 0 || extensionIndex === name.length - 1) {
      return { baseName: name, extension: '' };
    }

    return {
      baseName: name.slice(0, extensionIndex),
      extension: name.slice(extensionIndex),
    };
  }
}
