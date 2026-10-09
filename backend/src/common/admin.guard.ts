import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/// Protects the administrator endpoints: creating teacher accounts
/// (POST /auth/register) and the dev wipe (DELETE /exams). Requires a matching
/// `x-admin-token` header. If ADMIN_TOKEN is not set the guard allows everything
/// (local dev only); in production it MUST be set. Instructor endpoints use the
/// teacher JWT instead, and student endpoints are open.
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
