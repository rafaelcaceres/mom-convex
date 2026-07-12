/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _shared__libs_aggregate from "../_shared/_libs/aggregate.js";
import type * as _shared__libs_base64 from "../_shared/_libs/base64.js";
import type * as _shared__libs_crypto from "../_shared/_libs/crypto.js";
import type * as _shared__libs_repository from "../_shared/_libs/repository.js";
import type * as _shared_types_channelMessage from "../_shared/types/channelMessage.js";
import type * as _triggers from "../_triggers.js";
import type * as agentRunner_actions_handleIncoming from "../agentRunner/actions/handleIncoming.js";
import type * as agents__libs_agentFactory from "../agents/_libs/agentFactory.js";
import type * as agents__libs_mcpTools from "../agents/_libs/mcpTools.js";
import type * as agents__libs_providerOptions from "../agents/_libs/providerOptions.js";
import type * as agents__libs_supportedModels from "../agents/_libs/supportedModels.js";
import type * as agents__libs_systemPrompt from "../agents/_libs/systemPrompt.js";
import type * as agents__tables from "../agents/_tables.js";
import type * as agents_adapters_threadBridge from "../agents/adapters/threadBridge.js";
import type * as agents_mutations_createAgent from "../agents/mutations/createAgent.js";
import type * as agents_mutations_setAgentModel from "../agents/mutations/setAgentModel.js";
import type * as agents_mutations_setDefault from "../agents/mutations/setDefault.js";
import type * as agents_mutations_updateAgent from "../agents/mutations/updateAgent.js";
import type * as agents_mutations_updateSystemPrompt from "../agents/mutations/updateSystemPrompt.js";
import type * as agents_queries_getById from "../agents/queries/getById.js";
import type * as agents_queries_getByIdInternal from "../agents/queries/getByIdInternal.js";
import type * as agents_queries_getDefault from "../agents/queries/getDefault.js";
import type * as agents_queries_getDefaultInternal from "../agents/queries/getDefaultInternal.js";
import type * as agents_queries_listByOrg from "../agents/queries/listByOrg.js";
import type * as agents_queries_resolveSenderInternal from "../agents/queries/resolveSenderInternal.js";
import type * as auth from "../auth.js";
import type * as authz from "../authz.js";
import type * as cost__libs_modelPrices from "../cost/_libs/modelPrices.js";
import type * as cost__libs_priceFromUsage from "../cost/_libs/priceFromUsage.js";
import type * as cost__tables from "../cost/_tables.js";
import type * as cost_mutations_record from "../cost/mutations/record.js";
import type * as cost_queries_byThread from "../cost/queries/byThread.js";
import type * as crons from "../crons.js";
import type * as customFunctions from "../customFunctions.js";
import type * as http from "../http.js";
import type * as memory__tables from "../memory/_tables.js";
import type * as memory_mutations_deleteMemory from "../memory/mutations/deleteMemory.js";
import type * as memory_mutations_upsertMemory from "../memory/mutations/upsertMemory.js";
import type * as memory_queries_listAlwaysOn from "../memory/queries/listAlwaysOn.js";
import type * as memory_queries_listAlwaysOnInternal from "../memory/queries/listAlwaysOnInternal.js";
import type * as memory_queries_listForAgent from "../memory/queries/listForAgent.js";
import type * as memory_queries_listForThread from "../memory/queries/listForThread.js";
import type * as sandbox__libs_gc from "../sandbox/_libs/gc.js";
import type * as sandbox__libs_sandboxAccess from "../sandbox/_libs/sandboxAccess.js";
import type * as sandbox__libs_vercel from "../sandbox/_libs/vercel.js";
import type * as sandbox__tables from "../sandbox/_tables.js";
import type * as sandbox_actions_gc from "../sandbox/actions/gc.js";
import type * as sandbox_mutations_markDestroyedInternal from "../sandbox/mutations/markDestroyedInternal.js";
import type * as sandbox_mutations_markUsedInternal from "../sandbox/mutations/markUsedInternal.js";
import type * as sandbox_mutations_registerSandbox from "../sandbox/mutations/registerSandbox.js";
import type * as sandbox_queries_getByThreadInternal from "../sandbox/queries/getByThreadInternal.js";
import type * as sandbox_queries_listIdleInternal from "../sandbox/queries/listIdleInternal.js";
import type * as skills__libs_confirmationHeuristics from "../skills/_libs/confirmationHeuristics.js";
import type * as skills__libs_errorFormatting from "../skills/_libs/errorFormatting.js";
import type * as skills__libs_resolveTools from "../skills/_libs/resolveTools.js";
import type * as skills__libs_skillImpls from "../skills/_libs/skillImpls.js";
import type * as skills__libs_zodSerialize from "../skills/_libs/zodSerialize.js";
import type * as skills__seeds from "../skills/_seeds.js";
import type * as skills__tables from "../skills/_tables.js";
import type * as skills__triggers from "../skills/_triggers.js";
import type * as skills_actions_invoke from "../skills/actions/invoke.js";
import type * as skills_impls__stubs from "../skills/impls/_stubs.js";
import type * as skills_impls_httpFetch from "../skills/impls/httpFetch.js";
import type * as skills_impls_memorySearch from "../skills/impls/memorySearch.js";
import type * as skills_impls_sandboxBash from "../skills/impls/sandboxBash.js";
import type * as skills_impls_sandboxBrowse from "../skills/impls/sandboxBrowse.js";
import type * as skills_impls_sandboxRead from "../skills/impls/sandboxRead.js";
import type * as skills_impls_sandboxWrite from "../skills/impls/sandboxWrite.js";
import type * as skills_mutations_backfillBaselineSkills from "../skills/mutations/backfillBaselineSkills.js";
import type * as skills_mutations_seedCatalog from "../skills/mutations/seedCatalog.js";
import type * as skills_mutations_toggleSkill from "../skills/mutations/toggleSkill.js";
import type * as skills_queries_getCatalogByKeyInternal from "../skills/queries/getCatalogByKeyInternal.js";
import type * as skills_queries_listCatalogWithBindings from "../skills/queries/listCatalogWithBindings.js";
import type * as skills_queries_listForAgent from "../skills/queries/listForAgent.js";
import type * as skills_queries_listResolvedForAgentInternal from "../skills/queries/listResolvedForAgentInternal.js";
import type * as slack__libs_formatReasoningReply from "../slack/_libs/formatReasoningReply.js";
import type * as slack__libs_formatToolReply from "../slack/_libs/formatToolReply.js";
import type * as slack__libs_markdownToMrkdwn from "../slack/_libs/markdownToMrkdwn.js";
import type * as slack__libs_markdownToRichText from "../slack/_libs/markdownToRichText.js";
import type * as slack__libs_normalizeEvent from "../slack/_libs/normalizeEvent.js";
import type * as slack__libs_oauthState from "../slack/_libs/oauthState.js";
import type * as slack__libs_slackClient from "../slack/_libs/slackClient.js";
import type * as slack__libs_slackPainter from "../slack/_libs/slackPainter.js";
import type * as slack__libs_slackPoster from "../slack/_libs/slackPoster.js";
import type * as slack__libs_splitForSlack from "../slack/_libs/splitForSlack.js";
import type * as slack__libs_splitMrkdwn from "../slack/_libs/splitMrkdwn.js";
import type * as slack__libs_usersFetcher from "../slack/_libs/usersFetcher.js";
import type * as slack__libs_verifySignature from "../slack/_libs/verifySignature.js";
import type * as slack__tables from "../slack/_tables.js";
import type * as slack_actions_handleIncomingEvent from "../slack/actions/handleIncomingEvent.js";
import type * as slack_actions_postMessage from "../slack/actions/postMessage.js";
import type * as slack_actions_postOrUpdateMain from "../slack/actions/postOrUpdateMain.js";
import type * as slack_actions_postToolReply from "../slack/actions/postToolReply.js";
import type * as slack_actions_revokeToken from "../slack/actions/revokeToken.js";
import type * as slack_actions_syncAllInstallUsers from "../slack/actions/syncAllInstallUsers.js";
import type * as slack_actions_syncUsers from "../slack/actions/syncUsers.js";
import type * as slack_mutations_cleanExpiredDedupe from "../slack/mutations/cleanExpiredDedupe.js";
import type * as slack_mutations_createInstallUrl from "../slack/mutations/createInstallUrl.js";
import type * as slack_mutations_persistInstall from "../slack/mutations/persistInstall.js";
import type * as slack_mutations_recordOrSkipEvent from "../slack/mutations/recordOrSkipEvent.js";
import type * as slack_mutations_uninstall from "../slack/mutations/uninstall.js";
import type * as slack_mutations_upsertCachedUsers from "../slack/mutations/upsertCachedUsers.js";
import type * as slack_queries_getInstallById from "../slack/queries/getInstallById.js";
import type * as slack_queries_getUsersByTeam from "../slack/queries/getUsersByTeam.js";
import type * as slack_queries_listAllInstallIds from "../slack/queries/listAllInstallIds.js";
import type * as slack_queries_listInstallsByOrg from "../slack/queries/listInstallsByOrg.js";
import type * as slack_queries_resolveInstallByTeamId from "../slack/queries/resolveInstallByTeamId.js";
import type * as tenancy_mutations_completeOnboarding from "../tenancy/mutations/completeOnboarding.js";
import type * as tenants from "../tenants.js";
import type * as threads__tables from "../threads/_tables.js";
import type * as threads_mutations_ensureThread from "../threads/mutations/ensureThread.js";
import type * as threads_mutations_resetThread from "../threads/mutations/resetThread.js";
import type * as threads_mutations_setThreadParentTs from "../threads/mutations/setThreadParentTs.js";
import type * as threads_queries_getById from "../threads/queries/getById.js";
import type * as threads_queries_listByAgent from "../threads/queries/listByAgent.js";
import type * as webChat_mutations_createThread from "../webChat/mutations/createThread.js";
import type * as webChat_mutations_sendMessage from "../webChat/mutations/sendMessage.js";
import type * as webChat_queries_listMessages from "../webChat/queries/listMessages.js";
import type * as webChat_queries_listUIMessages from "../webChat/queries/listUIMessages.js";
import type * as webChat_queries_myThreads from "../webChat/queries/myThreads.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_shared/_libs/aggregate": typeof _shared__libs_aggregate;
  "_shared/_libs/base64": typeof _shared__libs_base64;
  "_shared/_libs/crypto": typeof _shared__libs_crypto;
  "_shared/_libs/repository": typeof _shared__libs_repository;
  "_shared/types/channelMessage": typeof _shared_types_channelMessage;
  _triggers: typeof _triggers;
  "agentRunner/actions/handleIncoming": typeof agentRunner_actions_handleIncoming;
  "agents/_libs/agentFactory": typeof agents__libs_agentFactory;
  "agents/_libs/mcpTools": typeof agents__libs_mcpTools;
  "agents/_libs/providerOptions": typeof agents__libs_providerOptions;
  "agents/_libs/supportedModels": typeof agents__libs_supportedModels;
  "agents/_libs/systemPrompt": typeof agents__libs_systemPrompt;
  "agents/_tables": typeof agents__tables;
  "agents/adapters/threadBridge": typeof agents_adapters_threadBridge;
  "agents/mutations/createAgent": typeof agents_mutations_createAgent;
  "agents/mutations/setAgentModel": typeof agents_mutations_setAgentModel;
  "agents/mutations/setDefault": typeof agents_mutations_setDefault;
  "agents/mutations/updateAgent": typeof agents_mutations_updateAgent;
  "agents/mutations/updateSystemPrompt": typeof agents_mutations_updateSystemPrompt;
  "agents/queries/getById": typeof agents_queries_getById;
  "agents/queries/getByIdInternal": typeof agents_queries_getByIdInternal;
  "agents/queries/getDefault": typeof agents_queries_getDefault;
  "agents/queries/getDefaultInternal": typeof agents_queries_getDefaultInternal;
  "agents/queries/listByOrg": typeof agents_queries_listByOrg;
  "agents/queries/resolveSenderInternal": typeof agents_queries_resolveSenderInternal;
  auth: typeof auth;
  authz: typeof authz;
  "cost/_libs/modelPrices": typeof cost__libs_modelPrices;
  "cost/_libs/priceFromUsage": typeof cost__libs_priceFromUsage;
  "cost/_tables": typeof cost__tables;
  "cost/mutations/record": typeof cost_mutations_record;
  "cost/queries/byThread": typeof cost_queries_byThread;
  crons: typeof crons;
  customFunctions: typeof customFunctions;
  http: typeof http;
  "memory/_tables": typeof memory__tables;
  "memory/mutations/deleteMemory": typeof memory_mutations_deleteMemory;
  "memory/mutations/upsertMemory": typeof memory_mutations_upsertMemory;
  "memory/queries/listAlwaysOn": typeof memory_queries_listAlwaysOn;
  "memory/queries/listAlwaysOnInternal": typeof memory_queries_listAlwaysOnInternal;
  "memory/queries/listForAgent": typeof memory_queries_listForAgent;
  "memory/queries/listForThread": typeof memory_queries_listForThread;
  "sandbox/_libs/gc": typeof sandbox__libs_gc;
  "sandbox/_libs/sandboxAccess": typeof sandbox__libs_sandboxAccess;
  "sandbox/_libs/vercel": typeof sandbox__libs_vercel;
  "sandbox/_tables": typeof sandbox__tables;
  "sandbox/actions/gc": typeof sandbox_actions_gc;
  "sandbox/mutations/markDestroyedInternal": typeof sandbox_mutations_markDestroyedInternal;
  "sandbox/mutations/markUsedInternal": typeof sandbox_mutations_markUsedInternal;
  "sandbox/mutations/registerSandbox": typeof sandbox_mutations_registerSandbox;
  "sandbox/queries/getByThreadInternal": typeof sandbox_queries_getByThreadInternal;
  "sandbox/queries/listIdleInternal": typeof sandbox_queries_listIdleInternal;
  "skills/_libs/confirmationHeuristics": typeof skills__libs_confirmationHeuristics;
  "skills/_libs/errorFormatting": typeof skills__libs_errorFormatting;
  "skills/_libs/resolveTools": typeof skills__libs_resolveTools;
  "skills/_libs/skillImpls": typeof skills__libs_skillImpls;
  "skills/_libs/zodSerialize": typeof skills__libs_zodSerialize;
  "skills/_seeds": typeof skills__seeds;
  "skills/_tables": typeof skills__tables;
  "skills/_triggers": typeof skills__triggers;
  "skills/actions/invoke": typeof skills_actions_invoke;
  "skills/impls/_stubs": typeof skills_impls__stubs;
  "skills/impls/httpFetch": typeof skills_impls_httpFetch;
  "skills/impls/memorySearch": typeof skills_impls_memorySearch;
  "skills/impls/sandboxBash": typeof skills_impls_sandboxBash;
  "skills/impls/sandboxBrowse": typeof skills_impls_sandboxBrowse;
  "skills/impls/sandboxRead": typeof skills_impls_sandboxRead;
  "skills/impls/sandboxWrite": typeof skills_impls_sandboxWrite;
  "skills/mutations/backfillBaselineSkills": typeof skills_mutations_backfillBaselineSkills;
  "skills/mutations/seedCatalog": typeof skills_mutations_seedCatalog;
  "skills/mutations/toggleSkill": typeof skills_mutations_toggleSkill;
  "skills/queries/getCatalogByKeyInternal": typeof skills_queries_getCatalogByKeyInternal;
  "skills/queries/listCatalogWithBindings": typeof skills_queries_listCatalogWithBindings;
  "skills/queries/listForAgent": typeof skills_queries_listForAgent;
  "skills/queries/listResolvedForAgentInternal": typeof skills_queries_listResolvedForAgentInternal;
  "slack/_libs/formatReasoningReply": typeof slack__libs_formatReasoningReply;
  "slack/_libs/formatToolReply": typeof slack__libs_formatToolReply;
  "slack/_libs/markdownToMrkdwn": typeof slack__libs_markdownToMrkdwn;
  "slack/_libs/markdownToRichText": typeof slack__libs_markdownToRichText;
  "slack/_libs/normalizeEvent": typeof slack__libs_normalizeEvent;
  "slack/_libs/oauthState": typeof slack__libs_oauthState;
  "slack/_libs/slackClient": typeof slack__libs_slackClient;
  "slack/_libs/slackPainter": typeof slack__libs_slackPainter;
  "slack/_libs/slackPoster": typeof slack__libs_slackPoster;
  "slack/_libs/splitForSlack": typeof slack__libs_splitForSlack;
  "slack/_libs/splitMrkdwn": typeof slack__libs_splitMrkdwn;
  "slack/_libs/usersFetcher": typeof slack__libs_usersFetcher;
  "slack/_libs/verifySignature": typeof slack__libs_verifySignature;
  "slack/_tables": typeof slack__tables;
  "slack/actions/handleIncomingEvent": typeof slack_actions_handleIncomingEvent;
  "slack/actions/postMessage": typeof slack_actions_postMessage;
  "slack/actions/postOrUpdateMain": typeof slack_actions_postOrUpdateMain;
  "slack/actions/postToolReply": typeof slack_actions_postToolReply;
  "slack/actions/revokeToken": typeof slack_actions_revokeToken;
  "slack/actions/syncAllInstallUsers": typeof slack_actions_syncAllInstallUsers;
  "slack/actions/syncUsers": typeof slack_actions_syncUsers;
  "slack/mutations/cleanExpiredDedupe": typeof slack_mutations_cleanExpiredDedupe;
  "slack/mutations/createInstallUrl": typeof slack_mutations_createInstallUrl;
  "slack/mutations/persistInstall": typeof slack_mutations_persistInstall;
  "slack/mutations/recordOrSkipEvent": typeof slack_mutations_recordOrSkipEvent;
  "slack/mutations/uninstall": typeof slack_mutations_uninstall;
  "slack/mutations/upsertCachedUsers": typeof slack_mutations_upsertCachedUsers;
  "slack/queries/getInstallById": typeof slack_queries_getInstallById;
  "slack/queries/getUsersByTeam": typeof slack_queries_getUsersByTeam;
  "slack/queries/listAllInstallIds": typeof slack_queries_listAllInstallIds;
  "slack/queries/listInstallsByOrg": typeof slack_queries_listInstallsByOrg;
  "slack/queries/resolveInstallByTeamId": typeof slack_queries_resolveInstallByTeamId;
  "tenancy/mutations/completeOnboarding": typeof tenancy_mutations_completeOnboarding;
  tenants: typeof tenants;
  "threads/_tables": typeof threads__tables;
  "threads/mutations/ensureThread": typeof threads_mutations_ensureThread;
  "threads/mutations/resetThread": typeof threads_mutations_resetThread;
  "threads/mutations/setThreadParentTs": typeof threads_mutations_setThreadParentTs;
  "threads/queries/getById": typeof threads_queries_getById;
  "threads/queries/listByAgent": typeof threads_queries_listByAgent;
  "webChat/mutations/createThread": typeof webChat_mutations_createThread;
  "webChat/mutations/sendMessage": typeof webChat_mutations_sendMessage;
  "webChat/queries/listMessages": typeof webChat_queries_listMessages;
  "webChat/queries/listUIMessages": typeof webChat_queries_listUIMessages;
  "webChat/queries/myThreads": typeof webChat_queries_myThreads;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  authz: import("@djpanda/convex-authz/_generated/component.js").ComponentApi<"authz">;
  tenants: import("@djpanda/convex-tenants/_generated/component.js").ComponentApi<"tenants">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
};
