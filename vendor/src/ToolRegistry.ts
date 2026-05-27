import { z } from 'zod'
import { tool } from 'ai'
import { ToolDef } from './types'

export class ToolRegistry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tools: Map<string, ToolDef<any>> = new Map()

  register<T extends z.ZodTypeAny>(name: string, def: ToolDef<T>): this {
    this.tools.set(name, def)
    return this
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toAITools(): Record<string, any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, any> = {}
    for (const [name, def] of this.tools) {
      result[name] = tool({
        description: def.description,
        inputSchema: def.schema,
        execute: def.execute
      })
    }
    return result
  }

  has(name: string): boolean { return this.tools.has(name) }
  list(): string[] { return Array.from(this.tools.keys()) }
}
