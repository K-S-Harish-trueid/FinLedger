import React, { useEffect, useState } from 'react';
import { UpdateDialog } from '@/components/UpdateDialog';
import { checkForUpdate, type AvailableUpdate } from '@/lib/updates';

/**
 * Checks once at startup and renders nothing at all unless an update is waiting.
 * `checkForUpdate` never rejects, so a failed check leaves the app untouched.
 * "Later" hides an optional update until the next launch.
 */
export const UpdateGate = (): React.JSX.Element | null => {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    void checkForUpdate().then((found) => {
      if (active) setUpdate(found);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!update || dismissed) return null;
  return <UpdateDialog update={update} onDismiss={() => setDismissed(true)} />;
};
