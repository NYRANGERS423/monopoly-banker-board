import { BarChart3, Home, Settings, Shield, Trophy } from 'lucide-react';
import type { Tab } from '../store/gameStore';
import { useGame } from '../store/gameStore';

export function BottomNav() {
  const tab = useGame((s) => s.tab);
  const setTab = useGame((s) => s.setTab);
  const isAdmin = useGame((s) => s.is_admin);

  const items: Array<{ key: Tab; label: string; Icon: typeof Home }> = [
    { key: 'home', label: 'Home', Icon: Home },
    { key: 'stats', label: 'Stats', Icon: BarChart3 },
    { key: 'leaderboard', label: 'Leaders', Icon: Trophy },
    { key: 'settings', label: 'Settings', Icon: Settings },
  ];
  if (isAdmin) {
    items.push({ key: 'admin', label: 'Admin', Icon: Shield });
  }

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-white/5 bg-bg-elev/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-xl grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ key, label, Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex flex-col items-center justify-center py-2.5 transition-colors ${
                active ? 'text-accent' : 'text-ink-dim hover:text-ink'
              }`}
            >
              <Icon size={20} />
              <span className={`text-[11px] mt-0.5 ${active ? 'font-semibold' : ''}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
