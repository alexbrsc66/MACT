# MACT Studio (PC application)

MACT Studio loads ROM/RAM images and bank windows into the MACT firmware over
the network (TCP port 3334), shows a live memory watch and opens a terminal on
the firmware console (TCP port 3335). The protocol is documented in
[`docs/protocol.md`](../docs/protocol.md).

## Download

Installers are attached to each [GitHub Release](https://github.com/alexbrsc66/MACT/releases):

| File | System |
|---|---|
| `MACT-Studio-<version>-win-x64.exe` | Windows installer |
| `MACT-Studio-<version>-portable.exe` | Windows, no installation |
| `MACT-Studio-<version>-mac-universal.dmg` | macOS (Intel and Apple Silicon) |

The installers are **not code-signed**, so the system warns on first start:

- **Windows** (SmartScreen, "Windows protected your PC"): click *More info*,
  then *Run anyway*.
- **macOS** ("MACT Studio was not opened" / "cannot verify the developer"):
  click *Done*, then open *System Settings -> Privacy & Security*, scroll to
  "MACT Studio was blocked" and click *Open Anyway*, then confirm. On macOS 15
  and later right-click -> *Open* is no longer enough.

On macOS the app is **ad-hoc signed** by the build (no developer identity):
Gatekeeper still warns, but the system can attach the **Local Network**
permission to it. At the first *Connect* macOS asks for that permission: allow
it, or turn it on later in *System Settings -> Privacy & Security -> Local
Network*. Without it every connection to the board fails with `EHOSTUNREACH`.

If the connection fails, check *System Settings -> Privacy & Security -> Local
Network*: **MACT Studio** must be switched on, and also **Electron** if it is
in the list (the app can show up under that name, its internal runtime).

If the app opens but never connects (for example with a .dmg built before the
ad-hoc signature was fixed), re-sign it once from the Terminal and start it again:

```
codesign --force --deep --sign - "/Applications/MACT Studio.app"
```

To try the app without a board, run the simulator in
[`tools/mact_board_sim.py`](../tools/mact_board_sim.py) on another computer of
the same network (`python3 mact_board_sim.py`) and connect to its address.

## Using it

See the [quick guide with screenshots](../docs/mact-studio.md).

1. **Memory** tab: enter the board IP (shown by the `net` command on the serial
   console), *Connect*, add the ROM files with their start address and mode,
   *Send all*. Bank-switched areas go in *Bank windows*. *Save config* stores
   the whole setup in a `.json` file (see the [demos](../demos/) for examples).
2. **Debug** tab: memory watch (up to 16 bytes per range, manual or automatic
   refresh) and a terminal on the firmware console.

## Building from source

Requires [Node.js](https://nodejs.org) 24 (the GitHub Action builds with 24.22.1).

```
cd app
npm ci
npm start                      # run the app
npx electron-builder --win     # Windows installer + portable, in app/dist
npx electron-builder --mac     # macOS universal .dmg (on a Mac)
```

The GitHub Action in `.github/workflows/build-app.yml` builds both on every
version tag.
