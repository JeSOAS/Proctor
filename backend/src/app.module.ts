import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { LogsModule } from './logs/logs.module';

@Module({
  imports: [LogsModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
