import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { SharingModule } from '../sharing/sharing.module';
import { StorageModule } from '../storage/storage.module';
import { FoldersController } from './controllers';
import { FoldersRepository } from './repositories';
import { FoldersService } from './services';

@Module({
  imports: [AuthModule, FilesModule, SharingModule, StorageModule],
  controllers: [FoldersController],
  providers: [FoldersRepository, FoldersService],
  exports: [FoldersRepository, FoldersService],
})
export class FoldersModule {}
