// Placeholder secrets so services that build a client in their constructor
// (Stripe, for one) can be instantiated without a real environment.
process.env.STRIPE_SECRET_KEY ??= 'sk_test_placeholder_for_unit_tests';
process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_placeholder_for_unit_tests';
process.env.JWT_SECRET ??= 'unit-test-jwt-secret';
process.env.JWT_REFRESH_SECRET ??= 'unit-test-refresh-secret';
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/unit_tests';
