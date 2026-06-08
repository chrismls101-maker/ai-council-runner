import { useLayoutEffect, type RefObject } from "react";

/** Extra space for outline, shadow, and subpixel rounding in the frameless window. */
const DOCK_SIZE_PADDING = 20;

function readGap(el: HTMLElement): number {
  const style = getComputedStyle(el);
  const columnGap = parseFloat(style.columnGap);
  if (Number.isFinite(columnGap) && columnGap > 0) return columnGap;
  const gap = parseFloat(style.gap);
  return Number.isFinite(gap) && gap > 0 ? gap : 6;
}

/** Sum child widths — reliable when the Electron window is narrower than content. */
function measureRowWidth(el: HTMLElement): number {
  const gap = readGap(el);
  let width = 0;
  for (let i = 0; i < el.children.length; i++) {
    const child = el.children[i] as HTMLElement;
    width += Math.ceil(child.offsetWidth) + (i > 0 ? gap : 0);
  }
  return width;
}

function measureDock(
  root: HTMLElement,
  actions: HTMLElement | null,
): { width: number; height: number } {
  const style = getComputedStyle(root);
  const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const rootGap = readGap(root);

  let contentWidth = 0;
  let contentHeight = 0;
  let rowCount = 0;

  if (actions) {
    contentWidth = Math.max(contentWidth, measureRowWidth(actions));
    contentHeight = Math.max(contentHeight, actions.offsetHeight);
    rowCount += 1;
  }

  let menuBlock: HTMLElement | null = null;
  for (const child of root.children) {
    if (child === actions) continue;
    if (!(child instanceof HTMLElement)) continue;
    if (!child.classList.contains("dock__row--menu")) continue;
    menuBlock = child;
    contentWidth = Math.max(contentWidth, child.offsetWidth);
    contentHeight += child.offsetHeight;
    rowCount += 1;
  }

  if (rowCount > 1) {
    contentHeight += rootGap * (rowCount - 1);
  }

  // Absolute-positioned overflow menu (horizontal dock) — include in window size.
  if (menuBlock) {
    const menuStyle = getComputedStyle(menuBlock);
    const menuTop = parseFloat(menuStyle.top) || 0;
    if (menuStyle.position === "absolute" && menuTop > 0) {
      contentHeight = Math.max(contentHeight, menuTop + menuBlock.offsetHeight);
    }
  }

  return {
    width: Math.max(contentWidth + padX, Math.ceil(root.scrollWidth)),
    height: Math.max(contentHeight + padY, Math.ceil(root.scrollHeight)),
  };
}

/** Report dock content size so the main process can resize the frameless window. */
export function useDockResize(
  rootRef: RefObject<HTMLElement | null>,
  actionsRef: RefObject<HTMLElement | null>,
  deps: unknown[],
): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const report = (): void => {
      const actions = actionsRef.current;
      const measured = measureDock(root, actions);
      const width = Math.ceil(measured.width) + DOCK_SIZE_PADDING;
      const height = Math.ceil(measured.height) + DOCK_SIZE_PADDING;
      window.glass.resizeDock(width, height);
    };

    report();
    requestAnimationFrame(() => requestAnimationFrame(report));

    const observer = new ResizeObserver(report);
    observer.observe(root);
    if (actionsRef.current) observer.observe(actionsRef.current);
    for (const child of root.children) {
      if (child instanceof HTMLElement) observer.observe(child);
    }
    return () => observer.disconnect();
  }, deps);
}
