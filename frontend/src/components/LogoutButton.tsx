import { deleteAccessSession } from "../services/api";

interface LogoutButtonProps {
  onLoggedOut?: () => void;
}

export function LogoutButton({ onLoggedOut }: LogoutButtonProps) {
  return (
    <button
      type="button"
      className="rounded-full border border-line bg-transparent px-3 py-1 text-sm text-ink"
      onClick={() => {
        void deleteAccessSession().finally(() => {
          onLoggedOut?.();
        });
      }}
    >
      退出
    </button>
  );
}
