import { createFileRoute } from "@tanstack/react-router";

import { ActivityPage } from "../../pages/ActivityPage";
import { listActivity } from "../../services/api";

export const Route = createFileRoute("/_authed/activity")({
  ssr: false,
  loader: async () => {
    const payload = await listActivity();
    return { records: payload.data ?? [] };
  },
  component: ActivityRoute,
});

function ActivityRoute() {
  const data = Route.useLoaderData();
  return <ActivityPage initialRecords={data.records} />;
}
