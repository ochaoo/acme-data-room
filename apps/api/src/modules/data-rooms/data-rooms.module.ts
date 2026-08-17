import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SharingModule } from '../sharing/sharing.module';
import { DataRoomsController } from './controllers';
import { DataRoomsRepository } from './repositories';
import { DataRoomsService } from './services';

@Module({
  imports: [AuthModule, SharingModule],
  controllers: [DataRoomsController],
  providers: [DataRoomsRepository, DataRoomsService],
  exports: [DataRoomsRepository, DataRoomsService],
})
export class DataRoomsModule {}
