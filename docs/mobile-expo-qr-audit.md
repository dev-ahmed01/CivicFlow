# Mobile Expo QR launch audit

## Scope and root cause

The user clarified that the failing QR is the terminal's **Expo development launch QR**, not a civic work/project QR. No in-app scanner, entity parser, or project QR contract is required for this flow.

The original checkout had no in-app QR scanner, decoder dependency, scan callback, or QR entity producer. Its `expo-image-picker` actions capture photo evidence. Android CAMERA permission and iOS photo camera text already existed. Adding `expo-camera` would not repair Expo launch.

Confirmed source-level incompatibility:

1. Commit `88dbbb0` (Mobile map) introduced `@maplibre/maplibre-react-native`.
2. `App.tsx` imports `src/screens.tsx`, which re-exports `report-screens.tsx`. That file imports MapLibre at module scope. MapLibre calls `TurboModuleRegistry.getEnforcing` for native modules such as `MLRNMapViewModule`, even before navigating to the map.
3. MapLibre is absent from Expo Go. Its [official setup guide](https://maplibre.org/maplibre-react-native/docs/setup/expo/) explicitly requires rebuilding the app.
4. Both start scripts used plain `expo start`, with no `expo-dev-client` dependency. The installed Expo CLI's `resolveOptionsAsync` selects Expo Go when neither an explicit development-client flag nor that dependency is present.
5. `eas.json` already declares `developmentClient: true` for `development`, but the launcher dependency was missing. Preview/free-demo release APKs also do not load Metro's QR development bundle.

This proves a repository incompatibility. No physical-device error log was supplied or captured; device-specific SDK, Wi-Fi, and firewall conditions remain unverified.

## Fix

- Install `expo-dev-client ~6.0.21` using Expo's SDK 54 version selection.
- Install SDK-compatible `expo-font ~14.0.12` directly, as required by `@expo/vector-icons` and Expo Doctor. It was already transitive, but native peers need direct installation.
- Make `dev` and `start` build shared workspace dependencies before `expo start --dev-client --scheme cityconnect`. Expo defaults to LAN; optional `--tunnel` remains available.
- Configure the development-client plugin with `addGeneratedScheme: false`, reusing the existing `cityconnect` scheme. Add the font plugin requested by the installer. The dynamic config spreads the static config, retaining plugins and EAS project ID.
- Preserve photo evidence, location, notifications, secure storage, MapLibre, API authentication, server-side RBAC, and database behavior.

The [Expo development build workflow](https://docs.expo.dev/develop/development-builds/use-development-builds/) still supports a terminal QR and JavaScript updates without recompiling. Native dependency changes require rebuilding.

## Build and run on Android

From the repository root:

```powershell
corepack pnpm install --frozen-lockfile
Set-Location apps/mobile
corepack pnpm dlx eas-cli@latest build --platform android --profile development
```

Before building, ensure the EAS **development** environment contains `EXPO_PUBLIC_API_URL` pointing to the intended public HTTPS API. The dynamic config requires it for all EAS builds; the preview environment is separate. Keep the existing project ID in `app.json`.

Install the newly built development APK on the phone. Expo Go or an older preview APK cannot gain these native dependencies through a JS reload. Profiles share `com.cityconnect.mobile`: installing one replaces the other, or Android may require uninstalling first if signing certificates differ, which clears the local session.

For each development session, from `apps/mobile`:

```powershell
$env:EXPO_PUBLIC_API_URL = "https://<your-running-api-host>"
corepack pnpm start
```

Scan into the **City Connect development client**, not Expo Go. The terminal should say **Using development build** and display:

```text
cityconnect://expo-development-client/?url=http%3A%2F%2F<computer-LAN-IP>%3A8081
```

Phone and computer need mutually reachable Wi-Fi and Metro access through the local firewall. If LAN access is unavailable, use `corepack pnpm start --tunnel`; Expo may prompt to install its tunnel helper. A Metro tunnel exposes the JavaScript server, not the API.

For a local API, set `EXPO_PUBLIC_API_URL` to `http://<computer-LAN-IP>:4000` before starting Metro. The existing `http://10.0.2.2:4000` fallback is for an Android emulator, not a physical phone. Set the variable in the mobile process or app-local environment; do not rely on the root `.env`. Restart Metro after changing it.

For a standalone demo APK that runs without Metro, use the existing **preview** environment and either profile:

```powershell
# From apps/mobile
corepack pnpm dlx eas-cli@latest build --platform android --profile preview
# Alternative SIH demo profile:
corepack pnpm dlx eas-cli@latest build --platform android --profile free-demo
```

Release APKs contain their own JS bundle and are not terminal-QR development clients. No cloud build or deployment was executed during this audit.

## Native configuration

Android is checked in, so EAS does not automatically apply config plugins to that folder. Inspection confirmed `settings.gradle` uses Expo autolinking, `MainApplication` uses the Expo host/lifecycle wrappers, and `MainActivity` uses `ReactActivityDelegateWrapper`. The main manifest already handles `cityconnect`; the debug manifest permits HTTP development traffic. Autolinking discovers the new native modules. No native source edits or clean prebuild are required for this change.

Expo introspection preserves Android CAMERA permission and RECORD_AUDIO removal, iOS camera text and `cityconnect` scheme, the EAS project ID, and all existing plugins. iOS has no checked-in native folder and uses generated configuration; device builds still require Apple signing.

## Verification and limits

Local verification on 2026-09-10 (commands used Corepack because bare `pnpm` was not on this shell's PATH):

| Command/check | Result |
| --- | --- |
| `corepack pnpm --filter mobile build` | PASS; includes shared/config workspace builds, then TypeScript |
| `corepack pnpm --filter mobile test` | PASS; 37 tests across 7 files, including photo flow and 19 upload/API tests |
| `corepack pnpm --filter mobile lint` | PASS |
| `corepack pnpm install --lockfile-only --frozen-lockfile --ignore-scripts --offline` | PASS; workspace lockfile matches manifests |
| `corepack pnpm --filter mobile exec expo install --check` | PASS; dependencies up to date |
| `corepack pnpm --filter mobile exec expo config --type public --json` | PASS |
| `corepack pnpm --filter mobile exec expo config --type introspect --json` | PASS; camera text, schemes, permissions, project ID, plugins checked |
| `corepack pnpm --filter mobile exec expo-modules-autolinking resolve --platform android --json` | PASS; development client, launcher and font found |
| `corepack pnpm --filter mobile exec expo-modules-autolinking react-native-config --platform android --json` | PASS; MapLibre `MLRNPackage` found |
| `corepack pnpm --filter mobile start --port 8083` with `EXPO_OFFLINE=1` for restricted-network verification | PASS; actual terminal QR printed, "Using development build", LAN `cityconnect://expo-development-client/` URL |
| GET `/_expo/link?platform=android&choice=expo-dev-client` | PASS; HTTP 307 to the City Connect development client |
| Android manifest and complete non-lazy Android JS bundle fetched from Metro | PASS; HTTP 200, 6,917,100 characters, includes `MLRNMapViewModule` |
| Network-enabled `corepack pnpm --filter mobile start --port 8083`, development redirect, Android manifest and bundle | PASS; redirect 307 and manifest/bundle HTTP 200; no manifest asset warning in this run |
| `corepack pnpm dlx expo-doctor` from `apps/mobile` | 17/18; exits 1 for the pre-existing checked-in-native/config-sync warning described above; font dependency failure resolved |
| `git diff --check` | PASS |

The font installer installed the correct dependency but could not automatically edit dynamic Expo config; its requested plugin was added to `app.json`, and config inspection and dependency checks then passed. Restricted-network Metro emitted an aborted manifest-asset lookup warning; the network-enabled verification resolved it. Diagnostic JSON is local under ignored `apps/mobile/.expo/`. Temporary verification servers were stopped.

No Android SDK/ADB or physical device is available here. No APK was compiled or installed, no camera/phone launch was claimed, and no live API login was performed. Existing automated photo checks passed; manual evidence capture remains a device check. Camera hardware and native launch cannot be proved by TypeScript compilation or a desktop browser opening Metro.

Manual device acceptance remains:

1. Install the development APK and start Metro with a phone-reachable API URL.
2. Scan the terminal QR and confirm City Connect opens without missing-module or incompatible-SDK errors.
3. Sign in as Citizen, take reporting evidence, and confirm the location map loads.
4. Sign in as Engineer and open an assigned task through the existing authenticated API.
5. Make a temporary visible text edit, confirm Fast Refresh, and revert the edit.
6. Separately verify standalone preview launch without Metro if demo acceptance is needed.

The QR identifies a development server, not an entity, and grants no application authorization. There is no new API endpoint, QR entity parser, or application handler for arbitrary URLs.
