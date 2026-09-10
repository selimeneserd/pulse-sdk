import { McpServer, type RegisteredTool, type ServerContext } from '@modelcontextprotocol/server';
import { createPulse } from '@pulse-sdk/mcp';
import { z } from 'zod';

// Compile-only acceptance. Type errors below must stay errors; never executed.
function registrationTypes() {
  class CustomerServer extends McpServer {
    customMethod(value: number): number { return value + 1; }
  }
  const pulse = createPulse({ enabled: false, environment: 'test' });
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
