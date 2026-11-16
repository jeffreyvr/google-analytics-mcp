export type ToolTextResult = {
  content: [{ type: "text"; text: string }];
  isError?: boolean;
};

export async function asToolResult(
  work: () => Promise<string>,
): Promise<ToolTextResult> {
  try {
    return { content: [{ type: "text", text: await work() }] };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error.";
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}

export function textResult(text: string): ToolTextResult {
  return { content: [{ type: "text", text }] };
}
