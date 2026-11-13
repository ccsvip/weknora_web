import { createFileRoute, redirect } from "@tanstack/react-router";

import { LoginPage } from "../pages/LoginPage";
import { probeAccess } from "../services/api";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    if ((await probeAccess()) === "ok") {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});
