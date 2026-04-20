const { configured, getRedirectUri, exchangeCode, fetchGoogleEmail, saveGoogleTokens, supabaseAdmin } = require('./_helpers');

function htmlPage(status, message) {
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Google Calendar</title>
    <style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F4F7FB;color:#0F172A}
    .c{max-width:420px;padding:2rem;border-radius:16px;background:#fff;box-shadow:0 16px 40px rgba(15,23,42,.08);text-align:center}
    h1{margin:0 0 .5rem;font-size:1.2rem}
    p{color:#475569;font-size:.9rem;line-height:1.5}
    .ok{color:#047857}.err{color:#B91C1C}</style></head><body>
    <div class="c">
      <h1 class="${status === 'ok' ? 'ok' : 'err'}">${status === 'ok' ? '✅ Google Calendar подключён' : '❌ Не удалось подключить'}</h1>
      <p>${message}</p>
      <p><a href="/app#profile">Вернуться в приложение</a></p>
    </div>
    <script>try{window.opener&&window.opener.postMessage({planel_google:'${status}'},'*');setTimeout(()=>window.close(),800);}catch(e){}</script>
    </body></html>`;
}

module.exports = async function googleCallback(req, res) {
  try {
    if (!configured()) return res.status(503).send(htmlPage('err', 'Сервер не настроен: отсутствуют GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET.'));

    const { code, state, error } = req.query || {};
    if (error) return res.status(400).send(htmlPage('err', `Google вернул ошибку: ${error}`));
    if (!code || !state) return res.status(400).send(htmlPage('err', 'Отсутствует code или state.'));

    let parsed;
    try { parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')); }
    catch { return res.status(400).send(htmlPage('err', 'Некорректный state.')); }

    const userToken = parsed?.t;
    if (!userToken) return res.status(400).send(htmlPage('err', 'Нет токена пользователя в state.'));

    const { data, error: userErr } = await supabaseAdmin().auth.getUser(userToken);
    if (userErr || !data?.user) return res.status(401).send(htmlPage('err', 'Сессия PLANEL истекла. Войдите заново и повторите подключение.'));
    const user = data.user;

    const redirectUri = getRedirectUri(req);
    const tokens = await exchangeCode(code, redirectUri);
    if (!tokens.access_token || !tokens.refresh_token) {
      console.error('[google/callback] no tokens:', tokens);
      return res.status(400).send(htmlPage('err', tokens.error_description || 'Google не вернул токены. Попробуйте снова.'));
    }

    const email = await fetchGoogleEmail(tokens.access_token);
    const now = Date.now();
    await saveGoogleTokens(user.id, user.user_metadata, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: now + ((tokens.expires_in || 3600) * 1000),
      email,
      connected_at: new Date().toISOString()
    });

    return res.send(htmlPage('ok', `Аккаунт ${email || 'Google'} успешно подключён к PLANEL.`));
  } catch (e) {
    console.error('[google/callback] fatal:', e.stack || e.message);
    return res.status(500).send(htmlPage('err', 'Внутренняя ошибка. Проверьте логи сервера.'));
  }
};
