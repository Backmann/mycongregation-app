/**
 * Проверка живого сервера из консоли браузера.
 *
 * КАК ПОЛЬЗОВАТЬСЯ
 *   1. Открыть mycongregation.org и войти.
 *   2. F12 → вкладка Console.
 *   3. Скопировать этот файл целиком и вставить. Enter.
 *
 * Проверки НИЧЕГО НЕ МЕНЯЮТ: только чтение и один заведомо несуществующий
 * запрос. Ни одного письма отсюда не уходит, ни одного кода не выдаётся —
 * иначе набор нельзя было бы гонять когда вздумается, а инструмент, которым
 * страшно пользоваться, не инструмент.
 *
 * ЧТО ОНА НЕ ПРОВЕРЯЕТ И ПОЧЕМУ
 *   - Предел попыток входа: чтобы его увидеть, надо шесть раз ошибиться
 *     паролем, то есть на четверть часа закрыть себе вход. Проверяется руками,
 *     когда есть время ждать.
 *   - Выдачу кода и отправку письма: это запись. Смотреть на них надо в
 *     интерфейсе, а результат — в логе сервера (`grep "mail sent"`).
 */
(async () => {
  const API = 'https://api.mycongregation.org/api';
  const ok = [];
  const bad = [];
  const note = (good, name, detail) =>
    (good ? ok : bad).push(detail ? `${name} — ${detail}` : name);

  // --- сессия -------------------------------------------------------------
  // Рабочий токен живёт только в памяти вкладки приложения, поэтому берём
  // новый по обновляющей куке — тем же путём, каким это делает само
  // приложение.
  let token;
  try {
    const r = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Auth-Mode': 'cookie', 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!r.ok) throw new Error(`refresh → ${r.status}`);
    token = (await r.json()).accessToken;
    note(true, 'сессия получена');
  } catch (e) {
    console.error('Не удалось получить токен:', e.message);
    console.error('Перезайди в приложение в этой вкладке и повтори.');
    return;
  }
  const auth = { Authorization: `Bearer ${token}` };
  const get = async (path) => {
    const r = await fetch(API + path, { headers: auth });
    return { status: r.status, body: r.ok ? await r.json() : null };
  };

  // --- 1. сервер жив ------------------------------------------------------
  {
    const r = await fetch(`${API}/health`);
    note(r.ok, 'сервер отвечает', `health → ${r.status}`);
  }

  // --- 2. список входов знает про срок приглашения ------------------------
  {
    const { status, body } = await get('/users');
    const rows = body?.items ?? body?.data ?? body ?? [];
    const has = Array.isArray(rows) && rows.length > 0 &&
      'inviteExpiresAt' in rows[0];
    note(status === 200 && has, 'список входов отдаёт срок приглашения',
      status !== 200 ? `→ ${status}` : has ? '' : 'поля inviteExpiresAt нет');

    // Заодно — сколько людей в каком состоянии. Не проверка, а картина.
    if (Array.isArray(rows)) {
      const waiting = rows.filter((u) => !u.hasPassword);
      const expired = waiting.filter(
        (u) => u.inviteExpiresAt && new Date(u.inviteExpiresAt) < new Date(),
      );
      const never = waiting.filter((u) => !u.inviteExpiresAt);
      console.log(
        `%cБез пароля: ${waiting.length} · код истёк: ${expired.length} · не приглашали: ${never.length}`,
        'color:#0369a1',
      );
      if (waiting.length) console.table(waiting.map((u) => ({
        имя: u.loginName, почта: u.email ?? '—',
        кодДо: u.inviteExpiresAt ? new Date(u.inviteExpiresAt).toLocaleDateString() : '—',
        входил: u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'ни разу',
      })));
    }
  }

  // --- 3. история отчётов отвечает про право отметить подсобного ----------
  {
    const list = await get('/publishers?limit=1');
    const rows = list.body?.items ?? list.body?.data ?? list.body ?? [];
    const id = rows[0]?.id;
    if (!id) {
      note(false, 'история возвещателя', 'не нашёл ни одного возвещателя');
    } else {
      const { status, body } = await get(
        `/service-reports/by-publisher/${id}?months=24`,
      );
      note(
        status === 200 && typeof body?.canMarkAuxiliary === 'boolean',
        'история отвечает canMarkAuxiliary',
        status !== 200 ? `→ ${status}` : `= ${body?.canMarkAuxiliary}`,
      );
      const wantsHours = (body?.timeline ?? []).some((e) => e.wantsHours);
      note(Array.isArray(body?.timeline), 'история отдаёт месяцы',
        `${body?.timeline?.length ?? 0} шт., часы просит хотя бы один: ${wantsHours}`);
    }
  }

  // --- 4. просьба нового кода отвечает одинаково --------------------------
  // Имя заведомо несуществующее: письма не будет, записи не будет, а ответ
  // должен быть тем же самым, что и для настоящего — в этом вся суть двери.
  {
    const r = await fetch(`${API}/auth/invite/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'nobody.at.all.' + Date.now() }),
    });
    note(r.status === 200, 'просьба кода отвечает одинаково', `→ ${r.status}`);
  }

  // --- 5. вход отказывает без подробностей --------------------------------
  // Одна попытка с несуществующим именем: предел — шесть на имя, так что
  // ничей вход этим не закрывается.
  {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        login: 'nobody.at.all.' + Date.now(),
        password: 'not-a-real-password',
      }),
    });
    const body = await r.json().catch(() => ({}));
    const generic =
      r.status === 401 &&
      !JSON.stringify(body).toLowerCase().includes('no such');
    note(generic, 'вход отказывает без подробностей', `→ ${r.status}`);
  }

  // --- итог ---------------------------------------------------------------
  console.log('%c\nПРОШЛО:', 'color:#15803d;font-weight:700');
  ok.forEach((l) => console.log('  ✓ ' + l));
  if (bad.length) {
    console.log('%c\nНЕ ПРОШЛО:', 'color:#b91c1c;font-weight:700');
    bad.forEach((l) => console.log('  ✗ ' + l));
  } else {
    console.log('%c\nВсё на месте.', 'color:#15803d');
  }
})();
