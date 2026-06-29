import { join } from "node:path";

export function glassStorageRoot(userDataPath: string): string {
  return join(userDataPath, "glass-storage");
}

export function glassStorageProjectsIndexPath(userDataPath: string): string {
  return join(glassStorageRoot(userDataPath), "projects-index.json");
}

export function designToCodeProjectsRoot(userDataPath: string): string {
  return join(glassStorageRoot(userDataPath), "design-to-code");
}

export function designToCodeProjectDir(userDataPath: string, projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
  return join(designToCodeProjectsRoot(userDataPath), safe);
}

export function glassStorageFilesDir(userDataPath: string): string {
  return join(glassStorageRoot(userDataPath), "files");
}
