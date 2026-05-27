import { generateText, streamText, stepCountIs, ModelMessage, Output } from 'ai'
import { z } from 'zod'
import { ToolRegistry } from './ToolRegistry'
import { Memory } from './Memory'
import { AgentLoopOptions, ToolDef, RunOptions } from './types'

export class AgentLoop {
  private registry: ToolRegistry
  private memory: Memory
  private options: AgentLoopOptions

  constructor(options: AgentLoopOptions) {
    this.options = options
    this.registry = new ToolRegistry()
    this.memory = new Memory(options.memory, options.llm)
  }

  use<T extends z.ZodTypeAny>(name: string, def: ToolDef<T>): this {
    this.registry.register(name, def)
    return this
  }

  async run<T = string>(input: string, options?: RunOptions<T>): Promise<T> {
    const systemPrompt = options?.systemPromptOverride ?? this.options.systemPrompt

    this.memory.add({ role: 'user', content: input })
    await this.memory.trim()

    const history = this.memory.getMessages().slice(0, -1)
    const messages = [...history, { role: 'user', content: input }] as ModelMessage[]
    const tools = this.registry.toAITools()
    const maxSteps = this.options.maxSteps ?? 10

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onStepFinish = (step: any) => {
      if (this.options.onStep) {
        this.options.onStep({
          stepIndex: 0,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          toolCalls: (step.toolCalls ?? []).map((tc: any) => ({
            name: tc.toolName,
            input: tc.args,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            result: (step.toolResults ?? []).find((tr: any) => tr.toolCallId === tc.toolCallId)?.output
          })),
          text: step.text
        })
      }
    }

    if (options?.outputSchema) {
      const result = await generateText({
        model: this.options.llm,
        system: systemPrompt,
        messages,
        tools,
        stopWhen: stepCountIs(maxSteps),
        output: Output.object({ schema: options.outputSchema }),
        onStepFinish
      })
      const output = await result.output
      this.memory.add({ role: 'assistant', content: JSON.stringify(output) })
      return output as T
    } else {
      const result = await generateText({
        model: this.options.llm,
        system: systemPrompt,
        messages,
        tools,
        stopWhen: stepCountIs(maxSteps),
        onStepFinish
      })
      this.memory.add({ role: 'assistant', content: result.text })
      return result.text as T
    }
  }

  async *stream(input: string, options?: { systemPromptOverride?: string }): AsyncGenerator<string> {
    const systemPrompt = options?.systemPromptOverride ?? this.options.systemPrompt

    this.memory.add({ role: 'user', content: input })
    await this.memory.trim()

    const history = this.memory.getMessages().slice(0, -1)

    const result = streamText({
      model: this.options.llm,
      system: systemPrompt,
      messages: [...history, { role: 'user', content: input }] as ModelMessage[],
      tools: this.registry.toAITools(),
      stopWhen: stepCountIs(this.options.maxSteps ?? 10)
    })

    let fullText = ''
    for await (const chunk of result.textStream) {
      fullText += chunk
      yield chunk
    }

    this.memory.add({ role: 'assistant', content: fullText })
  }

  clearMemory(): void { this.memory.clear() }
  tools(): string[] { return this.registry.list() }
}
