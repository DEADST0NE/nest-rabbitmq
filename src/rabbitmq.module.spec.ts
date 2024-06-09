import { Test, TestingModule } from '@nestjs/testing';
import { RabbitmqModule } from './rabbitmq.module';
import { RabbitmqService } from './rabbitmq.service';
import { RABBIT_MODULE_OPTIONS } from './constants';
import { RabbitModuleOptions } from './types';

describe('RabbitmqModule', () => {
  let module: TestingModule;

  const options: RabbitModuleOptions = {
    url: 'amqp://localhost',
    connectionName: 'test-connection',
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [RabbitmqModule.forRoot(options)],
    }).compile();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide RabbitmqService', () => {
    const rabbitmqService = module.get<RabbitmqService>(RabbitmqService);
    expect(rabbitmqService).toBeDefined();
  });

  it('should provide options', () => {
    const injectedOptions = module.get(RABBIT_MODULE_OPTIONS);
    expect(injectedOptions).toEqual(options);
  });
});
