import { useState } from 'react';
import toast from 'react-hot-toast';
import { Shield, AlertTriangle, RotateCcw, Trophy, Trash2, Pencil } from 'lucide-react';
import type { ArchivedGameSummary, CurrencyScale, ErrorPayload, Player } from '@monopoly/shared';
import { useGame } from '../store/gameStore';
import { emit } from '../socket';
import { formatMoney } from '../utils/currency';

export function AdminPage() {
  const state = useGame((s) => s.state)!;
  const setIsAdmin = useGame((s) => s.setIsAdmin);
  const setTab = useGame((s) => s.setTab);
  const isAdmin = useGame((s) => s.is_admin);

  if (!isAdmin) {
    setTab('settings');
    return null;
  }

  return (
    <div className="px-4 pt-4">
      <header className="mb-4 flex items-center gap-2">
        <Shield size={22} className="text-admin" />
        <h1 className="text-xl font-bold">Admin</h1>
        <button
          onClick={() => {
            setIsAdmin(false);
            setTab('home');
            toast('Admin re-locked');
          }}
          className="ml-auto text-xs text-ink-dim underline"
        >
          Lock
        </button>
      </header>

      <p className="text-xs text-ink-faint mb-4">
        Every admin action is recorded in the activity log with an "ADMIN" badge.
      </p>

      <OverridePanel players={state.players} scale={state.settings.currency_scale} />
      <RemovePanel players={state.players} scale={state.settings.currency_scale} />
      <SettingsPanel state={state} />
      <PotPanel pot={state.free_parking_pot} scale={state.settings.currency_scale} />
      <NewGamePanel players={state.players} scale={state.settings.currency_scale} />
      <GameNumberPanel current={state.game_number} />
      <LeaderboardAdminPanel scale={state.settings.currency_scale} />
    </div>
  );
}

function GameNumberPanel({ current }: { current: number }) {
  const [value, setValue] = useState(String(current));
  const [submitting, setSubmitting] = useState(false);

  async function go() {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n < 1) return toast.error('Must be a positive integer');
    if (n === current) return toast('No change');
    setSubmitting(true);
    try {
      await emit('admin_set_game_number', { game_number: n });
      toast.success(`Current game is now #${n}`);
    } catch (e) {
      toast.error((e as ErrorPayload).message ?? 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card mb-3 space-y-2">
      <h2 className="font-semibold">Current game number</h2>
      <p className="text-xs text-ink-dim">
        Renumber the in-progress game. The next archive will use the new number, and future games
        increment from there. Useful if you've been testing and want to start production at #1
        without wiping history.
      </p>
      <div className="flex gap-2">
        <input
          className="input flex-1"
          type="number"
          min="1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button onClick={go} disabled={submitting} className="btn-primary">
          Set
        </button>
      </div>
      <p className="text-[11px] text-ink-faint">
        Currently <span className="font-semibold text-ink">#{current}</span>. If you set it to a
        number that already exists in history, the next archive will overwrite that older entry.
      </p>
    </section>
  );
}

function OverridePanel({ players, scale }: { players: Player[]; scale: CurrencyScale }) {
  const [targetId, setTargetId] = useState<string>('');
  const [newBalance, setNewBalance] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function go() {
    if (!targetId) return toast.error('Pick a player');
    if (!note.trim()) return toast.error('Add a note explaining why');
    const n = Number.parseInt(newBalance, 10);
    if (!Number.isFinite(n)) return toast.error('Enter a balance');
    setSubmitting(true);
    try {
      await emit('admin_override', { player_id: targetId, new_balance: n, note: note.trim() });
      toast.success('Balance updated');
      setNewBalance('');
      setNote('');
      setTargetId('');
    } catch (e) {
      toast.error((e as ErrorPayload).message ?? 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card mb-3 space-y-2">
      <h2 className="font-semibold">Override balance</h2>
      <select
        className="input"
        value={targetId}
        onChange={(e) => setTargetId(e.target.value)}
      >
        <option value="">Select player…</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({formatMoney(p.balance, scale)})
          </option>
        ))}
      </select>
      <input
        className="input"
        type="number"
        value={newBalance}
        onChange={(e) => setNewBalance(e.target.value)}
        placeholder="New balance (exact)"
      />
      <input
        className="input"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reason (required)"
        maxLength={120}
      />
      <button onClick={go} disabled={submitting} className="btn-admin w-full">
        Apply
      </button>
    </section>
  );
}

function RemovePanel({ players, scale }: { players: Player[]; scale: CurrencyScale }) {
  const [targetId, setTargetId] = useState('');
  const [confirming, setConfirming] = useState(false);

  async function go() {
    if (!targetId) return;
    try {
      await emit('admin_remove_player', { player_id: targetId });
      toast.success('Player removed');
      setTargetId('');
      setConfirming(false);
    } catch (e) {
      toast.error((e as ErrorPayload).message ?? 'Failed');
    }
  }

  const target = players.find((p) => p.id === targetId);

  return (
    <section className="card mb-3 space-y-2">
      <h2 className="font-semibold">Remove player</h2>
      <select
        className="input"
        value={targetId}
        onChange={(e) => {
          setTargetId(e.target.value);
          setConfirming(false);
        }}
      >
        <option value="">Select player…</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({formatMoney(p.balance, scale)})
          </option>
        ))}
      </select>
      {target && !confirming && (
        <button onClick={() => setConfirming(true)} className="btn-danger w-full">
          Remove {target.name}
        </button>
      )}
      {target && confirming && (
        <div className="space-y-2">
          <p className="text-sm text-ink-dim">
            <AlertTriangle size={14} className="inline -mt-1 mr-1 text-warn" />
            {target.name} will be removed (final balance preserved in log).
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setConfirming(false)} className="btn-ghost">
              Cancel
            </button>
            <button onClick={go} className="btn-danger">
              Confirm
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function SettingsPanel({ state }: { state: ReturnType<typeof useGame.getState>['state'] }) {
  const s = state!;
  const [starting, setStarting] = useState(String(s.settings.starting_balance));
  const [passGo, setPassGo] = useState(String(s.settings.pass_go_amount));
  const [scale, setScale] = useState<CurrencyScale>(s.settings.currency_scale);
  const [parking, setParking] = useState(s.settings.free_parking_enabled);

  async function go() {
    const partial: Record<string, unknown> = {};
    const sn = Number.parseInt(starting, 10);
    const pn = Number.parseInt(passGo, 10);
    if (Number.isFinite(sn) && sn !== s.settings.starting_balance) partial.starting_balance = sn;
    if (Number.isFinite(pn) && pn !== s.settings.pass_go_amount) partial.pass_go_amount = pn;
    if (scale !== s.settings.currency_scale) partial.currency_scale = scale;
    if (parking !== s.settings.free_parking_enabled) partial.free_parking_enabled = parking;
    if (Object.keys(partial).length === 0) {
      toast('No changes');
      return;
    }
    try {
      await emit('admin_update_settings', partial);
      toast.success('Settings updated');
    } catch (e) {
      toast.error((e as ErrorPayload).message ?? 'Failed');
    }
  }

  const sn = Number.parseInt(starting, 10);
  const pn = Number.parseInt(passGo, 10);
  return (
    <section className="card mb-3 space-y-2">
      <h2 className="font-semibold">Game settings</h2>
      <label className="block text-xs text-ink-dim">
        Starting balance{' '}
        {Number.isFinite(sn) && (
          <span className="text-ink-faint">= {formatMoney(sn, scale)}</span>
        )}
        <input
          className="input mt-1"
          type="number"
          value={starting}
          onChange={(e) => setStarting(e.target.value)}
        />
      </label>
      <label className="block text-xs text-ink-dim">
        Pass GO amount{' '}
        {Number.isFinite(pn) && (
          <span className="text-ink-faint">= {formatMoney(pn, scale)}</span>
        )}
        <input
          className="input mt-1"
          type="number"
          value={passGo}
          onChange={(e) => setPassGo(e.target.value)}
        />
      </label>
      <label className="block text-xs text-ink-dim">
        Currency scale
        <select
          className="input mt-1"
          value={scale}
          onChange={(e) => setScale(e.target.value as CurrencyScale)}
        >
          <option value="classic">Classic ($)</option>
          <option value="millions">Millions ($M)</option>
        </select>
        {scale !== s.settings.currency_scale && (
          <p className="text-[11px] text-warn mt-1">
            Switching scale will multiply (or divide) every balance, the pot, the activity log
            amounts, and the starting / Pass GO values by 10,000. Lossy when downscaling sub-$10K
            amounts.
          </p>
        )}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={parking}
          onChange={(e) => setParking(e.target.checked)}
          className="w-5 h-5"
        />
        Free Parking pot enabled
      </label>
      <button onClick={go} className="btn-primary w-full">
        Save settings
      </button>
    </section>
  );
}

function PotPanel({ pot, scale }: { pot: number; scale: CurrencyScale }) {
  const [value, setValue] = useState(String(pot));
  return (
    <section className="card mb-3 space-y-2">
      <h2 className="font-semibold">Adjust Free Parking pot</h2>
      <p className="text-xs text-ink-dim">
        Current: <span className="text-park font-semibold">{formatMoney(pot, scale)}</span>
      </p>
      <input
        className="input"
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="New pot value"
      />
      <button
        onClick={async () => {
          const n = Number.parseInt(value, 10);
          if (!Number.isFinite(n) || n < 0) return toast.error('Bad value');
          try {
            await emit('admin_set_pot', { amount: n });
            toast.success('Pot updated');
          } catch (e) {
            toast.error((e as ErrorPayload).message ?? 'Failed');
          }
        }}
        className="btn-park w-full"
      >
        Set pot
      </button>
    </section>
  );
}

function NewGamePanel({ players, scale }: { players: Player[]; scale: CurrencyScale }) {
  const [winnerId, setWinnerId] = useState<string>(() => {
    if (players.length === 0) return '';
    const top = players.reduce((a, b) => (b.balance > a.balance ? b : a));
    return top.id;
  });
  const [confirmText, setConfirmText] = useState('');
  const [open, setOpen] = useState(false);

  async function go() {
    if (confirmText !== 'NEW') return toast.error('Type NEW to confirm');
    try {
      await emit('admin_new_game', { winner_id: winnerId || null });
      toast.success('New game started');
      setOpen(false);
      setConfirmText('');
    } catch (e) {
      toast.error((e as ErrorPayload).message ?? 'Failed');
    }
  }

  return (
    <section className="card mb-3 space-y-2 border-bad/40">
      <h2 className="font-semibold flex items-center gap-2 text-bad">
        <RotateCcw size={16} /> Start new game
      </h2>
      {!open ? (
        <button onClick={() => setOpen(true)} className="btn-danger w-full">
          New Game…
        </button>
      ) : (
        <>
          <p className="text-xs text-ink-dim">
            Archives the current game (preserving stats) and resets balances. Settings stay.
          </p>
          <label className="block text-xs text-ink-dim">
            Winner
            <select
              className="input mt-1"
              value={winnerId}
              onChange={(e) => setWinnerId(e.target.value)}
            >
              <option value="">No winner</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({formatMoney(p.balance, scale)})
                </option>
              ))}
            </select>
          </label>
          <input
            className="input"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
            placeholder="Type NEW to confirm"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setOpen(false);
                setConfirmText('');
              }}
              className="btn-ghost"
            >
              Cancel
            </button>
            <button onClick={go} className="btn-danger">
              Start new game
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function LeaderboardAdminPanel({ scale }: { scale: CurrencyScale }) {
  const archived = useGame((s) => s.archived);
  const [editing, setEditing] = useState<ArchivedGameSummary | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ArchivedGameSummary | null>(null);
  const [clearText, setClearText] = useState('');
  const [clearOpen, setClearOpen] = useState(false);

  async function deleteOne(g: ArchivedGameSummary) {
    try {
      await emit('admin_delete_archived', { game_number: g.game_number });
      toast.success(`Deleted game #${g.game_number}`);
      setConfirmDelete(null);
    } catch (e) {
      toast.error((e as ErrorPayload).message ?? 'Failed');
    }
  }

  async function clearAll() {
    if (clearText !== 'CLEAR') return toast.error('Type CLEAR to confirm');
    try {
      await emit('admin_clear_archived', {});
      toast.success('All history cleared. Game number reset to 1.');
      setClearOpen(false);
      setClearText('');
    } catch (e) {
      toast.error((e as ErrorPayload).message ?? 'Failed');
    }
  }

  return (
    <section className="card mb-3 space-y-2">
      <h2 className="font-semibold flex items-center gap-2">
        <Trophy size={16} className="text-warn" /> Manage leaderboard / history
      </h2>
      {archived.length === 0 ? (
        <p className="text-sm text-ink-dim">No archived games yet.</p>
      ) : (
        <div className="space-y-2">
          {archived.map((g) => (
            <div key={g.game_number} className="bg-bg-elev rounded-xl p-3 border border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <span className="pill bg-bg-card text-ink-dim text-[11px]">#{g.game_number}</span>
                <span className="font-semibold flex-1 truncate">
                  {g.winner_name ? `🏆 ${g.winner_name}` : 'No winner'}
                </span>
                <span className="text-xs text-ink-faint">
                  {new Date(g.ended_at).toLocaleDateString()}
                </span>
              </div>
              <div className="text-xs text-ink-dim mb-2">
                {g.player_count} players · {g.transaction_count} txs · top{' '}
                {formatMoney(g.top_payment, scale)}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setEditing(g)}
                  className="btn-ghost text-sm"
                >
                  <Pencil size={14} /> Edit winner
                </button>
                <button
                  onClick={() => setConfirmDelete(g)}
                  className="btn-danger text-sm"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Clear all */}
      <div className="pt-3 border-t border-white/5 mt-3">
        {!clearOpen ? (
          <button
            onClick={() => setClearOpen(true)}
            className="btn-danger w-full"
            disabled={archived.length === 0}
          >
            <AlertTriangle size={14} /> Clear all history
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-ink-dim">
              Wipes every archived game and resets the current game's number to 1. The next archive
              will be game #1 again. Cannot be undone.
            </p>
            <input
              className="input"
              value={clearText}
              onChange={(e) => setClearText(e.target.value.toUpperCase())}
              placeholder="Type CLEAR to confirm"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setClearOpen(false);
                  setClearText('');
                }}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button onClick={clearAll} className="btn-danger">
                Clear everything
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit winner modal */}
      {editing && (
        <EditWinnerModal
          game={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-5"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="bg-bg-elev rounded-2xl p-5 max-w-sm w-full border border-white/5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold mb-2">Delete game #{confirmDelete.game_number}?</h3>
            <p className="text-sm text-ink-dim mb-4">
              Removes this game from the leaderboard and history permanently. Other games keep their
              numbers (gaps are fine).
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setConfirmDelete(null)} className="btn-ghost">
                Cancel
              </button>
              <button onClick={() => deleteOne(confirmDelete)} className="btn-danger">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function EditWinnerModal({
  game,
  onClose,
}: {
  game: ArchivedGameSummary;
  onClose: () => void;
}) {
  const [winnerName, setWinnerName] = useState<string>(game.winner_name ?? '');
  const [submitting, setSubmitting] = useState(false);

  async function save() {
    setSubmitting(true);
    try {
      await emit('admin_edit_archived_winner', {
        game_number: game.game_number,
        winner_name: winnerName || null,
      });
      toast.success(`Updated winner of game #${game.game_number}`);
      onClose();
    } catch (e) {
      toast.error((e as ErrorPayload).message ?? 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-5"
      onClick={onClose}
    >
      <div
        className="bg-bg-elev rounded-2xl p-5 max-w-sm w-full border border-white/5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold">Edit winner — Game #{game.game_number}</h3>
        <p className="text-xs text-ink-dim">Pick from players who were in this game.</p>
        <div className="space-y-1.5 max-h-64 overflow-auto">
          <button
            type="button"
            onClick={() => setWinnerName('')}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-left ${
              winnerName === ''
                ? 'border-accent bg-accent/10'
                : 'border-white/5 bg-bg-card'
            }`}
          >
            <span className="w-3 h-3 rounded-full bg-ink-faint shrink-0" />
            <span className="font-semibold flex-1">No winner</span>
          </button>
          {game.final_balances.map((p) => {
            const selected = winnerName.toLowerCase() === p.name.toLowerCase();
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => setWinnerName(p.name)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-left ${
                  selected
                    ? 'border-accent bg-accent/10'
                    : 'border-white/5 bg-bg-card'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className="font-semibold flex-1">{p.name}</span>
                <span className="text-xs text-ink-dim tabular-nums">{p.balance}</span>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className="btn-ghost" disabled={submitting}>
            Cancel
          </button>
          <button onClick={save} className="btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
