const DEFAULT_RESEND_TO = "info@paoluccisrl.com";

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

async function submitToResend({
  apiKey,
  from,
  to,
  subject,
  payload,
}) {
  const messageHtml = escapeHtml(payload.message).replaceAll("\n", "<br/>");
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
        <h2>New contact request</h2>
        <p><strong>First name:</strong> ${escapeHtml(payload.firstName)}</p>
        <p><strong>Last name:</strong> ${escapeHtml(payload.lastName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(payload.email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(payload.phone)}</p>
        <p><strong>Company:</strong> ${escapeHtml(payload.company || "Private customer")}</p>
        <p><strong>Privacy accepted:</strong> ${payload.privacy ? "yes" : "no"}</p>
        <p><strong>Message:</strong><br/>${messageHtml}</p>
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
        `Resend request failed with status ${response.status}`,
    );
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

  const resendApiKey = normalize(env.RESEND_API_KEY);
  const resendFrom =
    normalize(env.RESEND_FROM_EMAIL) || normalize(env.RESEND_FROM);
  const resendTo =
    normalize(env.RESEND_TO_EMAIL) ||
    normalize(env.RESEND_TO) ||
    DEFAULT_RESEND_TO;
  const subject =
    normalize(env.RESEND_SUBJECT) || "New request from Paolucci SRL website";

  if (!resendApiKey) {
    return json(
      { error: "Server misconfiguration: RESEND_API_KEY is missing." },
      500,
    );
  }

  if (!resendFrom) {
    return json(
      {
        error:
          "Server misconfiguration: RESEND_FROM_EMAIL (or RESEND_FROM) is missing.",
      },
      500,
    );
  }

  try {
    await submitToResend({
      apiKey: resendApiKey,
      from: resendFrom,
      to: resendTo,
      subject,
      payload,
    });
    return json({ ok: true }, 200);
  } catch (error) {
    console.error("Form submission error:", error);
    const errorMessage =
      error instanceof Error && error.message
        ? error.message
        : "Message delivery failed. Please try again.";
    return json({ error: errorMessage }, 502);
  }
}
