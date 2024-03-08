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

import {errorHandler} from '@backstage/backend-common';
import {
  CacheService,
} from '@backstage/backend-plugin-api';

import express from 'express';
import Router from 'express-promise-router';
import { Logger } from 'winston';
import {APICEntityProvider} from "../providers";
import {APICProviderConfig} from "../lib/config";
import {
  EntityProviderConnection,
  EntityProviderMutation,
  EntityProviderRefreshOptions
} from "@backstage/plugin-catalog-node";

export interface RouterOptions {
  logger: Logger;
  cache: CacheService
}

const buildRouter = (logger: Logger, cache: CacheService) => {
  const router = Router();
  router.use(express.json());
  console.log(process.env.ENV1)

  const provider = new APICEntityProvider({
    id: process.env.ENTITY_PROVIDER_ID ?? "",
    provider: {
      id: process.env.ENTITY_PROVIDER_CONFIG_ID ?? "",
      baseUrl: process.env.ENTITY_PROVIDER_CONFIG_BASE_URL ?? "",
      realm: process.env.ENTITY_PROVIDER_CONFIG_REALM ?? "",
      clientId: process.env.ENTITY_PROVIDER_CONFIG_CLIENT_ID ?? "",
      clientSecret: process.env.ENTITY_PROVIDER_CONFIG_CLIENT_SECRET ?? "",
      username: process.env.ENTITY_PROVIDER_CONFIG_USERNAME ?? "",
      password: process.env.ENTITY_PROVIDER_CONFIG_PASSWORD ?? "",
    } as APICProviderConfig,
    logger: logger,
    cache: cache,
  });

  provider.connect(new DummyConnection(logger))

  router.get('/syncApic', (_, response) => {
    logger.info('SYNC APIC')
    provider.read()
    response.json({ status: 'ok' });
  });

  router.use(errorHandler());
  return router;
}


export async function createStandaloneRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger } = options;
  const { cache } = options;

  return buildRouter(logger, cache);
}

class DummyConnection implements EntityProviderConnection {
  constructor(
    private logger: Logger,
  ) {}

  applyMutation(mutation: EntityProviderMutation): Promise<void> {
    this.logger.info(mutation)
    return Promise.resolve(undefined);
  }

  refresh(options: EntityProviderRefreshOptions): Promise<void> {
    this.logger.info(options)
    return Promise.resolve(undefined);
  }

}
