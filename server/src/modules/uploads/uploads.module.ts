import { Module } from '@nestjs/common';
import { StorageModule } from '@/modules/storage/storage.module';
import { UploadsController } from '@/modules/uploads/uploads.controller';

@Module({
  imports: [StorageModule],
  controllers: [UploadsController],
})
export class UploadsModule {}
