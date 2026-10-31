# uOttawa Menu at a Glance

An independent, mobile-friendly viewer for the University of Ottawa Dining Hall menu.

- Loads the university's dated menu live in the browser.
- Shows every station together, with any subset of breakfast, lunch and dinner.
- Combines dietary filters and remembers preferences locally.
- Adds colored dietary badges and an inferred meat/fish protein badge.

The university's dietary icons describe ingredients and do not guarantee protection against cross-contact. The P badge is inferred from dish names, not an official university label or a nutritional measurement.

## Hosting

This is a static site with no build step or server-side dependencies. GitHub Pages serves the files from the root of the `main` branch. The `.nojekyll` file disables Jekyll processing.

For local development, serve this directory with any local HTTP server. JavaScript modules require an HTTP origin. The live menu fetch depends on uOttawa's cross-origin policy and HTML structure.

No analytics, accounts, API keys or server-side storage are used by the application. Preferences and a small, clearly labelled fallback menu cache stay in the browser.

Source menu: https://www.uottawa.ca/campus-life/eat-campus/dining-hall/menu
