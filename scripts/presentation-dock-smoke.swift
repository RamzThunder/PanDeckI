// macOS native regression check; no changes to the user's Dock preferences.
// Run: swift scripts/presentation-dock-smoke.swift
import AppKit

let app = NSApplication.shared
let before = app.presentationOptions
let screen = NSScreen.screens.last!
let editor = NSWindow(contentRect: NSRect(x: 80, y: 80, width: 640, height: 360), styleMask: [.titled], backing: .buffered, defer: false)
let audience = NSWindow(contentRect: NSRect(x: 80, y: 80, width: 640, height: 360), styleMask: [.borderless], backing: .buffered, defer: false)
editor.isReleasedWhenClosed = false
audience.isReleasedWhenClosed = false
let editorFrame = editor.frame
// Matches the native calls in fill_screen_without_hiding_dock.
audience.setFrame(screen.frame, display: true)
audience.level = NSWindow.Level(rawValue: NSWindow.Level.mainMenu.rawValue + 1)
audience.hidesOnDeactivate = false
precondition(audience.frame == screen.frame, "Audience must fill the screen")
precondition(!audience.styleMask.contains(.fullScreen), "Audience must remain a normal borderless window")
precondition(editor.frame == editorFrame, "Editor geometry must remain unchanged")
precondition(app.presentationOptions == before, "Dock/menu presentation options changed")
audience.close()
precondition(app.presentationOptions == before, "Closing presentation changed Dock/menu options")
editor.close()
print("PASS: screen-sized audience window; editor and Dock/menu options unchanged, including after close")
