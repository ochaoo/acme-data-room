import { Module } from '@nestjs/common';

import { SupabaseAuthGuard } from './guards';
import { AuthRepository } from './repositories';
import { AuthService } from './services';

@Module({
  providers: [AuthRepository, AuthService, SupabaseAuthGuard],
  exports: [AuthService, SupabaseAuthGuard],
})
export class AuthModule {}
