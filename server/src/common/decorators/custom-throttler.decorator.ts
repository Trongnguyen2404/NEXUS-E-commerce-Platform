import { Throttle } from '@nestjs/throttler';

const ONE_MINUTE = 60_000;

// Tightest rate limit, for login and other credential endpoints.
export const StrictThrottle = () =>
  Throttle({
    default: {
      ttl: ONE_MINUTE,
      limit: 5,
    },
  });

// Middle rate limit, for writes that are cheap to replay.
export const ModerateThrottle = () =>
  Throttle({
    default: {
      ttl: ONE_MINUTE,
      limit: 20,
    },
  });

// Loosest rate limit, for ordinary read endpoints.
export const RelaxedThrottle = () =>
  Throttle({
    default: {
      ttl: ONE_MINUTE,
      limit: 60,
    },
  });
