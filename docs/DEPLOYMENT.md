# Публикация

## GitHub Pages — сайт из командного репозитория

Владелец включает Settings → Pages → Build and deployment → Source: GitHub Actions. После успешного workflow `Publish demo` адрес показывается в Settings → Pages и на странице запуска Actions.

Workflow публикует только website/ после проверок. app/, история Git и SQLite на Pages не исполняются. Все ссылки ресурсов относительные и работают в подкаталоге репозитория.

## Уже опубликованный Sites

Текущее демо: https://trace-bank-demo.tenderfield7.chatgpt.site/demo.html . Это отдельная публикация. Push в GitHub автоматически обновляет GitHub Pages, когда он включен; адрес Sites от такого push не меняется. Для обновления Sites нужно отдельно публиковать website/ через инструменты Sites, с project_id `appgprj_6ad66d28e7e48191b8c148ca2ca594af` и корректным source workflow. Не добавляйте токены Sites в репозиторий.

## Clerk

Интерфейс подключения готов в website/workspace.html. Пока Publishable Key пустой. Настройте приложение Clerk, организации, приглашения и домен согласно CLERK-SETUP.md. Публичный demo.html использует синтетические данные без входа. Python API не защищен Clerk и остается локальным прототипом.
