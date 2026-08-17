import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators';
import { SupabaseAuthGuard } from '../../auth/guards';
import { AuthenticatedUser } from '../../auth/interfaces';
import { CompleteUploadDto, CreateUploadIntentDto, MoveFileDto, RenameFileDto, SearchFilesQueryDto } from '../dto';
import { FilesService } from '../services';

@Controller()
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @UseGuards(SupabaseAuthGuard)
  @Post('files/upload-intents')
  createUploadIntent(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUploadIntentDto) {
    return this.filesService.createUploadIntent(user, dto);
  }

  @UseGuards(SupabaseAuthGuard)
  @Post('files/complete')
  completeUpload(@CurrentUser() user: AuthenticatedUser, @Body() dto: CompleteUploadDto) {
    return this.filesService.completeUpload(user, dto);
  }

  @UseGuards(SupabaseAuthGuard)
  @Get('data-rooms/:dataRoomId/files/search')
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dataRoomId') dataRoomId: string,
    @Query() query: SearchFilesQueryDto,
  ) {
    return this.filesService.search(user, dataRoomId, query);
  }

  @UseGuards(SupabaseAuthGuard)
  @Get('files/:fileId')
  getById(@CurrentUser() user: AuthenticatedUser, @Param('fileId') fileId: string) {
    return this.filesService.getById(user, fileId);
  }

  @UseGuards(SupabaseAuthGuard)
  @Get('files/:fileId/versions')
  getVersions(@CurrentUser() user: AuthenticatedUser, @Param('fileId') fileId: string) {
    return this.filesService.getVersions(user, fileId);
  }

  @UseGuards(SupabaseAuthGuard)
  @Get('files/:fileId/versions/:versionId/download')
  getVersionDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('fileId') fileId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.filesService.getVersionDownloadUrl(user, fileId, versionId);
  }

  @UseGuards(SupabaseAuthGuard)
  @Get('files/:fileId/download')
  getDownloadUrl(@CurrentUser() user: AuthenticatedUser, @Param('fileId') fileId: string) {
    return this.filesService.getDownloadUrl(user, fileId);
  }

  @UseGuards(SupabaseAuthGuard)
  @Patch('files/:fileId')
  rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('fileId') fileId: string,
    @Body() dto: RenameFileDto,
  ) {
    return this.filesService.rename(user, fileId, dto);
  }

  @UseGuards(SupabaseAuthGuard)
  @Post('files/:fileId/move')
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('fileId') fileId: string,
    @Body() dto: MoveFileDto,
  ) {
    return this.filesService.move(user, fileId, dto);
  }

  @UseGuards(SupabaseAuthGuard)
  @Delete('files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('fileId') fileId: string) {
    await this.filesService.delete(user, fileId);
  }

  @Get('public-shares/:token/files/:fileId/download')
  getPublicDownloadUrl(@Param('token') token: string, @Param('fileId') fileId: string) {
    return this.filesService.getPublicDownloadUrl(token, fileId);
  }
}
