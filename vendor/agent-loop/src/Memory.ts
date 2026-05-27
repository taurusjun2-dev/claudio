import { ModelMessage, generateText, LanguageModel } from 'ai'
import { MemoryOptions } from './types'

export class Memory {
  private messages: ModelMessage[] = []
  private windowSize: number
  private summarize: boolean
  private llm?: LanguageModel

  constructor(options: MemoryOptions = {}, llm?: LanguageModel) {
    this.windowSize = options.windowSize ?? 20
    this.summarize = options.summarize ?? false
    this.llm = llm
  }

  add(message: ModelMessage): void {
    this.messages.push(message)
  }

  getMessages(): ModelMessage[] {
    if (this.messages.length <= this.windowSize) return [...this.messages]
    return this.messages.slice(-this.windowSize)
  }

  async trim(): Promise<void> {
    if (this.messages.length <= this.windowSize) return

    if (this.summarize && this.llm) {
      const overflow = this.messages.slice(0, -this.windowSize)
      const overflowText = overflow
        .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
        .join('\n')
      const { text } = await generateText({
        model: this.llm,
        prompt: `Summarize this conversation in 2-3 sentences:\n\n${overflowText}`
      })
      this.messages = [
        { role: 'assistant', content: [{ type: 'text', text: `[Summary] ${text}` }] },
        ...this.messages.slice(-this.windowSize)
      ]
    } else {
      this.messages = this.messages.slice(-this.windowSize)
    }
  }

  clear(): void { this.messages = [] }
  length(): number { return this.messages.length }
}
