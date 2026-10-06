/**
 * Факты с живого сервера — без единого имени (6 октября 2026).
 *
 * ЗАЧЕМ
 *   Правку проверяют на стенде, а работать ей на живых данных. Между ними
 *   стоял снимок экрана: по нему видно, что получилось, но не видно почему —
 *   и на нём имена братьев. 5–6 октября две недоработки подряд (районный,
 *   который приедет в феврале, не попал в журнал; заместитель подписан
 *   районным) нашлись только на живых данных и только глазами.
 *
 *   Этот файл отвечает на вопросы о живых данных ФАКТАМИ: числа, даты, да/нет.
 *   Его вывод можно отдать тому, кто чинит, не показывая ему ни одного брата.
 *
 * КАК ПОЛЬЗОВАТЬСЯ
 *   1. Открыть mycongregation.org и войти.
 *   2. F12 → вкладка Console.
 *   3. Скопировать этот файл целиком и вставить. Enter.
 *   4. Выделить текст между строками «──── факты ────» и «──── конец ────»,
 *      скопировать и отдать.
 *
 * ЧТО ОН ОБЕЩАЕТ
 *   - ТОЛЬКО ЧИТАЕТ. Ни одного запроса, который что-то меняет; единственный
 *     не-GET — получение рабочего токена, тем же путём, что и само приложение.
 *   - НИ ОДНОГО ИМЕНИ В ВЫВОДЕ. Ни имён, ни телефонов, ни почты, ни заметок,
 *     ни адресов, ни номеров записей. Имена сравниваются здесь, в браузере, и
 *     наружу выходит только итог сравнения: «его: да». Карточки и визиты
 *     называются по порядку: «визит 1», «карточка А».
 *     Правило для каждой новой проверки: в строку вывода попадает только то,
 *     что прошло через `fact()` или `check()`, а они принимают числа, даты,
 *     да/нет и слова, написанные в этом файле. Значение поля, которое
 *     заполняет человек, туда не передаётся никогда.
 *
 * КАК ДОПОЛНЯТЬ
 *   Новая правка — новый раздел `section('…', async () => { … })` внизу.
 *   Раздел читает что нужно, пишет факты и ставит проверки с ожиданием.
 *   Раздел, который стал не нужен, удаляется: файл — не архив.
 *
 * Работает и на стенде: на localhost он ходит на localhost:3000.
 */
(async () => {
  const LOCAL = location.hostname === 'localhost';
  const API = LOCAL
    ? 'http://localhost:3000/api'
    : 'https://api.mycongregation.org/api';

  // ─── вывод: только через эти три ────────────────────────────────────────
  const lines = [];
  let failed = 0;
  /** Что разрешено печатать: число, да/нет, дата, слово из этого файла. */
  const safe = (v) => {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'boolean') return v ? 'да' : 'нет';
    if (typeof v === 'number') return String(v);
    if (v instanceof Word) return v.text;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    if (typeof v === 'string' && /^[0-9a-f]{7,40}$/.test(v)) return v.slice(0, 7);
    // Всё остальное — возможно, написано человеком. Наружу не идёт.
    return '[скрыто]';
  };
  /** Слово, написанное в этом файле, а не взятое из данных. */
  class Word {
    constructor(text) {
      this.text = text;
    }
  }
  const w = (text) => new Word(text);
  const fact = (label, value) => lines.push(`  ${label}: ${safe(value)}`);
  const check = (good, label, detail) => {
    if (!good) failed += 1;
    lines.push(
      `  ${good ? '✓' : '✗'} ${label}${detail === undefined ? '' : ` — ${safe(detail)}`}`,
    );
  };
  const title = (text) => lines.push('', text);

  // ─── сессия ─────────────────────────────────────────────────────────────
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
  } catch (e) {
    console.error('Не удалось получить токен:', e.message);
    console.error('Перезайди в приложение в этой вкладке и повтори.');
    return;
  }
  const get = async (path) => {
    const r = await fetch(API + path, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`${path.split('?')[0]} → ${r.status}`);
    return r.json();
  };
  const section = async (name, run) => {
    title(name);
    try {
      await run();
    } catch (e) {
      // Сообщение ошибки — путь и код ответа, без содержимого.
      failed += 1;
      lines.push(`  ✗ раздел не выполнен — ${String(e.message).slice(0, 80)}`);
    }
  };

  // ─── общее для разделов ─────────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-CA');
  const addDays = (iso, n) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const mondayOf = (iso) => {
    const d = new Date(`${iso}T00:00:00Z`);
    const dow = d.getUTCDay() || 7;
    return addDays(iso, 1 - dow);
  };
  /** Имя так, как его сравнивает сервер: без регистра и лишних пробелов. */
  const normal = (...parts) =>
    parts.filter(Boolean).join(' ').trim().replace(/\s+/g, ' ').toLowerCase();
  const letter = (i) => String.fromCharCode(1040 + (i % 32)); // А, Б, В…

  // ─── 0. что выкачено ────────────────────────────────────────────────────
  await section('ЧТО ВЫКАЧЕНО', async () => {
    fact('сегодня', today);
    fact('где', w(LOCAL ? 'стенд' : 'живой сайт'));
    const site = await fetch(`/build-info.json?v=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    fact('сайт, коммит', site?.commit ?? null);
    const health = await fetch(`${API}/health`).then((r) => r.json());
    fact('сервер, коммит', health?.commit ?? null);
  });

  // ─── 1. районный в журнале «К нам» ──────────────────────────────────────
  // Правки 5–6 октября: визит районного — запись «К нам» и помеченная
  // карточка; запись есть и без программы выходных; заместитель подписан
  // заместителем.
  await section('РАЙОННЫЙ В ЖУРНАЛЕ «К НАМ»', async () => {
    const [events, speakers, journal] = await Promise.all([
      get('/special-events?all=true'),
      get('/visiting-speakers'),
      get('/talk-exchange'),
    ]);
    const visits = events
      .filter((e) => e.type === 'circuit_overseer_visit' && !e.deletedAt)
      .sort((a, b) => a.date.localeCompare(b.date));
    const marked = speakers.filter((s) => s.circuitOverseer);
    const cardName = (s) => normal(s.firstName, s.lastName);
    const cardLabel = new Map(marked.map((s, i) => [s.id, letter(i)]));

    fact('визитов районного всего', visits.length);
    fact('из них впереди', visits.filter((v) => mondayOf(v.date) >= mondayOf(today)).length);
    fact('карточек приезжих всего', speakers.length);
    fact('из них с пометкой', marked.length);
    check(
      marked.every((s) => s.circuitRole === 'overseer' || s.circuitRole === 'substitute'),
      'сервер отдаёт роль у каждой помеченной карточки',
    );

    // Последние два прошедших визита — для сравнения, все будущие — для дела.
    const ahead = visits.filter((v) => addDays(mondayOf(v.date), 6) >= today);
    const past = visits.filter((v) => addDays(mondayOf(v.date), 6) < today).slice(-2);
    const shown = [...past, ...ahead];
    // Слоты публичной речи за все недели, о которых пойдёт речь. До 6 октября
    // они читались только для будущих визитов, и про прошедший печаталось
    // «программы выходных нет» там, где её просто не спрашивали.
    const slots = shown.length
      ? (
          await get(
            `/assignments?partKey=public_talk_speaker&weekStart=${mondayOf(shown[0].date)}` +
              `&weekEnd=${mondayOf(shown[shown.length - 1].date)}&limit=500`,
          )
        ).data ?? []
      : [];

    const liveIncoming = journal.filter(
      (e) => e.direction === 'incoming' && !e.deletedAt && e.status !== 'did_not_happen',
    );
    const inWeek = (e, week) => e.date >= week && e.date <= addDays(week, 6);

    let n = 0;
    for (const v of shown) {
      n += 1;
      const week = mondayOf(v.date);
      const isAhead = ahead.includes(v);
      const name = normal(v.coFirstName, v.coLastName);
      const role = v.coRole === 'substitute' ? 'substitute' : 'overseer';
      const entries = liveIncoming.filter((e) => inWeek(e, week));
      const his = entries.filter(
        (e) => !e.publisherId && name !== '' && normal(e.speakerName) === name,
      );
      const card = his[0]?.visitingSpeakerId
        ? speakers.find((s) => s.id === his[0].visitingSpeakerId)
        : null;
      const slot = slots.find((a) => a.weekStartDate === week && !a.deletedAt);

      title(`  визит ${n} · неделя с ${week} · ${isAhead ? 'впереди' : 'прошёл'}`);
      fact('  роль в визите', w(role === 'substitute' ? 'заместитель' : 'районный'));
      fact('  имя в визите указано', name !== '');
      fact('  записей «К нам» в неделе', entries.length);
      fact('  из них его', his.length);
      // Другой гость на выходных визита: его запись приложение не трогает,
      // пока программа не скажет иначе, — но знать об этом надо.
      fact('  из них другого докладчика', entries.length - his.length);
      fact('  у его записи есть карточка', !!card);
      fact('  карточка', card ? w(cardLabel.get(card.id) ?? 'без пометки') : null);
      fact('  роль у карточки', card?.circuitRole ? w(card.circuitRole === 'substitute' ? 'заместитель' : 'районный') : null);
      fact('  программа выходных есть', !!slot);
      if (slot) {
        fact('  в слоте речи его имя', name !== '' && normal(slot.speakerName) === name);
        fact('  слот указывает на ту же карточку', !!card && slot.visitingSpeakerId === card.id);
        fact('  под ним остался наш брат', !!slot.publisherId);
        fact('  в слоте выбрана речь', !!slot.publicTalkId || !!slot.specialTalk);
      }
      if (isAhead && name !== '') {
        check(his.length === 1, '  в журнале ровно одна его запись', his.length);
        check(!!card?.circuitOverseer, '  запись ведёт на помеченную карточку');
        check(card?.circuitRole === role, '  подпись карточки совпадает с ролью в визите');
        if (slot) {
          check(
            normal(slot.speakerName) === name && slot.visitingSpeakerId === card?.id,
            '  программа и журнал говорят одно',
          );
          // Правка 6 октября: визит снимает прежнего докладчика со слота
          // целиком и возвращает его, когда визит убирают. Остался под
          // районным — значит визит положен до правки; чинится сохранением
          // визита.
          check(!slot.publisherId, '  под районным не остался наш брат');
        }
        check(entries.length === his.length || !slot, '  на выходных с программой записан только он');
      }
    }

    title('  карточки с пометкой');
    marked.forEach((s) => {
      const visitsOfHis = visits.filter((v) => normal(v.coFirstName, v.coLastName) === cardName(s));
      const twins = speakers.filter((o) => o.id !== s.id && cardName(o) === cardName(s));
      lines.push(
        `  карточка ${cardLabel.get(s.id)}: роль ${safe(w(s.circuitRole === 'substitute' ? 'заместитель' : 'районный'))}` +
          ` · визитов с этим именем ${safe(visitsOfHis.length)}` +
          ` · из них впереди ${safe(visitsOfHis.filter((v) => addDays(mondayOf(v.date), 6) >= today).length)}` +
          ` · записей в журнале ${safe(liveIncoming.filter((e) => e.visitingSpeakerId === s.id).length)}` +
          ` · собрание указано ${safe(!!s.externalCongregationId)}` +
          ` · заведена приложением ${safe(!!s.autoCreated)}` +
          ` · тёзок среди карточек ${safe(twins.length)}`,
      );
    });
    const names = marked.map(cardName);
    check(new Set(names).size === names.length, '  нет двух помеченных карточек на одно имя');

    // Запись на районного впереди, а визита в ту неделю нет — след удалённого
    // или перенесённого визита.
    const markedIds = new Set(marked.map((s) => s.id));
    const stray = liveIncoming.filter(
      (e) =>
        e.date >= today &&
        markedIds.has(e.visitingSpeakerId) &&
        !visits.some((v) => inWeek(e, mondayOf(v.date))),
    );
    check(stray.length === 0, '  нет будущих записей на районного без визита', stray.length);
  });

  // ─── итог ───────────────────────────────────────────────────────────────
  lines.push('', failed === 0 ? 'ИТОГ: все проверки прошли' : `ИТОГ: не прошло проверок — ${failed}`);
  const text = ['──── факты ────', ...lines, '──── конец ────'].join('\n');
  console.log(text);
  // В буфер обмена отсюда не положить: консольная `copy()` перестаёт быть
  // доступной после первого же запроса к серверу, а буфер браузера требует,
  // чтобы страница была в фокусе, — он у консоли (живой запуск 6 октября).
  console.log('%cВыдели текст между линиями и скопируй.', 'color:#0369a1');
  return text;
})();
