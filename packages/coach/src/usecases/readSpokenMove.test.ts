import { describe, expect, it } from 'vitest'
import { InMemoryConversationStore } from '../adapters/inMemoryConversationStore'
import { parseSpokenMove, SPOKEN_MOVE_PROMPT, type SpokenMoveFacts } from '../domain/spokenMove'
import { scriptedClient } from '../testing'
import { LoopAgent } from './loopAgent'
import { readSpokenMoveWithCoach } from './readSpokenMove'

const facts: SpokenMoveFacts = {
  said: 'take the bishop with my knight',
  turn: 'white',
  pieces: { white: ['Ke1', 'Ne3'], black: ['Ke8', 'Bd5'] },
  moves: [
    { san: 'Nxd5', does: 'knight e3 takes the bishop on d5' },
    { san: 'Nc4', does: 'knight e3 to c4' },
    { san: 'Kd2', does: 'king e1 to d2' },
  ],
}

const agentWith = (replies: string[]) => {
  const { client, requests } = scriptedClient(replies.map((text) => ({ text })))
  const agent = new LoopAgent({
    id: 'scripted',
    label: 'Scripted coach',
    client,
    tools: [],
    conversations: new InMemoryConversationStore(),
  })
  return { agent, requests }
}

describe('parseSpokenMove', () => {
  it('reads the move, also with text around the JSON', () => {
    expect(parseSpokenMove('{"move": "Nxd5"}', facts)).toBe('Nxd5')
    expect(parseSpokenMove('Sure:\n```json\n{"move":"Nc4"}\n```', facts)).toBe('Nc4')
  })

  it('reads null as no move', () => {
    expect(parseSpokenMove('{"move": null}', facts)).toBeNull()
  })

  it('never takes a move that is not in the list', () => {
    expect(parseSpokenMove('{"move": "Qh5"}', facts)).toBeUndefined()
    expect(parseSpokenMove('{"move": "nxd5"}', facts)).toBeUndefined()
    expect(parseSpokenMove('Nxd5', facts)).toBeUndefined()
    expect(parseSpokenMove('{"move": ""}', facts)).toBeUndefined()
  })
})

describe('the spoken-move prompt', () => {
  it('asks for a listed move or null, and for null when unsure', () => {
    expect(SPOKEN_MOVE_PROMPT).toContain('Never a move that is not in the list')
    expect(SPOKEN_MOVE_PROMPT).toMatch(/unsure, answer null/)
    expect(SPOKEN_MOVE_PROMPT).toMatch(/Never pick a move because it is good or bad/)
  })
})

describe('readSpokenMoveWithCoach', () => {
  it('asks once, with the facts, the prompt and no tools', async () => {
    const { agent, requests } = agentWith(['{"move": "Nxd5"}'])
    expect(await readSpokenMoveWithCoach(agent, facts)).toBe('Nxd5')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.system).toBe(SPOKEN_MOVE_PROMPT)
    expect(requests[0]?.tools).toEqual([])
    expect(JSON.stringify(requests[0]?.messages)).toContain('take the bishop with my knight')
  })

  it('gives null when the coach can’t tell', async () => {
    const { agent } = agentWith(['{"move": null}'])
    expect(await readSpokenMoveWithCoach(agent, facts)).toBeNull()
  })

  it('asks once more after an unusable answer, then gives up', async () => {
    const retried = agentWith(['{"move": "Qh5"}', '{"move": "Nc4"}'])
    expect(await readSpokenMoveWithCoach(retried.agent, facts)).toBe('Nc4')
    expect(retried.requests).toHaveLength(2)

    const failed = agentWith(['no json', '{"move": "Qh5"}', '{"move": "Nc4"}'])
    await expect(readSpokenMoveWithCoach(failed.agent, facts)).rejects.toThrow('no usable move')
    expect(failed.requests).toHaveLength(2)
  })

  it('doesn’t ask at all without a legal move', async () => {
    const { agent, requests } = agentWith(['{"move": "Nxd5"}'])
    expect(await readSpokenMoveWithCoach(agent, { ...facts, moves: [] })).toBeNull()
    expect(requests).toHaveLength(0)
  })
})
