import { Module } from '@nestjs/common';
import { StorageService } from '@/modules/storage/storage.service';

@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
