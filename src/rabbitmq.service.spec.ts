import { Channel } from 'amqplib';
import { Test, TestingModule } from '@nestjs/testing';

import { RabbitmqService, RabbitReadyState } from './rabbitmq.service';

import { RabbitModuleOptions } from './types';
import { RABBIT_MODULE_OPTIONS } from './constants';

jest.mock('amqplib', () => {
  const actualAmqplib = jest.requireActual('amqplib');
  return {
    ...actualAmqplib,
    connect: jest.fn().mockImplementation(() => ({
      createChannel: jest.fn().mockResolvedValue({
        assertQueue: jest.fn().mockResolvedValue({ queue: 'test-queue' }),
        assertExchange: jest.fn().mockResolvedValue({}),
        bindQueue: jest.fn().mockResolvedValue({}),
        sendToQueue: jest.fn().mockResolvedValue({}),
        consume: jest.fn().mockResolvedValue({ consumerTag: 'test-consumer' }),
        ack: jest.fn(),
        nack: jest.fn(),
        close: jest.fn(),
        prefetch: jest.fn(),
      }),
      on: jest.fn(),
      close: jest.fn(),
      removeAllListeners: jest.fn(),
    })),
  };
});

describe('RabbitmqService', () => {
  let service: RabbitmqService;
  let module: TestingModule;

  const options: RabbitModuleOptions = {
    url: 'amqp://localhost',
    connectionName: 'test-connection',
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        RabbitmqService,
        {
          provide: RABBIT_MODULE_OPTIONS,
          useValue: options,
        },
      ],
    }).compile();

    service = module.get<RabbitmqService>(RabbitmqService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should connect to RabbitMQ', async () => {
    await service.connect();
    expect(service.connected).toBe(true);
    expect(service['state']).toBe(RabbitReadyState.opened);
  });

  it('should disconnect from RabbitMQ', async () => {
    await service.connect();
    await service.disconnect();
    expect(service.connected).toBe(false);
    expect(service['state']).toBe(RabbitReadyState.closed);
  });

  it('should assert a queue', async () => {
    await service.connect();
    const queue = await service.assertQueue('test-queue', { prefetchCount: 1 });
    expect(queue).toBe('test-queue');
  });

  it('should send a message to the queue', async () => {
    await service.connect();
    await service.sendToQueue('test-queue', { message: 'test' }, {});
    const channel = (service as any).channel as Channel;
    expect(channel.sendToQueue).toHaveBeenCalledWith(
      'test-queue',
      Buffer.from(JSON.stringify({ message: 'test' }), 'utf-8'),
      {},
    );
  });

  it('should subscribe to a queue', async () => {
    await service.connect();
    const consumerTag = await service.subscribeToQueue(
      'test-queue',
      async () => {},
    );
    expect(consumerTag).toBe('test-consumer');
  });
});
