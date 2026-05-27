"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistry = void 0;
const ai_1 = require("ai");
class ToolRegistry {
    constructor() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.tools = new Map();
    }
    register(name, def) {
        this.tools.set(name, def);
        return this;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toAITools() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = {};
        for (const [name, def] of this.tools) {
            result[name] = (0, ai_1.tool)({
                description: def.description,
                inputSchema: def.schema,
                execute: def.execute
            });
        }
        return result;
    }
    has(name) { return this.tools.has(name); }
    list() { return Array.from(this.tools.keys()); }
}
exports.ToolRegistry = ToolRegistry;
//# sourceMappingURL=ToolRegistry.js.map