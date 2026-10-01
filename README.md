# Hydrafusion Diagnostics

Read-only Copilot canvas extension for inspecting Hydrafusion routing, concrete
models, workflow phases, usage, latency, normalized nano-AIU, and tool activity.

## Install

Clone this repository into the Copilot user extensions directory:

```sh
git clone https://github.com/willie-yao/hydrafusion-diagnostics.git \
  ~/.copilot/extensions/hydrafusion-diagnostics
```

Reload extensions in Copilot, then open the **Hydrafusion Diagnostics** canvas.

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
