import { createFileRoute } from "@tanstack/react-router";

import { ConversationPage } from "../../pages/ConversationPage";
import { listConversations, listKnowledgeBases } from "../../services/api";

export const Route = createFileRoute("/_authed/")({
  ssr: false,
  loader: async () => {
    const [knowledgeResult, conversationsResult] = await Promise.allSettled([
      listKnowledgeBases(),
      listConversations(),
    ]);
    const knowledge =
      knowledgeResult.status === "fulfilled"
        ? knowledgeResult.value
        : { data: [], reason: "upstream_unreachable" };

    return {
      knowledge,
      conversations:
        conversationsResult.status === "fulfilled" ? conversationsResult.value.data ?? [] : [],
    };
  },
  component: DeskRoute,
});

function DeskRoute() {
  const data = Route.useLoaderData();
  return (
    <ConversationPage
      initialKnowledge={data.knowledge}
      initialConversations={data.conversations}
    />
  );
}
