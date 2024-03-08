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

import { PluginDatabaseManager } from '@backstage/backend-common';
import { PluginTaskScheduler, TaskRunner } from '@backstage/backend-tasks';
import {
  ANNOTATION_LOCATION,
  ANNOTATION_ORIGIN_LOCATION, CompoundEntityRef, DomainEntity,
  Entity, GroupEntity, stringifyEntityRef,
  SystemEntity,
  UserEntity,
} from '@backstage/catalog-model';
import { Config } from '@backstage/config';
import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';

import { None, Option, Some } from '@sniptt/monads';
import { merge } from 'lodash';
import * as uuid from 'uuid';
import { Logger } from 'winston';

import {
  fetchAPIs, fetchApplicationCredentials, fetchApplications,
  fetchCatalogs,
  fetchConsumerOrgs,
  fetchMembers,
  fetchOrganisations, fetchProducts, fetchSubscriptions,
} from '../lib/apicClient';
import { APICProviderConfig, readProviderConfigs } from '../lib/config';
import {
  connectCatalogsToOrgs,
  connectCatalogsToOwners,
  connectComponentToOrganisationsAndProducts,
  connectSubscriptionsToApplications,
  entityListToIdValueMap,
} from '../lib/transformers';
import {CacheService} from "@backstage/backend-plugin-api";
import {
  ANNOTATION_APIC_CATALOGID,
  ANNOTATION_APIC_CATALOGNAME,
  ANNOTATION_APIC_ORGID,
  ANNOTATION_APIC_ORGNAME
} from "../lib/constants";

/**
 * Options for {@link APICEntityProvider}.
 *
 * @public
 */
export interface APICEntityProviderOptions {
  /**
   * A unique, stable identifier for this provider.
   *
   * @example "production"
   */
  id: string;

  /**
   * The refresh schedule to use.
   *
   * @defaultValue "manual"
   * @remarks
   *
   * If you pass in 'manual', you are responsible for calling the `read` method
   * manually at some interval.
   *
   * But more commonly you will pass in the result of
   * {@link @backstage/backend-tasks#PluginTaskScheduler.createScheduledTaskRunner}
   * to enable automatic scheduling of tasks.
   */
  schedule?: 'manual' | TaskRunner;

  /**
   * Scheduler used to schedule refreshes based on
   * the schedule config.
   */
  scheduler?: PluginTaskScheduler;

  /**
   * The logger to use.
   */
  logger: Logger;

  cache: CacheService;

  /**
   * The PluginDatabaseManager to use
   */
  database: PluginDatabaseManager;

  // /**
  //  * The function that transforms a user entry in LDAP to an entity.
  //  */
  // userTransformer?: UserTransformer;
  //
  // /**
  //  * The function that transforms a group entry in LDAP to an entity.
  //  */
  // groupTransformer?: GroupTransformer;
}

// Makes sure that emitted entities have a proper location
export const withLocations = (_: string, entity: Entity): Entity => {
  // const location = `url:${baseUrl}/admin/realms/${realm}/${kind}/${entity.metadata.annotations?.[KEYCLOAK_ID_ANNOTATION]}`;
  // const url = entity.metadata.annotations![ANNOTATION_SOURCE_LOCATION]
  const location = `apic:default`;
  return merge(
    {
      metadata: {
        annotations: {
          [ANNOTATION_LOCATION]: location,
          [ANNOTATION_ORIGIN_LOCATION]: location,
        },
      },
    },
    entity,
  ) as Entity;
};

/**
 * Ingests org data (users and groups) from GitHub.
 *
 * @public
 */
export class APICEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;
  private scheduleFn?: () => Promise<void>;

  static fromConfig(
    configRoot: Config,
    options: APICEntityProviderOptions,
  ): APICEntityProvider[] {
    return readProviderConfigs(configRoot).map(providerConfig => {
      // if (!options.schedule && !providerConfig.schedule) {
      //   throw new Error(
      //     `No schedule provided neither via code nor config for MicrosoftGraphOrgEntityProvider:${providerConfig.id}.`,
      //   );
      // }

      const taskRunner =
        options.schedule ??
        options.scheduler!.createScheduledTaskRunner(providerConfig.schedule!);

      const provider = new APICEntityProvider({
        id: providerConfig.id,
        provider: providerConfig,
        logger: options.logger,
        cache: options.cache,
      });

      if (taskRunner !== 'manual') {
        provider.schedule(taskRunner);
      }

      return provider;
    });
  }

  constructor(
    private options: {
      id: string;
      provider: APICProviderConfig;
      logger: Logger;
      cache: CacheService;
    },
  ) {}

  getProviderName(): string {
    return `APICEntityProvider:${this.options.id}`;
  }

  async connect(connection: EntityProviderConnection) {
    this.connection = connection;
    await this.scheduleFn?.();
  }

  /**
   * Runs one complete ingestion loop. Call this method regularly at some
   * appropriate cadence.
   */
  async read(options?: { logger?: Logger, cache?: CacheService, targetEntity: Option<CompoundEntityRef> }) {
    if (!this.connection) {
      throw new Error('Not initialized');
    }

    const logger = options?.logger ?? this.options.logger;
    const provider = this.options.provider;
    const cache = this.options.cache;

    const { markReadComplete } = trackProgress(logger);

    const organisations: DomainEntity[] = await fetchOrganisations(
      provider,
      logger,
    );
    for (const organisation of organisations) {
      await cache.set(`organisation:${organisation.metadata.id}:name`, organisation.metadata.name);
    }
    const catalogs: SystemEntity[] = await fetchCatalogs(
      provider,
      logger,
      cache,
      None,
    );
    for (const catalog of catalogs) {
      await cache.set(`catalog:${catalog.metadata.id}`, catalog as Entity);
      let id = await cache.get(`organisation:${catalog.metadata.annotations![ANNOTATION_APIC_ORGID]}:name`) as string;
      logger.info(id)
    }
    connectCatalogsToOrgs(catalogs, organisations);

    const users: UserEntity[] = await fetchMembers(
      organisations,
      provider,
      logger,
    );
    connectCatalogsToOwners(catalogs, users);
    const consumerOrgs: GroupEntity[] = await fetchConsumerOrgs(
      organisations,
      provider,
      logger,
    );
    let organisationIdValueMap = entityListToIdValueMap(organisations);
    let catalogIdValueMap = entityListToIdValueMap(catalogs);
    for (const consumerOrg of consumerOrgs) {
      consumerOrg.metadata.annotations![ANNOTATION_APIC_ORGNAME] = organisationIdValueMap.get(consumerOrg.metadata.annotations![ANNOTATION_APIC_ORGID])!.name
      consumerOrg.metadata.annotations![ANNOTATION_APIC_CATALOGNAME] = catalogIdValueMap.get(consumerOrg.metadata.annotations![ANNOTATION_APIC_CATALOGID])!.name
    }

    let entities = [...organisations, ...catalogs, ...users, ...consumerOrgs];
    await this.connection.applyMutation({
      type: 'full',
      entities: entities.map(entity => {
        return {
          entity: withLocations(provider.baseUrl, entity),
          locationKey: `apic:default`
        }
      })
    });

    for (const catalog of catalogs) {
      logger.info(`Processing catalog(${catalog.metadata.name})`)

      try {
        logger.info(`Fetching products for organisation(${catalog.metadata.name})`)
        let organisation = ((catalog as SystemEntity).spec.domain as string).replace('default/', '');
        const products = await fetchProducts(provider, logger, organisation, catalog.metadata.name);

        if (products.length > 0) {
          await this.connection.applyMutation({
            type: 'delta',
            removed: [],
            added: products.map(entity => {
              return {
                entity: withLocations(provider.baseUrl, entity),
                locationKey: `apic:default`
              }
            })
          });
        }

        let apis = await fetchAPIs(provider, logger, organisation, catalog.metadata.name);
        for (const api of apis) {
          api.metadata.namespace = catalog.metadata.name;
          api.spec.owner = stringifyEntityRef(catalog);
          api.spec.system = stringifyEntityRef(catalog);
        }

        await this.connection.applyMutation({
          type: 'delta',
          removed: [],
          added: apis.map(entity => {
            return {
              entity: withLocations(provider.baseUrl, entity),
              locationKey: `apic:default`
            }
          })
        });

      } catch (e) {
        logger.error(e)
      }

      for (const catalog of catalogs) {
        const applications = await fetchApplications(
          provider,
          logger,
          cache,
          catalog.metadata.annotations![ANNOTATION_APIC_ORGID],
          catalog.metadata.name,
        );
        await this.connection.applyMutation({
          type: 'delta',
          removed: [],
          added: applications.map(entity => {
            return {
              entity: withLocations(provider.baseUrl, entity),
              locationKey: `apic:default`
            }
          })
        });
        connectComponentToOrganisationsAndProducts(applications, consumerOrgs);
        const subscriptions = await fetchSubscriptions(
            provider,
            logger,
            catalog.metadata.annotations![ANNOTATION_APIC_ORGID], catalog.metadata.name
        );
        connectComponentToOrganisationsAndProducts(subscriptions, consumerOrgs);
        connectSubscriptionsToApplications(subscriptions, applications);
        await this.connection.applyMutation({
          type: 'delta',
          removed: [],
          added: subscriptions.map(entity => {
            return {
              entity: withLocations(provider.baseUrl, entity),
              locationKey: `apic:default`
            }
          })
        });

        const credentials = await fetchApplicationCredentials(
            provider,
            logger,
            catalog.metadata.annotations![ANNOTATION_APIC_ORGID],
            catalog.metadata.name,
            Some(applications),
        );
        connectComponentToOrganisationsAndProducts(credentials, consumerOrgs);
        await this.connection.applyMutation({
          type: 'delta',
          removed: [],
          added: credentials.map(entity => {
            return {
              entity: withLocations(provider.baseUrl, entity),
              locationKey: `apic:default`
            }
          })
        });
      }

    }

    // const products: ComponentEntity[] = [];
    // for (const catalog of catalogs) {
    //   products.push(
    //     ...(await fetchProducts(
    //       provider,
    //       logger,
    //       catalog.metadata.annotations![ANNOTATION_APIC_ORGID],
    //       catalog.metadata.name,
    //       None,
    //     )),
    //   );
    // }
    //
    // const apis: ApiEntity[] = [];
    // for (const catalog of catalogs) {
    //   apis.push(
    //     ...(await fetchAPIs(
    //       provider,
    //       logger,
    //       catalog.metadata.annotations![ANNOTATION_APIC_ORGID],
    //       catalog.metadata.name,
    //       None,
    //     )),
    //   );
    // }

    // const applications: ComponentEntity[] = [];
    // for (const catalog of catalogs) {
    //   const newApps = await fetchApplications(
    //     provider,
    //     logger,
    //     catalog.metadata.annotations![ANNOTATION_APIC_ORGID],
    //     catalog.metadata.name,
    //   );
    //   connectComponentToOrganisationsAndProducts(newApps, consumerOrgs);
    //   applications.push(...newApps);
    // }

    const { markCommitComplete } = markReadComplete();



    markCommitComplete();
  }

  private schedule(taskRunner: TaskRunner) {
    this.scheduleFn = async () => {
      const id = `${this.getProviderName()}:refresh`;
      await taskRunner.run({
        id,
        fn: async () => {
          const logger = this.options.logger.child({
            class: APICEntityProvider.prototype.constructor.name,
            taskId: id,
            taskInstanceId: uuid.v4(),
          });
          const cache = this.options.cache;
          try {
            await this.read({ logger, cache, targetEntity: None });
          } catch (error) {
            logger.error(error);
          }
        },
      });
    };
  }
}

// Helps wrap the timing and logging behaviors
function trackProgress(logger: Logger) {
  let timestamp = Date.now();
  let summary: string;

  logger.info('Reading APIC entities...');

  function markReadComplete(category: Option<string> = Some('APIC')) {
    summary = `Since ${category.unwrap()}`;
    const readDuration = ((Date.now() - timestamp) / 1000).toFixed(1);
    timestamp = Date.now();
    logger.info(`Read ${summary} in ${readDuration} seconds. Committing...`);
    return { markCommitComplete };
  }

  function markCommitComplete() {
    const commitDuration = ((Date.now() - timestamp) / 1000).toFixed(1);
    logger.info(`Committed ${summary} in ${commitDuration} seconds.`);
  }

  return { markReadComplete };
}
