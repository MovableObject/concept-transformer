# Concept Transformer

The code behind [concepttransformer.site](https://concepttransformer.site): type a concept, press creative
moves (SCAMPER, perceptual, linguistic, structural and chance moves, about forty in all), collide two ideas
by connecting their boxes, and grow a map of results. Every result is a full concept again, so any of them
can be transformed, collided or finished in turn. Results come as image concepts or as ideas.

This repository is published so visitors can check what the site does with what they type and, if
they use their own API key, with that key. The move prompts themselves are **not** in this
repository; they live only on the server.

## What is here

- `web/`: the page (version 3): React, React Flow and shadcn components, built with Vite. It holds no
  prompts and loads no outside code. The map, the visitor's Keep and Discard choices and their settings live
  in their own browser only (and in map files they save). A press sends only the box or two boxes it is
  about, plus the visitor's newest keeps and discards so the engine can follow their taste; the server
  does not store any of it.
- `relay.php`: the only server file. Every press goes through it. It reads the prompts from a
  locked folder, calls the engine, and returns the results. See below for how it treats keys.
- `moves.json`: the public list of moves: names, descriptions, examples and evidence notes. Built by
  `tools/export_moves.py` from the private prompt file.
- `.htaccess`: no-cache rules and the security headers (content security policy, no referrer).
- `tools/`, `tests/`: the export and deploy scripts and the local test harness.
- `index.html`, `app.js`, `mindmap.js`, `styles.css` at the top: version 2 of the page, kept for reference.

## Building and deploying

```
npm --prefix web install
npm --prefix web run build
python tools/export_moves.py
python tools/deploy.py --to v3 --dry-run
```

`tools/deploy.py --to v3` uploads a test copy that only the Hostinger preview address serves;
`--to root` replaces the live page. Both need an upload address from Hostinger in `UP_URL`, `UP_AUTH`
and `UP_REST`. For local work, `tests/local/serve.ps1` runs the relay on port 8787 and
`npm --prefix web run dev` serves the page on port 5180, passing presses through to it.

## How a visitor's own key is handled

`relay.php` is the whole story, and it is short. In brief:

1. The key arrives in the request body, over HTTPS, together with the concept and the move.
2. The request body is dropped right after the fields are read (`unset($in)`).
3. The key is placed in one HTTP header for the one call to the provider the visitor chose, then
   unset. It is never written to the counter files, never logged, never echoed back.
4. On an error, only the provider's status words (for example `401 UNAUTHORIZED`) are reported.

In the browser the key is kept in `sessionStorage` (this tab only, gone when the tab closes)
unless the visitor ticks "Remember on this computer", which moves it to `localStorage`. The
content security policy forbids any script that is not the site's own, so nothing else on the
page can read it.

## The free engines

The site's own free keys for Google Gemini and Groq sit in a config file in the same locked
folder as the prompts. The relay caps presses per visitor per hour (by a salted hash of the IP
address, never the address itself) and per engine per day, so the keys are never suspended.
