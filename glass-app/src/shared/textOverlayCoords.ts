/**
 * Convert a screen-space cursor point to overlay-local coordinates,
 * and resolve frosted-card placement that avoids Glass chrome at the bottom.
 */

export const TEXT_OVERLAY_CURSOR_GAP_PX = 20;
export const TEXT_OVERLAY_CARD_MAX_WIDTH_PX = 380;
/** Conservative height for flip/clamp before the card mounts. */
export const TEXT_OVERLAY_CARD_MAX_HEIGHT_ESTIMATE_PX = 320;

export type OverlayBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function screenPointToOverlayLocal(
  cursorX: number,
  cursorY: number,
  overlayBounds: OverlayBounds,
  nearestDisplayBounds: OverlayBounds,
  edgeMarginPx = 40,
): { x: number; y: number } {
  let localX = cursorX - overlayBounds.x;
  let localY = cursorY - overlayBounds.y;

  const inside =
    localX >= 0
    && localY >= 0
    && localX <= overlayBounds.width
    && localY <= overlayBounds.height;

  if (!inside) {
    localX = nearestDisplayBounds.x + nearestDisplayBounds.width / 2 - overlayBounds.x;
    localY = nearestDisplayBounds.y + nearestDisplayBounds.height / 2 - overlayBounds.y;
  }

  return {
    x: Math.max(edgeMarginPx, Math.min(overlayBounds.width - edgeMarginPx, localX)),
    y: Math.max(edgeMarginPx, Math.min(overlayBounds.height - edgeMarginPx, localY)),
  };
}

export type TextOverlayCardPlacement = {
  left: number;
  top?: number;
  bottom?: number;
  transform: "translateX(-50%)";
};

export type TextAnchoredCardPlacement = {
  left: number;
  top: number;
  /** Where the card was born relative to the text — drives transform-origin. */
  origin: "below" | "above" | "right";
};

/** Minimum room below the text before the card flips above (px). */
export const TEXT_ANCHOR_FLIP_BELOW_PX = 220;
/** Gap between the text unit and the card (px). */
export const TEXT_ANCHOR_GAP_PX = 12;

/**
 * Anchor the card to the logical text unit itself (Fix 9): preferred placement
 * is 12px below the bottom-left of the text bounds; flips above when the text
 * sits near the display bottom; flips right when the text hugs the left edge.
 * Never places outside the viewport.
 */
export function resolveTextAnchoredCardPlacement(input: {
  textAnchor: { x: number; y: number; width: number; height: number };
  viewportWidth: number;
  viewportHeight: number;
  bottomReservePx?: number;
  cardMaxWidthPx?: number;
  cardMaxHeightPx?: number;
  edgeMarginPx?: number;
}): TextAnchoredCardPlacement {
  const {
    textAnchor,
    viewportWidth,
    viewportHeight,
    bottomReservePx = 0,
    cardMaxWidthPx = TEXT_OVERLAY_CARD_MAX_WIDTH_PX,
    cardMaxHeightPx = TEXT_OVERLAY_CARD_MAX_HEIGHT_ESTIMATE_PX,
    edgeMarginPx = 8,
  } = input;

  const clampLeft = (left: number): number =>
    Math.max(edgeMarginPx, Math.min(viewportWidth - cardMaxWidthPx - edgeMarginPx, left));
  const clampTop = (top: number): number =>
    Math.max(
      edgeMarginPx,
      Math.min(viewportHeight - bottomReservePx - cardMaxHeightPx - edgeMarginPx, top),
    );

  const textBottom = textAnchor.y + textAnchor.height;
  const textRight = textAnchor.x + textAnchor.width;

  // Text hugging the left edge → the card becomes a margin note to its right.
  if (textRight < viewportWidth * 0.2) {
    return {
      left: clampLeft(textRight + TEXT_ANCHOR_GAP_PX),
      top: clampTop(textAnchor.y),
      origin: "right",
    };
  }

  const roomBelow = viewportHeight - bottomReservePx - textBottom;
  if (roomBelow >= TEXT_ANCHOR_FLIP_BELOW_PX) {
    return {
      left: clampLeft(textAnchor.x),
      top: clampTop(textBottom + TEXT_ANCHOR_GAP_PX),
      origin: "below",
    };
  }

  const aboveTop = textAnchor.y - TEXT_ANCHOR_GAP_PX - cardMaxHeightPx;
  if (aboveTop >= edgeMarginPx) {
    return {
      left: clampLeft(textAnchor.x),
      top: aboveTop,
      origin: "above",
    };
  }

  // No room above or below — margin note to the right.
  return {
    left: clampLeft(textRight + TEXT_ANCHOR_GAP_PX),
    top: clampTop(textAnchor.y),
    origin: "right",
  };
}

/** Anchor the explain card near the cursor while staying above command bar / builder strip. */
export function resolveTextOverlayCardPlacement(input: {
  cursorX: number;
  cursorY: number;
  viewportWidth: number;
  viewportHeight: number;
  bottomReservePx?: number;
  edgeMarginPx?: number;
  cursorGapPx?: number;
  cardMaxWidthPx?: number;
  cardMaxHeightPx?: number;
}): TextOverlayCardPlacement {
  const {
    cursorX,
    cursorY,
    viewportWidth,
    viewportHeight,
    bottomReservePx = 0,
    edgeMarginPx = 40,
    cursorGapPx = TEXT_OVERLAY_CURSOR_GAP_PX,
    cardMaxWidthPx = TEXT_OVERLAY_CARD_MAX_WIDTH_PX,
    cardMaxHeightPx = TEXT_OVERLAY_CARD_MAX_HEIGHT_ESTIMATE_PX,
  } = input;

  const halfCard = cardMaxWidthPx / 2;
  const left = Math.max(
    edgeMarginPx + halfCard,
    Math.min(viewportWidth - edgeMarginPx - halfCard, cursorX),
  );

  const minBottomPx = bottomReservePx + cursorGapPx;
  const maxAnchorY = viewportHeight - minBottomPx;
  const anchorY = Math.min(cursorY, maxAnchorY);

  const screenMid = viewportHeight / 2;
  const preferAbove =
    anchorY >= screenMid
    || anchorY + cursorGapPx + cardMaxHeightPx > viewportHeight - minBottomPx;

  if (preferAbove) {
    return {
      left,
      bottom: Math.max(viewportHeight - anchorY + cursorGapPx, minBottomPx),
      transform: "translateX(-50%)",
    };
  }

  const top = anchorY + cursorGapPx;
  const maxTop = viewportHeight - minBottomPx - cardMaxHeightPx;
  if (top > maxTop) {
    return {
      left,
      bottom: Math.max(viewportHeight - anchorY + cursorGapPx, minBottomPx),
      transform: "translateX(-50%)",
    };
  }

  return {
    left,
    top,
    transform: "translateX(-50%)",
  };
}
