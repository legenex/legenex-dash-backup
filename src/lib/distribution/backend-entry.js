// Canonical engine surface consumed by the Base44 backend (processLead, retry
// worker, simulator function). This is the SINGLE source of truth: the backend
// uses a GENERATED bundle of exactly this module (see scripts/generate-backend-
// engine.mjs), enforced by a blocking parity check (scripts/check-engine-parity.mjs).
// There is no hand-maintained backend mirror. Do not edit the generated file by
// hand; edit the canonical modules and regenerate.

export {
  REASON, isValidTrustedForm, missingRequiredFields, exhaustedCap, evaluateMember,
  resolvePrice, selectPriority, selectWeighted, selectRoundRobin, selectAuction,
  selectHybrid, routeWaterfall, capWindowStart, idempotencyKey, redact,
} from './engine.js';

export { evalLeaf, evalConditionTree, OPERATORS } from './conditions.js';
export { buildRoutingSnapshot } from './snapshot.js';
export { runShadow } from './shadowHook.js';
export { runSimulation } from './simulateReport.js';
export { loadRoutingSnapshot, hasActiveRouteGroup, _clearActiveGroupCache } from './snapshotLoader.js';
export { makeBase44CapStore } from './capStore.js';
export { reserve, finalize, release, RESERVE } from './reservation.js';
export { makeBase44WalletStore } from './walletStore.js';
export { walletDebit, walletCredit, walletCreditReturn, WALLET } from './walletLedger.js';
export { computeBillingLines, applyReturnAdjustment } from './billing.js';
export { deliverDirectPost } from './directPost.js';
export { resolveSubDeliveryCfg, projectSubDeliveryForClient } from './deliveryResolve.js';
export { runPingPost, buildPingPayload, PING_ALLOWLIST } from './pingpostFlow.js';
export { distributeLead, orderEligible } from './distribute.js';
export { runDistribution, capScopesFor, RUN } from './distributeRun.js';
export { resolveCampaign, CAMPAIGN_MATCH } from './campaignResolve.js';
export { makeBase44AttemptStore, makeInMemoryAttemptStore } from './deliveryStore.js';
export { applyTransform } from './transforms.js';
export { runRetryWorker, manualRetry, backoffWithJitter } from './retryWorker.js';
export {
  makeBase44HealthStore, makeInMemoryHealthStore, nextHealth, isBlocked, CIRCUIT,
} from './destinationHealth.js';
export { wallClock, isWithinSchedule } from './schedule.js';
export { rankBids, BID_REASON } from './pingpost.js';
export { compareDecision, summarizeComparisons, COMPARE } from './shadowCompare.js';
export { isOperator, OPERATOR_PERMISSION_KEYS } from './operatorAuth.js';
export {
  validateConfigForPublish, computeConfigHash, buildVersionSnapshot, diffConfig, resolveTraceVersion,
} from './configPublish.js';
export {
  MODES, isCanaryLead, planExecution, shouldFallback, executeMode, validateModeTransition, buildModeAudit,
} from './modeControl.js';
export {
  ATTEMPT_STATUS, computeBackoffMs, nextRetryAtIso, shouldRetry, classifyResponse,
  buildAttemptRecord,
} from './deliveryAttempt.js';
