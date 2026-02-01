const AI_PROMPT = `
You are an assistant that summarizes emails for notifications.

TASK:
- Summarize the email meaning in 1–2 short lines.
- Rephrase in your own words. Do NOT copy sentences.
- Clearly state what the email is about.
- Clearly state whether the user should reply or not.

CLASSIFICATION RULES:
- Reply Required → user must reply or confirm interest
- FYI → informational only
- No Reply Needed → confirmations or courtesy messages
- Urgent → time-sensitive action needed

OUTPUT FORMAT (JSON only):
{
  "summary": "short rewritten summary (max 30 words)",
  "tag": "Urgent|Reply Required|FYI|No Reply Needed"
}
`;

export class AIProcessor {
  constructor() {
    this.settings = null;
  }

  async loadSettings() {
    if (!this.settings) {
      const data = await chrome.storage.local.get(['settings']);
      this.settings = data.settings || { aiApiKey: null };
    }
    return this.settings;
  }

  async processEmail(subject, body) {
    const settings = await this.loadSettings();
    const cleaned = this.cleanEmail(body || '');

    if (!settings.aiApiKey || !cleaned) {
      return this.basicFallback(subject, cleaned);
    }

    const aiResult = await this.callAI(cleaned, settings.aiApiKey);

    if (!aiResult.summary || aiResult.summary.length < 10) {
      return this.basicFallback(subject, cleaned);
    }

    // 🔹 ADD CONTEXTUAL HINT (INTERVIEW / HR)
    const enhancedSummary = this.addContextHint(
      aiResult.summary,
      subject,
      cleaned,
      aiResult.tag
    );

    return {
      summary: enhancedSummary,
      tag: aiResult.tag
    };
  }

  /* ---------------- CLEANING ---------------- */

  cleanEmail(text) {
    return text
      .replace(/^(hi|hello|dear).*?\n/gi, '')
      .replace(/on .* wrote:[\s\S]*/gi, '')
      .replace(/-----original message-----[\s\S]*/gi, '')
      .replace(/sent from my.*$/gi, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 900);
  }

  /* ---------------- AI ---------------- */

  async callAI(text, apiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          temperature: 0.4,
          max_tokens: 120,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: AI_PROMPT },
            { role: 'user', content: `EMAIL:\n${text}` }
          ]
        })
      });

      const data = await res.json();
      const parsed = JSON.parse(data.choices[0].message.content);

      return {
        summary: parsed.summary.trim(),
        tag: this.validateTag(parsed.tag)
      };
    } catch (err) {
      console.error('AI error:', err);
      return this.basicFallback('', text);
    }
  }

  /* ---------------- CONTEXT HINTING ---------------- */

  addContextHint(summary, subject, body, tag) {
  const text = `${subject} ${body}`.toLowerCase();

  /* ───────────── AUTH / SECURITY / OTP ───────────── */

  if (/one time password|otp|verification code|use this code/i.test(text)) {
    return 'One-time password received for account verification.';
  }

  if (/new sign[- ]?in|signed in|login detected|new device/i.test(text)) {
    return 'New sign-in detected on your account; review if this was you.';
  }

  if (/google sign[- ]?in|sign[- ]?in to google account/i.test(text)) {
    return 'Google account sign-in detected; review activity if unexpected.';
  }

  if (/security alert|unusual activity|suspicious activity/i.test(text)) {
    return 'Security alert on your account; review immediately.';
  }

  if (/password reset|reset your password|change your password/i.test(text)) {
    return 'Password reset requested; take action if this was you.';
  }

  if (/verify your email|email verification|confirm your email/i.test(text)) {
    return 'Email verification required to complete account setup.';
  }

  /* ───────────── ACCOUNT / ACCESS REQUESTS ───────────── */

  if (/access request|permission request|requested access|shared with you/i.test(text)) {
    return 'Access request received; review and approve if appropriate.';
  }

  if (/new device|new browser|new location/i.test(text)) {
    return 'New device or location used to access your account.';
  }

  /* ───────────── CAREER / JOB ───────────── */

  if (/interview|hr|recruiter|hiring|selection|availability|next round/i.test(text)) {
    return 'Interview-related email; reply to confirm availability.';
  }

  if (/offer letter|job offer|we are pleased to offer/i.test(text)) {
    return 'Job offer received; review details and respond.';
  }

  if (/regret to inform|not selected|application rejected/i.test(text)) {
    return 'Application update received; no response required.';
  }

  if (/application status|application update|under review/i.test(text)) {
    return 'Update on your job application status.';
  }

  /* ───────────── EVENTS / MEETINGS ───────────── */

  if (/meeting request|schedule a call|calendar invite/i.test(text)) {
    return 'Meeting request received; reply to schedule or confirm.';
  }

  if (/event|meetup|webinar|conference|session|join us/i.test(text)) {
    return 'Event invitation received; reply if you want to attend.';
  }

  if (/rescheduled|new time|updated schedule/i.test(text)) {
    return 'Meeting or event has been rescheduled; review updated details.';
  }

  if (/cancelled|canceled/i.test(text)) {
    return 'Meeting or event has been cancelled.';
  }

  /* ───────────── PAYMENTS / FINANCE ───────────── */

  if (/payment due|outstanding amount|due by|overdue/i.test(text)) {
    return 'Payment due; review and complete before the deadline.';
  }

  if (/invoice|receipt|payment confirmation|transaction successful/i.test(text)) {
    return 'Payment or invoice details received.';
  }

  if (/refund|credited back|refund initiated/i.test(text)) {
    return 'Refund update received; check transaction details.';
  }

  /* ───────────── SUBSCRIPTIONS / SERVICES ───────────── */

  if (/subscription renewal|renewal notice|renews on/i.test(text)) {
    return 'Subscription renewal notice received.';
  }

  if (/subscription cancelled|cancellation confirmed/i.test(text)) {
    return 'Subscription cancellation confirmed.';
  }

  if (/plan upgraded|plan changed|billing plan/i.test(text)) {
    return 'Your service plan has been updated.';
  }

  /* ───────────── PROMOTIONAL / MARKETING ───────────── */

  if (/special offer|limited time offer|discount|sale|deal/i.test(text)) {
    return 'Promotional offer received; check details if interested.';
  }

  if (/introducing|new launch|we are excited to announce/i.test(text)) {
    return 'Promotional announcement about a new product or feature.';
  }

  /* ───────────── INFORMATIONAL ───────────── */

  if (/newsletter|weekly digest|monthly update/i.test(text)) {
    return 'Newsletter received; informational update.';
  }

  if (/policy update|terms updated|privacy policy/i.test(text)) {
    return 'Policy update announced; review changes.';
  }

  if (/product update|new feature|feature release/i.test(text)) {
    return 'Product update announced with new changes.';
  }

  /* ───────────── SOCIAL / CASUAL ───────────── */

  if (/thank you|thanks for|appreciate/i.test(text)) {
    return 'Thank-you or appreciation message received.';
  }

  if (/congratulations|congrats/i.test(text)) {
    return 'Congratulations message received.';
  }

  // 🧑‍💼 INTERVIEW / JOB
  if (/interview|hr|recruiter|hiring|selection|availability|next round/.test(text)) {
    return 'Interview-related email; reply to confirm availability.';
  }

  if (/offer letter|job offer|we are pleased to offer/.test(text)) {
    return 'Job offer received; review details and respond.';
  }

  if (/regret to inform|not selected|application rejected/.test(text)) {
    return 'Application update received; no response required.';
  }

  if (/application status|application update|under review/.test(text)) {
    return 'Update on your job application status.';
  }

  // 📅 EVENTS / MEETINGS
  if (/meeting request|schedule a call|calendar invite/.test(text)) {
    return 'Meeting request received; reply to schedule or confirm.';
  }

  if (/event|meetup|webinar|conference|session|join us/.test(text)) {
    return 'Event invitation received; reply if you want to attend.';
  }

  if (/rescheduled|new time|updated schedule/.test(text)) {
    return 'Meeting or event has been rescheduled; review updated details.';
  }

  if (/cancelled|canceled/.test(text)) {
    return 'Meeting or event has been cancelled.';
  }

  // 💰 PAYMENTS / FINANCE
  if (/payment due|outstanding amount|due by/.test(text)) {
    return 'Payment due; review and complete before the deadline.';
  }

  if (/invoice|receipt|payment confirmation/.test(text)) {
    return 'Payment or invoice details received.';
  }

  if (/refund|credited back/.test(text)) {
    return 'Refund update received; check transaction details.';
  }

  // 🔐 SECURITY / ACCOUNT
  if (/security alert|unusual activity|login attempt/.test(text)) {
    return 'Security alert detected; review immediately.';
  }

  if (/verify your email|email verification|confirm your email/.test(text)) {
    return 'Email verification required; confirm to continue.';
  }

  if (/password reset|reset your password/.test(text)) {
    return 'Password reset requested; take action if this was you.';
  }

  // 🛒 SUBSCRIPTIONS / SERVICES
  if (/subscription renewal|renewal notice/.test(text)) {
    return 'Subscription renewal notice received.';
  }

  if (/subscription cancelled|cancellation confirmed/.test(text)) {
    return 'Subscription cancellation confirmed.';
  }

  if (/plan upgraded|plan changed/.test(text)) {
    return 'Your service plan has been updated.';
  }

  // 📢 INFORMATIONAL
  if (/newsletter|monthly update|weekly digest/.test(text)) {
    return 'Newsletter received; informational update.';
  }

  if (/policy update|terms updated|privacy policy/.test(text)) {
    return 'Policy update announced; review changes.';
  }

  if (/product update|new feature|feature release/.test(text)) {
    return 'Product update announced with new changes.';
  }

  // 👋 SOCIAL / CASUAL
  if (/thank you|thanks for|appreciate/.test(text)) {
    return 'Thank-you or appreciation message received.';
  }

  if (/congratulations|congrats/.test(text)) {
    return 'Congratulations message received.';
  }

  // ✅ DEFAULT → keep AI summary
  return summary;
}


  /* ---------------- FALLBACK ---------------- */

  basicFallback(subject, text) {
    if (/interview|hr|recruiter|hiring/i.test(text)) {
      return {
        summary: 'Interview-related email; reply to confirm next steps.',
        tag: 'Reply Required'
      };
    }

    if (/invite|event|meetup|session/i.test(text)) {
      return {
        summary: 'Event invitation; reply if you want to attend.',
        tag: 'Reply Required'
      };
    }

    if (/let us know|would you|please reply|respond/i.test(text)) {
      return {
        summary: 'This email asks for your response or confirmation.',
        tag: 'Reply Required'
      };
    }

    if (/update|announcement|newsletter|inform/i.test(text)) {
      return {
        summary: 'This email shares an update or announcement.',
        tag: 'FYI'
      };
    }

    return {
      summary: subject
        ? `This email is about ${subject.toLowerCase()}.`
        : 'This email contains general information.',
      tag: 'No Reply Needed'
    };
  }

  validateTag(tag) {
    const allowed = ['Urgent', 'Reply Required', 'FYI', 'No Reply Needed'];
    return allowed.includes(tag) ? tag : 'FYI';
  }
}

export const aiProcessor = new AIProcessor();