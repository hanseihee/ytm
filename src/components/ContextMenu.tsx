// 우클릭 메뉴와 알림(토스트).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { closeMenu, menuStore, toastStore, toastError, type MenuEntry } from '../state/ui';
import { Icon } from './Icon';

function MenuList({ entries, x, y, onDone }: { entries: MenuEntry[]; x: number; y: number; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [open, setOpen] = useState<{ index: number; entries: MenuEntry[] | 'loading'; x: number; y: number } | null>(null);

  // 화면 밖으로 나가지 않게 위치를 고친다.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    });
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [x, y, entries]);

  const openSub = async (index: number, entry: MenuEntry, target: HTMLElement) => {
    const r = target.getBoundingClientRect();
    const at = { x: r.right - 4, y: r.top - 6 };
    if (Array.isArray(entry.submenu)) {
      setOpen({ index, entries: entry.submenu, ...at });
      return;
    }
    setOpen({ index, entries: 'loading', ...at });
    try {
      const list = await (entry.submenu as () => Promise<MenuEntry[]>)();
      setOpen((o) => (o && o.index === index ? { ...o, entries: list } : o));
    } catch (err) {
      setOpen(null);
      toastError(err, '목록을 불러오지 못했습니다');
    }
  };

  const run = async (entry: MenuEntry) => {
    onDone();
    try {
      await entry.action?.();
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <>
      <div ref={ref} className="menu" role="menu" style={{ left: pos.x, top: pos.y }}>
        {entries.map((entry, i) =>
          entry.separator ? (
            <div key={i} className="menu__sep" role="separator" />
          ) : (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={`menu__item${entry.danger ? ' menu__item--danger' : ''}${open?.index === i ? ' is-open' : ''}`}
              disabled={entry.disabled}
              aria-haspopup={entry.submenu ? 'menu' : undefined}
              onMouseEnter={(e) => (entry.submenu ? void openSub(i, entry, e.currentTarget) : setOpen(null))}
              onClick={(e) => (entry.submenu ? void openSub(i, entry, e.currentTarget) : void run(entry))}
            >
              <span>{entry.label}</span>
              {entry.submenu && <Icon name="forward" size={14} />}
            </button>
          ),
        )}
      </div>
      {open &&
        (open.entries === 'loading' ? (
          <div className="menu menu--loading" style={{ left: open.x, top: open.y }}>불러오는 중…</div>
        ) : (
          <MenuList entries={open.entries} x={open.x} y={open.y} onDone={onDone} />
        ))}
    </>
  );
}

export function ContextMenuHost() {
  const menu = useStore(menuStore, (s) => s);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof MouseEvent && (e.target as HTMLElement).closest('.menu')) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu();
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    document.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', close, true);
    };
  }, [menu]);
  if (!menu) return null;
  return <MenuList key={`${menu.x},${menu.y}`} entries={menu.entries} x={menu.x} y={menu.y} onDone={closeMenu} />;
}

export function Toasts() {
  const toasts = useStore(toastStore, (s) => s);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>{t.text}</div>
      ))}
    </div>
  );
}
