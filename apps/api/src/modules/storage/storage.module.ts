import { Module } from '@nestjs/common';

import { StorageService } from './services';

@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
