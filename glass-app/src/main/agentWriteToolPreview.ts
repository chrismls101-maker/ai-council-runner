/**
 * Glass Coder — live diff preview for write tools at tool-start (reads disk).
 */

import { readFileForDiff } from "./glassActions.ts";
import {
  assertPathInProjectRoot,
  proposeCreateContent,
  proposeDeleteContent,
  proposeEditContent,
  resolveProjectPath,
} from "./agentCoderTools.ts";
import type { AgentPendingApprovalPayload } from "../shared/ipc.ts";

export async function buildWriteToolStartPreview(
  toolName: string,
  input: Record<string, unknown>,
  projectRoot: string,
): Promise<AgentPendingApprovalPayload | undefined> {
  const root = projectRoot.trim();
  if (!root) return undefined;

  const filePath = String(input.path ?? "").trim();
  if (!filePath) return undefined;

  const resolved = resolveProjectPath(filePath, root);
  const pathErr = assertPathInProjectRoot(resolved, root);
  if (pathErr) return undefined;

  if (toolName === "create_file") {
    const content = String(input.content ?? "");
    const read = await readFileForDiff(resolved);
    if (!read.ok) return undefined;
    const proposal = proposeCreateContent(
      resolved,
      content,
      root,
      String(input.description ?? ""),
      read.existed,
    );
    return proposal.ok ? proposal.approval : undefined;
  }

  if (toolName === "edit_file") {
    const read = await readFileForDiff(resolved);
    if (!read.ok || !read.existed) return undefined;
    const proposal = proposeEditContent(
      resolved,
      read.content,
      read.hash,
      read.existed,
      root,
      String(input.old_string ?? ""),
      String(input.new_string ?? ""),
      String(input.description ?? ""),
    );
    return proposal.ok ? proposal.approval : undefined;
  }

  if (toolName === "delete_file") {
    const read = await readFileForDiff(resolved);
    if (!read.ok || !read.existed) return undefined;
    const proposal = proposeDeleteContent(
      resolved,
      read.content,
      read.hash,
      root,
      String(input.description ?? ""),
    );
    return proposal.ok ? proposal.approval : undefined;
  }

  return undefined;
}
