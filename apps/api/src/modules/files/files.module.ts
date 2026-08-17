import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SharingModule } from '../sharing/sharing.module';
import { StorageModule } from '../storage/storage.module';
import { FilesController } from './controllers';
import { FilesRepository } from './repositories';
import { FileNamingService, FilesService } from './services';

@Module({
  imports: [AuthModule, SharingModule, StorageModule],
  controllers: [FilesController],
  providers: [FilesRepository, FileNamingService, FilesService],
  exports: [FilesRepository, FilesService],
})
export class FilesModule {}
