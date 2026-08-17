import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateFolderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}
