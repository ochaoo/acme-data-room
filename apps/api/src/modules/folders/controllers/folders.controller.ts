import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators';
import { SupabaseAuthGuard } from '../../auth/guards';
import { AuthenticatedUser } from '../../auth/interfaces';
import { CreateFolderDto, ListContentsQueryDto, UpdateFolderDto } from '../dto';
import { FoldersService } from '../services';

@Controller()
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  @UseGuards(SupabaseAuthGuard)
  @Post('data-rooms/:dataRoomId/folders')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dataRoomId') dataRoomId: string,
    @Body() dto: CreateFolderDto,
  ) {
    return this.foldersService.create(user, dataRoomId, dto);
  }

  @UseGuards(SupabaseAuthGuard)
  @Get('data-rooms/:dataRoomId/contents')
  getDataRoomContents(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dataRoomId') dataRoomId: string,
    @Query() query: ListContentsQueryDto,
  ) {
    return this.foldersService.getDataRoomContents(user, dataRoomId, query);
  }

  @UseGuards(SupabaseAuthGuard)
  @Get('folders/:folderId/contents')
  getContents(
    @CurrentUser() user: AuthenticatedUser,
    @Param('folderId') folderId: string,
    @Query() query: ListContentsQueryDto,
  ) {
    return this.foldersService.getContents(user, folderId, query);
  }

  @UseGuards(SupabaseAuthGuard)
  @Get('folders/:folderId/deletion-summary')
  getDeletionSummary(@CurrentUser() user: AuthenticatedUser, @Param('folderId') folderId: string) {
    return this.foldersService.getDeletionSummary(user, folderId);
  }

  @UseGuards(SupabaseAuthGuard)
  @Patch('folders/:folderId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('folderId') folderId: string,
    @Body() dto: UpdateFolderDto,
  ) {
    return this.foldersService.update(user, folderId, dto);
  }

  @UseGuards(SupabaseAuthGuard)
  @Delete('folders/:folderId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('folderId') folderId: string) {
    await this.foldersService.delete(user, folderId);
  }

  @Get('public-shares/:token/contents')
  getPublicContents(@Param('token') token: string, @Query() query: ListContentsQueryDto) {
    return this.foldersService.getPublicContents(token, query);
  }

  @Get('public-shares/:token/folders/:folderId/contents')
  getPublicFolderContents(
    @Param('token') token: string,
    @Param('folderId') folderId: string,
    @Query() query: ListContentsQueryDto,
  ) {
    return this.foldersService.getPublicFolderContents(token, folderId, query);
  }
}
