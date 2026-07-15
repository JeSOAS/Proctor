import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/// Protects instructor/destructive endpoints (create exam, list, wipe, status,
/// view sessions). If ADMIN_TOKEN is not set, the guard allows everything —
/// convenient for local dev. In production ADMIN_TOKEN MUST be set, so these
/// endpoints require a matching `x-admin-token` header. Student-facing
/// endpoints (register, heartbeat, violations) are intentionally NOT guarded —
/// the extension calls them without any credential.
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const required = process.env.ADMIN_TOKEN;
    if (!required) return true; // no token configured → open (dev only)

    const req = context.switchToHttp().getRequest();
    const provided = req.headers['x-admin-token'];
    if (provided !== required) {
      throw new UnauthorizedException('Invalid or missing admin token');
    }
    return true;
  }
}
