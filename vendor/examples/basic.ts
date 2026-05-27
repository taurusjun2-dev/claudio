import { AgentLoop } from '../src'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'

const openai = createOpenAI({
  baseURL: process.env.LITELLM_URL ?? 'https://api.deepseek.com/v1',
  apiKey: process.env.LITELLM_API_KEY ?? ''
})

const agent = new AgentLoop({
  llm: openai(process.env.LITELLM_MODEL ?? 'deepseek-chat'),
  systemPrompt: 'You are a helpful assistant. Use tools when needed.',
  memory: { windowSize: 10 },
  maxSteps: 5,
  onStep: (step) => {
    if (step.toolCalls.length > 0) {
      console.log('[step] tool calls:', step.toolCalls.map(t => t.name))
    }
  }
})

agent.use('get_time', {
  description: 'Get the current time',
  schema: z.object({}),
  execute: async () => new Date().toLocaleString('zh-CN')
})

agent.use('calculate', {
  description: 'Evaluate a math expression',
  schema: z.object({ expression: z.string() }),
  execute: async ({ expression }) => {
    try {
      return String(Function(`"use strict"; return (${expression})`)())
    } catch {
      return 'invalid expression'
    }
  }
})

async function main() {
  console.log('--- Test 1: tool call ---')
  const r1 = await agent.run('What time is it now?')
  console.log('Answer:', r1)

  console.log('\n--- Test 2: math ---')
  const r2 = await agent.run('Calculate 123 * 456 + 789')
  console.log('Answer:', r2)

  console.log('\n--- Test 3: memory (multi-turn) ---')
  const r3 = await agent.run('My favorite number is 42. Remember it.')
  console.log('Answer:', r3)
  const r4 = await agent.run('What is my favorite number?')
  console.log('Answer:', r4)

  console.log('\n--- Test 4: stream ---')
  process.stdout.write('Stream: ')
  for await (const chunk of agent.stream('Say hello in 3 languages, briefly.')) {
    process.stdout.write(chunk)
  }
  console.log()
}

main().catch(console.error)
