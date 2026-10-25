// Startup file for cPanel "Setup Node.js App" (Phusion Passenger).
// Passenger loads the startup file with require(), and this package is ESM,
// so this CommonJS shim imports the built app. Run `npm run build` first.
import('./dist/main.js').catch(error => {
  console.error(error);
  process.exit(1);
});
