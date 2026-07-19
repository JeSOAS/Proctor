import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from './password.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /// Create a teacher account. Called by an admin (x-admin-token) — there is no
  /// open self-registration.
  async register(input: { email?: string; name?: string; password?: string }) {
    const email = input.email?.trim().toLowerCase();
    const name = input.name?.trim();
    const password = input.password;
    if (!email || !email.includes('@')) {
      throw new BadRequestException('a valid "email" is required');
    }
    if (!name) throw new BadRequestException('"name" is required');
    if (!password || password.length < 8) {
      throw new BadRequestException('"password" must be at least 8 characters');
    }

    const existing = await this.prisma.teacher.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('a teacher with that email already exists');
    }

    const teacher = await this.prisma.teacher.create({
      data: { email, name, passwordHash: hashPassword(password) },
    });
    return { id: teacher.id, email: teacher.email, name: teacher.name };
  }

  /// Verify credentials and return a JWT the dashboard uses for every request.
  async login(input: { email?: string; password?: string }) {
    const email = input.email?.trim().toLowerCase();
    const password = input.password;
    if (!email || !password) {
      throw new BadRequestException('email and password are required');
    }

    const teacher = await this.prisma.teacher.findUnique({ where: { email } });
    if (!teacher || !verifyPassword(password, teacher.passwordHash)) {
      throw new UnauthorizedException('invalid email or password');
    }

    const token = await this.jwt.signAsync({
      sub: teacher.id,
      email: teacher.email,
      name: teacher.name,
    });
    return {
      token,
      teacher: { id: teacher.id, email: teacher.email, name: teacher.name },
    };
  }
}
