import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentTeacherData {
  id: string;
  email: string;
  name: string;
}

/// Reads the teacher that JwtAuthGuard attached to the request.
export const CurrentTeacher = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentTeacherData => {
    return ctx.switchToHttp().getRequest().teacher;
  },
);
