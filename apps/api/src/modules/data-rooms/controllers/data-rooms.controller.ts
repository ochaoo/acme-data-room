import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators';
import { SupabaseAuthGuard } from '../../auth/guards';
import { AuthenticatedUser } from '../../auth/interfaces';
import { CreateDataRoomDto, UpdateDataRoomDto } from '../dto';
import { DataRoomsService } from '../services';

@UseGuards(SupabaseAuthGuard)
@Controller('data-rooms')
export class DataRoomsController {
  constructor(private readonly dataRoomsService: DataRoomsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDataRoomDto) {
    return this.dataRoomsService.create(user, dto);
  }

  @Get()
  listOwned(@CurrentUser() user: AuthenticatedUser) {
    return this.dataRoomsService.listOwned(user);
  }

  @Get(':dataRoomId')
  getById(@CurrentUser() user: AuthenticatedUser, @Param('dataRoomId') dataRoomId: string) {
    return this.dataRoomsService.getById(user, dataRoomId);
  }

  @Patch(':dataRoomId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dataRoomId') dataRoomId: string,
    @Body() dto: UpdateDataRoomDto,
  ) {
    return this.dataRoomsService.update(user, dataRoomId, dto);
  }
}
