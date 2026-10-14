# Project documentation

The application entry points and release contract stay in the repository root:
[README](../README.md), [AGENTS](../AGENTS.md), and the living
[project handoff](../project_handoff.md).

- [Architecture decision record](architecture/ENTERPRISE_ARCHITECTURE_PLAN.md)
  — as-built model, explicit non-goals and revisit triggers.
- [Inherited-code audit](audits/AUDIT_INHERITED_V129.md)
  — findings and remediation record.
- [Label and print audit](audits/AUDIT_LABEL_PRINT_REPORT.md)
  — output correctness evidence and historical findings.
- [Reports/Excel audit](audits/AUDIT_REPORT.md)
  — historical QA evidence; do not mistake it for the current release status.

Historical audit reports are evidence, **not** current defects. Use the
versioned handoff and live tests for release status. Source code remains
under `src/`; Cloudflare configuration, Vite entry points, `public/` and
`sw.js` remain at their existing paths to avoid deployment regressions.
