# Настройка Google Calendar для PLANEL

Чтобы заработала интеграция в профиле пользователя, нужно зарегистрировать OAuth-приложение в Google Cloud и задать три переменные окружения на сервере.

## 1. Создать OAuth-клиент в Google Cloud

1. Зайди на https://console.cloud.google.com/
2. Создай новый проект (или выбери существующий).
3. В меню → **APIs & Services** → **Library** → найди **Google Calendar API** → **Enable**.
4. **APIs & Services** → **OAuth consent screen**:
   - User type: **External** (если у тебя нет Google Workspace).
   - App name: `PLANEL`
   - User support email: твой email.
   - Developer contact: твой email.
   - **Scopes**: добавь `.../auth/calendar.events` и `.../auth/userinfo.email`.
   - **Test users**: добавь email, с которого будешь тестировать (пока приложение не прошло Google review, только test users могут входить).
5. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**:
   - Application type: **Web application**.
   - Name: `PLANEL web`.
   - **Authorized redirect URIs** — добавь ОБА:
     - `http://localhost:3000/api/google/callback` (для локальной разработки; замени 3000 на свой порт, если отличается)
     - `https://planel-1.onrender.com/api/google/callback` (замени на реальный домен твоего Render-сервиса)
6. Сохрани — Google покажет **Client ID** и **Client secret**. Скопируй их.

## 2. Задать переменные окружения

### Локально (файл `.env` в корне)

```env
GOOGLE_CLIENT_ID=<твой Client ID>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<твой Client secret>
# Необязательно — если нужно принудительно зафиксировать redirect URI:
# GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
```

### На Render

Dashboard → твой Web Service → **Environment** → **Add Environment Variable**:

| Ключ | Значение |
|---|---|
| `GOOGLE_CLIENT_ID` | `<твой Client ID>.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | `<твой Client secret>` |
| `GOOGLE_REDIRECT_URI` | `https://planel-1.onrender.com/api/google/callback` |

После сохранения Render автоматически перезапустит сервис.

## 3. Проверить

1. Открой приложение, войди как обычный пользователь.
2. Кликни на аватар справа вверху → откроется **Профиль**.
3. В карточке **Google Calendar** нажми **Подключить** → откроется всплывающее окно Google.
4. Выбери аккаунт (тот, что добавлен в Test users), разреши доступ.
5. После редиректа окно закроется, в тосте появится «Google Calendar подключён».
6. Перейди в **Планер** → вверху появится чекбокс **«Google-события»**. Включи его — события из основного календаря Google отобразятся на днях месяца.
7. При создании задачи с дедлайном внизу модалки появится чекбокс **«Добавить в Google Calendar»** — задача будет создана как событие в основном календаре Google.

## Что хранится

Токены Google (access + refresh) сохраняются в `user_metadata.google` пользователя Supabase. Это удобно для демо, но для продакшена лучше переехать на отдельную таблицу с RLS — тогда токены не будут видны клиенту через `getUser()`.

Требуется **service-role** ключ Supabase (а не publishable). Проверь `SUPABASE_SERVICE_KEY` — он должен начинаться с `sb_secret_...` (или это длинный JWT), а не с `sb_publishable_...`.

## Отключение

В Профиле → **Google Calendar** → **Отключить**. Сервер отзовёт refresh token у Google и сотрёт токены из Supabase.
