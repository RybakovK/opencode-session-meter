# Security

## Reporting

Please report vulnerabilities through GitHub Security Advisories in this
repository (**Security → Report a vulnerability**), not in a public issue.

Include the plugin version or commit, the OpenCode Desktop version, and the
steps that reproduce the problem. Do not include API keys, tokens or session
transcripts.

## Scope

The plugin reads session metadata from the OpenCode server that runs it and
sends nothing to third parties. It stores only its own preferences (which
gauges and alerts are enabled). A report is in scope if it shows the plugin
leaking that data, executing untrusted content, or escalating beyond the
permissions configured for it.
