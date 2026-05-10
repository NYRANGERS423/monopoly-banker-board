import { useState } from 'react';
import toast from 'react-hot-toast';
import { PLAYER_COLORS, type ErrorPayload, type JoinResult, type Player } from '@monopoly/shared';
import { emit } from '../socket';
import { useGame } from '../store/gameStore';
import { LeaderboardPanel } from '../components/LeaderboardPanel';
import { Trophy } from 'lucide-react';
import { formatMoney } from '../utils/currency';

export function JoinScreen() {
  const state = useGame((s) => s.state);
  const setPlayerId = useGame((s) => s.setPlayerId);
  const setState = useGame((s) => s.setState);
  const leaderboard = useGame((s) => s.leaderboard);

  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(PLAYER_COLORS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [confirmTakeover, setConfirmTakeover] = useState<Player | null>(null);

  const usedColors = new Set((state?.players ?? []).map((p) => p.color));
  const players = state?.players ?? [];
  const connected = new Set(state?.connected_player_ids ?? []);
  const scale = state?.settings.currency_scale ?? 'classic';

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!name.trim()) {
      toast.error('Enter a name first');
      return;
    }
    if (usedColors.has(color)) {
      toast.error('That color is taken');
      return;
    }
    setSubmitting(true);
    try {
      const result = (await emit('join', { name: name.trim(), color })) as JoinResult;
      setPlayerId(result.player_id);
      setState(result.state);
    } catch (e) {
      const err = e as ErrorPayload;
      toast.error(err.message ?? 'Join failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function claim(player: Player) {
    if (claimingId) return;
    setClaimingId(player.id);
    try {
      const result = (await emit('rejoin', { player_id: player.id })) as JoinResult;
      setPlayerId(result.player_id);
      setState(result.state);
      toast.success(`Welcome back, ${player.name}`);
    } catch (e) {
      const err = e as ErrorPayload;
      toast.error(err.message ?? 'Could not resume');
    } finally {
      setClaimingId(null);
      setConfirmTakeover(null);
    }
  }

  function handleClaimClick(player: Player) {
    if (connected.has(player.id)) {
      setConfirmTakeover(player);
    } else {
      claim(player);
    }
  }

  return (
    <div className="min-h-screen p-5 flex flex-col items-center max-w-xl mx-auto w-full">
      <div className="mt-6 mb-4 text-center">
        <div className="text-4xl mb-1">💰</div>
        <h1 className="text-2xl font-bold">Monopoly Banker</h1>
        <p className="text-ink-dim text-sm mt-1">
          Game #{state?.game_number ?? 1} · {players.length} player{players.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Resume section */}
      {players.length > 0 && (
        <div className="w-full mb-4">
          <h2 className="text-sm font-semibold text-ink-dim mb-2 px-1">Resume as…</h2>
          <div className="card p-0 overflow-hidden">
            {players.map((p) => {
              const live = connected.has(p.id);
              const claiming = claimingId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={claiming}
                  onClick={() => handleClaimClick(p)}
                  className="w-full flex items-center gap-3 px-3 py-3 border-b border-white/5 last:border-b-0 hover:bg-bg-elev disabled:opacity-50 text-left"
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0"
                    style={{ backgroundColor: p.color }}
                    aria-hidden
                  />
                  <span className="font-semibold flex-1">{p.name}</span>
                  <span
                    className={`tabular-nums text-sm ${p.balance < 0 ? 'text-bad' : 'text-ink-dim'}`}
                  >
                    {formatMoney(p.balance, scale)}
                  </span>
                  {live ? (
                    <span className="pill bg-good/15 text-good text-[10px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-good" /> in use
                    </span>
                  ) : (
                    <span className="pill bg-bg-elev text-ink-faint text-[10px]">free</span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-ink-faint mt-2 px-1">
            Tap a name to resume that player. "In use" means another device is connected — you'll
            be asked to confirm before taking over.
          </p>
        </div>
      )}

      {/* Join as new player */}
      <form onSubmit={handleJoin} className="w-full card space-y-4">
        <h2 className="text-sm font-semibold text-ink-dim">
          {players.length > 0 ? 'Or join as a new player' : 'Join the game'}
        </h2>
        <div>
          <label className="text-sm font-semibold text-ink-dim block mb-2">Your name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="e.g. Sam"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-ink-dim block mb-2">Pick a color</label>
          <div className="grid grid-cols-4 gap-2">
            {PLAYER_COLORS.map((c) => {
              const taken = usedColors.has(c);
              const selected = color === c;
              return (
                <button
                  key={c}
                  type="button"
                  disabled={taken}
                  onClick={() => setColor(c)}
                  className={`h-12 rounded-xl border-2 transition-all ${
                    selected
                      ? 'border-white scale-105'
                      : taken
                        ? 'border-transparent opacity-25 cursor-not-allowed'
                        : 'border-transparent hover:border-white/40'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || !name.trim() || usedColors.has(color)}
          className="btn-primary w-full text-lg"
        >
          {submitting ? 'Joining…' : 'Join Game'}
        </button>
      </form>

      {leaderboard.length > 0 && (
        <div className="w-full mt-6">
          <div className="flex items-center gap-2 mb-2 px-1">
            <Trophy size={16} className="text-warn" />
            <span className="text-sm font-semibold text-ink-dim">Top 5 — All Time</span>
          </div>
          <LeaderboardPanel entries={leaderboard.slice(0, 5)} compact />
        </div>
      )}

      {/* Takeover confirm modal */}
      {confirmTakeover && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-5"
          onClick={() => setConfirmTakeover(null)}
        >
          <div
            className="bg-bg-elev rounded-2xl p-5 max-w-sm w-full border border-white/5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold mb-2">Take over {confirmTakeover.name}?</h3>
            <p className="text-sm text-ink-dim mb-4">
              Another device is currently connected as {confirmTakeover.name}. If you continue, that
              device will be disconnected and sent back to the join screen.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setConfirmTakeover(null)}
                className="btn-ghost"
                disabled={claimingId !== null}
              >
                Cancel
              </button>
              <button
                onClick={() => claim(confirmTakeover)}
                className="btn-danger"
                disabled={claimingId !== null}
              >
                {claimingId ? 'Taking over…' : 'Take over'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
