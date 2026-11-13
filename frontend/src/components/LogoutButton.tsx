import { deleteAccessSession } from "../services/api";

interface LogoutButtonProps {
  onLoggedOut: () => void;
}

export function LogoutButton({ onLoggedOut }: LogoutButtonProps) {
  return (
    <button
      type="button"
      className="quiet"
      onClick={() => {
        void deleteAccessSession().finally(onLoggedOut);
      }}
    >
      退出
    </button>
  );
}
