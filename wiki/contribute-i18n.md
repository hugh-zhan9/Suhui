# Contributing to Internationalization (i18n)

We welcome contributions to our internationalization efforts! This guide will help you get started with adding or updating translations for our project.

## Pay Attention

If it's a new language, please check existing i18n issues in your active repository first. If none exist, open a new issue to avoid duplicate work.

## Adding a New Language

To add support for a new language:

1. Create locale files under `locales/` by copying from `locales/app/en.json` and other corresponding namespaces.
2. Keep key structure exactly the same as English.
3. Add translated values only; do not rename keys.

## Updating Existing Translations

To update or improve existing translations:

1. Navigate to the `locales/` directory.
2. Find the JSON files for the language you want to update.
3. Edit the translations as needed.

## Translation Guidelines

- Maintain the same structure and keys as the original English version.
- Ensure translations are culturally appropriate and context-aware.
- Use gender-neutral language where possible.
- Keep special placeholders (e.g., `{{variable}}`) intact.

## Testing Your Translations

After making changes:

1. Run locale dedupe/format:

   ```bash
   pnpm run dedupe:locales
   ```

2. Run the app locally and switch to the edited language for UI verification.

## Submitting Your Contribution

1. Create a new branch for your changes.
2. Commit your changes with a clear, descriptive message.
3. Open a pull request with details about the languages and sections you've updated.

Thank you for helping make our project more accessible to users worldwide!
