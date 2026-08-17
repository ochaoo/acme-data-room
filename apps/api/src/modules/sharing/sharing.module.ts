import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SharingController } from './controllers';
import { SharingRepository } from './repositories';
import { AccessControlService, SharingService } from './services';

@Module({
  imports: [AuthModule],
  controllers: [SharingController],
  providers: [SharingRepository, AccessControlService, SharingService],
  exports: [SharingRepository, AccessControlService, SharingService],
})
export class SharingModule {}
