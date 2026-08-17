import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateDataRoomDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}
