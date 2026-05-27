import { ModelMessage, LanguageModel } from 'ai';
import { MemoryOptions } from './types';
export declare class Memory {
    private messages;
    private windowSize;
    private summarize;
    private llm?;
    constructor(options?: MemoryOptions, llm?: LanguageModel);
    add(message: ModelMessage): void;
    getMessages(): ModelMessage[];
    trim(): Promise<void>;
    clear(): void;
    length(): number;
}
//# sourceMappingURL=Memory.d.ts.map