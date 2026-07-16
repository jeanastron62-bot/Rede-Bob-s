import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useSocketStore } from '../../stores/useSocketStore';

interface PanelLayoutProps {
  title: string;
  children: ReactNode;
}

export function PanelLayout({ title, children }: PanelLayoutProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const disconnectAll = useSocketStore((s) => s.disconnectAll);

  const handleLogout = () => {
    disconnectAll();
    logout();
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="flex items-center justify-between bg-bg-surface px-4 py-3 shadow-md">
        <div>
          <h1 className="text-lg font-bold text-white">{title}</h1>
          {user && <p className="text-xs text-white/50">{user.username} · {user.role}</p>}
        </div>
        <button onClick={handleLogout} className="flex h-11 items-center gap-2 rounded-lg bg-bg-elevated px-3 text-sm text-white/80">
          <LogOut size={18} />
          Sair
        </button>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
