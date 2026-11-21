# Your first scenario

redfish ships with no scenarios. You write your own in the app, or import one from a JSON file. Creating and importing scenarios needs a `superadmin` account (see `SEED_ROLE` in [configuration](configuration.md)). A scenario is global: every organization can use it.

Only run campaigns you are authorized to run, against people who are in scope.

## Zero credential capture

This rule is not optional. The simulated login page never records what a target types. In practice:

- the form posts to `{{submitUrl}}`, an endpoint that reads nothing;
- no `input`, `select` or `textarea` has a `name` attribute, so nothing can be submitted;
- the page sends only a display beacon with `navigator.sendBeacon('{{beaconUrl}}')`, never input;
- reverse proxies must not log request bodies (see [CSP and host isolation](csp-hosts.md)).

The importer enforces the first three and refuses a scenario that breaks them.

## Create it in the editor

1. Open **Scenarios**, then **Create a scenario**.
2. Fill in the details: a key (lowercase letters, digits and dashes, for example `my-scenario`), a title, a category (other, credential harvest, payment fraud), a language, a difficulty, an optional sender name and the email subject.
3. Edit the three templates. They start from a neutral working skeleton, so you can save first and refine later.
   - **Email (MJML)**: must compile. Keep a button with `href="{{clickUrl}}"` and the open pixel `{{openUrl}}`.
   - **Landing page (HTML)**: the page a target sees after clicking. Keep the form and beacon described above.
   - **Awareness page (HTML)**: the debrief. It must contain `{{awarenessMessage}}`.
4. Save. If a rule is broken, the editor shows what to fix. On success you land on the scenario page.

## Placeholders

Write them as `{{name}}`. An unknown name becomes an empty string.

| Placeholder            | Email | Subject | Landing | Awareness | Notes                                                        |
| ---------------------- | ----- | ------- | ------- | --------- | ------------------------------------------------------------ |
| `{{firstName}}`        | yes   | yes     | yes     | yes       | Escaped as HTML in the templates, plain text in the subject. |
| `{{lastName}}`         | no    | yes     | no      | no        |                                                              |
| `{{email}}`            | no    | yes     | no      | no        |                                                              |
| `{{clickUrl}}`         | yes   | no      | no      | no        | Tracked link to the landing page.                            |
| `{{openUrl}}`          | yes   | no      | no      | no        | Tracked open pixel.                                          |
| `{{submitUrl}}`        | no    | no      | yes     | no        | Form action. Reads nothing.                                  |
| `{{beaconUrl}}`        | no    | no      | yes     | yes       | Display beacon.                                              |
| `{{awarenessMessage}}` | no    | no      | yes     | yes       | The debrief text, escaped. Required in the awareness page.   |

## Export and import a bundle

A bundle is one self-contained JSON file. Use it to back up a scenario, move it to another instance, or share it.

- **Export**: open the scenario and click **Export**. You get a JSON file.
- **Import**: on **Scenarios**, choose **Import a scenario** and pick the file. The same checks as the editor run: required fields, key format, a key not already used by a built-in scenario, the zero-capture rules, `{{awarenessMessage}}`, and MJML that compiles. Importing a key you imported before updates it.

Shape of a bundle:

```json
{
	"schemaVersion": 1,
	"key": "my-scenario",
	"title": "My scenario",
	"category": "other",
	"locale": "en",
	"difficulty": "easy",
	"tags": [],
	"subject": "Hello {{firstName}}",
	"fromName": null,
	"email": "<mjml>...</mjml>",
	"landing": "<!doctype html>...",
	"awareness": "<!doctype html>...{{awarenessMessage}}..."
}
```

`schemaVersion` must be `1`. `tags` and `fromName` are optional.
