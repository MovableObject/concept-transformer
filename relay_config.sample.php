<?php
// Copy to a folder OUTSIDE the public web folder, e.g. <site>/ct_private/config.php (next to public_html),
// and fill in the keys. Never put this file in the public folder or in the project.
return [
    'gemini_key' => '',          // the owner's free Gemini key
    'groq_key' => '',            // the owner's free Groq key
    'salt' => 'pick-any-long-random-text',   // hashes visitor IPs; raw IPs are never stored
    'per_ip_hour' => 30,         // presses per visitor per hour
    'daily_cap' => ['gemini' => 200, 'groq' => 800],   // keep below each free tier's daily limit
    // 'data_dir' => __DIR__ . '/data',   // counters; defaults to a data folder beside this file
    // 'models' => ['gemini' => 'gemini-3.8-flash', 'groq' => 'openai/gpt-oss-120b'],
    // 'allowed_origins' => [],  // only if the page is served from a different site than the relay
];
