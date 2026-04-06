import {
  streamText,
  convertToModelMessages,
  type UIMessage,
  stepCountIs,
} from "ai";
import { getModel, type ProviderKey } from "@/lib/providers";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { gamedevTools } from "@/lib/tools";

export const maxDuration = 60;

export async function POST(req: Request) {
  const {
    messages,
    provider,
    model: modelId,
    apiKey,
  }: {
    messages: UIMessage[];
    provider: ProviderKey;
    model: string;
    apiKey: string;
  } = await req.json();

  if (!apiKey) {
    return new Response("API key required", { status: 401 });
  }

  const model = getModel(provider, modelId, apiKey);

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: gamedevTools,
    stopWhen: stepCountIs(5),
    onStepFinish: ({ toolResults }) => {
      if (toolResults && toolResults.length > 0) {
        console.log(
          "[GameCodex] Tools used:",
          toolResults.map((r) => r.toolName).join(", ")
        );
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
