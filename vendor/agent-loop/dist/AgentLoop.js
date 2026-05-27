"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentLoop = void 0;
const ai_1 = require("ai");
const ToolRegistry_1 = require("./ToolRegistry");
const Memory_1 = require("./Memory");
class AgentLoop {
    constructor(options) {
        this.options = options;
        this.registry = new ToolRegistry_1.ToolRegistry();
        this.memory = new Memory_1.Memory(options.memory, options.llm);
    }
    use(name, def) {
        this.registry.register(name, def);
        return this;
    }
    async run(input, options) {
        const systemPrompt = options?.systemPromptOverride ?? this.options.systemPrompt;
        this.memory.add({ role: 'user', content: input });
        await this.memory.trim();
        const history = this.memory.getMessages().slice(0, -1);
        const messages = [...history, { role: 'user', content: input }];
        const tools = this.registry.toAITools();
        const maxSteps = this.options.maxSteps ?? 10;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const onStepFinish = (step) => {
            if (this.options.onStep) {
                this.options.onStep({
                    stepIndex: 0,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    toolCalls: (step.toolCalls ?? []).map((tc) => ({
                        name: tc.toolName,
                        input: tc.args,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        result: (step.toolResults ?? []).find((tr) => tr.toolCallId === tc.toolCallId)?.output
                    })),
                    text: step.text
                });
            }
        };
        if (options?.outputSchema) {
            const result = await (0, ai_1.generateText)({
                model: this.options.llm,
                system: systemPrompt,
                messages,
                tools,
                stopWhen: (0, ai_1.stepCountIs)(maxSteps),
                output: ai_1.Output.object({ schema: options.outputSchema }),
                onStepFinish
            });
            const output = await result.output;
            this.memory.add({ role: 'assistant', content: JSON.stringify(output) });
            return output;
        }
        else {
            const result = await (0, ai_1.generateText)({
                model: this.options.llm,
                system: systemPrompt,
                messages,
                tools,
                stopWhen: (0, ai_1.stepCountIs)(maxSteps),
                onStepFinish
            });
            this.memory.add({ role: 'assistant', content: result.text });
            return result.text;
        }
    }
    async *stream(input, options) {
        const systemPrompt = options?.systemPromptOverride ?? this.options.systemPrompt;
        this.memory.add({ role: 'user', content: input });
        await this.memory.trim();
        const history = this.memory.getMessages().slice(0, -1);
        const result = (0, ai_1.streamText)({
            model: this.options.llm,
            system: systemPrompt,
            messages: [...history, { role: 'user', content: input }],
            tools: this.registry.toAITools(),
            stopWhen: (0, ai_1.stepCountIs)(this.options.maxSteps ?? 10)
        });
        let fullText = '';
        for await (const chunk of result.textStream) {
            fullText += chunk;
            yield chunk;
        }
        this.memory.add({ role: 'assistant', content: fullText });
    }
    clearMemory() { this.memory.clear(); }
    tools() { return this.registry.list(); }
}
exports.AgentLoop = AgentLoop;
//# sourceMappingURL=AgentLoop.js.map