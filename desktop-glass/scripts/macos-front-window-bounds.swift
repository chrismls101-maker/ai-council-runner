#!/usr/bin/env swift
/**
 * Frontmost app window bounds via NSWorkspace + CGWindowList (no Accessibility).
 * Emits one JSON line: { ok, appName?, x?, y?, y?, width?, height? } (CG coords).
 */

import Cocoa
import ApplicationServices
import Foundation

func jsonEscape(_ value: String) -> String {
  let data = try! JSONEncoder().encode(value)
  return String(data: data, encoding: .utf8)!
}

guard let app = NSWorkspace.shared.frontmostApplication else {
  print("{\"ok\":false}")
  exit(0)
}

let pid = app.processIdentifier
let appName = app.localizedName ?? ""

let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
  print("{\"ok\":true,\"appName\":\(jsonEscape(appName))}")
  exit(0)
}

var bestArea = 0
var bestBounds: [String: CGFloat]?

for win in list {
  guard let ownerPid = win[kCGWindowOwnerPID as String] as? Int32, ownerPid == pid else { continue }
  guard let layer = win[kCGWindowLayer as String] as? Int, layer == 0 else { continue }
  guard let boundsDict = win[kCGWindowBounds as String] as? [String: CGFloat] else { continue }
  let w = boundsDict["Width"] ?? 0
  let h = boundsDict["Height"] ?? 0
  if w < 48 || h < 48 { continue }
  let area = Int(w * h)
  if area > bestArea {
    bestArea = area
    bestBounds = boundsDict
  }
}

if let b = bestBounds {
  let x = b["X"] ?? 0
  let y = b["Y"] ?? 0
  let w = b["Width"] ?? 0
  let h = b["Height"] ?? 0
  print("{\"ok\":true,\"appName\":\(jsonEscape(appName)),\"x\":\(x),\"y\":\(y),\"width\":\(w),\"height\":\(h)}")
} else {
  print("{\"ok\":true,\"appName\":\(jsonEscape(appName))}")
}
