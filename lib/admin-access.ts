export type AdminAccessResult = { allowed: boolean; error: string };
/** Deny on network errors, malformed responses, or any value other than true. */
export async function checkAdminAccess(request: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<AdminAccessResult> {
  try {
    const { data, error } = await request();
    if (error || typeof data !== 'boolean') return { allowed: false, error: 'Could not check account access. Please refresh.' };
    return { allowed: data === true, error: '' };
  } catch {
    return { allowed: false, error: 'Could not check account access. Please refresh.' };
  }
}

// Ignore results from a superseded request, including an earlier login. Kept
// separate from React so account-switch/network races can be regression tested.
export function createAdminAccessGuard() {
  let generation = 0;
  return {
    invalidate() { generation++; },
    async check(request: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<AdminAccessResult | null> {
      const current = ++generation;
      const result = await checkAdminAccess(request);
      return current === generation ? result : null;
    },
  };
}
