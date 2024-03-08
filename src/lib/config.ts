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

import {
  readTaskScheduleDefinitionFromConfig,
  TaskScheduleDefinition,
} from '@backstage/backend-tasks';
import { Config } from '@backstage/config';

/**
 * The configuration parameters for a single APIC provider.
 *
 * @public
 */
export type APICProviderConfig = {
  /**
   * Identifier of the provider which will be used i.e. at the location key for ingested entities.
   */
  id: string;

  /**
   * The APIC API base URL
   */
  baseUrl: string;

  /**
   * Realm inside APIC
   */
  realm: string;

  /**
   * The username to use for authenticating requests
   * If specified, password must also be specified
   */
  username?: string;

  /**
   * The password to use for authenticating requests
   * If specified, username must also be specified
   */
  password?: string;

  /**
   * The clientId to use for authenticating requests
   * If specified, clientSecret must also be specified
   */
  clientId: string;

  /**
   * The clientSecret to use for authenticating requests
   * If specified, clientId must also be specified
   */
  clientSecret: string;

  /**
   * Schedule configuration for refresh tasks.
   */
  schedule?: TaskScheduleDefinition;

  tmpToken?: string;
};

export const readProviderConfigs = (config: Config): APICProviderConfig[] => {
  const providersConfig = config.getOptionalConfig('catalog.providers.ibmApic');
  if (!providersConfig) {
    return [];
  }

  return providersConfig.keys().map(id => {
    const providerConfigInstance = providersConfig.getConfig(id);

    const baseUrl = providerConfigInstance.getString('baseUrl');
    const realm =
      providerConfigInstance.getOptionalString('realm') ??
      'provider/default-idp-2';
    // const loginRealm =
    //   providerConfigInstance.getOptionalString('loginRealm') ?? 'master';
    const username = providerConfigInstance.getOptionalString('username');
    const password = providerConfigInstance.getOptionalString('password');
    const clientId = providerConfigInstance.getString('clientId');
    const clientSecret = providerConfigInstance.getString('clientSecret');
    // const userQuerySize =
    //   providerConfigInstance.getOptionalNumber('userQuerySize');
    // const groupQuerySize =
    //   providerConfigInstance.getOptionalNumber('groupQuerySize');

    if (clientId && !clientSecret) {
      throw new Error(
        `clientSecret must be provided when clientId is defined.`,
      );
    }

    if (clientSecret && !clientId) {
      throw new Error(
        `clientId must be provided when clientSecret is defined.`,
      );
    }

    if (username && !password) {
      throw new Error(`password must be provided when username is defined.`);
    }

    if (password && !username) {
      throw new Error(`username must be provided when password is defined.`);
    }

    const schedule = providerConfigInstance.has('schedule')
      ? readTaskScheduleDefinitionFromConfig(
          providerConfigInstance.getConfig('schedule'),
        )
      : undefined;

    return {
      id,
      baseUrl,
      realm,
      username,
      password,
      clientId,
      clientSecret,
      schedule,
    };
  });
};
