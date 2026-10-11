// Apply the saved theme before first paint to avoid a light/dark flash.
// A separate file (not inline) so the Content-Security-Policy can stay `script-src 'self'`.
try {
  var saved = localStorage.getItem('theme')
  var dark = saved === 'dark' || (saved !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  if (dark) document.documentElement.classList.add('dark')
} catch {
  // storage or matchMedia unavailable: fall back to the light theme
}
