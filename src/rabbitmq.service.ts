import {
  Inject,
  Logger,
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Channel, connect, Connection } from 'amqplib';

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

  private readonly subscriptions: Map<
    string,
    {
      queue: string;
      callback: QueueCallback;
      options: QueueOptions;
    }
  > = new Map();

  connected = false;
  private stayAlive = false;
  private channel?: Channel;
  private RECONNECT_TTL = 3000;
  private connection?: Connection;
  private state: RabbitReadyState = RabbitReadyState.closed;

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    this.stayAlive = true;
    if (this.connected || this.state === RabbitReadyState.connecting) {
      return;
    }
    this.state = RabbitReadyState.connecting;
    try {
      this.connection = await connect(this.options.url, {
        clientProperties: { connection_name: this.options.connectionName },
      });
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
      this.logger.error(`AMQP error `, error);
    });

    this.logger.debug(`Rabbit connected`);
    this.channel = await this.connection.createChannel();
    this.state = RabbitReadyState.opened;
    this.logger.debug(`Rabbit channel created`);

    await this.resubscribeToQueues();
  }

  async reconnect() {
    await new Promise((r) => setTimeout(() => r(true), this.RECONNECT_TTL));
    await this.connect();
  }

  async disconnect(): Promise<void> {
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
    this.logger.debug(`Asset exchange ${name}`);
    await this.connect();
    return await this.channel.assertExchange(name, options.type, options);
  }

  async assertQueue(name: string, options: QueueOptions): Promise<string> {
    this.logger.debug(`Assert queue ${name}`);

    await this.connect();
    const queue = await this.channel.assertQueue(name, options);

    if (options.prefetchCount) {
      await this.channel.prefetch(options.prefetchCount);
    }

    if (options.exchange?.length) {
      await this.channel.bindQueue(
        queue.queue,
        options.exchange,
        options.pattern,
      );
    }
    return queue.queue;
  }

  async sendToQueue(
    queue: string,
    data: { [key: string]: any },
    options: MessageOptions,
  ) {
    const payload = JSON.stringify(data);
    this.channel.sendToQueue(queue, Buffer.from(payload, 'utf-8'), options);
  }

  async subscribeToQueue(
    queue: string,
    callback: QueueCallback,
    options: QueueOptions = {},
  ): Promise<string> {
    this.subscriptions.set(queue, { queue, callback, options });

    const consumer = await this.channel.consume(
      queue,
      async (msg) => {
        const content = msg.content.toString('utf-8');
        let payload: { [key: string]: any };
        try {
          payload = JSON.parse(content);
        } catch (error) {
          this.logger.debug(`Invalid format message from queue`, content);
          this.channel.ack(msg);
          return;
        }
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
    return consumer.consumerTag;
  }

  async resubscribeToQueues() {
    if (this.subscriptions.size === 0) return;
    this.logger.debug(`Resubscribing to queues...`);

    for (const sub of this.subscriptions.values()) {
      await this.channel.assertQueue(sub.queue, {
        durable: true,
        ...sub.options,
      });
      await this.subscribeToQueue(sub.queue, sub.callback, sub.options);
    }

    this.logger.debug(`All queues resubscribed.`);
  }
}
