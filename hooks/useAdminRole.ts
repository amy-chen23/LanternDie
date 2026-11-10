import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { createAdminAccessGuard } from '../lib/admin-access';

export function useAdminRole(userId: string | undefined) {
  const [role, setRole] = useState({ userId: '', allowed: false, error: '' });
  const guard = useRef(createAdminAccessGuard());
  const currentUser = useRef(userId);
  const active = useRef(false);
  // Prevent a response from a previous account from being accepted even between
  // render and effect cleanup. Access is never carried across account IDs.
  if (currentUser.current !== userId) { currentUser.current = userId; guard.current.invalidate(); }
  const refresh = useCallback(async () => {
    if (!active.current || !userId || !supabase) return false;
    const result = await guard.current.check(() => supabase!.rpc('get_my_admin_status'));
    if (!active.current || !result || currentUser.current !== userId) return false;
    setRole({ userId, ...result });
    return result.allowed;
  }, [userId]);
  useEffect(() => {
    setRole({ userId: userId ?? '', allowed: false, error: '' });
    if (!userId || !supabase) { active.current = false; return; }
    active.current = true;
    void refresh();
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 60_000);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user.id !== userId) {
        guard.current.invalidate();
        setRole({ userId: '', allowed: false, error: '' });
      } else if (event === 'TOKEN_REFRESHED') {
        // Supabase auth callbacks must not await other Supabase operations.
        setTimeout(() => { if (currentUser.current === userId) void refresh(); }, 0);
      }
    });
    return () => { active.current = false; guard.current.invalidate(); foreground.remove(); clearInterval(timer); subscription.unsubscribe(); };
  }, [userId, refresh]);
  const matches = Boolean(userId && role.userId === userId);
  return { isAdmin: matches && role.allowed, error: matches ? role.error : '', refresh };
}
