// Node 24 can fail inside os.userInfo() on some Windows hosts before tsx starts.
// tsx only needs an identifier for its temporary directory, so expose the
// POSIX-style uid hook it already prefers and avoid the failing Windows call.
if (process.platform === "win32" && typeof process.geteuid !== "function") {
  Object.defineProperty(process, "geteuid", {
    configurable: true,
    value: () => 0,
  });

  // tsx launches a child process in watch mode. Carry the shim into that
  // process as well; otherwise its IPC path setup calls os.userInfo() again.
  if (!process.env.NODE_OPTIONS?.includes(__filename)) {
    process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, `--require=${__filename}`]
      .filter(Boolean)
      .join(" ");
  }
}
