---
name: k-e2e-qa
description: E2E and UI verification workflows. AgentController for native macOS apps (mcp__agentcontroller__*) and for iOS simulators and physical iPhones (mcp__agentcontroller-ios__*), Maestro or raw adb for Android (mcp__maestro__*), Claude in Chrome or Playwright MCP for the web. Use when running UI tests, QA automation, simulator or device testing, or driving and verifying a macOS app, iPhone, Android device, or web page.
---

# K-e2e-qa

Verify on the real surface: drive the app or page, assert on elements, capture screenshots. A green test suite is not evidence the UI works.

## Requirements

- **macOS and iOS targets**: AgentController, installed from its own repo at https://github.com/Kasempiternal/agentcontroller, registered as two user-scope MCP servers, `agentcontroller` (macOS apps; the menu-bar app must be running) and `agentcontroller-ios` (simulators and physical iPhones). See `docs/claude-setup.md` in the repo for the registration commands.
- **Android**: Maestro (`mcp__maestro__*` tools or the CLI), or raw `adb` with no MCP at all.
- **Web**: Claude in Chrome (`/chrome`) when the extension is available, else a Playwright MCP if one is configured.

When the needed server is not in the session's tool list, stop and report which target has no transport instead of improvising one.

## Routing

| Target | Use |
|---|---|
| macOS app | `mcp__agentcontroller__*` |
| iOS simulator or physical iPhone | `mcp__agentcontroller-ios__*` |
| Android phone or emulator | Maestro, or raw `adb`. AgentController has no Android transport. |
| Web page or app | Claude in Chrome (`/chrome`) when available; else Playwright MCP if configured; else report the gap. |

Prefer AgentController over Maestro for every target it covers: element-level control and honest failures beat YAML flows. For Android, raw `adb` is often better than Maestro: `adb exec-out screencap` returns true framebuffer pixels, so tap coordinates and screenshot coordinates share one space. Maestro reports hierarchy bounds that need scaling against a resized screenshot, a recurring source of mis-taps.

## AgentController operating rules (macOS and iOS)

- **Background-safe by default.** `launch_app` and `open_url` do not activate; input is PID-targeted; screenshots and video work with the window covered or hidden. The user keeps working undisturbed.
- **Focus Guard** is on by default and refuses `activate_app` and `foreground: true`. Never reach for them, and never bypass them with `osascript` activate or `open` without `-g`. `screenshot_window` captures background and hidden windows, so an app never needs to be frontmost.
- **One snapshot, then batch.** Call `list_apps`, then `snapshot` or `describe_screen` once for element ids (`e1`, `e2`, ...), then send one `run_steps` batch that uses those `elementId`s. Re-snapshot only when the UI shape changed.
- **Assertions return `isError` on failure**, so pass/fail is unambiguous: `assert_visible`, `assert_not_visible`, `assert_value` (equals/contains/enabled/focused/checked, with timeout).
- **Selectors**: role, title, titleContains, identifier, value, description, descriptionContains, labelContains, index. Use `labelContains` when you see on-screen text but do not know which AX attribute holds it (SwiftUI varies). Interaction tools default to the focused window (`scope:"app"` to widen); assert/read/find tools default to the whole app (`scope:"window"` to narrow). Interaction finds retry briefly, so first-frame races self-heal.
- **Invisible mode**: `hide_app` makes the tested app fully invisible while interactions and screenshots keep working. While hidden, the AX windows list is empty (use `scope:"window"`). Clipboard and responder-chain shortcuts need an active app. `unhide_app` restores without stealing focus.
- Also available: `read_text`/`read_all_text`, `get_focused_element`, `get_clipboard`/`set_clipboard`, `scroll`/`scroll_until_visible`/`swipe`/`drag_drop`, `right_click`, `navigate_menu` (silent, reads the menu tree without opening), `wait_for_element`, window tools, `reset_app_state`, and replayable flows (`run_steps`, `save_flow`, `run_saved_flow`).
- The AgentController app (not the terminal) needs Accessibility and Screen Recording permissions on the Mac.

## AgentController iOS (simulators and physical iPhones)

- Simulator flow: `list_simulators` → `boot_simulator` → `launch_app` → `describe_screen` or `scan_ui` → `tap_element`/`device_action` → `wait_for_element` → `get_screenshot`.
- Physical iPhone: run `setup_device` first (builds and launches WebDriverAgent on the phone). The screen must stay unlocked or every AX read fails. If WDA is not running, the tool returns the exact commands to run.
- Prefer `tap_element`/`wait_for_element` over repeated `describe_screen`: the physical-device transport's `/source` call is the slow path.

## Maestro (Android; iOS only if AgentController is missing)

- Flow: `list_devices` → `start_device` → `launch_app` (by bundle or app id) → `inspect_view_hierarchy` → `tap_on`/`input_text`/`back` → `take_screenshot`.
- Inspect the hierarchy before tapping to get the right selectors. Use `run_flow` for multi-step sequences and `run_flow_files` for saved YAML tests.
- The app must already be installed on the emulator or device.

## In K-stack

k-mode's verify steps call this skill for UI, native app, and device work. Whatever surface you drive, return the evidence with the result:

- Screenshot paths (or recordings from `start_recording`/`stop_recording` for flows).
- Assertion results verbatim, including `isError`.
- A one-line note on which transport served the target (agentcontroller, agentcontroller-ios, maestro, adb, chrome, playwright).
