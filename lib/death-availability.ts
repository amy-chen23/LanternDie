type NativeBridge = { install?: unknown } | null | undefined;

export function hasNativeRuntime(bridge: NativeBridge, installedApi?: unknown) {
  return installedApi != null || typeof bridge?.install === 'function';
}

export async function loadNativeRuntime<T>(bridge: NativeBridge, installedApi: unknown, loader: () => Promise<T>): Promise<T> {
  // Guard before importing: the runtime's module initializer calls install()
  // immediately and Metro can report that exception even if import() is caught.
  if (!hasNativeRuntime(bridge, installedApi)) throw new Error('native_build_required');
  return loader();
}
