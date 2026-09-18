// ============================================================================
// FAQ content (EN / RU)
//
// Kept out of the i18n dictionaries so the HTML stays readable and editable.
// Both `en.ts` and `ru.ts` expose it under the same `FAQ_BODY` key, so the
// EN/RU key-parity invariant is preserved.
//
// Writing rules: task-oriented ("how do I…"), action first, real UI labels in
// <b>/<code>, short scannable lists, and a dedicated troubleshooting section.
// ============================================================================

export const FAQ_BODY_EN = `
<div class="faq-accordion">

<details class="faq-details" open>
<summary class="faq-summary">1. Quick start — the first 5 minutes</summary>
<div class="faq-content">
<p>Do these in order — everything else builds on them.</p>
<ol>
<li><b>Sign in</b> with your username and PIN. On a fresh system the first Administrator sets their own PIN.</li>
<li><b>Build the structure</b> — <b>System Management</b> → <b>System Registries</b> → <b>Programs &amp; Stations</b>. Add a program, then add stations inside it, then posts inside a station. Areas with no program (Tool Gage, Machine Shop) live in the <i>“No program (areas)”</i> group at the bottom.</li>
<li><b>Add people</b> — same window → <b>Personnel</b>: name, initials, badge, then choose <b>Program → Station → Post</b>.</li>
<li><b>Add tools</b> — <b>System Management</b> → <b>+ Add New Tool</b>. Pick the class prefix, fill in name and spec, then set the program and workstation/post.</li>
<li><b>Issue a tool</b> — open the tool card → <b>[Assign Person]</b> → choose the employee → set the return date.</li>
</ol>
<p><b>Where is what:</b> the <i>Category Hub</i> is the home screen (Tools / Personnel / Workstations / Consumables / Procurement / Maintenance). <i>All Tools Detailed Grid</i> is the searchable full list. The charts sit above the list.</p>
</div>
</details>

<details class="faq-details">
<summary class="faq-summary">2. Tools: issue, return, move, service, retire</summary>
<div class="faq-content">
<p>Open any tool card (click the tool name) to reach its actions:</p>
<ul>
<li><b>[Assign Person]</b> — issue the tool to an employee and set the due-return date. The holder is responsible until the return is registered.</li>
<li><b>[Return Tool]</b> — grade the condition (1–5 stars) and add notes. The grade feeds the holder’s Care Score.</li>
<li><b>[Transfer / Move]</b> — change the workstation/post or the rack–shelf–bin address.</li>
<li><b>[Service / Calibrate]</b> — send the tool to the maintenance/calibration queue; <b>[Complete Maintenance]</b> closes it and logs the result.</li>
<li><b>[Procure / Order]</b> — create a purchase request for this tool.</li>
<li><b>Print Sticker / Label</b> — print the tool’s QR / Code39 label.</li>
<li><b>[Decommission / Retire]</b> — write the tool off with a reason; it moves to the <b>Decommissioned Assets Archive</b> and can be restored from there.</li>
</ul>
<p><b>Consumables</b> (bits, drills, abrasives…) are tracked as quantities with Min/Max limits; the hub warns when stock drops below the minimum.</p>
</div>
</details>

<details class="faq-details">
<summary class="faq-summary">3. Structure: programs, stations, posts &amp; people</summary>
<div class="faq-content">
<p>The hierarchy is <b>Program → Station → Post</b>. Tools and people are attached to a station/post; the program is derived from the station.</p>
<ul>
<li><b>Add a program</b> — type the name and press <b>+ Add Program</b>.</li>
<li><b>Add a station</b> — use the <b>+ Add</b> row inside the program, or inside <i>“No program (areas)”</i> for Tool Gage / Machine Shop / Store.</li>
<li><b>Add a post</b> — use the <b>+ Add</b> row inside the station.</li>
<li><b>Move a station to another program</b> — the <b>⇄</b> button on the station. Pick a program, or <b>— No program —</b> to detach it (Tool Gage is an area, not a program).</li>
<li><b>Move a post to another station</b> — the <b>⇄</b> button on the post. People and tools follow automatically.</li>
<li><b>Rename / delete</b> — <b>✏️</b> / <b>✖</b>. Deleting a station also removes its posts; the integrity check will find any dangling people or tools.</li>
<li><b>The registry is missing stations that clearly exist</b> — press <b>📥 Register missing stations &amp; posts</b> (top of the <i>Programs &amp; Stations</i> tab, or in the Integrity Check). It reads the stations, posts and programs that tools and people <i>already</i> reference and adds them to the registry — <b>without changing a single tool or person</b>. Use this after importing old data, or when the risk chart shows a station you cannot find in the registry.</li>
</ul>
<p><b>Assign a person</b> — <b>Personnel</b> tab: choose Program → Station → Post, then <b>+ Add</b>. Click <b>✏️</b> on a row to change an assignment.</p>
<p><b>Why a station I added does not appear in the Risk Index chart:</b> that chart is built from <b>tool locations</b> (and, for issued tools, from the holder's station), not from the registry. A station with no tools on it has no risk to show, so it stays out of the chart until something is placed there. The registry and the chart agree once the tools point at registered stations.</p>
</div>
</details>

<details class="faq-details">
<summary class="faq-summary">4. Address storage, QR scan &amp; labels</summary>
<div class="faq-content">
<p>Storage addresses follow <b>Zone → Rack (A–Z) → Shelf (1–20) → Bin (1–50)</b>. The next free bin is suggested automatically to avoid duplicates. Structure types: Rack, Workbench, Toolbox, A-Frame.</p>
<ul>
<li><b>Find a tool or a place fast</b> — use the search box (ID, name, category, location, employee) or the <b>📷 QR</b> button to scan a tool or storage label.</li>
<li><b>Storage summary</b> — scanning or searching a storage address opens an analytical card: tooling vs consumables balance, items on maintenance/calibration, low stock and overdue items, with shelf contents grouped into expandable sections.</li>
<li><b>Print labels</b> — <b>Operations &amp; Reports</b> → <b>Print Storage Labels</b>, or <b>Print Sticker / Label</b> on a tool. Choose the media (Avery / bin tag / Brady) and preview before printing. Labels can be queued and printed later with the <b>🏷</b> button in the header.</li>
</ul>
</div>
</details>

<details class="faq-details">
<summary class="faq-summary">5. Procurement &amp; receiving</summary>
<div class="faq-content">
<ol>
<li><b>Create a request</b> — <b>Operations &amp; Reports</b> → <b>Procure / Order Tool</b>. Add line items (name, qty, unit price, reason, supplier link); the running total is shown. Press <b>Submit Request</b> to save it.</li>
<li><b>Receive</b> — <b>Purchase Orders</b> → open the order. Receive each line individually (partial receiving is fine: 2 of 5 today, the rest later), or reject a line with a reason. Stock increases automatically on receipt.</li>
<li><b>Official REQ-003 form</b> — export the filled expense-request <b>.xlsx</b> from the order.</li>
</ol>
</div>
</details>

<details class="faq-details">
<summary class="faq-summary">6. Dashboard: charts, filters &amp; risk index</summary>
<div class="faq-content">
<ul>
<li><b>Tool Status Breakdown</b> (donut) — click a slice or its legend entry to filter the tool list by that status.</li>
<li><b>Workstation Tool Load</b> (bars) — click a bar to filter by that workstation.</li>
<li><b>Risk Index &amp; Incidents</b> (radar) — one ray per <b>Station | Post</b>, scored 0–100 (penalties for overdue items, maintenance and wear). <b>Hover</b> a ray for the program, responsible person and rating factors; <b>click</b> it to open the full <b>risk breakdown</b> (KPIs, per-tool list, summary) with a shortcut to the 5S report.</li>
<li><b>5S Audit Radar</b> — click a ray to open the audit history and the post card with the 1–5 breakdown per pillar.</li>
<li><b>Filters</b> — a banner appears above the list; use <b>Reset Filter</b> to clear it. A search query jumps straight to the detailed grid.</li>
</ul>
</div>
</details>

<details class="faq-details">
<summary class="faq-summary">7. 5S audits &amp; reports</summary>
<div class="faq-content">
<ol>
<li><b>Run an audit</b> — <b>Operations &amp; Reports</b> → <b>5S Post Audit</b>: pick a workstation and post, score each of the 5 pillars (Sort, Set in Order, Shine, Standardize, Sustain) from 1 to 5, and add notes.</li>
<li><b>Understand a score</b> — every 1–5 value has a rubric explanation (e.g. “3 — Excess items present, but stacked separately”).</li>
<li><b>Report</b> — <b>Operations &amp; Reports</b> → <b>Generate 5S Report</b>: compliance rate, status breakdown, workstation load &amp; loss risk, warnings and recommendations. Print it or export it to PDF.</li>
</ol>
</div>
</details>

<details class="faq-details">
<summary class="faq-summary">8. Updating the app, offline work &amp; your data</summary>
<div class="faq-content">
<ul>
<li><b>Check the version</b> — the number next to the title in the header (for example <b>v***</b>).</li>
<li><b>Update to the newest version</b> — click that <b>version number</b> in the header, or use <b>Operations &amp; Reports</b> → <b>🔄 Update PWA</b>, or <b>System Management</b> → <b>Force Update App</b>. This clears the browser caches, unregisters the old service worker and reloads, so you always get the latest build. <b>Your data is not affected.</b></li>
<li><b>Offline</b> — the app keeps working without a network. Data is stored in the browser (IndexedDB); the server is only used for the optional multi-device sync.</li>
<li><b>Backup / restore</b> — <b>System Management</b> → <b>Export Backup (.json)</b> and <b>Restore Backup (.json)</b> (Administrator only).</li>
</ul>
</div>
</details>

<details class="faq-details">
<summary class="faq-summary">9. If something does not work</summary>
<div class="faq-content">
<ul>
<li><b>A button says “Access Denied”</b> — your role is too low. Ask an Administrator (adding tools and editing registries require the Administrator role).</li>
<li><b>The app looks outdated after an update</b> — click the version number in the header to force a clean reload.</li>
<li><b>A tool or person points to an unknown station</b> — <b>System Management</b> → <b>🩺 Integrity Check</b>. Press <b>📥 Register missing stations &amp; posts</b>: it adds the missing stations to the registry and keeps every tool where it really is. Only if you genuinely want to relocate those tools, use <b>🛠 Move tools to default station</b> — it <b>overwrites</b> their real location, so it asks for confirmation.</li>
<li><b>The workstation chart shows odd rows</b> — usually dangling tool locations; run the Integrity Check as above.</li>
<li><b>You made a mistake in the registries</b> — <b>System Management</b> → <b>↩ Rollback Last Cascade</b> restores the state from before the last structural change.</li>
<li><b>You are stuck or locked out</b> — press <b>🔒 Lock</b> and sign in again; a forgotten PIN must be reset by an Administrator.</li>
</ul>
</div>
</details>

</div>
`;

export const FAQ_BODY_RU = `
<div class="faq-accordion">

<details class="faq-details" open>
<summary class="faq-summary">1. Быстрый старт — первые 5 минут</summary>
<div class="faq-content">
<p>Выполните шаги по порядку — всё остальное строится на них.</p>
<ol>
<li><b>Войдите</b> по логину и PIN. На новой системе первый Администратор задаёт свой PIN сам.</li>
<li><b>Создайте структуру</b> — <b>Управление системой</b> → <b>Справочники системы</b> → <b>Программы и станции</b>. Добавьте программу, затем станции внутри неё, затем посты внутри станции. Участки без программы (Tool Gage, Machine Shop) находятся в нижней группе <i>«Без программы (участки)»</i>.</li>
<li><b>Добавьте людей</b> — в том же окне → <b>Персонал</b>: имя, инициалы, бейдж, затем выберите <b>Программа → Станция → Пост</b>.</li>
<li><b>Добавьте инструмент</b> — <b>Управление системой</b> → <b>+ Добавить инструмент</b>. Выберите класс, заполните название и спецификацию, затем укажите программу и рабочую станцию/пост.</li>
<li><b>Выдайте инструмент</b> — откройте карточку инструмента → <b>[Назначить]</b> → выберите сотрудника → задайте срок возврата.</li>
</ol>
<p><b>Где что находится:</b> <i>Категорийный хаб</i> — главный экран (Инструмент / Персонал / Станции / Расходники / Закупки / Обслуживание). <i>Все инструменты (сетка)</i> — полный список с поиском и фильтрами. Графики расположены над списком.</p>
</div>
</details>

<details class="faq-details">
<summary class="faq-summary">2. Инструмент: выдача, возврат, перемещение, обслуживание, списание</summary>
<div class="faq-content">
<p>Откройте карточку инструмента (клик по названию), чтобы увидеть действия:</p>
<ul>
<li><b>[Назначить]</b> — выдать инструмент сотруднику и задать срок возврата. Держатель отвечает за инструмент до регистрации возврата.</li>
<li><b>[Вернуть инструмент]</b> — оцените состояние (1–5 звёзд) и добавьте примечание. Оценка влияет на «Бережливость» сотрудника.</li>
<li><b>[Переместить]</b> — сменить рабочую станцию/пост или адрес стеллаж–полка–ячейка.</li>
<li><b>[Обслуживание / Калибровка]</b> — отправить в очередь ТО/калибровки; <b>[Завершить ремонт]</b> закрывает запись и фиксирует результат.</li>
<li><b>[Закупка]</b> — создать заявку на закупку этого инструмента.</li>
<li><b>Печать этикетки</b> — напечатать QR / Code39 этикетку инструмента.</li>
<li><b>[Списать]</b> — списать инструмент с указанием причины; он переходит в <b>Архив списанных активов</b> и может быть восстановлен оттуда.</li>
</ul>
<p><b>Расходники</b> (биты, свёрла, абразивы…) учитываются количеством с порогами Min/Max; хаб предупреждает, когда остаток ниже минимума.</p>
</div>
</details>

<details class="faq-details">
<summary class="faq-summary">3. Структура: программы, станции, посты и люди</summary>
<div class="faq-content">
<p>Иерархия: <b>Программа → Станция → Пост</b>. Инструменты и люди привязаны к станции/посту; программа выводится из станции.</p>
<ul>
<li><b>Добавить программу</b> — введите название и нажмите <b>+ Добавить программу</b>.</li>
<li><b>Добавить станцию</b> — строка <b>+ Добавить</b> внутри программы или внутри группы <i>«Без программы (участки)»</i> (Tool Gage / Machine Shop / Склад).</li>
<li><b>Добавить пост</b> — строка <b>+ Добавить</b> внутри станции.</li>
<li><b>Перенести станцию в другую программу</b> — кнопка <b>⇄</b> у станции. Выберите программу или <b>— Без программы —</b>, чтобы отвязать станцию (Tool Gage — это участок, а не программа).</li>
<li><b>Перенести пост в другую станцию</b> — кнопка <b>⇄</b> у поста. Люди и инструменты переходят автоматически.</li>
<li><b>Переименовать / удалить</b> — <b>✏️</b> / <b>✖</b>. Удаление станции удаляет и её посты; проверка целостности найдёт «висячие» ссылки у людей и инструментов.</li>
<li><b>В справочнике нет станций, которые явно существуют</b> — нажмите <b>📥 Зарегистрировать недостающие станции и посты</b> (вверху вкладки <i>Программы и станции</i> или в проверке целостности). Она читает станции, посты и программы, на которые <i>уже</i> ссылаются инструменты и люди, и добавляет их в справочник — <b>не меняя ни один инструмент и ни одного человека</b>. Используйте после переноса старых данных или когда на графике рисков видна станция, которой нет в справочнике.</li>
</ul>
<p><b>Назначить человека</b> — вкладка <b>Персонал</b>: выберите Программа → Станция → Пост, затем <b>+ Добавить</b>. Клик по <b>✏️</b> в строке меняет привязку.</p>
<p><b>Почему добавленная станция не появляется на графике «Индекс рисков»:</b> этот график строится по <b>расположению инструментов</b> (а для выданных — по станции держателя), а не по справочнику. У станции без инструментов нет риска, который можно показать, поэтому она не попадает на график, пока туда что-нибудь не поставят. Справочник и график сходятся, когда инструменты указывают на зарегистрированные станции.</p>
</div>
</details>

<details class="faq-details">
<summary class="faq-summary">4. Адресное хранение, QR-скан и этикетки</summary>
<div class="faq-content">
<p>Адреса хранения: <b>Зона → Стеллаж (A–Z) → Полка (1–20) → Ячейка (1–50)</b>. Следующая свободная ячейка предлагается автоматически, чтобы не было дублей. Типы конструкций: Стеллаж, Верстак, Ящик/Тележка, А-Фрейм.</p>
<ul>
<li><b>Быстро найти инструмент или место</b> — используйте строку поиска (ID, название, категория, локация, сотрудник) или кнопку <b>📷 QR</b> для сканирования этикетки инструмента или места хранения.</li>
<li><b>Сводка по месту хранения</b> — сканирование или поиск адреса открывает аналитическую карточку: баланс оснастки и расходников, позиции на ТО/калибровке, низкий остаток и просрочки; содержимое полок сгруппировано в раскрывающиеся блоки.</li>
<li><b>Печать этикеток</b> — <b>Операции и отчёты</b> → <b>Печать этикеток мест хранения</b> или <b>Печать этикетки</b> в карточке инструмента. Выберите носитель (Avery / бирка ячейки / Brady) и проверьте предпросмотр. Этикетки можно поставить в очередь и напечатать позже кнопкой <b>🏷</b> в шапке.</li>
</ul>
</div>
</details>

<details class="faq-details">
<summary class="faq-summary">5. Закупки и приёмка</summary>
<div class="faq-content">
<ol>
<li><b>Создать заявку</b> — <b>Операции и отчёты</b> → <b>Закупка инструмента</b>. Добавьте позиции (название, количество, цена за единицу, причина, ссылка на поставщика); итог считается на лету. Нажмите <b>Отправить заявку</b>, чтобы сохранить.</li>
<li><b>Приёмка</b> — <b>Заявки на закупку</b> → откройте заявку. Принимайте позиции по отдельности (частичная приёмка допустима: 2 из 5 сегодня, остальное позже) или отклоните позицию с указанием причины. Остаток увеличивается автоматически при приёмке.</li>
<li><b>Официальная форма REQ-003</b> — выгрузите заполненную форму заявки на расход <b>.xlsx</b> прямо из заявки.</li>
</ol>
</div>
</details>

<details class="faq-details">
<summary class="faq-summary">6. Дашборд: графики, фильтры и индекс рисков</summary>
<div class="faq-content">
<ul>
<li><b>Статус инструментов</b> (пончик) — клик по сектору или подписи в легенде фильтрует список по этому статусу.</li>
<li><b>Загрузка рабочих станций</b> (столбцы) — клик по столбцу фильтрует по этой станции.</li>
<li><b>Индекс рисков и инциденты</b> (радар) — один луч на <b>Станция | Пост</b>, оценка 0–100 (штрафы за просрочки, обслуживание и износ). <b>Наведение</b> на луч показывает программу, ответственного и факторы риска; <b>клик</b> открывает полную <b>расшифровку риска</b> (показатели, список инструментов, сводка) с переходом к отчёту 5S.</li>
<li><b>Радар аудита 5S</b> — клик по лучу открывает историю аудитов и карточку поста с расшифровкой оценок 1–5 по каждому столпу.</li>
<li><b>Фильтры</b> — над списком появляется плашка активного фильтра; сбросить — кнопка <b>Сбросить фильтр</b>. Поисковый запрос сразу переключает на подробную сетку.</li>
</ul>
</div>
</details>

<details class="faq-details">
<summary class="faq-summary">7. 5S-аудиты и отчёты</summary>
<div class="faq-content">
<ol>
<li><b>Провести аудит</b> — <b>Операции и отчёты</b> → <b>5S аудит поста</b>: выберите рабочую станцию и пост, оцените каждый из 5 столпов (Сортировка, Порядок, Чистота, Стандартизация, Совершенствование) от 1 до 5 и добавьте примечания.</li>
<li><b>Понять оценку</b> — для каждой оценки 1–5 есть пояснение из рубрикатора (например, «3 — Лишнее есть, но сложено отдельно»).</li>
<li><b>Отчёт</b> — <b>Операции и отчёты</b> → <b>Сформировать отчёт 5S</b>: процент соответствия, разбивка по статусам, загрузка станций и риск потерь, предупреждения и рекомендации. Можно распечатать или выгрузить в PDF.</li>
</ol>
</div>
</details>

<details class="faq-details">
<summary class="faq-summary">8. Обновление приложения, офлайн-работа и данные</summary>
<div class="faq-content">
<ul>
<li><b>Проверить версию</b> — номер рядом с заголовком в шапке (например, <b>v***</b>).</li>
<li><b>Обновить до новой версии</b> — кликните по этому <b>номеру версии</b> в шапке, либо <b>Операции и отчёты</b> → <b>🔄 Обновить PWA</b>, либо <b>Управление системой</b> → <b>Принудительное обновление</b>. Приложение очистит кэш браузера, снимет старый сервис-воркер и перезагрузится, поэтому вы всегда получаете свежую сборку. <b>Ваши данные при этом не затрагиваются.</b></li>
<li><b>Офлайн</b> — приложение работает и без сети. Данные хранятся в браузере (IndexedDB); сервер используется только для необязательной синхронизации между устройствами.</li>
<li><b>Резервная копия / восстановление</b> — <b>Управление системой</b> → <b>Экспорт резервной копии (.json)</b> и <b>Восстановить из копии (.json)</b> (только Администратор).</li>
</ul>
</div>
</details>

<details class="faq-details">
<summary class="faq-summary">9. Если что-то не работает</summary>
<div class="faq-content">
<ul>
<li><b>Кнопка отвечает «Доступ запрещён»</b> — у вашей роли недостаточно прав. Обратитесь к Администратору (добавление инструментов и правка справочников требуют роли Администратор).</li>
<li><b>После обновления приложение выглядит старым</b> — кликните по номеру версии в шапке, чтобы выполнить чистую перезагрузку.</li>
<li><b>Инструмент или человек ссылается на неизвестную станцию</b> — <b>Управление системой</b> → <b>🩺 Проверка целостности</b>. Нажмите <b>📥 Зарегистрировать недостающие станции и посты</b>: она добавит станции в справочник и оставит каждый инструмент там, где он реально находится. Только если вы действительно хотите перенести эти инструменты, используйте <b>🛠 Перенести инструменты на станцию по умолчанию</b> — она <b>перезапишет</b> их реальное расположение, поэтому запрашивает подтверждение.</li>
<li><b>В графике загрузки станций странные строки</b> — обычно это «висячие» локации инструментов; выполните проверку целостности выше.</li>
<li><b>Ошиблись в справочниках</b> — <b>Управление системой</b> → <b>↩ Откат последнего каскада</b> вернёт состояние до последнего структурного изменения.</li>
<li><b>Заблокировались / не можете войти</b> — нажмите <b>🔒 Заблокировать</b> и войдите заново; забытый PIN сбрасывает Администратор.</li>
</ul>
</div>
</details>

</div>
`;
