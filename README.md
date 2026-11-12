# dsh-restart

A DeepSeek Harness plugin that adds a **Restart DSH** button to the sidebar footer, so a newly installed or updated plugin can be loaded without quitting the application by hand.

Package: `@qhy2333/dsh-restart`

![icon](icon.svg)

## What it does

- Adds a restart action at the bottom-left of the sidebar, in the same column as the account/settings row.
- Clicking it opens a confirmation dialog, then quits the desktop app and starts it again.
- Works in the Web GUI and in the DSH desktop app, because both pages are served over the same-origin HTTP listener.

Restarting interrupts tasks that are running at that moment. The confirmation dialog says so before anything happens.

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

Then open the bottom-left sidebar: **Restart DSH** sits just above the account row. After installing this plugin for the first time, restart DSH once manually; after that the button is available.

## How it works

The Host half registers one exact HTTP route, `/_dsh_restart`:

- `POST` only, with the `x-dsh-restart: 1` header, which a cross-site page cannot send without a CORS preflight that this route does not grant.
- Origin / `Sec-Fetch-Site` is checked against the running Web server.
- The response is sent first; a detached helper then stops every process of the app and launches `process.execPath` again. The executable is never supplied by the browser.
- On Windows the helper is a hidden, encoded PowerShell script, so install paths with spaces or non-ASCII characters work.

The Client half registers a `sidebar.footer.action` item through `ctx.slots`, renders its own dialog with the current theme tokens, and has no dependency on other plugins' DOM or styles.

## Privacy

No network requests, no telemetry, no stored data. The only request is the same-origin `POST` to the Host bundle's own route.

## Development

The package is a plain Cordis bundle: `index.js` is the Host half, `client.js` is the Web Client half, and `cordis.patch.yml` inserts the row.

```sh
node --check index.js
node --check client.js
```

## License

MIT
