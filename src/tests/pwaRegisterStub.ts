// Test stub for the `virtual:pwa-register` module, which only exists when the
// vite-plugin-pwa build plugin is active. Aliased in for Vitest so the lazy
// import in PwaUpdatePrompt resolves (the prompt itself stays inert in tests,
// since registration is gated behind `import.meta.env.PROD`).
export function registerSW(): (reload?: boolean) => Promise<void> {
  return async () => {};
}
