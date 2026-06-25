import { Injectable } from '@nestjs/common';
import * as fs from 'fs';

const FILE = 'logs.json';

@Injectable()
export class LogsService {
  addLog(log: any) {
    if (!fs.existsSync(FILE)) {
      fs.writeFileSync(FILE, '[]');
    }

    const data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));

    data.push(log);

    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));

    return { success: true };
  }
}