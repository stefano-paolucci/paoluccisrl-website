const DEFAULT_RESEND_TO = "info@paoluccisrl.com";

const MESSAGES = {
  it: {
    errors: {
      invalidJsonPayload: "Payload JSON non valido.",
      nameRequired: "Nome obbligatorio.",
      nameLength: "La lunghezza del nome deve essere tra 2 e 50 caratteri.",
      nameInvalidChars: "Il nome contiene caratteri non validi.",
      surnameRequired: "Cognome obbligatorio.",
      surnameLength: "La lunghezza del cognome deve essere tra 2 e 50 caratteri.",
      surnameInvalidChars: "Il cognome contiene caratteri non validi.",
      emailRequired: "Email obbligatoria.",
      emailInvalid: "Email non valida.",
      phoneRequired: "Telefono obbligatorio.",
      phoneLength: "La lunghezza del telefono non è valida.",
      phoneInvalid: "Il formato del telefono non è valido.",
      messageRequired: "Messaggio obbligatorio.",
      messageLength: "Il messaggio deve essere tra 10 e 1000 caratteri.",
      messageForbiddenChars: "Il messaggio contiene caratteri non consentiti.",
      privacyRequired: "Il consenso privacy è obbligatorio.",
      turnstileSecretMissing:
        "Configurazione server errata: TURNSTILE_SECRET_KEY mancante.",
      antiSpamTokenMissing: "Token anti-spam mancante.",
      antiSpamVerificationFailed: "Verifica anti-spam non superata.",
      antiSpamUnavailable: "Impossibile verificare il controllo anti-spam.",
      resendApiKeyMissing:
        "Configurazione server errata: RESEND_API_KEY mancante.",
      resendFromMissing:
        "Configurazione server errata: RESEND_FROM_EMAIL (o RESEND_FROM) mancante.",
      resendRequestFailed: (status) =>
        `Richiesta Resend fallita con stato ${status}.`,
      messageDeliveryFailed: "Invio non riuscito. Riprova tra poco.",
    },
    email: {
      defaultSubject: "Nuova richiesta dal sito Paolucci SRL",
      heading: "Nuova richiesta di contatto dal sito",
      firstName: "Nome",
      lastName: "Cognome",
      email: "Email",
      phone: "Telefono",
      company: "Azienda",
      privacy: "Privacy",
      message: "Messaggio",
      privacyYes: "sì",
      privacyNo: "no",
      companyFallback: "Privato",
    },
  },
  en: {
    errors: {
      invalidJsonPayload: "Invalid JSON payload.",
      nameRequired: "Name is required.",
      nameLength: "Name length must be between 2 and 50 characters.",
      nameInvalidChars: "Name contains invalid characters.",
      surnameRequired: "Surname is required.",
      surnameLength: "Surname length must be between 2 and 50 characters.",
      surnameInvalidChars: "Surname contains invalid characters.",
      emailRequired: "Email is required.",
      emailInvalid: "Email is invalid.",
      phoneRequired: "Phone is required.",
      phoneLength: "Phone length is invalid.",
      phoneInvalid: "Phone format is invalid.",
      messageRequired: "Message is required.",
      messageLength: "Message length must be between 10 and 1000 characters",
      messageForbiddenChars: "Message contains forbidden characters.",
      privacyRequired: "Privacy consent is required.",
      turnstileSecretMissing:
        "Server misconfiguration: TURNSTILE_SECRET_KEY is missing.",
      antiSpamTokenMissing: "Missing anti-spam token.",
      antiSpamVerificationFailed: "Anti-spam verification failed.",
      antiSpamUnavailable: "Unable to verify anti-spam check.",
      resendApiKeyMissing: "Server misconfiguration: RESEND_API_KEY is missing.",
      resendFromMissing:
        "Server misconfiguration: RESEND_FROM_EMAIL (or RESEND_FROM) is missing.",
      resendRequestFailed: (status) =>
        `Resend request failed with status ${status}.`,
      messageDeliveryFailed: "Message delivery failed. Please try again.",
    },
    email: {
      defaultSubject: "New request from Paolucci SRL website",
      heading: "New contact request",
      firstName: "First name",
      lastName: "Last name",
      email: "Email",
      phone: "Phone",
      company: "Company",
      privacy: "Privacy",
      message: "Message",
      privacyYes: "yes",
      privacyNo: "no",
      companyFallback: "Private customer",
    },
  },
};
const SUPPORTED_LANGS = new Set(["it", "en"]);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

const normalize = (value) => String(value ?? "").trim();
const isName = (value) => /^[a-zA-ZÀ-ÿ\s'-]+$/.test(value);
const isEmail = (value) =>
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
const isPhone = (value) => /^\+?[0-9\s-]+$/.test(value);
const hasDangerousMessageChars = (value) => /[<>{}[\]`\\]/.test(value);
const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function detectLang(request, body) {
  const fromBody = normalize(body?.lang).toLowerCase();
  if (SUPPORTED_LANGS.has(fromBody)) return fromBody;

  const referer = normalize(request.headers.get("Referer"));
  if (referer) {
    try {
      const { pathname } = new URL(referer);
      if (pathname === "/en" || pathname.startsWith("/en/")) return "en";
      if (pathname === "/it" || pathname.startsWith("/it/")) return "it";
    } catch (error) {}
  }

  const acceptLanguage = normalize(request.headers.get("Accept-Language")).toLowerCase();
  if (acceptLanguage.startsWith("en") || acceptLanguage.includes(",en")) {
    return "en";
  }

  return "it";
}

function getText(request, body = null) {
  const lang = detectLang(request, body);
  return MESSAGES[lang] || MESSAGES.it;
}

function validatePayload(payload, text) {
  const errors = [];
  const { errors: messages } = text;

  if (!payload.firstName) errors.push(messages.nameRequired);
  else if (payload.firstName.length < 2 || payload.firstName.length > 50)
    errors.push(messages.nameLength);
  else if (!isName(payload.firstName)) errors.push(messages.nameInvalidChars);

  if (!payload.lastName) errors.push(messages.surnameRequired);
  else if (payload.lastName.length < 2 || payload.lastName.length > 50)
    errors.push(messages.surnameLength);
  else if (!isName(payload.lastName))
    errors.push(messages.surnameInvalidChars);

  if (!payload.email) errors.push(messages.emailRequired);
  else if (!isEmail(payload.email)) errors.push(messages.emailInvalid);

  if (!payload.phone) errors.push(messages.phoneRequired);
  else if (payload.phone.length < 8 || payload.phone.length > 20)
    errors.push(messages.phoneLength);
  else if (!isPhone(payload.phone))
    errors.push(messages.phoneInvalid);

  if (!payload.message) errors.push(messages.messageRequired);
  else if (payload.message.length < 10 || payload.message.length > 1000)
    errors.push(messages.messageLength);
  else if (hasDangerousMessageChars(payload.message))
    errors.push(messages.messageForbiddenChars);

  if (!payload.privacy) errors.push(messages.privacyRequired);

  return errors;
}

async function verifyTurnstile(secretKey, token, remoteIp) {
  const body = new URLSearchParams();
  body.set("secret", secretKey);
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
  );

  if (!response.ok) {
    throw new Error(`Turnstile verification failed with status ${response.status}`);
  }

  return await response.json();
}

async function submitToResend({
  apiKey,
  from,
  to,
  subject,
  payload,
  text,
}) {
  const messageHtml = escapeHtml(payload.message).replaceAll("\n", "<br/>");
  const company = payload.company || text.email.companyFallback;
  const privacy = payload.privacy
    ? text.email.privacyYes
    : text.email.privacyNo;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      reply_to: payload.email,
      html: `
        <h2>${escapeHtml(text.email.heading)}</h2>
        <p><strong>${escapeHtml(text.email.firstName)}:</strong> ${escapeHtml(payload.firstName)}</p>
        <p><strong>${escapeHtml(text.email.lastName)}:</strong> ${escapeHtml(payload.lastName)}</p>
        <p><strong>${escapeHtml(text.email.email)}:</strong> ${escapeHtml(payload.email)}</p>
        <p><strong>${escapeHtml(text.email.phone)}:</strong> ${escapeHtml(payload.phone)}</p>
        <p><strong>${escapeHtml(text.email.company)}:</strong> ${escapeHtml(company)}</p>
        <p><strong>${escapeHtml(text.email.privacy)}:</strong> ${escapeHtml(privacy)}</p>
        <p><strong>${escapeHtml(text.email.message)}:</strong><br/>${messageHtml}</p>
      `,
    }),
  });

  let result = null;
  try {
    result = await response.json();
  } catch (error) {
    result = null;
  }

  if (!response.ok) {
    const errorFromArray = Array.isArray(result?.errors)
      ? result.errors.map((item) => item?.message).filter(Boolean).join(", ")
      : "";
    throw new Error(
      result?.message ||
        result?.error ||
        errorFromArray ||
        text.errors.resendRequestFailed(response.status),
    );
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const fallbackText = getText(request);

  let body = null;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: fallbackText.errors.invalidJsonPayload }, 400);
  }
  const text = getText(request, body);

  const payload = {
    firstName: normalize(body?.firstName),
    lastName: normalize(body?.lastName),
    email: normalize(body?.email),
    phone: normalize(body?.phone),
    company: normalize(body?.company),
    message: normalize(body?.message),
    privacy: Boolean(body?.privacy),
    honeypot: normalize(body?.honeypot),
    turnstileToken: normalize(body?.turnstileToken),
  };

  // Honeypot: return success to silently drop bot submissions.
  if (payload.honeypot) {
    return json({ ok: true }, 200);
  }

  const validationErrors = validatePayload(payload, text);
  if (validationErrors.length > 0) {
    return json({ error: validationErrors[0] }, 400);
  }

  const turnstileSecret = normalize(env.TURNSTILE_SECRET_KEY);
  if (!turnstileSecret) {
    return json({ error: text.errors.turnstileSecretMissing }, 500);
  }

  if (!payload.turnstileToken) {
    return json({ error: text.errors.antiSpamTokenMissing }, 400);
  }

  try {
    const verifyResult = await verifyTurnstile(
      turnstileSecret,
      payload.turnstileToken,
      request.headers.get("CF-Connecting-IP") || "",
    );

    if (!verifyResult?.success) {
      return json({ error: text.errors.antiSpamVerificationFailed }, 400);
    }
  } catch (error) {
    console.error("Turnstile verification error:", error);
    return json({ error: text.errors.antiSpamUnavailable }, 502);
  }

  const resendApiKey = normalize(env.RESEND_API_KEY);
  const resendFrom =
    normalize(env.RESEND_FROM_EMAIL) || normalize(env.RESEND_FROM);
  const resendTo =
    normalize(env.RESEND_TO_EMAIL) ||
    normalize(env.RESEND_TO) ||
    DEFAULT_RESEND_TO;
  const subject = normalize(env.RESEND_SUBJECT) || text.email.defaultSubject;

  if (!resendApiKey) {
    return json({ error: text.errors.resendApiKeyMissing }, 500);
  }

  if (!resendFrom) {
    return json({ error: text.errors.resendFromMissing }, 500);
  }

  try {
    await submitToResend({
      apiKey: resendApiKey,
      from: resendFrom,
      to: resendTo,
      subject,
      payload,
      text,
    });
    return json({ ok: true }, 200);
  } catch (error) {
    console.error("Form submission error:", error);
    const errorMessage =
      error instanceof Error && error.message
        ? error.message
        : text.errors.messageDeliveryFailed;
    return json({ error: errorMessage }, 502);
  }
}
