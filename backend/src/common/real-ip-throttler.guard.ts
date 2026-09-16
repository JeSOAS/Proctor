import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limit by the REAL client IP. Behind the Cloudflare tunnel every request
 * reaches the backend from the tunnel itself, so without this the limiter would
 * treat all students as one client and throttle the whole class. Cloudflare puts
 * the real client in `CF-Connecting-IP`; we fall back to X-Forwarded-For, then
 * the socket address.
 */
@Injectable()
export class RealIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const cf = req.headers?.['cf-connecting-ip'];
    const xff = req.headers?.['x-forwarded-for'];
    return (
      (Array.isArray(cf) ? cf[0] : cf) ||
      (typeof xff === 'string' ? xff.split(',')[0].trim() : undefined) ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown'
    );
  }
}
