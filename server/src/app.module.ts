import { Module } from '@nestjs/common';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from '@/modules/users/users.module';
import { CategoryModule } from '@/modules/category/category.module';
import { ProductsModule } from '@/modules/products/products.module';
import { OrdersModule } from '@/modules/orders/orders.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CartModule } from '@/modules/cart/cart.module';
import { PaymentsModule } from '@/modules/payments/payments.module';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ContactsModule } from './modules/contacts/contacts.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }), 
    ThrottlerModule.forRoot([
      {
        ttl: 60, // seconds
        limit: 10, // 10 requests per 60 seconds
      },
    ]),
    PrismaModule,  
    AuthModule, UsersModule, CategoryModule, ProductsModule, OrdersModule, CartModule, PaymentsModule, ContactsModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
  {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
