import { Module } from '@nestjs/common';
import { AddressesController } from '@/modules/addresses/addresses.controller';
import { AddressesService } from '@/modules/addresses/addresses.service';

@Module({
  controllers: [AddressesController],
  providers: [AddressesService],
  exports: [AddressesService],
})
export class AddressesModule {}
