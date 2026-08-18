import { Module } from '@nestjs/common';
import { StorageService } from '@/modules/storage/storage.service';

// Image storage feature module.
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
