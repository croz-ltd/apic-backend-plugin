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
  DomainEntity,
  Entity,
  GroupEntity, isApiEntity, isComponentEntity, isGroupEntity, isSystemEntity,
  SystemEntity,
  UserEntity,
} from '@backstage/catalog-model';

import { None, Option } from '@sniptt/monads';

import {
  ANNOTATION_APIC_APPLICATIONID,
  ANNOTATION_APIC_CATALOGID,
  ANNOTATION_APIC_CONSUMERORGID,
  ANNOTATION_APIC_CREDENTIAL_CLIENTID,
  ANNOTATION_APIC_ORGID,
  ANNOTATION_APIC_PRODUCTID,
  ANNOTATION_APIC_SUBSCRIPTION_PLAN,
  ANNOTATION_APIC_USERID,
  COMPONENT_TYPE_APPLICATION,
  COMPONENT_TYPE_CREDENTIAL,
  COMPONENT_TYPE_PRODUCT,
  COMPONENT_TYPE_SUBSCRIPTION,
  GROUP_TYPE_CONSUMER_ORG,
} from './constants';
import {
  APICAPI,
  APICApplication,
  APICApplicationCredential,
  APICCatalog,
  APICMember,
  APICOrg,
  APICProduct,
  APICSubscription, ProductEntity,
} from './types';

export function lastPathPartAsId(url: string) {
  const lastSlash = url?.lastIndexOf('/')!;
  return url?.slice(lastSlash + 1, url?.length);
}

export function parseOrganisation(org: APICOrg): DomainEntity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Domain',
    metadata: {
      id: org.id,
      name: org.name,
      title: org.title,
      uid: org.id,
      annotations: {
        [ANNOTATION_SOURCE_LOCATION]: `apic:${org.url}`,
      }
    },
    spec: {
      owner: `default/${lastPathPartAsId(org.owner_url ?? '')}`,
    },
  } as DomainEntity;
}

export function parseCatalog(catalog: APICCatalog): SystemEntity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'System',
    metadata: {
      name: catalog.name,
      title: catalog.title,
      id: catalog.id,
      description: 'Catalog',
      annotations: {
        [ANNOTATION_APIC_ORGID]: lastPathPartAsId(catalog.org_url),
        [ANNOTATION_SOURCE_LOCATION]: `apic:${catalog.url}`,
      },
    },
    spec: {
      owner: `default/${lastPathPartAsId(catalog.owner_url ?? '')}`, // placeholder
      domain: lastPathPartAsId(catalog.org_url), // placeholder
    },
  } as SystemEntity;
}

export function parseProduct(product: APICProduct): ProductEntity {
  return {
    apiVersion: 'croz.net/v1alpha1',
    kind: 'Product',
    metadata: {
      id: product.id,
      name: `product.${product.name}`,
      title: product.title,
      description: 'Some description',
      annotations: {
        [ANNOTATION_APIC_ORGID]: lastPathPartAsId(product.org_url),
        [ANNOTATION_APIC_CATALOGID]: lastPathPartAsId(product.catalog_url),
        [ANNOTATION_SOURCE_LOCATION]: `apic:${product.url}`,
      },
    },
    spec: {
      type: COMPONENT_TYPE_PRODUCT,
      lifecycle: product.state,
      owner: '',
      plans: product.plans?.map(p => {
        return p
      })
    },
  } as ProductEntity;
}

export function parseApplication(app: APICApplication): ComponentEntity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      id: app.id,
      name: app.name,
      title: app.title,
      description: app.summary,
      annotations: {
        [ANNOTATION_APIC_CATALOGID]: lastPathPartAsId(app.catalog_url),
        [ANNOTATION_APIC_ORGID]: lastPathPartAsId(app.org_url),
        [ANNOTATION_APIC_CONSUMERORGID]: lastPathPartAsId(
          app.consumer_org_url || '',
        ),
        [ANNOTATION_SOURCE_LOCATION]: `apic:${app.url}`,
      },
    },
    spec: {
      type: COMPONENT_TYPE_APPLICATION,
      lifecycle: app.lifecycle_state,
      owner: 'catalog:n/a', // placeholder
      // subcomponentOf: `${catalog.name}/${lastPathPartAsId(pro.)}`
      system: 'catalog:n/a', // placeholder
    },
  } as ComponentEntity;
}

function resolveApiType(document_specification: string | undefined) {
  if (document_specification?.startsWith('openapi')) {
    return 'openapi';
  }
  return '';
}

export function parseAPI(api: APICAPI): ApiEntity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'API',
    metadata: {
      name: `${api.name}_${api.version}`,
      title: `${api.title} ${api.version}`,
      description: api.name,
      annotations: {
        [ANNOTATION_APIC_CATALOGID]: lastPathPartAsId(api.catalog_url),
        [ANNOTATION_APIC_ORGID]: lastPathPartAsId(api.org_url),
        [ANNOTATION_SOURCE_LOCATION]: `apic:${api.url}`,
      }
    },
    spec: {
      type: resolveApiType(api.document_specification),
      lifecycle: api.state,
      owner: 'n/a', // `component:${catalog.name}/${product.name}`
      definition: 'string',
      // system?: "string",
    },
  } as ApiEntity;
}

export function parseSubscription(
  subscription: APICSubscription,
): ComponentEntity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      id: subscription.id,
      name: subscription.name,
      title: subscription.title,
      description: `Plan: ${subscription.plan_title}`,
      annotations: {
        [ANNOTATION_APIC_CATALOGID]: lastPathPartAsId(subscription.catalog_url),
        [ANNOTATION_APIC_ORGID]: lastPathPartAsId(subscription.org_url),
        [ANNOTATION_APIC_CONSUMERORGID]: lastPathPartAsId(
          subscription.consumer_org_url || '',
        ),
        [ANNOTATION_APIC_PRODUCTID]: lastPathPartAsId(subscription.product_url),
        [ANNOTATION_APIC_APPLICATIONID]: lastPathPartAsId(subscription.app_url),
        [ANNOTATION_APIC_SUBSCRIPTION_PLAN]: subscription.plan,
        [ANNOTATION_SOURCE_LOCATION]: `apic:${subscription.url}`,
      },
    },
    spec: {
      type: COMPONENT_TYPE_SUBSCRIPTION,
      lifecycle: subscription.plan,
      owner: 'catalog:n/a', // placeholder
      // subcomponentOf: `${catalog.name}/${lastPathPartAsId(pro.)}`
      system: 'catalog:n/a', // placeholder
    },
  } as ComponentEntity;
}

export function parseUser(member: APICMember): UserEntity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'User',
    metadata: {
      id: member.id,
      name: member.user.username,
      title: member.title,
      annotations: {
        [ANNOTATION_APIC_USERID]: member.user.id,
        [ANNOTATION_SOURCE_LOCATION]: `apic:${member.url}`,
      },
    },
    spec: {
      profile: {
        displayName: member.title,
        email: member.user.email,
        picture: 'n/a',
      },
      memberOf: ['croz'],
    },
  } as UserEntity;
}

export function parseConsumerOrg(consumerOrg: APICOrg): GroupEntity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Group',
    metadata: {
      name: consumerOrg.name,
      id: consumerOrg.id,
      title: consumerOrg.title,
      annotations: {
        [ANNOTATION_APIC_ORGID]: lastPathPartAsId(consumerOrg.org_url),
        [ANNOTATION_APIC_CATALOGID]: lastPathPartAsId(consumerOrg.catalog_url),
      },
    },
    spec: {
      type: GROUP_TYPE_CONSUMER_ORG,
      profile: {
        displayName: consumerOrg.title,
        email: 'n/a',
        picture: 'https://example.com/groups/bu-infrastructure.jpeg',
      },
      children: [],
    },
  } as GroupEntity;
}

export function connectCatalogsToOrgs(
  catalogs: SystemEntity[],
  orgs: DomainEntity[],
) {
  orgs.forEach(org => {
    catalogs.forEach(catalog => {
      if (catalog.spec.domain === org.metadata.uid) {
        catalog.spec.domain = `${org.metadata.namespace || 'default'}/${
          org.metadata.name
        }`;
      }
    });
  });
}

export function connectCatalogsToOwners(
  catalogs: SystemEntity[],
  users: UserEntity[],
) {
  catalogs.forEach(catalog => {
    users.forEach(user => {
      const owner = catalog.spec.owner;
      const metadata = user.metadata!;
      const annotations = metadata.annotations!;
      const annotation = annotations[ANNOTATION_APIC_USERID];
      if (owner !== undefined && owner.endsWith(`/${annotation}`)) {
        catalog.spec.owner = `user:${
          catalog.metadata!.namespace || 'default'
        }/${metadata.name}`;
      }
    });
  });
}

export function connectComponentToOrganisationsAndProducts(
  newApps: ComponentEntity[],
  organisations: GroupEntity[],
  products: Option<ComponentEntity[]> = None,
) {
  const orgIdNames = entityListToIdValueMap(organisations);
  let productIdNames = new Map<string, { name: string; namespace: string }>();
  if (products.isSome()) {
    productIdNames = entityListToIdValueMap(products.unwrap());
  }
  for (const newComponent of newApps) {
    const orgId =
      newComponent.metadata.annotations![ANNOTATION_APIC_CONSUMERORGID];
    const org = orgIdNames.get(orgId) as { name: string; namespace: string };
    if (!org) {
      continue;
    }
    newComponent.spec.owner = `group:${org!.namespace}/${org!.name}`;
    if (products.isSome()) {
      const productId =
        newComponent.metadata.annotations![ANNOTATION_APIC_PRODUCTID];
      const product = productIdNames.get(productId) as {
        name: string;
        namespace: string;
      };
      if (products) {
        newComponent.spec.subcomponentOf = `component:${product!.namespace}/${
            product!.name
        }`;
      }
    }
  }
}

export function connectSubscriptionsToApplications(subscriptions: ComponentEntity[], applications: ComponentEntity[]) {
  let idValueMap = entityListToIdValueMap(applications);
  for (const subscription of subscriptions) {
    const application = idValueMap.get(subscription.metadata.annotations![ANNOTATION_APIC_APPLICATIONID])!;
    subscription.spec.subcomponentOf = `component:${application.namespace}/${application.name}`
  }
}

export function parseApplicationCredential(
  app: APICApplicationCredential,
): ComponentEntity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      id: app.id,
      name: app.name,
      title: app.title,
      description: `${app.summary || ''} ClientId: ${app.client_id}`,
      annotations: {
        [ANNOTATION_APIC_CATALOGID]: lastPathPartAsId(app.catalog_url),
        [ANNOTATION_APIC_ORGID]: lastPathPartAsId(app.org_url),
        [ANNOTATION_APIC_APPLICATIONID]: lastPathPartAsId(app.app_url),
        [ANNOTATION_APIC_CONSUMERORGID]: lastPathPartAsId(
          app.consumer_org_url || '',
        ),
        [ANNOTATION_APIC_CREDENTIAL_CLIENTID]: app.client_id,
        [ANNOTATION_SOURCE_LOCATION]: `apic:${app.url}`,
      },
    },
    spec: {
      type: COMPONENT_TYPE_CREDENTIAL,
      lifecycle: 'active',
      owner: 'catalog:n/a', // placeholder
      // subcomponentOf: `${catalog.name}/${lastPathPartAsId(pro.)}`
      system: 'catalog:n/a', // placeholder
    },
  } as ComponentEntity;
}

export function entityListToIdValueMap(
  entities: Entity[],
): Map<string, { name: string; namespace: string }> {
  let entitiesIdNames: Map<string, { name: string; namespace: string }> =
    new Map<string, { name: string; namespace: string }>();
  if (entities) {
    entitiesIdNames = new Map(
      entities.map(entity => {
        const id = entity.metadata.id! as string;
        return [
          id,
          {
            name: entity.metadata.name,
            namespace: entity.metadata.namespace || 'default',
          },
        ];
      }),
    );
  }
  return entitiesIdNames;
}

export function isCatalogType(entity: Entity) {
  if (isSystemEntity(entity)) {
    let annotations = entity.metadata.annotations;
    if (annotations !== undefined) {
      return annotations[ANNOTATION_APIC_ORGID] !== undefined
    } else {
      return false
    }
  } else {
    return false
  }
}

export function isOrganisationType(entity: Entity) {
  if (isComponentEntity(entity)) {
    let annotations = entity.metadata.annotations;
    if (annotations !== undefined) {
      return annotations[ANNOTATION_APIC_ORGID] !== undefined && entity.spec.type === ""
    } else {
      return false
    }
  } else {
    return false
  }
}

export function isProductType(entity: Entity) {
  if (entity.kind === "Product") {
    let annotations = entity.metadata.annotations;
    if (annotations !== undefined) {
      return annotations[ANNOTATION_APIC_ORGID] !== undefined
    } else {
      return false
    }
  } else {
    return false
  }
}

export function isAPIType(entity: Entity) {
  if (isApiEntity(entity)) {
    let annotations = entity.metadata.annotations;
    if (annotations !== undefined) {
      const sourceLocation = entity.metadata.annotations![ANNOTATION_SOURCE_LOCATION];
      return annotations[ANNOTATION_APIC_ORGID] !== undefined && sourceLocation?.startsWith("apic");
    } else {
      return false
    }
  } else {
    return false
  }
}

export function isCustomerOrganisationType(entity: Entity) {
  return isGroupEntity(entity) && entity.spec.type === GROUP_TYPE_CONSUMER_ORG
}

export function isApplicationType(entity: Entity) {
  return isComponentEntity(entity) && entity.spec.type === COMPONENT_TYPE_APPLICATION
}

export function isSubscriptionType(entity: Entity) {
  return isComponentEntity(entity) && entity.spec.type === COMPONENT_TYPE_SUBSCRIPTION
}

export function isCredentialType(entity: Entity) {
  return isComponentEntity(entity) && entity.spec.type === COMPONENT_TYPE_CREDENTIAL
}