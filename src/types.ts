import { ConsumeMessage } from 'amqplib';

export enum ExchangeType {
  direct = 'direct',
  topic = 'topic',
  headers = 'headers',
  fanout = 'fanout',
  match = 'match',
}

export type ExchangeOptions = {
  type: ExchangeType;
  durable?: boolean;
  internal?: boolean;
  autoDelete?: boolean;
  alternateExchange?: string;
};

export type QueueOptions = {
  durable?: boolean;
  autoDelete?: boolean;
  exclusive?: boolean;
  maxLength?: number;
  exchange?: string;
  pattern?: string;
  noAck?: boolean;
  prefetchCount?: number;
};

export type MessageOptions = {
  messageId?: string;
  route?: string;
};

export type Ack = (ack: boolean) => void | PromiseLike<void>;

export type QueueCallback = (
  data: any,
  ack: Ack,
  msg?: ConsumeMessage,
) => void | PromiseLike<void>;

export interface RabbitModuleOptions {
  url: string;
  connectionName: string;
}

export interface RabbitModuleAsyncOptions {
  imports?: any[];
  useFactory: (
    ...args: any[]
  ) => Promise<RabbitModuleOptions> | RabbitModuleOptions;
  inject?: any[];
}
