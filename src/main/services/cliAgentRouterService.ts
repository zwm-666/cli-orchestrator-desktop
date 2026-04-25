import type {
  CallCliAgentInput,
  CliAgentCallResult,
  CliAgentContext,
  CliAgentDecision,
  CliAgentName,
  CliAgentStreamEvent,
  TaskType,
} from '../../shared/domain.js';
import type { LocalToolRegistryService } from './localToolRegistryService.js';

type CliAgentEventCallback = (event: CliAgentStreamEvent) => void;

const DEFAULT_CLI_AGENT_TIMEOUT_MS = 10 * 60_000;

const createId = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;

const normalizePrompt = (prompt: string): string => prompt.trim();

const hasAny = (value: string, patterns: RegExp[]): boolean => {
  return patterns.some((pattern) => pattern.test(value));
};

export class CliAgentRouterService {
  public constructor(
    private readonly rootDir: string,
    private readonly localTools: LocalToolRegistryService,
  ) {}

  public decideRoute(prompt: string, context: CliAgentContext = {}): CliAgentDecision {
    const normalizedPrompt = normalizePrompt(prompt);
    const lowerPrompt = normalizedPrompt.toLowerCase();
    const taskType = context.taskType ?? this.classifyTaskType(lowerPrompt);

    if (taskType === 'planning' || taskType === 'research') {
      return {
        route: 'claude',
        taskType,
        reason: 'Planning/research work benefits from Claude Code synthesis before implementation.',
      };
    }

    if (taskType === 'general' && normalizedPrompt.length < 180 && !hasAny(lowerPrompt, [/\bfix\b/u, /\bimplement\b/u, /\brefactor\b/u, /\btest\b/u, /\bbuild\b/u, /代码/u, /修复/u, /实现/u])) {
      return {
        route: 'self',
        taskType,
        reason: 'Small low-risk request; the orchestrator can handle it without launching an external CLI agent.',
      };
    }

    if (taskType === 'code' || taskType === 'frontend' || taskType === 'git' || taskType === 'ops') {
      return {
        route: 'codex',
        taskType,
        reason: 'Implementation, repository operations, and verification are routed to Codex CLI for non-interactive execution.',
      };
    }

    if (hasAny(lowerPrompt, [/\bwhy\b/u, /\bdesign\b/u, /\barchitecture\b/u, /方案/u, /分析/u])) {
      return {
        route: 'claude',
        taskType,
        reason: 'The request is analysis-heavy, so Claude Code is selected for synthesis.',
      };
    }

    return {
      route: 'codex',
      taskType,
      reason: 'The request appears actionable and repository-bound, so Codex CLI is selected for execution.',
    };
  }

  public async callCliAgent(input: CallCliAgentInput, onEvent?: CliAgentEventCallback): Promise<CliAgentCallResult> {
    const prompt = normalizePrompt(input.prompt);
    if (!prompt) {
      throw new Error('CLI agent prompt is required.');
    }

    const context = input.context ?? {};
    const recommendedDecision = this.decideRoute(prompt, context);
    const agent = input.agent;
    const decision: CliAgentDecision = recommendedDecision.route === agent
      ? recommendedDecision
      : {
          route: agent,
          taskType: recommendedDecision.taskType,
          reason: `Explicit ${agent} invocation requested; router recommendation was ${recommendedDecision.route} (${recommendedDecision.reason}).`,
        };
    const eventId = createId(`cli-${agent}`);
    const startedAtMs = Date.now();
    const args = this.buildAgentArgs(agent, prompt, context);
    const cwd = context.workspaceRoot?.trim() || this.rootDir;
    const timeoutMs = context.timeoutMs ?? DEFAULT_CLI_AGENT_TIMEOUT_MS;
    let stdout = '';
    let stderr = '';

    onEvent?.({
      id: eventId,
      agent,
      stream: 'system',
      data: `Routing to ${agent}: ${decision.reason}`,
      timestamp: new Date().toISOString(),
      done: false,
    });

    const localResult = await this.localTools.callLocalTool(
      {
        toolName: agent,
        args,
        cwd,
        timeoutMs,
      },
      {
        onOutput: (stream, chunk) => {
          if (stream === 'stdout') {
            stdout += chunk;
          } else {
            stderr += chunk;
          }

          onEvent?.({
            id: eventId,
            agent,
            stream,
            data: chunk,
            timestamp: new Date().toISOString(),
            done: false,
          });
        },
      },
    );

    const output = localResult.result;
    stdout = output?.stdout ?? stdout;
    stderr = output?.stderr ?? stderr;

    onEvent?.({
      id: eventId,
      agent,
      stream: 'system',
      data: localResult.success ? `${agent} completed.` : localResult.error ?? `${agent} failed.`,
      timestamp: new Date().toISOString(),
      done: true,
    });

    return {
      success: localResult.success,
      agent,
      decision: {
        ...decision,
      },
      logEntry: localResult.logEntry,
      stdout,
      stderr,
      exitCode: output?.exitCode ?? null,
      signal: output?.signal ?? null,
      error: localResult.error,
      durationMs: output?.durationMs ?? Date.now() - startedAtMs,
    };
  }

  private classifyTaskType(lowerPrompt: string): TaskType {
    if (hasAny(lowerPrompt, [/\bui\b/u, /\bcss\b/u, /\bfrontend\b/u, /\breact\b/u, /界面/u, /样式/u])) return 'frontend';
    if (hasAny(lowerPrompt, [/\bgit\b/u, /\bcommit\b/u, /\brebase\b/u, /\bpr\b/u])) return 'git';
    if (hasAny(lowerPrompt, [/\bdocker\b/u, /\bdeploy\b/u, /\bci\b/u, /\bterminal\b/u, /运维/u])) return 'ops';
    if (hasAny(lowerPrompt, [/\bresearch\b/u, /\bdocs\b/u, /\bexamples\b/u, /文档/u, /调研/u])) return 'research';
    if (hasAny(lowerPrompt, [/\bplan\b/u, /\bdesign\b/u, /\barchitecture\b/u, /方案/u, /规划/u])) return 'planning';
    if (hasAny(lowerPrompt, [/\bcode\b/u, /\bfix\b/u, /\bimplement\b/u, /\btest\b/u, /\brefactor\b/u, /代码/u, /修复/u, /实现/u])) return 'code';
    return 'general';
  }

  private buildAgentArgs(agent: CliAgentName, prompt: string, context: CliAgentContext): string[] {
    const model = context.model?.trim() ?? '';
    if (agent === 'claude') {
      return [
        '-p',
        '--output-format',
        'text',
        ...(model ? ['--model', model] : []),
        prompt,
      ];
    }

    return [
      'exec',
      ...(model ? ['--model', model] : []),
      '--json',
      '--',
      prompt,
    ];
  }
}
