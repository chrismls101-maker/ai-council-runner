const DEFAULT_NEAR_BOTTOM_THRESHOLD_PX = 96;

export function isChatScrollNearBottom(
  element: HTMLElement,
  thresholdPx = DEFAULT_NEAR_BOTTOM_THRESHOLD_PX,
): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= thresholdPx;
}

export function scrollChatContainerToBottom(
  element: HTMLElement,
  behavior: ScrollBehavior = "auto",
): void {
  element.scrollTo({ top: element.scrollHeight, behavior });
}
