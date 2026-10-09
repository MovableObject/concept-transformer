<?php
/*
 * Concept Transformer relay. Every press goes through here, so the move prompts never leave the server.
 *
 * NOT an open proxy. It accepts only {engine, move, moves? (for move "stack"), mode, words?, concept, field?, key?}, builds the prompt itself from
 * ct_private/prompts.json, calls the engine, and returns {variants: [...]} or {error, message}.
 *   - engine: "gemini" or "groq" on the owner's free keys, or "own:gemini" / "own:groq" / "own:claude" /
 *     "own:openai" with the visitor's own key in "key" (used for this one request only, never stored or logged)
 *   - move: an id from the prompts file; concept: 1 to 500 characters;
 *     field: the second box, only for moves that have one (Domain transfer, Collide), capped per move
 *   - per visitor: presses an hour (by a salted hash of the IP, never the raw IP); own-key presses have a looser cap
 *   - per free engine: a daily cap set below the free tier, so the owner's key is never suspended
 *
 * Keys, limits and prompts live in ct_private/ (locked by ct_private/.htaccess), or one folder above the
 * web root. Config lookup: the CT_CONFIG environment variable, then ../ct_private/config.php, then
 * ./ct_private/config.php. Prompts sit beside the config file as prompts.json.
 */

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function reply(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(int $code, string $error, string $message): void {
    reply($code, ['error' => $error, 'message' => $message]);
}
if (!function_exists('array_is_list')) {
    function array_is_list(array $a): bool { return $a === [] || array_keys($a) === range(0, count($a) - 1); }
}

// ── config ─────────────────────────────────────────────────────────────────
$cfgPath = null;
foreach ([getenv('CT_CONFIG') ?: '', __DIR__ . '/../ct_private/config.php', __DIR__ . '/ct_private/config.php'] as $p) {
    if ($p !== '' && is_file($p)) { $cfgPath = $p; break; }
}
if (!$cfgPath) fail(500, 'config', 'The site is not set up yet.');
$cfg = require $cfgPath;
$cfg += [
    'per_ip_hour' => 30,          // free-engine presses per visitor per hour
    'own_per_ip_hour' => 120,     // own-key presses per visitor per hour (their key, our bandwidth)
    'daily_cap' => ['gemini' => 200, 'groq' => 800],
    'data_dir' => dirname($cfgPath) . '/data',
    'prompts' => '',
    'salt' => 'change-me',
    'models' => [],
    'allowed_origins' => [],      // empty = same site only (no cross-origin headers sent)
];
$cfg['models'] += [
    'gemini' => 'gemini-3.8-flash', 'groq' => 'openai/gpt-oss-120b',
    'claude' => 'claude-opus-5-5', 'openai' => 'gpt-5.4-mini',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, $cfg['allowed_origins'], true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST');
    header('Access-Control-Allow-Headers: Content-Type');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail(405, 'method', 'Send a POST request.');

// ── input ──────────────────────────────────────────────────────────────────
$in = json_decode((string)file_get_contents('php://input', false, null, 0, 8192), true);
if (!is_array($in)) fail(400, 'input', 'The request was not understood.');
$str = fn($k) => is_string($in[$k] ?? null) ? $in[$k] : '';
$engine = $str('engine');
$moveId = $str('move');
$concept = $str('concept');
$field = $str('field');
$mode = $str('mode');   // "image" or "ideas"; checked against the prompts file below
$words = is_int($in['words'] ?? null) ? $in['words'] : (int)($in['words'] ?? 0);   // the length slider; 0 = the mode's default

$own = str_starts_with($engine, 'own:');
$provider = $own ? substr($engine, 4) : $engine;
$labels = ['gemini' => 'Gemini', 'groq' => 'Groq', 'claude' => 'Claude', 'openai' => 'OpenAI'];
if ($own ? !isset($labels[$provider]) : !in_array($provider, ['gemini', 'groq'], true)) fail(400, 'engine', 'Unknown engine.');
if ($own) {
    $apiKey = trim($str('key'));
    if ($apiKey === '' || strlen($apiKey) > 300 || !preg_match('/^[\x21-\x7E]+$/', $apiKey)) {
        fail(400, 'key', 'That key does not look right. Paste it again.');
    }
} else {
    $apiKey = '';   // the free engines' keys are read from the config at call time
}
$stackRaw = is_array($in['moves'] ?? null) ? array_slice($in['moves'], 0, 5) : [];   // only for move "stack"
unset($in);   // the request body (with any visitor key) is not kept around

$promptsPath = $cfg['prompts'] ?: dirname($cfgPath) . '/prompts.json';
$P = json_decode((string)@file_get_contents($promptsPath), true);
if (!is_array($P) || empty($P['moves'])) fail(500, 'config', 'The moves are missing on the server.');
if ($moveId === 'stack') {
    // Two or three moves done together in every result: each move's method, then the stacking rules.
    $max = (int)($P['stack']['max'] ?? 3);
    $ids = array_values(array_unique(array_filter($stackRaw, 'is_string')));
    if (count($ids) < 2 || count($ids) > $max) fail(400, 'move', "Pick two or three moves to stack.");
    $parts = [];
    foreach ($ids as $i => $id) {
        $m = $P['moves'][$id] ?? null;
        if (!is_array($m) || empty($m['method'])) fail(400, 'move', 'One of those moves cannot be stacked.');
        $parts[] = '### Move ' . ($i + 1) . "\n" . $m['method'];
    }
    $move = ['system' => (string)$P['stack']['intro'] . "\n\n" . implode("\n\n", $parts) . (string)$P['stack']['rules'],
             'length_rule' => true, 'count' => 3];
} else {
    $move = $P['moves'][$moveId] ?? null;
    if (!is_array($move)) fail(400, 'move', 'Unknown move.');
}

function clean_text(string $t): ?string {
    if (!preg_match('//u', $t)) return null;
    $t = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $t);
    return trim(preg_replace('/\s+/u', ' ', $t));
}
function text_len(string $t): int {
    return function_exists('mb_strlen') ? mb_strlen($t, 'UTF-8') : (int)preg_match_all('/./us', $t);
}
$concept = clean_text($concept);
if ($concept === null) fail(400, 'input', 'The concept has characters that could not be read.');
if (text_len($concept) < 1) fail(400, 'input', 'Type a concept first.');
if (text_len($concept) > 500) fail(400, 'input', 'Keep the concept under 500 characters.');
if (!empty($move['field'])) {
    $field = clean_text($field);
    $fmax = (int)($move['field']['max'] ?? 100);
    $flabel = strtolower((string)($move['field']['label'] ?? 'second box'));
    if ($field === null || text_len($field) < 1) fail(400, 'input', "Fill in the $flabel box first.");
    if (text_len($field) > $fmax) fail(400, 'input', "Keep the $flabel under $fmax characters.");
} else {
    $field = '';
}

// ── limits ─────────────────────────────────────────────────────────────────
$dir = rtrim($cfg['data_dir'], '/\\');
if (!is_dir($dir) && !@mkdir($dir, 0700, true)) fail(500, 'config', 'The site cannot store its counters.');

/** Run $fn on a JSON file's contents under an exclusive lock and save what it returns. */
function with_locked_json(string $path, callable $fn) {
    $fh = fopen($path, 'c+');
    if (!$fh) return null;
    flock($fh, LOCK_EX);
    $data = json_decode((string)stream_get_contents($fh), true);
    if (!is_array($data)) $data = [];
    [$data, $result] = $fn($data);
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($data));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return $result;
}

$now = time();
$who = substr(hash('sha256', $cfg['salt'] . '|' . ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0')), 0, 24);
$limit = (int)($own ? $cfg['own_per_ip_hour'] : $cfg['per_ip_hour']);
$ipOk = with_locked_json($dir . ($own ? '/visitors_own.json' : '/visitors.json'), function (array $d) use ($who, $now, $limit) {
    foreach ($d as $k => $times) {
        $d[$k] = array_values(array_filter((array)$times, fn($t) => $t > $now - 3600));
        if (!$d[$k]) unset($d[$k]);
    }
    $mine = $d[$who] ?? [];
    if (count($mine) >= $limit) return [$d, false];
    $mine[] = $now;
    $d[$who] = $mine;
    return [$d, true];
});
if ($ipOk === false) {
    fail(429, 'rate', $own ? 'That is a lot of presses this hour. Take a short break and try again.'
                          : 'You have used this hour\'s free presses. Come back in an hour, or use your own key.');
}

// ── the prompt ─────────────────────────────────────────────────────────────
// The result mode picks the move's prompt (the two utilities differ by mode) and the result-type clause.
$modes = is_array($P['modes'] ?? null) ? $P['modes'] : [];
$mode = isset($modes[$mode]) ? $mode : (string)array_key_first($modes);
$moveSystem = is_array($move['system']) ? (string)($move['system'][$mode] ?? reset($move['system'])) : (string)$move['system'];
// A mode is {clause, length_rule}; an older prompts file has the clause as a plain string.
$modeDef = $modes[$mode] ?? '';
$clause = is_array($modeDef) ? (string)($modeDef['clause'] ?? '') : (string)$modeDef;
$lengthRule = is_array($modeDef) && isset($modeDef['length_rule']) ? (string)$modeDef['length_rule'] : (string)($P['length_rule'] ?? '');
if ($words > 0) {
    // The visitor's length slider wins over every other length rule, including a move's own.
    $words = max(5, min(80, $words));
    $low = max(3, (int)round($words * 0.6));
    $lengthRule = "\n\nLENGTH (overrides any other length rule above): each result is $low to $words words, "
                . "not counting any leading [tag]." . ($words > 25 ? ' Use two or three sentences if it needs them.' : ' One sentence.');
    $useLength = true;
} else {
    $useLength = (bool)($move['length_rule'] ?? true);
}
$system = $moveSystem . $clause . (string)($P['guard'] ?? '') . ($useLength ? $lengthRule : '');
$user = str_replace(['{concept}', '{field}'], [$concept, $field], $move['user_template'] ?? $P['user_template']);
$count = max(1, min(8, (int)($move['count'] ?? 3)));
$wantsObject = empty($move['array']);

// ── calling an engine ──────────────────────────────────────────────────────
function build_request(string $provider, string $model, string $apiKey, string $system, string $user, bool $wantsObject): array {
    switch ($provider) {
        case 'gemini':
            return ['https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent',
                ['Content-Type: application/json', 'x-goog-api-key: ' . $apiKey],
                ['systemInstruction' => ['parts' => [['text' => $system]]],
                 'contents' => [['role' => 'user', 'parts' => [['text' => $user]]]],
                 'generationConfig' => ['temperature' => 0.9, 'responseMimeType' => 'application/json', 'maxOutputTokens' => 4000]]];
        case 'claude':
            return ['https://api.anthropic.com/v1/messages',
                ['Content-Type: application/json', 'x-api-key: ' . $apiKey, 'anthropic-version: 2023-06-01'],
                ['model' => $model, 'max_tokens' => 1600, 'system' => $system, 'messages' => [['role' => 'user', 'content' => $user]]]];
        default:   // groq, openai: the same chat format
            $payload = ['model' => $model, 'max_completion_tokens' => 4000,
                        'messages' => [['role' => 'system', 'content' => $system], ['role' => 'user', 'content' => $user]]];
            if ($provider === 'groq') $payload += ['temperature' => 0.9, 'reasoning_effort' => 'medium', 'include_reasoning' => false];
            else $payload['reasoning_effort'] = 'low';
            if ($wantsObject) $payload['response_format'] = ['type' => 'json_object'];
            return [$provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions',
                ['Content-Type: application/json', 'Authorization: Bearer ' . $apiKey], $payload];
    }
}

function http_post(string $url, array $headers, string $body): array {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 90, CURLOPT_CONNECTTIMEOUT => 10,
        ]);
        $out = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return [$out === false ? 0 : $code, $out === false ? '' : (string)$out];
    }
    $ctx = stream_context_create(['http' => [
        'method' => 'POST', 'header' => implode("\r\n", $headers), 'content' => $body,
        'timeout' => 90, 'ignore_errors' => true,
    ]]);
    $out = @file_get_contents($url, false, $ctx);
    $code = 0;
    if (isset($http_response_header[0]) && preg_match('#\s(\d{3})\s#', $http_response_header[0], $mm)) $code = (int)$mm[1];
    return [$code, $out === false ? '' : (string)$out];
}

/** One engine call; overloaded answers are retried up to three times. Returns [status, decoded reply]. */
function call_engine(string $provider, string $model, string $apiKey, string $system, string $user, bool $wantsObject): array {
    [$url, $headers, $payload] = build_request($provider, $model, $apiKey, $system, $user, $wantsObject);
    $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
    for ($try = 1; $try <= 3; $try++) {
        [$status, $resp] = http_post($url, $headers, $body);
        if (!in_array($status, [0, 500, 502, 503, 504, 529], true)) break;
        if ($try < 3) usleep(1500000 * $try);
    }
    $decoded = json_decode($resp, true);
    return [$status, is_array($decoded) ? $decoded : []];
}

/** The provider's status words, plus Google's quota name when it gives one ("429 RESOURCE_EXHAUSTED ...PerDay...=20"). */
function status_words(int $status, array $out): string {
    $e = is_array($out['error'] ?? null) ? $out['error'] : [];
    $why = trim($status . ' ' . (string)($e['status'] ?? $e['type'] ?? $e['code'] ?? ''));
    foreach ((array)($e['details'] ?? []) as $d) {
        foreach ((array)($d['violations'] ?? []) as $v) {
            if (!empty($v['quotaId'])) $why .= ' ' . $v['quotaId'] . (isset($v['quotaValue']) ? '=' . $v['quotaValue'] : '');
        }
    }
    return $why;
}

// ── the free engines' daily budget ─────────────────────────────────────────
// Today's count per engine (Pacific time, when Google and Groq reset their free days). The cap is the
// config's, but never above what the free tier really allows: Gemini 3.8 Flash gives only 20 a day.
$day = (new DateTime('now', new DateTimeZone('America/Los_Angeles')))->format('Y-m-d');
$freeLimits = ($cfg['free_limits'] ?? []) + ['gemini-3.8-flash' => 18];
function daily_cap(array $cfg, array $freeLimits, string $p): int {
    $cap = (int)($cfg['daily_cap'][$p] ?? 0);
    $model = (string)($cfg['models'][$p] ?? '');
    return isset($freeLimits[$model]) ? min($cap, (int)$freeLimits[$model]) : $cap;
}
/** Count one press against an engine's day; false when the day is used up (or the engine said so). */
function take_daily(string $dir, string $day, string $p, int $cap): bool {
    return (bool)with_locked_json($dir . '/daily.json', function (array $d) use ($day, $p, $cap) {
        if (($d['day'] ?? '') !== $day) $d = ['day' => $day];
        $n = (int)($d[$p] ?? 0);
        if (!empty($d[$p . '_out']) || $n >= $cap) return [$d, false];
        $d[$p] = $n + 1;
        return [$d, true];
    });
}
function mark_out(string $dir, string $day, string $p): void {
    with_locked_json($dir . '/daily.json', function (array $d) use ($day, $p) {
        if (($d['day'] ?? '') !== $day) $d = ['day' => $day];
        $d[$p . '_out'] = true;
        return [$d, null];
    });
}

// ── the call ───────────────────────────────────────────────────────────────
$note = '';
if ($own) {
    [$status, $out] = call_engine($provider, $cfg['models'][$provider], $apiKey, $system, $user, $wantsObject);
    unset($apiKey);
} else {
    // Gemini Flash first; once its free day is used up, or it is overloaded, Groq answers instead.
    $order = $provider === 'gemini' ? ['gemini', 'groq'] : ['groq'];
    $answered = false;
    $tried = 0;
    $status = 0;
    $out = [];
    foreach ($order as $p) {
        $key = (string)($cfg[$p . '_key'] ?? '');
        if ($key === '' || !take_daily($dir, $day, $p, daily_cap($cfg, $freeLimits, $p))) continue;
        $tried++;
        [$status, $out] = call_engine($p, $cfg['models'][$p], $key, $system, $user, $wantsObject);
        $provider = $p;
        if ($p === 'gemini' && ($status === 429 || $status === 503 || $status === 529)) {
            $why = status_words($status, $out);
            error_log("ct relay: gemini $why");
            if ($status === 429 && stripos($why, 'PerDay') !== false) mark_out($dir, $day, 'gemini');
            continue;
        }
        $answered = true;
        break;
    }
    if ($provider === 'groq' && $order[0] === 'gemini') {
        $note = 'Gemini Flash is out of free presses for today, so Groq answered.';
    }
    if (!$answered) {
        if ($tried === 0) {
            fail(429, 'allowance', 'Today\'s shared free presses are used up. Come back tomorrow, or use your own key.');
        }
        reply(503, ['error' => 'busy', 'detail' => status_words($status, $out),
            'message' => 'The free engines are busy right now. Wait a minute and press again, or use your own key.']);
    }
}

$label = $labels[$provider];
$errMsg = (string)($out['error']['message'] ?? '');
if ($own) {
    if ($status === 401 || $status === 403 || ($status === 400 && preg_match('/api[ _-]?key/i', $errMsg))) {
        fail(401, 'key', "$label refused the key. Check it and paste it again.");
    }
    if ($status === 429) fail(429, 'key_limit', "$label says this key is over its limit right now. Wait a minute and try again.");
    if ($status === 503 || $status === 529) fail(503, 'busy', "$label is busy right now. Wait a minute and press again.");
} elseif ($status === 429 || $status === 503) {
    reply(503, ['error' => 'busy', 'detail' => status_words($status, $out),
        'message' => 'The free engine is busy right now. Wait a minute and press again, or use your own key.']);
}
if ($status < 200 || $status >= 300) {
    // Only the provider's status words go back (e.g. "404 NOT_FOUND"), never its full reply.
    $why = status_words($status, $out);
    if (!$own) error_log("ct relay: $provider HTTP $why");
    reply(502, ['error' => 'upstream', 'detail' => $why,
        'message' => $own ? "$label returned an error ($why). Press the move again."
                          : 'The free engine had a problem. Press the move again, or try the other engine.']);
}

if ($provider === 'gemini') {
    $raw = '';
    foreach (($out['candidates'][0]['content']['parts'] ?? []) as $part) $raw .= $part['text'] ?? '';
} elseif ($provider === 'claude') {
    $raw = '';
    foreach (($out['content'] ?? []) as $part) if (($part['type'] ?? '') === 'text') $raw .= $part['text'] ?? '';
} else {
    $raw = (string)($out['choices'][0]['message']['content'] ?? '');
}

// Accept {"variants": [...]}, a bare list, or any object holding one list.
$raw = trim(preg_replace('/^```(?:json)?\s*|```\s*$/i', '', trim($raw)));
$parsed = json_decode($raw, true);
if (!is_array($parsed)) {
    $a = strpos($raw, '{'); $b = strrpos($raw, '}');
    if ($a !== false && $b !== false && $b > $a) $parsed = json_decode(substr($raw, $a, $b - $a + 1), true);
}
if (!is_array($parsed)) {
    $a = strpos($raw, '['); $b = strrpos($raw, ']');
    if ($a !== false && $b !== false && $b > $a) $parsed = json_decode(substr($raw, $a, $b - $a + 1), true);
}
$list = [];
if (is_array($parsed)) {
    if (array_is_list($parsed)) $list = $parsed;
    elseif (isset($parsed['variants']) && is_array($parsed['variants'])) $list = $parsed['variants'];
    else foreach ($parsed as $v) { if (is_array($v) && array_is_list($v)) { $list = $v; break; } }
}
$variants = [];
foreach ($list as $v) {
    if (is_string($v) && trim($v) !== '') $variants[] = trim($v);
    if (count($variants) === $count) break;
}
if (!$variants) fail(502, 'upstream', ($own ? $label : 'The free engine') . ' answered, but not with rewrites. Press the move again.');

reply(200, ['variants' => $variants, 'engine' => $own ? $engine : $provider] + ($note !== '' ? ['note' => $note] : []));
