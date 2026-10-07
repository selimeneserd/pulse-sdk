import { McpServer, type RegisteredTool, type ServerContext } from '@modelcontextprotocol/server';
import { createPulse } from '@reviseflow/pulse';
import type { PulseEvent, PulseHandlerEvent, PulseUsageEvent } from '@reviseflow/pulse-core';
import { z } from 'zod';

// Compile-only acceptance. Type errors below must stay errors; never executed.
function registrationTypes() {
  class CustomerServer extends McpServer {
    customMethod(value: number): number { return value + 1; }
  }
  const pulse = createPulse({ enabled: false, environment: 'test' });
  pulse.recordUsage({ provider: 'fixture', model: 'fixture', inputTokens: 1 });
  // @ts-expect-error Usage is numeric scalar metadata, never a provider object.
  pulse.recordUsage({ provider: 'fixture', model: 'fixture', inputTokens: '1' });
  // @ts-expect-error Raw prompts are not part of the public usage API.
  pulse.recordUsage({ provider: 'fixture', model: 'fixture', inputTokens: 1, prompt: 'private' });
  const contextResult: Promise<number> = pulse.withToolContext({ toolName: 'fixture' }, async () => 1);
  void contextResult;
  const server = pulse.wrapServer(new CustomerServer({ name: 'typed', version: '1' }));
  const subclassResult: number = server.customMethod(2);
  // @ts-expect-error Preserve subclass parameter type.
  server.customMethod('bad');
  const handle: RegisteredTool = server.registerTool('typed', {
    inputSchema: z.object({ quantity: z.number(), label: z.string().optional() }),
    outputSchema: z.object({ total: z.number() }),
    annotations: { readOnlyHint: true },
  }, (args, ctx) => {
    const context: ServerContext = ctx;
    const quantity: number = args.quantity;
    // @ts-expect-error Input fields retain inference.
    const invalid: string = args.quantity;
    // @ts-expect-error Unknown argument fields must not compile.
    args.missing;
    void context; void invalid;
    return { content: [], structuredContent: { total: quantity } };
  });
  handle.update({ name: 'renamed', enabled: false });
  handle.enable(); handle.disable(); handle.remove();
  server.registerTool('without_args', {}, ctx => {
    const context: ServerContext = ctx;
    void context;
    return { content: [] };
  });
  server.registerTool('legacy_raw_shape', { inputSchema: { value: z.number() } }, args => {
    const value: number = args.value;
    // @ts-expect-error Deprecated upstream overload still retains its types.
    const invalid: string = args.value;
    void value; void invalid;
    return { content: [] };
  });
  // @ts-expect-error Preserve original required result shape.
  server.registerTool('bad_result', {}, () => 'bad');
  void subclassResult;
}
void registrationTypes;

function eventTypes(event: PulseEvent) {
  if (event.kind === 'model_usage.recorded') {
    const narrowed: PulseUsageEvent = event;
    const tokens: number | null = narrowed.input_tokens;
    // @ts-expect-error Usage events cannot be treated as handler outcomes.
    event.duration_ms;
    void tokens;
  } else {
    const narrowed: PulseHandlerEvent = event;
    const duration: number = narrowed.duration_ms;
    // @ts-expect-error Handler events do not carry token totals.
    event.input_tokens;
    void duration;
  }
}
void eventTypes;
