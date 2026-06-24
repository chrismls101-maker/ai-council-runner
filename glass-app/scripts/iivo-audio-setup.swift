/**
 * iivo-audio-setup — CoreAudio helper for IIVO Glass system audio setup.
 *
 * Compiled to a universal binary (arm64 + x64) at build time and bundled
 * in the app's Resources/bin/ directory.
 *
 * Usage:
 *   iivo-audio-setup --check          → exit 0 if BlackHole 2ch present, exit 1 if not
 *   iivo-audio-setup --setup          → create "IIVO Glass Audio" Multi-Output Device
 *                                        (current default output + BlackHole 2ch) and
 *                                        set it as the system default output
 *   iivo-audio-setup --teardown       → remove "IIVO Glass Audio" device, restore
 *                                        the original output if still available
 *   iivo-audio-setup --list-outputs   → print JSON array of output device names + UIDs
 *
 * Exit codes:
 *   0 = success
 *   1 = BlackHole not found / operation failed
 *   2 = usage error
 */

import Foundation
import CoreAudio

// MARK: - Constants

let kIIVODeviceName = "IIVO Glass Audio"
let kIIVODeviceUID  = "com.iivo.glass.multiaudio.v1"
let kBlackHolePrefix = "BlackHole"

// MARK: - CoreAudio helpers

func systemObjectID() -> AudioObjectID { AudioObjectID(kAudioObjectSystemObject) }

func getPropertyDataSize(_ objectID: AudioObjectID,
                         selector: AudioObjectPropertySelector,
                         scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> UInt32 {
    var address = AudioObjectPropertyAddress(
        mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
    var size: UInt32 = 0
    AudioObjectGetPropertyDataSize(objectID, &address, 0, nil, &size)
    return size
}

func audioDeviceIDs() -> [AudioDeviceID] {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDevices,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
    var dataSize: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(systemObjectID(), &address, 0, nil, &dataSize) == noErr,
          dataSize > 0 else { return [] }
    let count = Int(dataSize) / MemoryLayout<AudioDeviceID>.size
    var ids = [AudioDeviceID](repeating: 0, count: count)
    AudioObjectGetPropertyData(systemObjectID(), &address, 0, nil, &dataSize, &ids)
    return ids
}

func deviceUID(_ id: AudioDeviceID) -> String? {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyDeviceUID,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
    var ref: CFString? = nil
    var size = UInt32(MemoryLayout<CFString?>.size)
    guard AudioObjectGetPropertyData(id, &address, 0, nil, &size, &ref) == noErr else { return nil }
    return ref as String?
}

func deviceName(_ id: AudioDeviceID) -> String? {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioObjectPropertyName,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
    var ref: CFString? = nil
    var size = UInt32(MemoryLayout<CFString?>.size)
    guard AudioObjectGetPropertyData(id, &address, 0, nil, &size, &ref) == noErr else { return nil }
    return ref as String?
}

func hasOutputStreams(_ id: AudioDeviceID) -> Bool {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyStreams,
        mScope: kAudioDevicePropertyScopeOutput,
        mElement: kAudioObjectPropertyElementMain)
    var size: UInt32 = 0
    AudioObjectGetPropertyDataSize(id, &address, 0, nil, &size)
    return size > 0
}

func defaultOutputDeviceID() -> AudioDeviceID? {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultOutputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
    var id: AudioDeviceID = 0
    var size = UInt32(MemoryLayout<AudioDeviceID>.size)
    guard AudioObjectGetPropertyData(systemObjectID(), &address, 0, nil, &size, &id) == noErr else { return nil }
    return id
}

func setDefaultOutputDevice(_ id: AudioDeviceID) -> Bool {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultOutputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
    var mutableID = id
    return AudioObjectSetPropertyData(systemObjectID(), &address, 0, nil,
                                      UInt32(MemoryLayout<AudioDeviceID>.size), &mutableID) == noErr
}

func setDefaultSystemOutputDevice(_ id: AudioDeviceID) -> Bool {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultSystemOutputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
    var mutableID = id
    return AudioObjectSetPropertyData(systemObjectID(), &address, 0, nil,
                                      UInt32(MemoryLayout<AudioDeviceID>.size), &mutableID) == noErr
}

// MARK: - Device lookup

struct AudioDeviceInfo {
    let id: AudioDeviceID
    let uid: String
    let name: String
    let hasOutput: Bool
}

func allDevices() -> [AudioDeviceInfo] {
    audioDeviceIDs().compactMap { id -> AudioDeviceInfo? in
        guard let uid = deviceUID(id), let name = deviceName(id) else { return nil }
        return AudioDeviceInfo(id: id, uid: uid, name: name, hasOutput: hasOutputStreams(id))
    }
}

func findBlackHole() -> AudioDeviceInfo? {
    // Prefer exact "BlackHole 2ch" match, then any BlackHole device.
    let devices = allDevices()
    return devices.first(where: { $0.name == "BlackHole 2ch" })
        ?? devices.first(where: { $0.name.hasPrefix(kBlackHolePrefix) })
}

func findIIVODevice() -> AudioDeviceInfo? {
    allDevices().first(where: { $0.uid == kIIVODeviceUID || $0.name == kIIVODeviceName })
}

// MARK: - Commands

func cmdCheck() -> Int32 {
    if let bh = findBlackHole() {
        print("ok: BlackHole found — \(bh.name) [\(bh.uid)]")
        return 0
    }
    fputs("error: BlackHole 2ch not found\n", stderr)
    return 1
}

func cmdListOutputs() -> Int32 {
    let devices = allDevices().filter { $0.hasOutput }
    let currentID = defaultOutputDeviceID()
    var items: [[String: Any]] = []
    for d in devices {
        items.append([
            "name": d.name,
            "uid": d.uid,
            "isDefault": d.id == currentID
        ])
    }
    if let data = try? JSONSerialization.data(withJSONObject: items, options: [.prettyPrinted]),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
    return 0
}

func cmdSetup() -> Int32 {
    // 1. Find BlackHole
    guard let blackHole = findBlackHole() else {
        fputs("error: BlackHole 2ch not found — install it first\n", stderr)
        return 1
    }

    // 2. Find current default output (must not be BlackHole or existing IIVO device)
    guard let currentDefaultID = defaultOutputDeviceID() else {
        fputs("error: cannot read default output device\n", stderr)
        return 1
    }
    let allDevs = allDevices()
    guard let currentDefault = allDevs.first(where: { $0.id == currentDefaultID }),
          !currentDefault.name.hasPrefix(kBlackHolePrefix),
          currentDefault.uid != kIIVODeviceUID else {
        // Already set up correctly or already routing through IIVO device — check if it exists
        if let existing = findIIVODevice() {
            print("ok: IIVO Glass Audio already exists [\(existing.uid)] — setting as default")
            let ok = setDefaultOutputDevice(existing.id) && setDefaultSystemOutputDevice(existing.id)
            return ok ? 0 : 1
        }
        fputs("error: current output is BlackHole or already IIVO — cannot determine real output device\n", stderr)
        return 1
    }

    print("info: current output = \(currentDefault.name) [\(currentDefault.uid)]")
    print("info: BlackHole = \(blackHole.name) [\(blackHole.uid)]")

    // 3. Destroy any existing IIVO Glass Audio device first (idempotent)
    if let existing = findIIVODevice() {
        print("info: removing existing IIVO Glass Audio device [\(existing.id)]")
        AudioHardwareDestroyAggregateDevice(existing.id)
        Thread.sleep(forTimeInterval: 0.3)
    }

    // 4. Build the aggregate device description
    // kAudioAggregateDeviceIsStackedKey = true → "Multi-Output Device" behaviour
    // (routes audio to all sub-devices simultaneously)
    let subDevices: [[String: Any]] = [
        [kAudioSubDeviceUIDKey as String: currentDefault.uid],
        [kAudioSubDeviceUIDKey as String: blackHole.uid],
    ]
    let desc: [String: Any] = [
        kAudioAggregateDeviceNameKey as String: kIIVODeviceName,
        kAudioAggregateDeviceUIDKey as String: kIIVODeviceUID,
        kAudioAggregateDeviceSubDeviceListKey as String: subDevices,
        kAudioAggregateDeviceIsStackedKey as String: true,
        kAudioAggregateDeviceMasterSubDeviceKey as String: currentDefault.uid,
        // kAudioAggregateDeviceClockSourceKey removed — not available in current macOS SDK;
        // HAL selects the master sub-device's clock automatically.
    ]

    // 5. Create it
    var newDeviceID: AudioDeviceID = 0
    let status = AudioHardwareCreateAggregateDevice(desc as CFDictionary, &newDeviceID)
    guard status == noErr else {
        fputs("error: AudioHardwareCreateAggregateDevice failed (\(status))\n", stderr)
        return 1
    }
    print("info: created IIVO Glass Audio device id=\(newDeviceID)")

    // 6. Short pause for HAL to register the new device
    Thread.sleep(forTimeInterval: 0.5)

    // 7. Set as default output + system output
    guard setDefaultOutputDevice(newDeviceID) else {
        fputs("error: failed to set default output device\n", stderr)
        return 1
    }
    _ = setDefaultSystemOutputDevice(newDeviceID)

    print("ok: IIVO Glass Audio created and set as default output")
    print("uid: \(kIIVODeviceUID)")
    print("previous-output-uid: \(currentDefault.uid)")
    print("previous-output-name: \(currentDefault.name)")
    return 0
}

func cmdTeardown() -> Int32 {
    // Find and destroy the IIVO Glass Audio device, restore to a real output
    guard let iivoDevice = findIIVODevice() else {
        print("ok: IIVO Glass Audio not found — nothing to tear down")
        return 0
    }

    // Find a fallback real output (not BlackHole, not IIVO device itself)
    let realOutputs = allDevices().filter {
        $0.hasOutput &&
        $0.uid != kIIVODeviceUID &&
        !$0.name.hasPrefix(kBlackHolePrefix)
    }

    // Restore to first real output before destroying the aggregate
    if let restore = realOutputs.first {
        _ = setDefaultOutputDevice(restore.id)
        _ = setDefaultSystemOutputDevice(restore.id)
        print("info: restored default output to \(restore.name)")
    }

    let status = AudioHardwareDestroyAggregateDevice(iivoDevice.id)
    if status == noErr {
        print("ok: IIVO Glass Audio removed")
        return 0
    } else {
        fputs("error: AudioHardwareDestroyAggregateDevice failed (\(status))\n", stderr)
        return 1
    }
}

// MARK: - Entry point

let args = CommandLine.arguments
let mode = args.count > 1 ? args[1] : "--check"

switch mode {
case "--check":         exit(cmdCheck())
case "--list-outputs":  exit(cmdListOutputs())
case "--setup":         exit(cmdSetup())
case "--teardown":      exit(cmdTeardown())
default:
    fputs("Usage: iivo-audio-setup [--check | --setup | --teardown | --list-outputs]\n", stderr)
    exit(2)
}
