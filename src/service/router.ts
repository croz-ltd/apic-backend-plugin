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

import {errorHandler, loggerToWinstonLogger} from '@backstage/backend-common';
import {
  coreServices, createBackendPlugin
} from '@backstage/backend-plugin-api';

import express from 'express';
import Router from 'express-promise-router';
import { Logger } from 'winston';


export interface RouterOptions {
  logger: Logger;
}

const buildRouter = (logger: Logger) => {
  const router = Router();
  router.use(express.json());

  router.get('/health', (_, response) => {
    logger.info('PONG!');

    response.json({ status: 'ok' });
  });

  router.use(errorHandler());
  return router;
}


export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger } = options;

  return buildRouter(logger);
}

export const apicPublicBackendPlugin = createBackendPlugin({
  pluginId: 'apic-public-backend',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        http: coreServices.httpRouter,
      },
      async init({ logger, http }) {
        http.use(buildRouter(loggerToWinstonLogger(logger)));
      },
    });
  },
});
