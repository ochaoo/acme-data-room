import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export class CreateUploadIntentDto {
  @IsUUID()
  dataRoomId!: string;

  @IsOptional()
  @IsUUID()
  folderId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/\.pdf$/i)
  fileName!: string;

  @IsString()
  @IsIn(['application/pdf'])
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_FILE_SIZE_BYTES)
  sizeBytes!: number;
}
