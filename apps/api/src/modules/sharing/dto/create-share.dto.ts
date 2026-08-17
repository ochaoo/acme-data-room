import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsUUID, ValidateIf } from 'class-validator';

import { ShareResourceType, ShareType } from '../enums';

export class CreateShareDto {
  @IsEnum(ShareResourceType)
  resourceType!: ShareResourceType;

  @IsUUID()
  resourceId!: string;

  @IsEnum(ShareType)
  shareType!: ShareType;

  @ValidateIf((value: CreateShareDto) => value.shareType === ShareType.USER)
  @IsEmail()
  @IsNotEmpty()
  granteeEmail?: string;
}
