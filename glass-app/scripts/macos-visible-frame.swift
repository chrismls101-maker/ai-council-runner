#!/usr/bin/env swift
/**
 * NSScreen.visibleFrame for a display — updates when the macOS Dock autohides,
 * unlike Electron's cached workArea.
 * Args: electronBoundsX electronBoundsY electronBoundsWidth electronBoundsHeight
 * Emits JSON: { ok, x?, y?, width?, height? } in Electron top-left DIP coords.
 */

import Cocoa
import Foundation

func emit(_ obj: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: obj)
  print(String(data: data, encoding: .utf8)!)
}

func electronWorkArea(from screen: NSScreen) -> (x: Double, y: Double, w: Double, h: Double, boundsY: Double, boundsH: Double) {
  let frame = screen.frame
  let visible = screen.visibleFrame
  let primaryMaxY = NSScreen.screens.map { $0.frame.maxY }.max() ?? frame.maxY
  let electronScreenY = primaryMaxY - frame.maxY
  let electronWorkY = electronScreenY + (frame.maxY - visible.maxY)
  return (
    x: Double(visible.minX),
    y: electronWorkY,
    w: Double(visible.width),
    h: Double(visible.height),
    boundsY: electronScreenY,
    boundsH: Double(frame.height)
  )
}

func screenMatchingElectronBounds(bx: Double, by: Double, bw: Double, bh: Double) -> NSScreen? {
  var best: NSScreen?
  var bestScore = Double.infinity
  for screen in NSScreen.screens {
    let converted = electronWorkArea(from: screen)
    let score =
      abs(converted.boundsY - by) +
      abs(converted.boundsH - bh) +
      abs(converted.x - bx) * 0.01
    if score < bestScore {
      bestScore = score
      best = screen
    }
  }
  return best
}

let args = CommandLine.arguments
let screen: NSScreen?
if args.count >= 5,
   let bx = Double(args[1]),
   let by = Double(args[2]),
   let bw = Double(args[3]),
   let bh = Double(args[4]) {
  screen = screenMatchingElectronBounds(bx: bx, by: by, bw: bw, bh: bh) ?? NSScreen.main
} else {
  screen = NSScreen.main
}

guard let matched = screen else {
  emit(["ok": false])
  exit(0)
}

let wa = electronWorkArea(from: matched)
emit([
  "ok": true,
  "x": wa.x,
  "y": wa.y,
  "width": wa.w,
  "height": wa.h,
])
