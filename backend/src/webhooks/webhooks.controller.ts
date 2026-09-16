import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { WebhooksService } from './webhooks.service';

// Open endpoint called by the Google Forms Apps Script on each submission,
// authenticated by a shared secret (env WEBHOOK_SECRET). Not rate-limited —
// legitimate submissions can burst at the end of an exam, and it's secret-gated.
@SkipThrottle()
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  private assertSecret(secret: string) {
    const expected = process.env.WEBHOOK_SECRET;
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('invalid or unconfigured webhook secret');
    }
  }

  // Which forms should the Apps Script watch (auto-sync from the exam links).
  @Get('forms')
  forms(@Headers('x-webhook-secret') secret: string) {
    this.assertSecret(secret);
    return this.webhooks.listWatchedFormTokens();
  }

  @Post('form-submit')
  formSubmit(@Headers('x-webhook-secret') secret: string, @Body() body: any) {
    this.assertSecret(secret);
    return this.webhooks.recordFormSubmission(body ?? {});
  }
}
