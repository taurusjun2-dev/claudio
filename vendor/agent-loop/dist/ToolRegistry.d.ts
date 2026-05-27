import { z } from 'zod';
import { ToolDef } from './types';
export declare class ToolRegistry {
    private tools;
    register<T extends z.ZodTypeAny>(name: string, def: ToolDef<T>): this;
    toAITools(): Record<string, any>;
    has(name: string): boolean;
    list(): string[];
}
//# sourceMappingURL=ToolRegistry.d.ts.map