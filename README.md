# @deadstone/rabbitmq

A Nest.js module for RabbitMQ integration.

## Installation

<pre>
npm install @deadstone/rabbitmq
</pre>

## Usage

### Importing Module

<pre>
import { Module } from'@nestjs/common';
import { RabbitmqModule, RabbitModuleOptions } from '@deadstone/rabbitmq';

@Module({
  imports: [
    RabbitmqModule.forRoot({
      url: 'amqp://localhost',
      connectionName: 'test-connection',
    }),
  ],
})
export class AppModule {}
</pre>

### Injecting RabbitService

<pre>
import { Injectable } '@nestjs/common';
import { RabbitmqService } from '@deadstone/rabbitmq';

@Injectable()
export class MyService {
  constructor(private readonly rabbitService: RabbitmqService) {}

  async sendMessageToQueue () {
    await this.rabbitService.assertQueue('my-queue', { durable: true });
    await this.rabbitService.sendToQueue('my-queue', { message: 'Hello, RabbitMQ!' }, {});
  }
}
</pre>

## API Reference

### RabbitmqModule.forRoot(options: RabbitModuleOptions): DynamicModule

Creates a dynamic module for synchronously configuring the RabbitMQ connection options.

- `options` (RabbitModuleOptions): RabbitMQ connection options.

### RabbitmqModule.forRootAsync(options: RabbitModuleAsyncOptions): DynamicModule

Creates a dynamic module for asynchronously configuring the RabbitMQ connection options.

- `options` (RabbitModuleAsyncOptions): Asynchronous RabbitMQ connection options.

### RabbitmqService

The RabbitMQ service provides methods for interacting with RabbitMQ.

#### Methods

- `connect(): Promise<void>`: Establishes a connection to RabbitMQ.
- `disconnect(): Promise<void>`: Closes the connection to RabbitMQ.
- `assertQueue(name: string, options: QueueOptions): Promise<string>`: Asserts a queue in RabbitMQ.
- `sendToQueue(queue: string, data: Record<string, any>, options: MessageOptions): void`: Sends a message to the specified queue.
- `subscribeToQueue(queue: string, callback: QueueCallback, options: QueueOptions = {}): Promise<string>`: Subscribes to a queue in RabbitMQ.

## Contributing

Contributions welcome! See [Contributing](CONTRIBUTING.md).

## Notes

This project is not endorsed by or affiliated with [RabbitMQ](https://www.rabbitmq.com/).

## Author

Ruslan Pakhlivanov, [github](https://github.com/DEADST0NE).

## License

Licensed under the [MIT licensed](LICENSE).
