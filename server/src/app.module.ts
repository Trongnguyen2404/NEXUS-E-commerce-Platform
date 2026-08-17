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
import { HealthModule } from '@/modules/health/health.module';
import { MailModule } from '@/modules/mail/mail.module';
import { ReviewsModule } from '@/modules/reviews/reviews.module';
import { WishlistModule } from '@/modules/wishlist/wishlist.module';
import { DashboardModule } from '@/modules/dashboard/dashboard.module';
import { PricingModule } from '@/modules/pricing/pricing.module';
import { AddressesModule } from '@/modules/addresses/addresses.module';
import { CouponsModule } from '@/modules/coupons/coupons.module';
import { UploadsModule } from '@/modules/uploads/uploads.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }), 
    ThrottlerModule.forRoot([
      {
        // NOTE: ttl is in MILLISECONDS since @nestjs/throttler v5.
        ttl: 60_000,
        limit: 100, // 100 requests per minute per IP, across all routes
      },
    ]),
    PrismaModule,
    MailModule,
    PricingModule,
    HealthModule,
    AuthModule, UsersModule, CategoryModule, ProductsModule, OrdersModule, CartModule, PaymentsModule, ContactsModule,
    ReviewsModule, WishlistModule, DashboardModule, AddressesModule, CouponsModule,
    UploadsModule
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
