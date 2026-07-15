# Chrome Web Store Submission Notes

Draft text and answers for the developer dashboard. Fill the `[bracketed]`
placeholders before submitting. Review is faster and more likely to pass when
every permission is justified and the privacy disclosures match the code.

## Before you submit — checklist

- [ ] Host `PRIVACY.md` at a public URL (e.g. GitHub Pages) and paste that URL
      into the store listing's **Privacy policy** field. **Mandatory** — a
      monitoring extension will be rejected without one.
- [ ] Set `DEFAULT_API_BASE` in `background.js` **and** `popup.js` to the
      production backend URL (HTTPS). Not `localhost`.
- [ ] Update `manifest.json`: real `name` and `description` (drop "Dev" /
      "logs to console"), bump `version`, add icons (16/48/128 px).
- [ ] Consider removing the unused `activeTab` permission (nothing uses it —
      fewer permissions means lighter review).
- [ ] Register a Chrome Web Store developer account ($5 one-time) if not done.

## Single-purpose description

> Proctor monitors a student's browser activity during an online exam they have
> joined, to support academic integrity. It detects tab switching, window focus
> loss, page navigation, and clipboard actions (copy/paste/cut) and reports them
> to the exam server operated by the student's institution. It does not log
> keystrokes or record what the student types.

## Permission justifications

| Permission | Justification to paste |
|---|---|
| `tabs` | Detect when the student switches browser tabs and record the destination URL — a primary signal that the student may have left the exam page. |
| `windows` | Detect when the browser window loses focus (student switching to another application), a key academic-integrity signal. |
| `storage` | Store the current exam session locally so monitoring continues across the MV3 service worker restarting. |
| `alarms` | Send a periodic heartbeat so the exam server knows the session is still active and can detect when the student's browser closes. |
| `host_permissions` (`<all_urls>`) | During an exam the student may navigate to any website; the extension must detect navigation and clipboard actions on whatever page is open to log potential violations. |

> **Reviewer-friendliness vs. coverage:** `<all_urls>` draws the most scrutiny.
> If you can constrain exams to specific platforms (e.g. Google Forms, Microsoft
> Forms), narrowing `host_permissions` and the content-script `matches` to those
> domains would ease review — at the cost of not detecting navigation to
> arbitrary sites. Decide before submitting.

## Privacy practices tab (data disclosures)

Declare the extension **collects** these, all for **App functionality** only:

- **Personally identifiable information** — name and optional student ID.
- **Web history** — URLs of tabs the student navigates to during an exam.
- **User activity** — tab switches, window focus changes, clipboard actions.

Certify (all true for this code):

- [x] Not being sold to third parties.
- [x] Not used or transferred for purposes unrelated to the single purpose.
- [x] Not used to determine creditworthiness or for lending.

Do **not** declare: authentication info, financial info, personal
communications, location, health, or "website content" — the extension collects
none of these (no keystrokes, no page content, no clipboard text).
