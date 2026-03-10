# ACTO — Code Context Collector

Расширение VS Code, которое собирает выбранные файлы проекта в единый текстовый отчёт.  
Удобно при работе с LLM (ChatGPT, Claude и т.д.) — вы передаёте весь нужный контекст одним файлом.

## Возможности

- **Дерево файлов** в боковой панели с чекбоксами для каждого файла и папки
- **Каскадное выделение** — клик на папке отмечает все вложенные файлы
- **«Выделить всё» / «Снять выделение»** — кнопки на панели инструментов
- **Автоматический пропуск бинарных файлов** (изображения, `.exe`, архивы и т.д.)
- **Автоматический пропуск** `node_modules`, `.git`, `dist`, `out` и других служебных папок
- **Остановка** сбора в любой момент — частичный результат всё равно сохраняется
- Результат открывается в редакторе автоматически

## Использование

1. Откройте папку проекта в VS Code
2. Нажмите иконку **ACTO** на панели активности (Activity Bar)
3. Отметьте чекбоксами нужные файлы и/или папки
4. Нажмите кнопку **▶ (Собрать отчёт)** на панели инструментов
5. Файл `output.txt` откроется в соседней вкладке — скопируйте содержимое в LLM

## Команды

| Команда | Описание |
|---|---|
| ACTO: Собрать отчёт | Запускает сбор выбранных файлов |
| Выделить все | Отмечает все файлы проекта |
| Снять выделение | Снимает все отметки |
| Остановить парсинг | Прерывает текущий сбор |

## Требования

VS Code версии `1.101.0` или новее.

## Известные ограничения

- Файл `output.txt` всегда сохраняется в корне открытого workspace
- Кодировка результата — UTF-8


Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
