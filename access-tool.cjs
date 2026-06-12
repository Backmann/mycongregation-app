#!/usr/bin/env node
/**
 * access-tool.cjs — управление доступом возвещателей с консоли.
 * Использование:
 *   node access-tool.cjs status     <publisherId>
 *   node access-tool.cjs grant      <publisherId> <email> <password>
 *   node access-tool.cjs reset      <publisherId> <newPassword>
 *   node access-tool.cjs deactivate <publisherId>
 *   node access-tool.cjs activate   <publisherId>
 * Пароль админа спрашивается интерактивно (или через env ADMIN_PASS).
 */
const readline = require('readline');

const API = 'https://api.mycongregation.org/api';
const ADMIN_EMAIL = 'lionel@mycongregation.org';

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const orig = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (s) => {
      if (s.includes(question)) orig(s);
      else orig('*');
    };
    rl.question(question, (ans) => {
      rl.close();
      process.stdout.write('\n');
      resolve(ans);
    });
  });
}

async function jfetch(url, options) {
  const res = await fetch(url, options);
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* пустой ответ — ок */
  }
  return { ok: res.ok, status: res.status, body };
}

function die(msg, body) {
  console.error('ОШИБКА:', msg);
  if (body) console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

async function main() {
  const [cmd, pubId, arg3, arg4] = process.argv.slice(2);
  const cmds = ['status', 'grant', 'reset', 'deactivate', 'activate'];
  if (!cmds.includes(cmd) || !pubId) {
    console.log('Команды:');
    console.log('  node access-tool.cjs status     <publisherId>');
    console.log('  node access-tool.cjs grant      <publisherId> <email> <password>');
    console.log('  node access-tool.cjs reset      <publisherId> <newPassword>');
    console.log('  node access-tool.cjs deactivate <publisherId>');
    console.log('  node access-tool.cjs activate   <publisherId>');
    process.exit(1);
  }

  const adminPass =
    process.env.ADMIN_PASS ||
    (await askHidden('Пароль админа (' + ADMIN_EMAIL + '): '));

  const login = await jfetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: adminPass }),
  });
  if (!login.ok) die('логин не удался (HTTP ' + login.status + ')', login.body);

  const b = login.body || {};
  const token =
    b.accessToken ||
    b.access_token ||
    b.token ||
    (b.tokens && (b.tokens.accessToken || b.tokens.access)) ||
    (b.data && (b.data.accessToken || b.data.token));
  if (!token)
    die('токен не найден в ответе логина; ключи: ' + Object.keys(b).join(', '));

  const headers = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + token,
  };
  const accessUrl = API + '/publishers/' + pubId + '/access';
  let res;

  if (cmd === 'status') {
    res = await jfetch(accessUrl, { headers });
  } else if (cmd === 'grant') {
    if (!arg3 || !arg4)
      die('для grant нужны <email> и <password> (мин. 8 символов)');
    res = await jfetch(accessUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: arg3, password: arg4 }),
    });
  } else if (cmd === 'reset') {
    if (!arg3) die('для reset нужен <newPassword> (мин. 8 символов)');
    res = await jfetch(accessUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ password: arg3 }),
    });
  } else {
    res = await jfetch(accessUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ isActive: cmd === 'activate' }),
    });
  }

  if (!res.ok) die(cmd + ' не удался (HTTP ' + res.status + ')', res.body);
  console.log('OK: ' + cmd);
  console.log(JSON.stringify(res.body, null, 2));
}

main().catch((e) => die(e.message));
