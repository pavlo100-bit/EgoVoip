import { useEffect, useState } from 'react';

/** Ticks once a second while `answeredAt` is set. Returns elapsed seconds. */
export function useCallDuration(answeredAt: number | null): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!answeredAt) {
      setSeconds(0);
      return;
    }
    const tick = () => setSeconds(Math.floor((Date.now() - answeredAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [answeredAt]);

  return seconds;
}
