# Envpermit

This repository is configured to publish the self-contained Artefakt C risk-register app with GitHub Pages.

## One-time GitHub setup

1. Create a GitHub repository and push this project to its `main` branch.
2. In the GitHub repository, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Open the **Actions** tab and wait for **Deploy app to GitHub Pages** to finish.

The deployment URL appears in the completed workflow run and in **Settings → Pages**. Every later push to `main` deploys the current app automatically. You can also run the workflow manually from the **Actions** tab.

## What is published

The workflow publishes only:

```text
Artefakt_C_Riskregister/Artefakt_C_riskregister.html → index.html
```

The page contains its styles, JavaScript, and data inline, so it works at both a repository subpath such as `https://OWNER.github.io/REPOSITORY/` and a root Pages domain. Source data, build scripts, archives, and the local MCP server are not included in the deployed site.

Everything embedded in the HTML—including all risk-register data—is visible to anyone who can access the Pages site.

GitHub Pages is static hosting and cannot run `Artefakt_C_Riskregister/mcp-server`; the browser app does not depend on that server.

## Local preview

From the repository root, run:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/Artefakt_C_Riskregister/Artefakt_C_riskregister.html
```
