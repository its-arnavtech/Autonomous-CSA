import { UnsupportedMediaTypeException } from '@nestjs/common';
import { ChannelWebhooksController } from './channel-webhooks.controller';

describe('ChannelWebhooksController', () => {
  it('rejects non-json webhook content types', () => {
    const service = { ingestWebhook: jest.fn() };
    const controller = new ChannelWebhooksController(service as never);

    expect(() =>
      controller.receiveWebhook(
        'public_1',
        'v1=abc',
        'text/plain',
        {},
        { rawBody: Buffer.from('{}') } as never,
      ),
    ).toThrow(UnsupportedMediaTypeException);
    expect(service.ingestWebhook).not.toHaveBeenCalled();
  });

  it('passes parsed payload and raw body to the service', () => {
    const service = { ingestWebhook: jest.fn().mockReturnValue({ ok: true }) };
    const controller = new ChannelWebhooksController(service as never);
    const rawBody = Buffer.from('{"eventId":"evt_1"}');
    const payload = { eventId: 'evt_1' };

    expect(
      controller.receiveWebhook(
        'public_1',
        'v1=abc',
        'application/json; charset=utf-8',
        payload,
        { rawBody } as never,
      ),
    ).toEqual({ ok: true });
    expect(service.ingestWebhook).toHaveBeenCalledWith(
      'public_1',
      payload,
      'v1=abc',
      rawBody,
    );
  });
});
