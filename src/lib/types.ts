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

import {Entity} from "@backstage/catalog-model";

export class APICAccessToken {
  access_token!: string;
}
export class APICResponse<RESULT_TYPE> {
  results!: RESULT_TYPE[];
}

export class APICProductPlan {
  apis!: APICAPI[];
  name!: string;
  title?: string;
}

export class APICEnabledType {
  type!: string;
  enabled!: boolean;
}

class APICProductVisibility {
  view?: APICEnabledType;
  subscribe?: APICEnabledType;
}

export class APICProduct {
  type!: string;
  api_version!: string;
  id!: string;
  name!: string;
  version!: string;
  title?: string;
  state!: string;
  scope!: string;
  gateway_types?: string[];
  gateway_service_urls?: string[];
  visibility?: APICProductVisibility;
  api_urls?: string[];
  apiList?: APICAPI[];
  plans?: APICProductPlan[];
  oauth_provider_urls?: string[];
  billing_urls?: string[];
  org_url!: string;
  catalog_url!: string;
  url!: string;
}

export interface ProductEntity extends Entity {
  apiVersion: 'croz.net/v1alpha1';
  kind: 'Product';
  spec: {
    type: string;
    lifecycle: string;
    owner: string;
    subcomponentOf?: string;
    providesApis?: string[];
    consumesApis?: string[];
    dependsOn?: string[];
    system?: string;
    plans: {
      name: string,
      title: string,
      apis: {
        id: string,
        url: string,
        name: string,
        title: string,
        version: string,
      }[]
    }[]
  };
}

export class APICCatalog {
  type!: string;
  api_version!: string;
  id!: string;
  name!: string;
  title?: string;
  owner_url!: string;
  created_at!: string;
  updated_at!: string;
  org_url!: string;
  url!: string;
}

export class APICAPI {
  api_type?: string;
  api_version?: string;
  id?: string;
  name?: string;
  version?: string;
  title?: string;
  state?: string;
  scope?: string;
  gateway_type?: string;
  oai_version?: string;
  document_specification?: string;
  base_paths?: string[];
  enforced?: boolean;
  gateway_service_urls?: string[];
  user_registry_urls?: string[];
  oauth_provider_urls?: string[];
  tls_client_profile_urls?: string[];
  extension_urls?: string[];
  policy_urls?: string[];
  created_at?: string;
  updated_at?: string;
  org_url!: string;
  catalog_url!: string;
  url!: string;
}

export class APICOrg {
  org_type!: string;
  api_version!: string;
  id!: string;
  name!: string;
  title?: string;
  state!: string;
  owner_url!: string;
  created_at!: string;
  updated_at!: string;
  org_url!: string;
  catalog_url!: string;
  url!: string;
}

export class APICUser {
  id!: string;
  url?: string;
  name?: string;
  type?: string;
  email!: string;
  state?: string;
  title?: string;
  org_url?: string;
  username?: string;
  last_name?: string;
  first_name?: string;
  api_version?: string;
  identity_provider?: string;
  user_registry_url?: string;
}
export class APICMember {
  id?: string;
  name?: string;
  title?: string;
  state?: string;
  scope?: string;
  user!: APICUser;
  role_urls?: string[];
  created_at?: string;
  updated_at?: string;
  org_url?: string;
  url?: string;
}

export class APICApplication {
  type!: string;
  api_version!: string;
  id!: string;
  name!: string;
  title!: string;
  summary?: string;
  state!: string;
  lifecycle_state!: string;
  app_credential_urls?: string[];
  image_endpoint?: string;
  created_at?: string;
  updated_at?: string;
  org_url!: string;
  catalog_url!: string;
  consumer_org_url?: string;
  url!: string;
}

export class APICApplicationCredential {
  type!: string;
  api_version!: string;
  id!: string;
  name!: string;
  title!: string;
  summary!: string;
  client_id!: string;
  client_secret_hashed!: string;
  client_secret!: string;
  created_at!: string;
  updated_at!: string;
  org_url!: string;
  catalog_url!: string;
  consumer_org_url!: string;
  app_url!: string;
  url!: string;
}

export class APICSubscription {
  type!: string;
  api_version!: string;
  id!: string;
  name!: string;
  title!: string;
  state!: string;
  product_url!: string;
  plan!: string;
  plan_title!: string;
  task_urls?: string[];
  created_at!: string;
  updated_at!: string;
  org_url!: string;
  catalog_url!: string;
  consumer_org_url!: string;
  app_url!: string;
  url!: string;
}
