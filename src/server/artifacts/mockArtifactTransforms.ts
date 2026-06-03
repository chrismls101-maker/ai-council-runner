import { v4 as uuidv4 } from "uuid";
import type { ArtifactTransformType } from "./artifactTransforms.js";
import type { ArtifactType, IivoArtifact } from "./artifactTypes.js";

function mockId(): string {
  return `art-mock-${uuidv4().slice(0, 8)}`;
}

const FIXTURES: Partial<
  Record<ArtifactTransformType, (parent: IivoArtifact) => IivoArtifact>
> = {
  follow_up_sequence: (parent) => ({
    id: mockId(),
    type: "follow_up_sequence",
    renderMode: "canvas",
    title: `${parent.title} — Follow-up sequence`,
    summary: "Mock 3-email follow-up sequence",
    sections: [
      {
        id: "email-1",
        label: "Email 1",
        kind: "email_body",
        content:
          "Subject: Quick follow-up\n\nHi — just checking if you had a chance to review the pilot offer.",
        copyable: true,
      },
      {
        id: "email-2",
        label: "Email 2",
        kind: "email_body",
        content: "Subject: One more note\n\nSharing a short case study from a similar HVAC shop.",
        copyable: true,
      },
      {
        id: "email-3",
        label: "Email 3",
        kind: "email_body",
        content: "Subject: Close the loop\n\nHappy to book 15 minutes this week if useful.",
        copyable: true,
      },
    ],
    actions: ["copy", "download_txt", "download_pdf"],
    metadata: { mock: true, transformedFrom: parent.id },
  }),
  social_post: (parent) => ({
    id: mockId(),
    type: "social_post",
    renderMode: "canvas",
    title: `${parent.title} — Social post`,
    sections: [
      {
        id: "post-1",
        label: "Post 1",
        kind: "text",
        content: "Stop losing leads after hours. Book a demo — link in bio.",
      },
    ],
    actions: ["copy", "download_txt"],
    metadata: { mock: true, transformedFrom: parent.id },
  }),
  facebook_ad: (parent) => ({
    id: mockId(),
    type: "social_post",
    renderMode: "canvas",
    title: `${parent.title} — Facebook ad`,
    sections: [
      {
        id: "ad",
        label: "Ad copy",
        kind: "text",
        content:
          "Headline: Recover missed calls\nPrimary: HVAC owners — 14-day pilot to capture after-hours leads.\nCTA: Learn more",
      },
    ],
    actions: ["copy"],
    metadata: { mock: true, transformedFrom: parent.id },
  }),
  developer_task_list: (parent) => ({
    id: mockId(),
    type: "checklist",
    renderMode: "canvas",
    title: `${parent.title} — Developer tasks`,
    sections: [
      {
        id: "tasks",
        label: "Priority fixes",
        kind: "checklist",
        content: {
          items: [
            { label: "Fix hero headline clarity", checked: false },
            { label: "Add trust badges above fold", checked: false },
            { label: "Improve mobile CTA contrast", checked: false },
          ],
        },
      },
    ],
    actions: ["copy", "download_txt"],
    metadata: { mock: true, transformedFrom: parent.id },
  }),
  priority_checklist: (parent) => ({
    id: mockId(),
    type: "checklist",
    renderMode: "canvas",
    title: `${parent.title} — Priority checklist`,
    sections: [
      {
        id: "checklist",
        label: "Checklist",
        kind: "checklist",
        content: {
          items: [
            { label: "Clarify value proposition", checked: false },
            { label: "Add proof near CTA", checked: false },
          ],
        },
      },
    ],
    actions: ["copy"],
    metadata: { mock: true, transformedFrom: parent.id },
  }),
  task_checklist: (parent) => ({
    id: mockId(),
    type: "checklist",
    renderMode: "canvas",
    title: `${parent.title} — Task checklist`,
    sections: [
      {
        id: "tasks",
        label: "Tasks",
        kind: "checklist",
        content: {
          items: [
            { label: "Define success metric", checked: false },
            { label: "Assign owner per workstream", checked: false },
          ],
        },
      },
    ],
    actions: ["copy"],
    metadata: { mock: true, transformedFrom: parent.id },
  }),
  execution_plan: (parent) => ({
    id: mockId(),
    type: "report",
    renderMode: "canvas",
    title: `${parent.title} — Execution plan`,
    sections: [
      {
        id: "plan",
        label: "Plan",
        kind: "text",
        content: "Phase 1: Validate offer. Phase 2: Pilot outreach. Phase 3: Measure conversion.",
      },
    ],
    actions: ["copy", "download_md"],
    metadata: { mock: true, transformedFrom: parent.id },
  }),
  outreach_checklist: (parent) => ({
    id: mockId(),
    type: "checklist",
    renderMode: "canvas",
    title: `${parent.title} — Outreach checklist`,
    sections: [
      {
        id: "outreach",
        label: "Outreach steps",
        kind: "checklist",
        content: {
          items: [
            { label: "Personalize opener", checked: false },
            { label: "Send initial email", checked: false },
            { label: "Follow up day 3", checked: false },
          ],
        },
      },
    ],
    actions: ["copy"],
    metadata: { mock: true, transformedFrom: parent.id },
  }),
};

function defaultFixture(parent: IivoArtifact, transformType: ArtifactTransformType): IivoArtifact {
  return {
    id: mockId(),
    type: "report" as ArtifactType,
    renderMode: "canvas",
    title: `${parent.title} — ${transformType.replace(/_/g, " ")}`,
    sections: [
      {
        id: "output",
        label: "Output",
        kind: "text",
        content: `Mock transform output for ${transformType}. Source: ${parent.title}.`,
      },
    ],
    actions: ["copy", "download_txt"],
    metadata: { mock: true, transformedFrom: parent.id, transformType },
  };
}

export function isMockTransformMode(): boolean {
  return (
    process.env.ARTIFACT_TRANSFORM_MOCK === "1" ||
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true"
  );
}

export function buildMockTransformArtifact(
  parent: IivoArtifact,
  transformType: ArtifactTransformType,
): IivoArtifact {
  const builder = FIXTURES[transformType];
  return builder ? builder(parent) : defaultFixture(parent, transformType);
}
