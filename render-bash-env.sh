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
