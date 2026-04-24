import { useEffect, useRef } from 'react';
import type { WorkbenchState } from '../../../shared/domain.js';

interface UseQueuedWorkbenchPersistInput {
  workbench: WorkbenchState;
  persistWorkbench: (nextWorkbench: WorkbenchState) => Promise<void>;
}

interface UseQueuedWorkbenchPersistResult {
  getLatestWorkbench: () => WorkbenchState;
  queueWorkbenchPersist: (updater: (currentWorkbench: WorkbenchState) => WorkbenchState) => Promise<WorkbenchState>;
}

export function useQueuedWorkbenchPersist(input: UseQueuedWorkbenchPersistInput): UseQueuedWorkbenchPersistResult {
  const { workbench, persistWorkbench } = input;
  const workbenchRef = useRef(workbench);
  const queueRef = useRef(Promise.resolve());

  useEffect(() => {
    workbenchRef.current = workbench;
  }, [workbench]);

  const getLatestWorkbench = (): WorkbenchState => {
    return workbenchRef.current;
  };

  const queueWorkbenchPersist = (updater: (currentWorkbench: WorkbenchState) => WorkbenchState): Promise<WorkbenchState> => {
    const run = queueRef.current.catch(() => undefined).then(async () => {
      const currentWorkbench = workbenchRef.current;
      const nextWorkbench = updater(currentWorkbench);
      if (nextWorkbench === currentWorkbench) {
        return currentWorkbench;
      }

      workbenchRef.current = nextWorkbench;

      try {
        await persistWorkbench(nextWorkbench);
        return nextWorkbench;
      } catch (error: unknown) {
        workbenchRef.current = currentWorkbench;
        throw error;
      }
    });

    queueRef.current = run.then(() => undefined, () => undefined);
    return run;
  };

  return {
    getLatestWorkbench,
    queueWorkbenchPersist,
  };
}
