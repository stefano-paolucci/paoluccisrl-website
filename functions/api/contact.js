const DEFAULT_FORMSUBMIT_ENDPOINT =
  "https://formsubmit.co/ajax/info@paoluccisrl.com";

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

function validatePayload(payload) {
  const errors = [];

  if (!payload.firstName) errors.push("Name is required.");
  else if (payload.firstName.length < 2 || payload.firstName.length > 50)
    errors.push("Name length must be between 2 and 50 characters.");
  else if (!isName(payload.firstName)) errors.push("Name contains invalid characters.");

  if (!payload.lastName) errors.push("Surname is required.");
  else if (payload.lastName.length < 2 || payload.lastName.length > 50)
    errors.push("Surname length must be between 2 and 50 characters.");
  else if (!isName(payload.lastName))
    errors.push("Surname contains invalid characters.");

  if (!payload.email) errors.push("Email is required.");
  else if (!isEmail(payload.email)) errors.push("Email is invalid.");

  if (!payload.phone) errors.push("Phone is required.");
  else if (payload.phone.length < 8 || payload.phone.length > 20)
    errors.push("Phone length is invalid.");
  else if (!isPhone(payload.phone))
    errors.push("Phone format is invalid.");

  if (!payload.message) errors.push("Message is required.");
  else if (payload.message.length < 10 || payload.message.length > 1000)
    errors.push("Message length must be between 10 and 1000 characters.");
  else if (hasDangerousMessageChars(payload.message))
    errors.push("Message contains forbidden characters.");

  if (!payload.privacy) errors.push("Privacy consent is required.");

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

async function submitToFormSubmit(endpoint, payload, subject) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      _subject: subject,
      _template: "table",
      _captcha: "false",
      _replyto: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      phone: payload.phone,
      company: payload.company || "Private customer",
      message: payload.message,
      privacyAccepted: payload.privacy ? "yes" : "no",
      source: "Website contact form",
    }),
  });

  if (!response.ok) {
    throw new Error(`FormSubmit request failed with status ${response.status}`);
  }

  let result = null;
  try {
    result = await response.json();
  } catch (error) {
    result = null;
  }

  if (result && result.success !== "true" && result.success !== true) {
    throw new Error(result.message || "FormSubmit rejected the request.");
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body = null;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: "Invalid JSON payload." }, 400);
  }

  const payload = {
    firstName: normalize(body?.firstName),
    lastName: normalize(body?.lastName),
    email: normalize(body?.email),
    phone: normalize(body?.phone),
    company: normalize(body?.company) || "Private customer",
    message: normalize(body?.message),
    privacy: Boolean(body?.privacy),
    honeypot: normalize(body?.honeypot),
    turnstileToken: normalize(body?.turnstileToken),
  };

  // Honeypot: return success to silently drop bot submissions.
  if (payload.honeypot) {
    return json({ ok: true }, 200);
  }

  const validationErrors = validatePayload(payload);
  if (validationErrors.length > 0) {
    return json({ error: validationErrors[0] }, 400);
  }

  const turnstileSecret = normalize(env.TURNSTILE_SECRET_KEY);
  if (!turnstileSecret) {
    return json(
      { error: "Server misconfiguration: TURNSTILE_SECRET_KEY is missing." },
      500,
    );
  }

  if (!payload.turnstileToken) {
    return json({ error: "Missing anti-spam token." }, 400);
  }

  try {
    const verifyResult = await verifyTurnstile(
      turnstileSecret,
      payload.turnstileToken,
      request.headers.get("CF-Connecting-IP") || "",
    );

    if (!verifyResult?.success) {
      return json({ error: "Anti-spam verification failed." }, 400);
    }
  } catch (error) {
    console.error("Turnstile verification error:", error);
    return json({ error: "Unable to verify anti-spam check." }, 502);
  }

  const endpoint =
    normalize(env.FORMSUBMIT_ENDPOINT) || DEFAULT_FORMSUBMIT_ENDPOINT;
  const subject =
    normalize(env.FORMSUBMIT_SUBJECT) || "New request from Paolucci SRL website";

  try {
    await submitToFormSubmit(endpoint, payload, subject);
    return json({ ok: true }, 200);
  } catch (error) {
    console.error("Form submission error:", error);
    return json({ error: "Message delivery failed. Please try again." }, 502);
  }
}

