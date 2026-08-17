import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class MoveFileDto {
  @ValidateIf((value: MoveFileDto) => value.folderId !== null)
  @IsOptional()
  @IsUUID()
  folderId!: string | null;
}
