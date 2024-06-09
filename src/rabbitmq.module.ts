import { DynamicModule, Module } from '@nestjs/common';

import { RabbitmqService } from './rabbitmq.service';

import { RABBIT_MODULE_OPTIONS } from './constants';
import { RabbitModuleAsyncOptions, RabbitModuleOptions } from './types';

@Module({
  providers: [RabbitmqService],
  exports: [RabbitmqService],
})
export class RabbitmqModule {
  static forRoot(options: RabbitModuleOptions): DynamicModule {
    return {
      module: RabbitmqModule,
      providers: [
        {
          provide: RABBIT_MODULE_OPTIONS,
          useValue: options,
        },
        RabbitmqService,
      ],
      exports: [RabbitmqService],
    };
  }

  static forRootAsync(options: RabbitModuleAsyncOptions): DynamicModule {
    return {
      module: RabbitmqModule,
      imports: options.imports || [],
      providers: [
        {
          provide: RABBIT_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        RabbitmqService,
      ],
      exports: [RabbitmqService],
    };
  }
}
