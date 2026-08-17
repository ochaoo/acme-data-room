import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

import { ApiException } from '../../../common/errors/api-exception';
import { ERROR_CODE } from '../../../common/errors/error-code';

@Injectable()
export class StorageService {
  private readonly supabase;
  private readonly bucket: string;
  private readonly signedUrlTtlSeconds: number;

  constructor(configService: ConfigService) {
    this.supabase = createClient(
      configService.getOrThrow<string>('SUPABASE_URL'),
      configService.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
    this.bucket = configService.getOrThrow<string>('SUPABASE_STORAGE_BUCKET');
    this.signedUrlTtlSeconds = Number(configService.get<number>('SIGNED_URL_TTL_SECONDS') ?? 300);
  }

  createStorageKey(dataRoomId: string): string {
    return `rooms/${dataRoomId}/files/${randomUUID()}.pdf`;
  }

  async createSignedUploadUrl(storageKey: string): Promise<{ signedUrl: string; token: string }> {
    const { data, error } = await this.supabase.storage.from(this.bucket).createSignedUploadUrl(storageKey);

    if (error || !data) {
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ERROR_CODE.STORAGE_ERROR);
    }

    return data;
  }

  async createSignedDownloadUrl(storageKey: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(storageKey, this.signedUrlTtlSeconds);

    if (error || !data?.signedUrl) {
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ERROR_CODE.STORAGE_ERROR);
    }

    return data.signedUrl;
  }

  async objectExists(storageKey: string): Promise<boolean> {
    const separatorIndex = storageKey.lastIndexOf('/');
    const folderPath = storageKey.slice(0, separatorIndex);
    const fileName = storageKey.slice(separatorIndex + 1);
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .list(folderPath, { limit: 1, search: fileName });

    if (error) {
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ERROR_CODE.STORAGE_ERROR);
    }

    return data.some((item) => item.name === fileName);
  }

  async removeFiles(storageKeys: string[]): Promise<void> {
    if (!storageKeys.length) {
      return;
    }

    const { error } = await this.supabase.storage.from(this.bucket).remove(storageKeys);

    if (error) {
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ERROR_CODE.STORAGE_ERROR);
    }
  }
}
