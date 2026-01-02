# Решение проблемы с Git авторизацией на Windows

## БЫСТРОЕ РЕШЕНИЕ (рекомендуется)

### Вариант 1: Использовать Personal Access Token

1. **Создайте токен на GitHub:**
   - Откройте: https://github.com/settings/tokens
   - Нажмите "Generate new token" → "Generate new token (classic)"
   - Выберите срок действия и permissions: `repo` (full control)
   - Скопируйте токен (он показывается только один раз!)

2. **Выполните в PowerShell/CMD:**
```bash
# Отключите Git Credential Manager
git config --global --unset credential.helper

# Установите простой store
git config --global credential.helper store

# Сделайте push (введите токен вместо пароля)
git push

# Когда попросит:
# Username: ваш_github_username
# Password: вставьте_токен_сюда
```

После первого ввода Git запомнит токен навсегда.

---

### Вариант 2: Токен прямо в URL (самый быстрый)

```bash
# Замените remote URL на URL с токеном
git remote set-url origin https://ваш_токен@github.com/Svyatoyotec98/Spanish-Lanuage-Trainer-A2-C1.git

# Теперь просто
git push
```

**ВАЖНО:** Замените `ваш_токен` на реальный Personal Access Token из GitHub.

---

### Вариант 3: Переустановить credential helper

```bash
# В PowerShell от администратора
git config --system --unset credential.helper
git config --global credential.helper wincred

# Затем сделайте push и введите токен
git push
```

---

## Если ничего не помогает

Удалите все сохраненные credentials:

```bash
# Windows Credential Manager
cmdkey /list | findstr git
cmdkey /delete:git:https://github.com

# Затем настройте заново
git config --global credential.helper store
git push
```

---

## Проверка текущих настроек

```bash
git config --list | findstr credential
git remote -v
```
