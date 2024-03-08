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
  ANNOTATION_SOURCE_LOCATION,
  ApiEntity,
  ComponentEntity,
  DomainEntity, Entity,
  GroupEntity,
  SystemEntity,
  UserEntity,
} from '@backstage/catalog-model';

import { Err, None, Ok, Option, Result, Some } from '@sniptt/monads';
import fetch, { RequestInfo, RequestInit, Response } from 'node-fetch';
import * as winston from 'winston';

import * as https from 'https';

import { APICProviderConfig } from './config';
import {
  ANNOTATION_APIC_APPLICATIONID,
  APIS_API_PART,
  APPS_API_PART,
  CATALOGS_API_PART,
  CONSUMER_ORGS_API_PART,
  CREDENTIALS_API_PART,
  MEMBERS_API_PART,
  ORGANISATIONS_API_PART,
  PRODUCTS_API_PART,
  SUBSCRIPTIONS_API_PART,
} from './constants';
import {
  entityListToIdValueMap,
  lastPathPartAsId,
  parseAPI,
  parseApplication,
  parseApplicationCredential,
  parseCatalog,
  parseConsumerOrg,
  parseOrganisation,
  parseProduct,
  parseSubscription,
  parseUser,
} from './transformers';
import {
  APICAccessToken,
  APICAPI,
  APICApplication,
  APICApplicationCredential,
  APICCatalog,
  APICMember,
  APICOrg,
  APICProduct,
  APICResponse,
  APICSubscription, APICUser, ProductEntity,
} from './types';
import {Logger} from "winston";
import {CacheService} from "@backstage/backend-plugin-api";

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

function delay(ms: number) {
  return new Promise( resolve => setTimeout(resolve, ms) );
}

async function issueToken(
  provider: APICProviderConfig,
): Promise<Result<string, string>> {
  if (provider.tmpToken !== undefined && provider.tmpToken.length > 0) {
    return Ok(provider.tmpToken);
  }
  const tokenResponse = await fetch(`${provider.baseUrl}/token`, {
    agent: httpsAgent,
    method: 'POST',
    headers: {
      'User-Agent': 'backstage-apic-plugin',
      'X-Ibm-Client-Id': provider.clientId,
      'X-Ibm-Client-Secret': provider.clientSecret,
      'X-Ibm-Consumer-Context': 'admin',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: `{"client_id":"${provider.clientId}","client_secret":"${provider.clientSecret}","grant_type":"password","password":"${provider.password}","realm":"${provider.realm}","username":"${provider.username}"}`,
  });

  if (tokenResponse.ok) {
    const token_json: APICAccessToken = await tokenResponse.json();
    provider.tmpToken = token_json.access_token;
    return Ok(token_json.access_token);
  } else if (tokenResponse.status == 401) {
    await delay(1000);
    provider.tmpToken = "";
    return issueToken(provider)
  }
  return Err(`Received HTTP response status code: ${tokenResponse.status}`);
}

export async function safeFetch(
  url: RequestInfo,
  provider: APICProviderConfig,
  fieldsToReturn: Option<string[]> = None,
  logger: winston.Logger,
  init?: RequestInit,
): Promise<Result<Response, string>> {
  const token = await issueToken(provider);
  let currentUrl = url;
  let localInit = init;
  if (localInit === undefined) {
    localInit = {
      headers: {},
    };
  }
  localInit.agent = httpsAgent;
  localInit.headers = {
    'User-Agent': 'backstage-apic-plugin',
    // 'X-Ibm-Client-Id': provider.clientId!,
    // 'X-Ibm-Client-Secret': provider.clientSecret!,
    "Authorization": `Bearer ${token.unwrap()}`,
    'X-Ibm-Consumer-Context': 'admin',
    "Accept": 'application/json',
    "Content-Type": 'application/json',
    ...localInit.headers,
  };
  if (fieldsToReturn.isSome()) {
    currentUrl += `?fields=${fieldsToReturn.unwrap().join(',')}`;
  }
  logger.info(`Performing request to '${currentUrl}'`);
  const response = await fetch(currentUrl, localInit);
  if (response.ok) {
    return Ok(response);
  } else if(response.status == 401) {
    await delay(1000);
    logger.warn(`Got 401, retrying...`)
    provider.tmpToken = "";
    return safeFetch(url, provider, fieldsToReturn, logger)
  }
  return Err(`${response.statusText} ${await response.text()}`);
}
export async function fetchOrganisations(
  provider: APICProviderConfig,
  logger: winston.Logger,
): Promise<DomainEntity[]> {
  logger.info('Fetching organisations...');
  const response = await safeFetch(
    `${provider.baseUrl}/${ORGANISATIONS_API_PART}`,
    provider,
    None,
    logger,
  );

  if (response.isErr()) {
    logger.error(`${ORGANISATIONS_API_PART}: ${response.unwrapErr()}`);
    return [];
  }

  const orgList: APICResponse<APICOrg> = await response.unwrap().json();
  return orgList.results.map(parseOrganisation);
}

export async function fetchCatalogs(
  provider: APICProviderConfig,
  logger: winston.Logger,
  cache: CacheService,
  catalogId: Option<string>,
): Promise<SystemEntity[]> {
  logger.info('Fetching catalogs...');
  let url = `${provider.baseUrl}/${CATALOGS_API_PART}`;
  if (catalogId.isSome()) {
    url += `/${catalogId}`;
  }
  const response = await safeFetch(url, provider, None, logger);

  if (response.isErr()) {
    logger.error(`${CATALOGS_API_PART}: ${response.unwrapErr()}`);
    return [];
  }

  const orgList: APICResponse<APICCatalog> = await response.unwrap().json();
  for (const value of orgList.results) {
    await cache.set(value.url, `system:default/${value.name}`)
  }
  return orgList.results.map(parseCatalog);
}
export async function fetchMembers(
  organisations: DomainEntity[],
  provider: APICProviderConfig,
  logger: winston.Logger,
): Promise<UserEntity[]> {
  logger.info('Fetching members...');
  const users: UserEntity[] = [];
  for (const org of organisations) {
    const response = await safeFetch(
      `${provider.baseUrl}/orgs/${org.metadata.name}/${MEMBERS_API_PART}`,
      provider,
      None,
      logger,
    );

    if (response.isErr()) {
      logger.error(`${MEMBERS_API_PART}: ${response.unwrapErr()}`);
      return [];
    }

    const entityList: APICResponse<APICMember> = await response.unwrap().json();
    users.push(
      ...entityList.results.map(entity => {
        const user = parseUser(entity);
        user.metadata.namespace = 'default';
        return user;
      }),
    );
  }
  return users;
}

export async function fetchConsumerOrgs(
  organisations: DomainEntity[],
  provider: APICProviderConfig,
  logger: winston.Logger,
): Promise<GroupEntity[]> {
  logger.info('Fetching consumer organisations...');
  const groups: GroupEntity[] = [];
  for (const org of organisations) {
    const catalogsResponse = await safeFetch(
      `${provider.baseUrl}/${CATALOGS_API_PART}`,
      provider,
      Some(['id', 'name']),
      logger,
    );
    if (catalogsResponse.isErr()) {
      continue;
    }

    const catalogList: APICResponse<APICCatalog> = await catalogsResponse
      .unwrap()
      .json();

    for (const catalog of catalogList.results) {
      const response = await safeFetch(
        `${provider.baseUrl}/catalogs/${org.metadata.name}/${catalog.name}/${CONSUMER_ORGS_API_PART}`,
        provider,
        None,
        logger,
      );

      if (response.isErr()) {
        logger.error(`${CONSUMER_ORGS_API_PART}: ${response.unwrapErr()}`);
        return [];
      }

      const entityList: APICResponse<APICOrg> = await response.unwrap().json();

      const consumerOrgs = [];
      for (const consumerOrgResponse of entityList.results) {
        const consumerOrg = parseConsumerOrg(consumerOrgResponse);
        consumerOrg.metadata.namespace = catalog.name;
        const consumerOrgMembersResponse = await safeFetch(
          `${provider.baseUrl}/${CONSUMER_ORGS_API_PART}/${org.metadata.name}/${catalog.name}/${consumerOrgResponse.id}/members`,
          provider,
          Some(['user.name']),
          logger,
        );
        if (consumerOrgMembersResponse.ok()) {
          const consumerOrgMembers: APICResponse<APICMember> =
            await consumerOrgMembersResponse.unwrap().json();
          consumerOrg.spec.members = consumerOrgMembers.results.flatMap(
            value => {
              return `default/${value.user.name}`;
            },
          );
        }
        consumerOrgs.push(consumerOrg);
      }

      groups.push(...consumerOrgs);
    }
  }
  return groups;
}

export async function fetchProducts(
  provider: APICProviderConfig,
  logger: winston.Logger,
  organisationId: string,
  catalogId: string,
  productId: Option<string> = None,
): Promise<ProductEntity[]> {
  logger.info(
    `Fetching products for organisation(${organisationId}) and catalog(${catalogId})...`,
  );
  let url = `${provider.baseUrl}/${CATALOGS_API_PART}/${organisationId}/${catalogId}/${PRODUCTS_API_PART}`;
  if (productId.isSome()) {
    url += `/${productId}`;
  }
  const response = await safeFetch(url, provider, None, logger);

  if (response.isErr()) {
    logger.error(`${CATALOGS_API_PART}: ${response.unwrapErr()}`);
    return [];
  }

  const list: APICResponse<APICProduct> = await response.unwrap().json();
  return list.results.map(product => {
    const productEntity = parseProduct(product);
    productEntity.metadata.namespace = catalogId;
    productEntity.spec.owner = `system:default/${catalogId}`;
    if (product.plans !== undefined) {
      productEntity.spec.providesApis = product.plans.flatMap(p => {
        return p.apis.map(
          a => `${productEntity.metadata.namespace}/${a.name}_${a.version}`,
        );
      });
    }
    return productEntity;
  });
}
export async function fetchAPIs(
  provider: APICProviderConfig,
  logger: winston.Logger,
  organisationId: string,
  catalogId: string,
): Promise<ApiEntity[]> {
  logger.info(
    `Fetching APIs for organisation(${organisationId}) and catalog(${catalogId})...`,
  );

  let url = `${provider.baseUrl}/${CATALOGS_API_PART}/${organisationId}/${catalogId}/${APIS_API_PART}`;

  const response = await safeFetch(url, provider, None, logger);

  if (response.isErr()) {
    logger.error(`${APIS_API_PART}: ${response.unwrapErr()}`);
    return [];
  }

  const list: APICResponse<APICAPI> = await response.unwrap().json();
  const result = list.results.map(api => {
    const apiEntity = parseAPI(api);
    apiEntity.metadata.namespace = catalogId;
    apiEntity.metadata.annotations = {
      [ANNOTATION_SOURCE_LOCATION]: api.url,
    };
    apiEntity.spec.owner = `system:default/${catalogId}`;
    apiEntity.spec.system = `default/${catalogId}`;
    return apiEntity;
  });
  for (const api of result) {
    if (api.spec.type !== undefined && api.spec.type.startsWith('openapi')) {
      try {
        const docsUrl = api.metadata.annotations![ANNOTATION_SOURCE_LOCATION];
        const docResponse = await safeFetch(
          `${docsUrl}/document`,
          provider,
          None,
          logger,
        );
        if (docResponse.ok()) {
          api.spec.definition = await docResponse.unwrap().text();
        }
      } catch (e) {
        logger.warn(
          `Received error while fetching API spec for api(${api.metadata.id})`,
        );
      }
    }
  }
  return result;
}

export async function fetchApplications(
  provider: APICProviderConfig,
  logger: winston.Logger,
  cache: CacheService,
  organisationId: string,
  catalogId: string,
  consumerOrgId: Option<string> = None,
): Promise<ComponentEntity[]> {
  let url = `${provider.baseUrl}/${CATALOGS_API_PART}/${organisationId}/${catalogId}`;

  if (consumerOrgId.isSome()) {
    url = `${provider.baseUrl}/${CONSUMER_ORGS_API_PART}/${organisationId}/${catalogId}/${consumerOrgId.unwrap()}/${APPS_API_PART}`
    logger.info(
        `Fetching applications for organisation(${organisationId}) catalog(${catalogId}) and consumerOrg(${consumerOrgId.unwrap()})...`,
    );
  } else {
    url = `${url}/${APPS_API_PART}`
    logger.info(
        `Fetching applications for organisation(${organisationId}) and catalog(${catalogId})...`,
    );
  }

  const response = await safeFetch(url, provider, None, logger);

  if (response.isErr()) {
    logger.error(`${APPS_API_PART}: ${response.unwrapErr()}`);
    return [];
  }

  const list: APICResponse<APICApplication> = await response.unwrap().json();

  let entities: ComponentEntity[] = [];

  for (const application of list.results) {
    let catalogRef = await cache.get(application.catalog_url) as string;
    const entity = parseApplication(application);
    entity.metadata.namespace = catalogId;
    entity.spec.system = catalogRef;
    entity.spec.subcomponentOf = catalogRef;
    entities.push(entity)
  }
  return entities;
}

export async function fetchApplicationCredentials(
  provider: APICProviderConfig,
  logger: winston.Logger,
  organisationId: string,
  catalogId: string,
  applications: Option<ComponentEntity[]> = None,
): Promise<ComponentEntity[]> {
  logger.info(
    `Fetching application credentials for organisation(${organisationId}) and catalog(${catalogId})...`,
  );
  const url = `${provider.baseUrl}/${CATALOGS_API_PART}/${organisationId}/${catalogId}/${CREDENTIALS_API_PART}`;
  const response = await safeFetch(url, provider, None, logger);

  if (response.isErr()) {
    logger.error(`${APPS_API_PART}: ${response.unwrapErr()}`);
    return [];
  }

  const list: APICResponse<APICApplicationCredential> = await response
    .unwrap()
    .json();

  let applicationsIdNames = new Map<
    string,
    { name: string; namespace: string }
  >();
  if (applications.isSome()) {
    applicationsIdNames = entityListToIdValueMap(applications.unwrap());
  }

  return list.results.map(application => {
    const entity = parseApplicationCredential(application);
    entity.metadata.namespace = catalogId;
    entity.spec.system = `system:default/${catalogId}`;
    if (applications.isSome()) {
      const targetApplication = applicationsIdNames.get(
        entity.metadata.annotations![ANNOTATION_APIC_APPLICATIONID],
      );
      entity.spec.subcomponentOf = `component:${targetApplication!.namespace}/${
        targetApplication!.name
      }`;
    }
    return entity;
  });
}

export async function fetchSubscriptions(
  provider: APICProviderConfig,
  logger: winston.Logger,
  organisationId: string,
  catalogId: string,
  products: Option<ComponentEntity[]> = None,
): Promise<ComponentEntity[]> {
  logger.info(
    `Fetching subscriptions for organisation(${organisationId}) and catalog(${catalogId})...`,
  );
  // const organisationResponse = await fetchOneAndParse<APICOrg>(`${provider.baseUrl}/${ORGANISATIONS_API_PART}/${organisationId}`, provider, logger);
  //
  // if (organisationResponse.isNone()) {
  //   return []
  // }
  const url = `${provider.baseUrl}/${CATALOGS_API_PART}/${organisationId}/${catalogId}/${SUBSCRIPTIONS_API_PART}`;
  const response = await safeFetch(url, provider, None, logger);

  if (response.isErr()) {
    logger.error(`${SUBSCRIPTIONS_API_PART}: ${response.unwrapErr()}`);
    return [];
  }

  const list: APICResponse<APICSubscription> = await response.unwrap().json();
  return list.results.map(subscription => {
    const entity = parseSubscription(subscription);
    entity.metadata.namespace = catalogId;
    entity.spec.system = `system:default/${catalogId}`;
    if (products.isSome()) {
      entity.spec.consumesApis = products
        .unwrap()
        .find(f => f.metadata.id === lastPathPartAsId(subscription.product_url))
        ?.spec.providesApis;
    }
    return entity;
  });
}

export async function fetchOneAndParse<T>(url: string, provider: APICProviderConfig, logger: Logger): Promise<Option<Entity>> {
  const response = await safeFetch(url, provider, None, logger);

  if (response.isErr()) {
    logger.error(`${SUBSCRIPTIONS_API_PART}: ${response.unwrapErr()}`);
    return None;
  }

  const result: T = await response.unwrap().json();
  if (result !== undefined) {
    switch (result!.constructor) {
      case APICOrg: return Some(parseOrganisation(result as APICOrg));
      case APICCatalog: return Some(parseCatalog(result as APICCatalog));
      case APICProduct: return Some(parseProduct(result as APICProduct));
      case APICAPI: return Some(parseAPI(result as APICAPI));
      case APICUser: return Some(parseUser(result as APICMember));
      case APICApplication: return Some(parseApplication(result as APICApplication));
      case APICSubscription: return Some(parseSubscription(result as APICSubscription));
      case APICApplicationCredential: return Some(parseApplicationCredential(result as APICApplicationCredential));
      default: return None;
    }
  } else {
    return None
  }
}
export async function fetchNameByUrl(url: string, provider: APICProviderConfig, logger: Logger, cache: CacheService): Promise<string> {
  let cacheName = `refByUrl:${url}`;
  let ref =  await cache.get(cacheName) as string;
  if (ref) {
    return ref;
  }
  const response = await safeFetch(url, provider, Some(['name']), logger);

  if (response.isErr()) {
    logger.error(`fetchOneEntityRef: ${response.unwrapErr()}`);
    return "";
  }

  const result = await response.unwrap().text();
  await cache.set(cacheName, result)
  return result;
}