import { z } from 'zod';
import { AgentLoopOptions, ToolDef, RunOptions } from './types';
export declare class AgentLoop {
    private registry;
    private memory;
    private options;
    constructor(options: AgentLoopOptions);
    use<T extends z.ZodTypeAny>(name: string, def: ToolDef<T>): this;
    run<T = string>(input: string, options?: RunOptions<T>): Promise<T>;
    stream(input: string, options?: {
        systemPromptOverride?: string;
    }): AsyncGenerator<string>;
    clearMemory(): void;
    tools(): string[];
}
//# sourceMappingURL=AgentLoop.d.ts.map