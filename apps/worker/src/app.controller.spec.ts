import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('version', () => {
    it('returns safe deployment metadata', () => {
      const previous = {
        APP_VERSION: process.env.APP_VERSION,
        GIT_SHA: process.env.GIT_SHA,
        APP_ENV: process.env.APP_ENV,
        BUILD_TIMESTAMP: process.env.BUILD_TIMESTAMP,
      };
      process.env.APP_VERSION = '0.11.0-rc.1';
      process.env.GIT_SHA = 'abc1234';
      process.env.APP_ENV = 'staging';
      process.env.BUILD_TIMESTAMP = '2026-06-16T00:00:00Z';

      expect(appController.getVersion()).toEqual({
        service: 'worker',
        appVersion: '0.11.0-rc.1',
        gitSha: 'abc1234',
        environment: 'staging',
        buildTimestamp: '2026-06-16T00:00:00Z',
      });

      Object.assign(process.env, previous);
    });
  });
});
