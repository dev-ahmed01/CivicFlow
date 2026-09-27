# Render compatibility shim for legacy service build commands.
# The old city-connect-api service still runs "corepack enable", but Render's
# managed pnpm shim lives on a read-only filesystem. pnpm is already available,
# so treating only that redundant subcommand as a no-op is safe.
corepack() {
  if [ "$1" = "enable" ]; then
    return 0
  fi
  command /usr/bin/corepack "$@"
}

# Keep the original failed Render service usable as a compatibility endpoint.
# When LEGACY_PROXY_TARGET is set, its fixed start command is translated into
# a lightweight reverse proxy to the canonical backend, avoiding duplicate DB
# credentials while preserving the old public URL.
pnpm() {
  if [ -n "$LEGACY_PROXY_TARGET" ]; then
    if [ "$1" = "--filter" ] && [ "$2" = "db" ] && [ "$3" = "exec" ] && [ "$4" = "prisma" ] && [ "$5" = "migrate" ] && [ "$6" = "deploy" ]; then
      return 0
    fi
    if [ "$1" = "--filter" ] && [ "$2" = "api" ] && [ "$3" = "start" ]; then
      command node /opt/render/project/src/render-legacy-proxy.mjs
      return $?
    fi
  fi
  command /usr/bin/pnpm "$@"
}
