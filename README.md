# dsh-restart

A DeepSeek Harness plugin that adds a **Restart DSH** row to the bottom-left account menu, directly above **Sign out** / **Sign in**, so a newly installed or updated plugin can be loaded without quitting the application by hand.

Package: `@qhy2333/dsh-restart`

![icon](icon.svg)

## What it does

- Adds a restart action inside the account menu that opens when you click the user avatar at the bottom-left, in the same column as **Settings** and **Sign out**.
- Clicking it opens a confirmation dialog, then quits the desktop app and starts it again.
- Works in the Web GUI and in the DSH desktop app, because both pages are served over the same-origin HTTP listener.

Restarting interrupts tasks that are running at that moment. The confirmation dialog says so before anything happens. If the app does not come back within 20 seconds, the dialog shows an error instead of staying on "Restarting…" forever.

## Why

DSH loads plugin code at boot. Changing a plugin's files, or installing a plugin that needs a fresh module generation, is reported as `restart-required`; the usual fix is to quit the app and open it again. This plugin makes that one click.

## Requirements

- DSH `0.2.2-rc.1` or a later `0.2.x` release.
- The restart endpoint exists only while the Web server is mounted, so the button is for the Web GUI / desktop app rather than a headless profile.
- The actual quit-and-relaunch is supported in the DSH desktop app (Electron). In a plain `dsh web` process the button reports that restart is desktop-only instead of killing the server.

## Install

From the Plugins page in DSH, install this bundle from its Git source:

```
git+https://github.com/QHY2333/dsh-restart.git
```

Then click the user avatar at the bottom-left: **Restart DSH** sits just above **Sign out**. After installing this plugin for the first time, restart DSH once manually; after that the row is available.

## How it works

The Host half registers one exact HTTP route, `/_dsh_restart`:

- `POST` only, with the `x-dsh-restart: 1` header, which a cross-site page cannot send without a CORS preflight that this route does not grant.
- Origin / `Sec-Fetch-Site` is checked against the running Web server.
- The response is sent first. A short launcher then asks Windows WMI to create a helper process. The helper is created with `SW_HIDE` (no console window flashes) and runs outside Electron's job object, in the user's session, so it survives the application exit. It clears `ELECTRON_RUN_AS_NODE` (the Host runs as Node, and a relaunched Electron app must not inherit that), stops every process of the app, waits for them to exit, and starts `process.execPath` again. The executable is never supplied by the browser.
- WMI creation avoids the two failure modes that matter here: a helper inside the Electron job dies with the app, and an Electron process launched with `ELECTRON_RUN_AS_NODE=1` exits immediately instead of showing the window.

The Client half has no slot for the account menu: the shipped account plugin builds its menu from a hardcoded `items` array. The plugin waits for a click on the account trigger (`button[aria-haspopup="menu"][data-signed-out]`), finds the menu portal that opens, clones the last row's live classes, and inserts a native-looking `menuitem` above Sign out. The confirmation dialog is a small React root mounted on `document.body`. No shipped plugin file is modified.

## Troubleshooting

If a restart does not complete, these files in `%TEMP%` say where it stopped:

- `dsh-restart-host.log` — the Host accepted a restart request and launched the WMI launcher.
- `dsh-restart-launcher.log` — the WMI `Win32_Process.Create` result and the helper PID.
- `dsh-restart-helper.log` — the helper started, stopped the app, and the PID of the relaunched application.

`dsh-restart-failure.log` records a Host-side exception from the launcher.

## Privacy

No network requests, no telemetry, no stored data. The only request is the same-origin `POST` to the Host bundle's own route.

## Development

The package is a plain Cordis bundle: `index.js` is the Host half, `client.js` is the Web Client half, and `cordis.patch.yml` inserts the row.

```sh
node --check index.js
node --check client.js
npm test
```

## License

MIT
