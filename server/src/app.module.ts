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
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
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
import { AuditInterceptor } from '@/common/interceptors/audit.interceptor';
import { SeoModule } from '@/modules/seo/seo.module';
import { UploadsModule } from '@/modules/uploads/uploads.module';

// Wires every feature module, global config, throttling and the schedule runner.
@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    PrismaModule,
    MailModule,
    PricingModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CategoryModule,
    ProductsModule,
    OrdersModule,
    CartModule,
    PaymentsModule,
    ContactsModule,
    ReviewsModule,
    WishlistModule,
    DashboardModule,
    AddressesModule,
    CouponsModule,
    UploadsModule,
    SeoModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      // Global, so a new admin route is audited the day it ships rather than
      // the day someone remembers to add a log call to its service.
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
