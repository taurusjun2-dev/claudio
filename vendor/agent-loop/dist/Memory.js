"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Memory = void 0;
const ai_1 = require("ai");
class Memory {
    constructor(options = {}, llm) {
        this.messages = [];
        this.windowSize = options.windowSize ?? 20;
        this.summarize = options.summarize ?? false;
        this.llm = llm;
    }
    add(message) {
        this.messages.push(message);
    }
    getMessages() {
        if (this.messages.length <= this.windowSize)
            return [...this.messages];
        return this.messages.slice(-this.windowSize);
    }
    async trim() {
        if (this.messages.length <= this.windowSize)
            return;
        if (this.summarize && this.llm) {
            const overflow = this.messages.slice(0, -this.windowSize);
            const overflowText = overflow
                .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
                .join('\n');
            const { text } = await (0, ai_1.generateText)({
                model: this.llm,
                prompt: `Summarize this conversation in 2-3 sentences:\n\n${overflowText}`
            });
            this.messages = [
                { role: 'assistant', content: [{ type: 'text', text: `[Summary] ${text}` }] },
                ...this.messages.slice(-this.windowSize)
            ];
        }
        else {
            this.messages = this.messages.slice(-this.windowSize);
        }
    }
    clear() { this.messages = []; }
    length() { return this.messages.length; }
}
exports.Memory = Memory;
//# sourceMappingURL=Memory.js.map