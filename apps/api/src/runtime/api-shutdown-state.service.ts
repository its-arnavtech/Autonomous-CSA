import { Injectable } from '@nestjs/common';

@Injectable()
export class ApiShutdownStateService {
  private activeSignal: string | null = null;

  beginShutdown(signal: string) {
    if (!this.activeSignal) {
      this.activeSignal = signal;
    }
  }

  isShuttingDown() {
    return this.activeSignal !== null;
  }

  getSignal() {
    return this.activeSignal;
  }
}
