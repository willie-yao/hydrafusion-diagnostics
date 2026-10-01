# Hydrafusion Diagnostics

Read-only Copilot canvas extension for inspecting Hydrafusion routing, concrete
models, workflow phases, usage, latency, normalized nano-AIU, and tool activity.

## Install

Download the latest release into the Copilot user extensions directory:

```sh
mkdir -p ~/.copilot/extensions/hydrafusion-diagnostics
curl -fsSL https://github.com/willie-yao/hydrafusion-diagnostics/archive/refs/tags/v0.2.0.tar.gz \
  | tar -xz --strip-components=1 \
      -C ~/.copilot/extensions/hydrafusion-diagnostics
```

Reload extensions in Copilot, then open the **Hydrafusion Diagnostics** canvas.

To install the development version instead, replace `refs/tags/v0.2.0` with
`refs/heads/main`.

The extension uses the Copilot SDK contracts supplied by the host application.
It does not require a separate runtime dependency.

## Development

```sh
npm test
```

Diagnostics are metadata-only, retained in process memory, and bounded to the
25 most recent Hydrafusion turns. Prompts, responses, phase content, tool
arguments and results, file paths, and provider tracing IDs are not exposed.

Hydrafusion and canvas APIs are experimental and may change between Copilot
releases.
