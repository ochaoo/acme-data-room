import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './modules/auth/auth.module';
import { DataRoomsModule } from './modules/data-rooms/data-rooms.module';
import { FilesModule } from './modules/files/files.module';
import { FoldersModule } from './modules/folders/folders.module';
import { SharingModule } from './modules/sharing/sharing.module';
import { StorageModule } from './modules/storage/storage.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    StorageModule,
    SharingModule,
    DataRoomsModule,
    FoldersModule,
    FilesModule,
  ],
})
export class AppModule {}
