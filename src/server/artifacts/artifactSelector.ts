import { normalizePromptForRouting } from "../agents/promptNormalize.js";
import type { ResponseContract } from "../responseContracts/responseContract.js";
import type { TaskIntentResult } from "../responseContracts/taskIntent.js";
import type { ArtifactRenderMode, ArtifactType } from "./artifactTypes.js";

const CANVAS_BUILD_SIGNALS =
  /\b(build (me )?(a )?full|create a (full )?|complete (business plan|proposal|campaign|landing page|financial model|website audit)|multi-?section document|full project plan|entire (landing page|website|campaign))\b/i;

const LARGE_DOC_SIGNALS =
  /\b(business plan|full proposal|comprehensive report|website audit report|financial model)\b/i;

export function selectArtifactType({
  taskIntent,
  responseContract,
  prompt,
}: {
  taskIntent: TaskIntentResult;
  responseContract: ResponseContract;
  prompt: string;
}): {
  type: ArtifactType;
  renderMode: ArtifactRenderMode;
  reason: string;
} {
  const text = normalizePromptForRouting(prompt.trim());

  if (/\b(financial table|budget table|pricing table|p&l|profit and loss)\b/i.test(text)) {
    return {
      type: "financial_table",
      renderMode: "inline",
      reason: "Financial table deliverable.",
    };
  }

  if (/\b(comparison table|compare .+ in a table)\b/i.test(text)) {
    return {
      type: "comparison_table",
      renderMode: "inline",
      reason: "Comparison table.",
    };
  }

  const canvasSuggested = CANVAS_BUILD_SIGNALS.test(text) || LARGE_DOC_SIGNALS.test(text);

  if (canvasSuggested) {
    if (/\b(landing page|website)\b/i.test(text)) {
      return {
        type: "canvas_project",
        renderMode: "canvas",
        reason: "Large landing/website build — Builder Canvas suggested.",
      };
    }
    if (/\b(business plan)\b/i.test(text)) {
      return {
        type: "business_plan",
        renderMode: "canvas",
        reason: "Business plan — Builder Canvas suggested.",
      };
    }
    if (/\b(proposal)\b/i.test(text)) {
      return {
        type: "proposal",
        renderMode: "canvas",
        reason: "Full proposal — Builder Canvas suggested.",
      };
    }
    if (/\b(campaign)\b/i.test(text)) {
      return {
        type: "campaign_plan",
        renderMode: "canvas",
        reason: "Full campaign — Builder Canvas suggested.",
      };
    }
    return {
      type: "canvas_project",
      renderMode: "canvas",
      reason: "Large multi-section build — Builder Canvas suggested.",
    };
  }

  if (/\b(follow-?up sequence|sequence of emails|3 follow-?ups)\b/i.test(text)) {
    return {
      type: "follow_up_sequence",
      renderMode: "inline",
      reason: "Follow-up email sequence.",
    };
  }

  if (
    taskIntent.intent === "support_response" ||
    responseContract.id === "support_reply_first"
  ) {
    return {
      type: "support_reply",
      renderMode: "inline",
      reason: "Support reply deliverable.",
    };
  }

  if (/\b(cold email|outreach email)\b/i.test(text) || taskIntent.intent === "asset_generation") {
    if (/\b(cold email|outreach email|sales email)\b/i.test(text)) {
      return {
        type: "cold_email",
        renderMode: "inline",
        reason: "Cold email deliverable.",
      };
    }
    if (/\b(email template|write an email|write a email)\b/i.test(text)) {
      return {
        type: "email_template",
        renderMode: "inline",
        reason: "Email template.",
      };
    }
  }

  if (/\b(checklist|to-?do list)\b/i.test(text)) {
    return {
      type: "checklist",
      renderMode: "inline",
      reason: "Checklist deliverable.",
    };
  }

  if (/\b(landing page copy|hero section|homepage copy)\b/i.test(text)) {
    return {
      type: "landing_page_copy",
      renderMode: "inline",
      reason: "Landing page copy blocks.",
    };
  }

  if (/\b(build a landing page|build the landing page)\b/i.test(text)) {
    return {
      type: "canvas_project",
      renderMode: "canvas",
      reason: "Full landing page build.",
    };
  }

  if (/\b(voicemail script|call script|sales script)\b/i.test(text)) {
    return {
      type: "script",
      renderMode: "inline",
      reason: "Script deliverable.",
    };
  }

  if (/\b(social post|linkedin post|tweet|instagram caption)\b/i.test(text)) {
    return {
      type: "social_post",
      renderMode: "inline",
      reason: "Social post deliverable.",
    };
  }

  if (responseContract.id === "decision_first") {
    return {
      type: "report",
      renderMode: "inline",
      reason: "Decision recommendation card.",
    };
  }

  if (responseContract.id === "strategy_plan") {
    return {
      type: "campaign_plan",
      renderMode: "inline",
      reason: "Strategy / plan report.",
    };
  }

  if (responseContract.id === "rewrite_only") {
    return {
      type: "plain_answer",
      renderMode: "inline",
      reason: "Rewritten copy as text.",
    };
  }

  if (taskIntent.intent === "vision_analysis") {
    return {
      type: "website_audit",
      renderMode: "inline",
      reason: "Visual / screenshot analysis report.",
    };
  }

  return {
    type: "plain_answer",
    renderMode: "inline",
    reason: "Default plain answer.",
  };
}
