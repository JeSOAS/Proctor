import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentTeacher, CurrentTeacherData } from '../auth/current-teacher.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CoursesService } from './courses.service';

// All course routes are scoped to the logged-in teacher.
@Controller('courses')
@UseGuards(JwtAuthGuard)
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Post()
  create(@CurrentTeacher() teacher: CurrentTeacherData, @Body() body: any) {
    return this.courses.create(teacher.id, body ?? {});
  }

  @Get()
  list(@CurrentTeacher() teacher: CurrentTeacherData) {
    return this.courses.list(teacher.id);
  }

  @Get(':id')
  get(@CurrentTeacher() teacher: CurrentTeacherData, @Param('id') id: string) {
    return this.courses.get(teacher.id, id);
  }

  @Patch(':id')
  update(
    @CurrentTeacher() teacher: CurrentTeacherData,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.courses.update(teacher.id, id, body ?? {});
  }

  @Delete(':id')
  remove(@CurrentTeacher() teacher: CurrentTeacherData, @Param('id') id: string) {
    return this.courses.remove(teacher.id, id);
  }
}
