import { useCallback, useEffect, useMemo, useState } from "react";
import type { GlassIdeProjectEntry } from "../../shared/glassIdeProject.ts";
import { GlassHoverTooltip } from "../components/GlassHoverTooltip.tsx";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";
import "./GlassIdeFileTree.css";

export function GideSidebarChevron({ direction }: { direction: "left" | "right" }): JSX.Element {
  return (
    <svg
      className="gide-sidebar-chevron"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
    >
      {direction === "left" ? (
        <path
          d="M7.5 2.5L4.5 6l3 3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M4.5 2.5l3 3.5-3 3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

interface TreeNode {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  children: TreeNode[];
}

interface GlassIdeFileTreeProps {
  workspaceRoot?: string;
  selectedPath: string | null;
  onSelectPath: (relativePath: string) => void;
  refreshKey?: number;
  onCollapse?: () => void;
}

function buildTree(entries: GlassIdeProjectEntry[]): TreeNode[] {
  const root: TreeNode = {
    name: "",
    relativePath: "",
    isDirectory: true,
    children: [],
  };
  const byPath = new Map<string, TreeNode>([["", root]]);

  for (const entry of entries) {
    if (!entry.relativePath) continue;
    const parts = entry.relativePath.split("/");
    let parentPath = "";
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]!;
      const isLast = i === parts.length - 1;
      const relativePath = parts.slice(0, i + 1).join("/");
      if (!byPath.has(relativePath)) {
        const node: TreeNode = {
          name: part,
          relativePath,
          isDirectory: isLast ? entry.isDirectory : true,
          children: [],
        };
        byPath.set(relativePath, node);
        byPath.get(parentPath)?.children.push(node);
      } else if (isLast) {
        const node = byPath.get(relativePath)!;
        node.isDirectory = entry.isDirectory;
      }
      parentPath = relativePath;
    }
  }

  const sortNodes = (nodes: TreeNode[]): void => {
    nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    for (const node of nodes) sortNodes(node.children);
  };
  sortNodes(root.children);
  return root.children;
}

function TreeRow({
  node,
  depth,
  selectedPath,
  onSelectPath,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelectPath: (relativePath: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(depth < 2);
  const isSelected = selectedPath === node.relativePath;

  if (node.isDirectory) {
    return (
      <>
        <button
          type="button"
          className={`gide-tree__row gide-tree__row--dir${isSelected ? " gide-tree__row--selected" : ""}`}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => setOpen((v) => !v)}
          onPointerDown={ensureOverlayInteractive}
        >
          <span className="gide-tree__chevron">{open ? "▾" : "▸"}</span>
          <span className="gide-tree__icon">📁</span>
          <span className="gide-tree__name">{node.name}</span>
        </button>
        {open
          ? node.children.map((child) => (
            <TreeRow
              key={child.relativePath || child.name}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelectPath={onSelectPath}
            />
          ))
          : null}
      </>
    );
  }

  return (
    <button
      type="button"
      className={`gide-tree__row gide-tree__row--file${isSelected ? " gide-tree__row--selected" : ""}`}
      style={{ paddingLeft: `${20 + depth * 12}px` }}
      onClick={() => onSelectPath(node.relativePath)}
      onPointerDown={ensureOverlayInteractive}
    >
      <span className="gide-tree__icon">📄</span>
      <span className="gide-tree__name">{node.name}</span>
    </button>
  );
}

export function GlassIdeFileTree({
  workspaceRoot,
  selectedPath,
  onSelectPath,
  refreshKey = 0,
  onCollapse,
}: GlassIdeFileTreeProps): JSX.Element {
  const [entries, setEntries] = useState<GlassIdeProjectEntry[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);

  const refreshList = useCallback(async (): Promise<void> => {
    if (!workspaceRoot?.trim()) {
      setEntries([]);
      setListError("Set a project folder first.");
      return;
    }
    setLoadingList(true);
    setListError(null);
    try {
      const res = await window.glass.glassIdeListProject();
      if (!res.ok) {
        setEntries([]);
        setListError(res.error ?? "Could not list project files.");
        return;
      }
      setEntries(res.entries ?? []);
    } finally {
      setLoadingList(false);
    }
  }, [workspaceRoot]);

  useEffect(() => {
    void refreshList();
  }, [refreshList, refreshKey]);

  const tree = useMemo(() => buildTree(entries), [entries]);

  return (
    <div className="gide-tree" data-testid="glass-ide-file-tree">
      <div className="gide-tree__head">
        <span>Project</span>
        {onCollapse ? (
          <GlassHoverTooltip label="Collapse file tree" placement="bottom">
            <button
              type="button"
              className="gide-tree__collapse"
              onClick={onCollapse}
              onPointerDown={ensureOverlayInteractive}
              aria-label="Collapse file tree"
            >
              <GideSidebarChevron direction="left" />
            </button>
          </GlassHoverTooltip>
        ) : null}
        <GlassHoverTooltip label="Refresh file tree" placement="bottom">
          <button
            type="button"
            className="gide-tree__refresh"
            onClick={() => void refreshList()}
            onPointerDown={ensureOverlayInteractive}
            disabled={loadingList}
            aria-label="Refresh file tree"
          >
            ↻
          </button>
        </GlassHoverTooltip>
      </div>
      <div className="gide-tree__body">
        {listError ? <p className="gide-tree__message gide-tree__message--error">{listError}</p> : null}
        {!listError && loadingList && entries.length === 0 ? (
          <p className="gide-tree__message">Loading…</p>
        ) : null}
        {!listError && !loadingList && entries.length === 0 ? (
          <p className="gide-tree__message">No files in project.</p>
        ) : null}
        {tree.map((node) => (
          <TreeRow
            key={node.relativePath || node.name}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onSelectPath={onSelectPath}
          />
        ))}
      </div>
    </div>
  );
}
