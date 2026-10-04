# MY NAGHI Content Hub

public/index.html                  the website
netlify/functions/generate.mjs     the AI helper (keeps your API key secret)
netlify.toml                       tells Netlify where things are

Set these in Netlify > Site configuration > Environment variables:
- ANTHROPIC_API_KEY  (required)
- TEAM_PASSCODE      (recommended)
- CLAUDE_MODEL       (optional)

Without an API key the site still works using built-in templates.
