import {
  Inject,
  Logger,
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Channel, connect, Connection, Options } from 'amqplib';

import {
  QueueOptions,
  QueueCallback,
  MessageOptions,
  ExchangeOptions,
  RabbitModuleOptions,
} from './types';
import { RABBIT_MODULE_OPTIONS } from './constants';

export enum RabbitReadyState {
  closed,
  opened,
  connecting,
}

@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(RABBIT_MODULE_OPTIONS)
    private readonly options: RabbitModuleOptions,
  ) {}

  private readonly logger = new Logger(RabbitmqService.name);

  connected = false;
  private stayAlive = false;
  private channel?: Channel;
  private RECONNECT_TTL = 3000;
  private connection?: Connection;
  private state: RabbitReadyState = RabbitReadyState.closed;
  private subscribes: Map<string, () => void> = new Map();
  private exchanges: Map<string, () => void> = new Map();
  private queues: Map<
    string,
    {
      queue: string;
      reset: () => void;
    }
  > = new Map();

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect() {
    this.stayAlive = true;
    if (this.connected || this.state === RabbitReadyState.connecting) {
      return;
    }
    this.state = RabbitReadyState.connecting;
    try {
      const url = new URL(this.options.url);
      this.connection = await connect(
        {
          hostname: url.hostname,
          port: parseInt(url.port, 10),
          username: url.username,
          password: url.password,
          vhost: url.pathname.slice(1),
        },
        {
          clientProperties: { connection_name: this.options.connectionName },
        },
      );
    } catch (err) {
      this.logger.error(`Rabbit mq connection failed`);
      this.logger.log(err);
      this.state = RabbitReadyState.closed;
      this.connected = false;
      await this.reconnect();
      return;
    }
    this.connected = true;

    this.connection.on('close', () => {
      this.connected = false;
      this.state = RabbitReadyState.closed;
      if (this.stayAlive) {
        void this.reconnect();
      }
    });

    this.connection.on('error', (error) => {
      void this.reconnect();
      this.logger.error(`AMQP error `, error);
    });

    this.logger.debug(`Rabbit connected`);
    this.channel = await this.connection.createChannel();
    this.state = RabbitReadyState.opened;
    this.logger.debug(`Rabbit channel created`);

    this.recoverySub();
  }

  async recoverySub() {
    if (this.subscribes.size) this.subscribes.forEach((c) => c());
    if (this.exchanges.size) this.exchanges.forEach((c) => c());
    if (this.queues.size) this.queues.forEach((c) => c.reset());
  }

  async reconnect() {
    await new Promise((r) => setTimeout(() => r(true), this.RECONNECT_TTL));
    await this.connect();
  }

  async disconnect() {
    this.stayAlive = false;
    this.connection?.removeAllListeners();
    await this.channel?.close();
    this.logger.debug(`Rabbit channel closed`);
    await this.connection?.close();
    this.logger.debug(`Rabbit disconnected`);
    this.channel = undefined;
    this.connection = undefined;
    this.connected = false;
    this.state = RabbitReadyState.closed;
  }

  async assetExchange(name: string, options: ExchangeOptions) {
    this.logger.debug(`Assert exchange ${name}`);
    await this.connect();

    this.exchanges.set(name, () =>
      this.channel.assertExchange(name, options.type, options),
    );

    return await this.channel.assertExchange(name, options.type, options);
  }

  async assertQueue(
    name: string,
    options: QueueOptions,
    patterns: string[] = [],
  ) {
    await this.connect();

    const found = this.queues.get(name);
    if (found) {
      return found.queue;
    }
    this.logger.debug(`Assert queue ${name}`);

    const queue = await this.channel.assertQueue(name, options);

    if (options.prefetchCount) {
      await this.channel.prefetch(options.prefetchCount);
    }

    if (options.exchange?.length) {
      if (patterns?.length === 0) {
        await this.channel.bindQueue(
          queue.queue,
          options.exchange,
          options.pattern,
        );
      } else {
        for (const pattern of patterns) {
          await this.channel.bindQueue(queue.queue, options.exchange, pattern);
        }
      }
    }

    this.queues.set(name, {
      queue: queue.queue,
      reset: () => this.assertQueue(name, options, patterns),
    });
    return queue.queue;
  }

  async publish(
    exchange: string,
    routingKey: string,
    data: { [key: string]: any },
    options: Options.Publish | undefined = undefined,
  ) {
    const payload = JSON.stringify(data);
    this.channel.publish(
      exchange,
      routingKey,
      Buffer.from(payload, 'utf-8'),
      options,
    );
  }

  async sendToQueue(
    queue: string,
    data: { [key: string]: any },
    options: MessageOptions | undefined = undefined,
  ) {
    const payload = JSON.stringify(data);
    this.channel.sendToQueue(queue, Buffer.from(payload, 'utf-8'), options);
  }

  async subscribeToQueue(
    queue: string,
    callback: QueueCallback | null = null,
    options: QueueOptions = {},
  ) {
    this.logger.debug(`Subscribe queue ${queue}`);

    const consumer = await this.channel.consume(
      queue,
      async (msg) => {
        const content = msg.content.toString('utf-8');
        let payload: { [key: string]: any };
        try {
          payload = JSON.parse(content);
        } catch (error) {
          this.logger.debug(
            `Invalid format message from queue`,
            content,
            error,
          );
          this.channel.ack(msg);
          return;
        }

        if (!callback) return;

        await callback(
          payload,
          (ack: boolean) => {
            if (ack) {
              this.channel.ack(msg);
            } else {
              this.channel.nack(msg);
            }
          },
          msg,
        );
      },
      {
        noAck: options.noAck,
      },
    );
    this.subscribes.set(consumer.consumerTag, () =>
      this.subscribeToQueue(queue, callback, options),
    );
    return consumer.consumerTag;
  }

  async unsubscribeToQueue(consumerTag: string) {
    this.subscribes.delete(consumerTag);
    return await this.channel.cancel(consumerTag);
  }
}
