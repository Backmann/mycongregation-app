import { useCallback, useEffect, useState } from 'react';
import { storage } from './storage';

/**
 * Незаконченные экраны — за выключателем.
 *
 * Приложением пользуются шестьдесят человек каждый день, а перестройка разделов
 * трогает то, чем они ходят. Копить перемены в стороне и свалить их разом ещё
 * хуже: большой непроверенный ком ломается больнее, чем десять маленьких.
 *
 * Поэтому новое пишется и выкатывается вместе со всем остальным, но
 * показывается, только если выключатель включён. У всех он выключен.
 *
 * Хранится НА УСТРОЙСТВЕ, а не в учётной записи: включивший видит новое лишь у
 * себя, и это не расходится по собранию через общий вход. Вход к выключателю
 * спрятан за долгим нажатием на строку версии в Профиле — кто про него не
 * знает, тот его и не найдёт.
 */
const KEY = 'devPreview.v1';

/** Что можно включить. Добавляется по мере появления новых экранов. */
export type DevPreviewArea = 'congregationIndex' | 'programmeFeed';

export const DEV_PREVIEW_AREAS: DevPreviewArea[] = [
  'congregationIndex',
  'programmeFeed',
];

type State = Partial<Record<DevPreviewArea, boolean>>;

async function read(): Promise<State> {
  const raw = await storage.getItem(KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as State;
  } catch {
    // Испорченное значение — не повод падать: считаем, что ничего не включено.
    return {};
  }
}

/**
 * Состояние выключателей и способ их менять.
 *
 * Пока значение не прочитано, `ready` ложно — экран за это время не должен
 * мигнуть новым видом и тут же вернуться к старому.
 */
export function useDevPreview() {
  const [state, setState] = useState<State>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void read().then((s) => {
      if (!alive) return;
      setState(s);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = useCallback(async (area: DevPreviewArea) => {
    const next = await read();
    next[area] = !next[area];
    await storage.setItem(KEY, JSON.stringify(next));
    setState({ ...next });
  }, []);

  const clear = useCallback(async () => {
    await storage.removeItem(KEY);
    setState({});
  }, []);

  return {
    ready,
    enabled: (area: DevPreviewArea) => state[area] === true,
    anyEnabled: Object.values(state).some(Boolean),
    toggle,
    clear,
  };
}
