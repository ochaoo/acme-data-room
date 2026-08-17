import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseEnumPipe, Post, UseGuards } from '@nestjs/common';
import { ShareResourceType } from '@prisma/client';

import { CurrentUser } from '../../auth/decorators';
import { SupabaseAuthGuard } from '../../auth/guards';
import { AuthenticatedUser } from '../../auth/interfaces';
import { CreateShareDto } from '../dto';
import { SharingService } from '../services';

@Controller()
export class SharingController {
  constructor(private readonly sharingService: SharingService) {}

  @UseGuards(SupabaseAuthGuard)
  @Post('shares')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateShareDto) {
    return this.sharingService.create(user, dto);
  }

  @UseGuards(SupabaseAuthGuard)
  @Get('shares/received')
  listReceived(@CurrentUser() user: AuthenticatedUser) {
    return this.sharingService.listReceived(user);
  }

  @UseGuards(SupabaseAuthGuard)
  @Get('shares/resources/:resourceType/:resourceId')
  listForResource(
    @CurrentUser() user: AuthenticatedUser,
    @Param('resourceType', new ParseEnumPipe(ShareResourceType)) resourceType: ShareResourceType,
    @Param('resourceId') resourceId: string,
  ) {
    return this.sharingService.listForResource(user, resourceType, resourceId);
  }

  @UseGuards(SupabaseAuthGuard)
  @Delete('shares/:shareId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@CurrentUser() user: AuthenticatedUser, @Param('shareId') shareId: string) {
    await this.sharingService.revoke(user, shareId);
  }

  @Get('public-shares/:token')
  getPublicShare(@Param('token') token: string) {
    return this.sharingService.getPublicShare(token);
  }
}
