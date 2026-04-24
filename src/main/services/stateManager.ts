import type { AppState, RunEvent, SaveProjectContextInput, SaveWorkbenchStateInput, Task, RunSession } from '../../shared/domain.js';
import { DEFAULT_WORKBENCH_STATE } from '../../shared/domain.js';
import type { LocalPersistenceStore } from '../persistence.js';

type StateListener = (state: AppState) => void;
type RunEventListener = (event: RunEvent) => void;

const normalizeRecentWorkspaceRoots = (roots: string[] | undefined, workspaceRoot: string | null): string[] => {
  const filtered = (roots ?? []).filter((entry) => typeof entry === 'string' && entry.trim().length > 0);
  if (!workspaceRoot) {
    return filtered.slice(0, 8);
  }

  return [workspaceRoot, ...filtered.filter((entry) => entry !== workspaceRoot)].slice(0, 8);
};

export class StateManager {
  private readonly stateListeners = new Set<StateListener>();
  private readonly runEventListeners = new Set<RunEventListener>();
  private adaptersProvider: (() => AppState['adapters']) | null = null;

  public constructor(
    private state: AppState,
    private readonly persistenceStore: LocalPersistenceStore,
  ) {}

  public setAdaptersProvider(provider: () => AppState['adapters']): void {
    this.adaptersProvider = provider;
  }

  public refreshDerivedState(): void {
    this.emitStateChanged();
  }

  public getState(): AppState {
    return this.state;
  }

  public getAppState(): AppState {
    return structuredClone(this.state);
  }

  public updateState(updater: (state: AppState) => AppState): void {
    this.state = updater(this.state);
    this.emitStateChanged();
  }

  public getProjectContext(): AppState['projectContext'] {
    return structuredClone(this.state.projectContext);
  }

  public saveProjectContext(input: SaveProjectContextInput): AppState['projectContext'] {
    this.updateState((currentState) => ({
      ...currentState,
      projectContext: {
        summary: input.summary.trim(),
        updatedAt: new Date().toISOString(),
      },
    }));

    return this.getProjectContext();
  }

  public saveWorkbenchState(input: SaveWorkbenchStateInput): AppState {
    this.updateState((currentState) => ({
      ...currentState,
      workbench: (() => {
        const workspaceRoot =
          typeof input.state.workspaceRoot === 'string' && input.state.workspaceRoot.trim().length > 0
            ? input.state.workspaceRoot
            : (currentState.workbench?.workspaceRoot ?? null);
        const nextWorkbench = {
          ...input.state,
          workspaceRoot,
          recentWorkspaceRoots: normalizeRecentWorkspaceRoots(input.state.recentWorkspaceRoots, workspaceRoot),
          processedOrchestrationNodeIds: input.state.processedOrchestrationNodeIds ?? [],
          orchestrationThreadBindings: input.state.orchestrationThreadBindings ?? [],
          activeOrchestrationRunId: input.state.activeOrchestrationRunId ?? null,
          updatedAt: new Date().toISOString(),
        };

        return nextWorkbench;
      })(),
    }));

    return this.getAppState();
  }

  public getWorkbenchWorkspaceRoot(): string | null {
    const root = this.state.workbench?.workspaceRoot;
    return typeof root === 'string' && root.trim().length > 0 ? root : null;
  }

  public setWorkbenchWorkspaceRoot(workspaceRoot: string | null): AppState {
    const normalizedRoot = typeof workspaceRoot === 'string' && workspaceRoot.trim().length > 0 ? workspaceRoot : null;
    this.updateState((currentState) => ({
      ...currentState,
      workbench: {
        ...(currentState.workbench ?? structuredClone(DEFAULT_WORKBENCH_STATE)),
        workspaceRoot: normalizedRoot,
        recentWorkspaceRoots: normalizeRecentWorkspaceRoots(currentState.workbench?.recentWorkspaceRoots, normalizedRoot),
        updatedAt: new Date().toISOString(),
      },
    }));

    return this.getAppState();
  }

  public getNextClaudeTask(): AppState['nextClaudeTask'] {
    return structuredClone(this.state.nextClaudeTask);
  }

  public getRun(runId: string): RunSession {
    const run = this.state.runs.find((entry) => entry.id === runId);

    if (!run) {
      throw new Error(`Run ${runId} was not found.`);
    }

    return structuredClone(run);
  }

  public getTask(taskId: string): Task {
    const task = this.state.tasks.find((entry) => entry.id === taskId);

    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }

    return structuredClone(task);
  }

  public onStateChanged(listener: StateListener): () => void {
    this.stateListeners.add(listener);

    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public onRunEvent(listener: RunEventListener): () => void {
    this.runEventListeners.add(listener);

    return () => {
      this.runEventListeners.delete(listener);
    };
  }

  public emitRunEvent(event: RunEvent): void {
    this.runEventListeners.forEach((listener) => {
      listener(structuredClone(event));
    });
  }

  private emitStateChanged(): void {
    if (this.adaptersProvider) {
      this.state = {
        ...this.state,
        adapters: this.adaptersProvider(),
      };
    }

    const snapshot = this.getAppState();
    this.persistenceStore.queueAppStateSave(snapshot);

    this.stateListeners.forEach((listener) => {
      listener(snapshot);
    });
  }
}
