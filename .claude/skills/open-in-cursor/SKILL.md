---
name: open-in-cursor
description: Open the collection module in Cursor IDE (desktop or web). Use when the user wants to open the project in Cursor, view the code in their IDE, or open the collection module workspace.
disable-model-invocation: true
allowed-tools: Bash
---

# Open in Cursor

Open the collection module in Cursor.

## Determine mode

If the user said "web" or "browser", open in **Cursor web** via vscode.dev with the GitHub repo:

```bash
open "https://vscode.dev/github/RootBank/blank_starter_template_v2/tree/main/collection_module"
```

Otherwise, open in **Cursor desktop**:

```bash
open -a "Cursor" /Users/dionnechasi/blank_starter_template_v2/collection_module
```

If `$ARGUMENTS` contains a specific file path, open that file directly:

```bash
open -a "Cursor" /Users/dionnechasi/blank_starter_template_v2/collection_module/$ARGUMENTS
```

Confirm to the user which mode was used.
