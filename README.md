# Paolucci SRL Website

Sito Astro con form contatti protetto da Cloudflare Turnstile e invio email via Resend.

## Contact form

### Flusso

1. L'utente compila il form in:
   - `src/pages/contact/components/ContactSection.astro` (IT)
   - `src/pages/en/contact/components/ContactSection.astro` (EN)
2. Il client raccoglie i campi e invia una `POST` JSON a `/api/contact`.
3. L'endpoint server (`functions/api/contact.js`) valida il payload e verifica il token Turnstile.
4. Se tutto è valido, il server invia l'email tramite Resend (`https://api.resend.com/emails`).
5. `reply_to` viene impostato con l'email inserita nel form, quindi il tasto "Rispondi" va al contatto del cliente.

### Sicurezza inclusa

- Cloudflare Turnstile lato client + verifica server-side su `siteverify`.
- Honeypot (`website`): se valorizzato la richiesta viene scartata silenziosamente.
- Validazioni server-side su tutti i campi richiesti:
  - lunghezze min/max
  - regex per nome/email/telefono
  - consenso privacy obbligatorio
- Filtro caratteri pericolosi nel messaggio (`<`, `>`, `{`, `}`, `[`, `]`, backtick, `\`).
- Escape HTML del contenuto prima di comporre la mail, per evitare injection nel template email.
- Risposte API con `Cache-Control: no-store`.

### Variabili ambiente richieste

- `TURNSTILE_SECRET_KEY`
- `PUBLIC_TURNSTILE_SITE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` (o `RESEND_FROM`)
- `RESEND_TO_EMAIL` (opzionale, default: `info@paoluccisrl.com`)
- `RESEND_SUBJECT` (opzionale)

### Note operative

- `RESEND_FROM_EMAIL` deve essere un mittente valido su dominio verificato in Resend.
- Le variabili vanno impostate sia in `.env` (locale) sia in Cloudflare Pages (Production/Preview).
