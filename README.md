# Concept Transformer

The code behind [concepttransformer.site](https://concepttransformer.site): type a concept, press a creative
move (the seven SCAMPER operators, five transforms, and a few utilities), get fresh takes on it as
image concepts or as ideas.

This repository is published so visitors can check what the site does with what they type and, if
they use their own API key, with that key. The move prompts themselves are **not** in this
repository; they live only on the server.

## What is here

- `index.html`, `app.js`, `styles.css`: the page. It holds no prompts and loads no outside code.
- `mindmap.js`: the Map view. It records each press as a small graph in the visitor's browser and draws it as a tree; nothing from it is sent anywhere.
- `relay.php`: the only server file. Every press goes through it. It reads the prompts from a
  locked folder, calls the engine, and returns the results. See below for how it treats keys.
- `moves.json`: the public list of moves: names, descriptions, examples. Built by
  `tools/export_moves.py` from the private prompt file.
- `.htaccess`: no-cache rules and the security headers (content security policy, no referrer).
- `tools/`, `tests/`: the export and upload scripts and the local test harness.

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
