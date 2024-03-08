/*
 * Copyright 2024 CROZ d.o.o, the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {createServiceBuilder} from '@backstage/backend-common';
import {CacheService, CacheServiceSetOptions} from '@backstage/backend-plugin-api';
import {Server} from 'http';
import {Logger} from 'winston';
import {createRouter} from './router';
import {JsonValue} from "@backstage/config";
import {createStandaloneRouter} from "./standaloneRouter";

export interface ServerOptions {
  port: number;
  enableCors: boolean;
  logger: Logger;
}

export async function startStandaloneServer(
  options: ServerOptions,
): Promise<Server> {
  const logger = options.logger.child({ service: 'apic-public-backend' });

  logger.debug('Starting application server...');

  const cache = getDummyCache(logger)
  const router = await createRouter({
    logger
  });

  const standaloneRouter = await createStandaloneRouter(
    {
      logger,
      cache
    }
  )

  let service = createServiceBuilder(module)
    .setPort(options.port)
    .addRouter('/apic-public', router)
    .addRouter('/apic-public-standalone', standaloneRouter)

  if (options.enableCors) {
    service = service.enableCors({ origin: 'http://localhost:3000' });
  }

  return await service.start().catch(err => {
    logger.error(err);
    process.exit(1);
  });
}

function getDummyCache(logger: Logger) : CacheService {
  return <CacheService>{
    get<TValue extends JsonValue>(key: string): Promise<TValue | undefined> {
      logger.info(key)
      return Promise.resolve(undefined)
    },
    set(key: string, value: JsonValue, options?: CacheServiceSetOptions): Promise<void> {
      logger.info(key, value, options)
      return Promise.resolve()
    },
    delete(key: string): Promise<void> {
      logger.info(key)
      return Promise.resolve()
    }
  }
}

module.hot?.accept();
