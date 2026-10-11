// Apply the saved theme before first paint to avoid a flash. Dark is the default design;
// the light theme is used only if the user chose it. A separate file (not inline) so the
// Content-Security-Policy can stay `script-src 'self'`.
try {
  if (localStorage.getItem('theme') !== 'light') document.documentElement.classList.add('dark')
} catch {
  document.documentElement.classList.add('dark')
}
