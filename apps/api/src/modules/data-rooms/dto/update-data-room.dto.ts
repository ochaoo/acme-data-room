import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateDataRoomDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}
