# Design QA — prompt-to-template advanced settings shortcut

- Source visual truth: `/Users/kilianvivien/Desktop/Capture d’écran 2026-07-15 à 14.39.49.png`
- Implementation screenshot: `/Users/kilianvivien/.codex/visualizations/2026/07/15/019f6593-e6ac-7b63-856f-99e14c0b446d/calqo-template-modal-light-0.4.1.png`
- Normalized comparison: `/Users/kilianvivien/.codex/visualizations/2026/07/15/019f6593-e6ac-7b63-856f-99e14c0b446d/calqo-template-modal-comparison.png`
- Viewport: 1198 × 1127, light theme, French app UI
- State: prompt-to-template modal open with an active local AI provider

**Full-view comparison evidence**

- The existing modal keeps its source hierarchy, width, glass treatment, typography, field spacing, radii, and action styling.
- The new ghost action sits at the requested bottom-left position; the existing Close and Generate actions remain aligned at bottom-right.
- The longer French label fits on one line without crowding or overlapping the primary actions.
- The source and implementation differ in selected project-content locale (Turkish versus English); this is persisted project state and does not affect the feature or layout.

**Focused region comparison evidence**

- A separate focused crop was not needed: the normalized modal-only comparison renders the footer controls and their typography at readable size.

**Required fidelity surfaces**

- Fonts and typography: passed; existing weights, sizes, line heights, and hierarchy are preserved. The advanced label uses the established ghost-button treatment.
- Spacing and layout rhythm: passed; the footer now uses a left action and a right action group with no visible collision at the reference width.
- Colors and visual tokens: passed; the action reuses Calqo glass/ghost tokens and the existing Lucide icon language.
- Image quality and asset fidelity: passed; no raster assets were added or replaced, and the standard Bot icon comes from the app's existing icon library.
- Copy and content: passed; English and French strings both identify the shortcut as an advanced feature and name Agent drawing explicitly.

**Interaction verification**

- Desktop preview: shortcut is present; activating it closes the generator and opens Settings with the Agent drawing tab selected.
- Browser preview: shortcut count is zero, confirming the action is desktop-only.
- App version displays as 0.4.1 in the status bar.
- Regular browser console: no errors.
- The desktop-only browser shim reports expected missing-Tauri-bridge errors because it supplies the platform flag without a native Tauri host; these are preview-artifact errors, not caused by the shortcut.

**Findings**

- No actionable P0, P1, or P2 differences.

**Open Questions**

- None.

**Implementation Checklist**

- [x] Add bottom-left advanced action.
- [x] Hide it outside the desktop app.
- [x] Deep-link to Settings → Agent drawing.
- [x] Localize English and French copy.
- [x] Bump application version metadata to 0.4.1.

**Comparison history**

- Initial implementation comparison found no P0/P1/P2 issues, so no visual-fix iteration was required.

**Follow-up Polish**

- None required.

final result: passed
