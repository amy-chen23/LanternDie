import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parsePublicationLedger, publicationUpdates } from '../lib/publication-celebration';
import type { PublicationCelebration, PublicationLedger } from '../lib/publication-celebration';
import type { Report } from '../lib/reports';

export function usePublicationCelebration(userId: string | undefined, reports: Report[], ready: boolean) {
  const memory = useRef<{ userId: string; ledger: PublicationLedger | null } | null>(null);
  const tasks = useRef(Promise.resolve());
  const [queue, setQueue] = useState<{ userId: string; items: PublicationCelebration[] } | null>(null);
  useEffect(() => {
    if (!userId || !ready) return;
    let cancelled = false;
    tasks.current = tasks.current.then(async () => {
      const key = `lanterndie:publication-celebrations:${userId}`;
      if (memory.current?.userId !== userId) {
        const stored = await AsyncStorage.getItem(key).catch(() => null);
        if (cancelled) return;
        memory.current = { userId, ledger: parsePublicationLedger(stored) };
      }
      if (cancelled) return;
      const update = publicationUpdates(memory.current.ledger, reports, userId);
      memory.current.ledger = update.ledger;
      if (update.celebrations.length) setQueue(current => ({ userId,
        items: [...(current?.userId === userId ? current.items : []), ...update.celebrations] }));
      if (update.changed) await AsyncStorage.setItem(key, JSON.stringify(update.ledger)).catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId, reports, ready]);
  return {
    celebration: queue && queue.userId === userId ? queue.items[0] ?? null : null,
    dismiss: () => setQueue(current => current && current.userId === userId ? { ...current, items: current.items.slice(1) } : current),
  };
}
