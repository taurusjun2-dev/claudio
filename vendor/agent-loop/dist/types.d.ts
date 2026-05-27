import { z } from 'zod';
import { LanguageModel } from 'ai';
export interface ToolDef<TInput extends z.ZodTypeAny = z.ZodTypeAny> {
    description: string;
    schema: TInput;
    execute: (input: z.infer<TInput>) => Promise<unknown>;
}
export interface MemoryOptions {
    windowSize?: number;
    summarize?: boolean;
}
export interface AgentLoopOptions {
    llm: LanguageModel;
    systemPrompt: string;
    memory?: MemoryOptions;
    maxSteps?: number;
    onStep?: (step: StepInfo) => void;
}
export interface StepInfo {
    stepIndex: number;
    toolCalls: Array<{
        name: string;
        input: unknown;
        result: unknown;
    }>;
    text: string;
}
export type RunOptions<T = string> = {
    systemPromptOverride?: string;
    outputSchema?: z.ZodType<T>;
};
//# sourceMappingURL=types.d.ts.map