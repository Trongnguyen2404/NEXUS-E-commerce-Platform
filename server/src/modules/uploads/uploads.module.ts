import { Module } from '@nestjs/common';
import { StorageModule } from '@/modules/storage/storage.module';
import { UploadsController } from '@/modules/uploads/uploads.controller';

// Image upload feature module.
@Module({
  imports: [StorageModule],
  controllers: [UploadsController],
})
export class UploadsModule {}
