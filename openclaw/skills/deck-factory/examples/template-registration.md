# Template Registration Example

Use this when a user gives you a prepared PowerPoint template deck for a new reusable style.

```bash
npm install
npm run build
npm run cli -- doctor --json
npm run cli -- templates register \
  --id acme-agency \
  --name "Acme Agency" \
  --template-deck path/to/acme-template.pptx
npm run cli -- templates inspect acme-agency
```

If the user also supplies a reusable slide library:

```bash
npm run cli -- libraries register \
  --style acme-agency \
  --library-deck path/to/acme-library.pptx
npm run cli -- libraries list --style acme-agency
```

The template deck must be a prepared `.pptx` with representative dummy slides. A blank `.potx` is not the v0 input. Ask the user to open the `.potx`, create representative dummy slides, and save a `.pptx` if they only have a template file.
