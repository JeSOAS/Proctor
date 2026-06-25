import { Body, Controller, Post } from '@nestjs/common';
import { LogsService } from './logs.service';

@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Post()
  create(@Body() body: any) {
    return this.logsService.addLog(body);
  }
}