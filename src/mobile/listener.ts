// Capacitor-style plugins register listeners asynchronously, but React effect cleanups are sync:
// a cleanup that runs before addListener resolves (StrictMode's double mount does exactly that)
// would leak the listener, and every event would then fire twice.

/**
 * Register through `add` and return a sync cleanup that removes the listener — also when it runs
 * before registration finished. `tag` labels the warning if registration fails.
 */
export function addListenerSafely(add: () => Promise<{ remove: () => Promise<void> }>, tag: string): () => void {
  let removed = false
  let remove: (() => Promise<void>) | undefined
  void add()
    .then((handle) => {
      remove = () => handle.remove()
      if (removed) void remove()
    })
    .catch((err: unknown) => console.warn(`[${tag}] listener failed`, err))
  return () => {
    removed = true
    void remove?.()
  }
}
