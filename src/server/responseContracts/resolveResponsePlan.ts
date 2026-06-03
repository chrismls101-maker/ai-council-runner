import { detectTaskIntent, type TaskIntentResult } from "./taskIntent.js";
import { selectResponseContract, type ResponseContract } from "./responseContract.js";
import { selectRouteLane, type RouteLaneDecision } from "./routeLane.js";

export type ResponsePlan = {
  intent: TaskIntentResult;
  contract: ResponseContract;
  lane: RouteLaneDecision;
};

export function resolveResponsePlan(prompt: string): ResponsePlan {
  const intent = detectTaskIntent(prompt);
  const contract = selectResponseContract(intent, prompt);
  const lane = selectRouteLane(intent, contract, prompt);
  return { intent, contract, lane };
}

export type ResponsePlanTrace = {
  taskIntent: string;
  responseContract: string;
  routeLane: string;
  preferredRoute: string;
  targetLatencySeconds?: number;
  intentReason: string;
  laneReason: string;
};

export function responsePlanToTrace(plan: ResponsePlan): ResponsePlanTrace {
  return {
    taskIntent: plan.intent.intent,
    responseContract: plan.contract.id,
    routeLane: plan.lane.lane,
    preferredRoute: plan.lane.preferredRoute,
    targetLatencySeconds: plan.lane.targetLatencySeconds,
    intentReason: plan.intent.reason,
    laneReason: plan.lane.reason,
  };
}
