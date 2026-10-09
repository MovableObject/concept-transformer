<?php
// Local test config: keys come from the environment, never from this file.
return [
    'gemini_key' => getenv('GEMINI_API_KEY') ?: '',
    'groq_key' => getenv('GROQ_API_KEY') ?: '',
    'salt' => 'local-test',
    'per_ip_hour' => (int)(getenv('CT_PER_IP_HOUR') ?: 30),
    'daily_cap' => ['gemini' => (int)(getenv('CT_CAP_GEMINI') ?: 200), 'groq' => (int)(getenv('CT_CAP_GROQ') ?: 800)],
    'data_dir' => __DIR__ . '/data',
    'prompts' => __DIR__ . '/../../ct_private/prompts.json',
];
