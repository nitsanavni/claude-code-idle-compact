// The MCP tools idle-compact registers; Claude sees them as mcp__idle-compact__<name>.

export const TOOLS = [
  {
    name: 'config',
    description:
      'Read or change idle-compact settings; applies immediately (re-arms the idle timer). Fields: enabled, idleSeconds, minTokens, dryRun, instructions, announce (comma list: log,toast,notify,prompt), afterPrompt (testing: text auto-submitted after a compaction to wake Claude; empty = off); reset:true restores defaults. No fields = just read.',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        idleSeconds: { type: 'number' },
        minTokens: { type: 'number' },
        dryRun: { type: 'boolean' },
        instructions: { type: 'string' },
        announce: { type: 'string' },
        afterPrompt: { type: 'string' },
        reset: { type: 'boolean' },
      },
    },
    isDeferred: false,
  },
  {
    name: 'status',
    description: 'Show idle-compact state: armed, fireAt, lastOutcome, context tokens.',
    inputSchema: { type: 'object', properties: {} },
    isDeferred: false,
  },
  {
    name: 'compact_after_turn',
    description: 'Compact this conversation (like /compact) as soon as the current turn ends.',
    inputSchema: { type: 'object', properties: {} },
    isDeferred: false,
  },
] as const
