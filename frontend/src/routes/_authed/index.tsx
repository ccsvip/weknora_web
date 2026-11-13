import { createFileRoute } from "@tanstack/react-router";

import { ConversationPage } from "../../pages/ConversationPage";
import { listConversations, listKnowledgeBases } from "../../services/api";

export const Route = createFileRoute("/_authed/")({
  ssr: false,
  loader: async () => {
    const knowledge = await listKnowledgeBases();
    const conversations = await listConversations();
    return {
      knowledge,
      conversations: conversations.data ?? [],
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
