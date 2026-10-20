const nodemailer = require('nodemailer');

const FROM_ADDRESS = process.env.SMTP_FROM || 'Chaiderbs@netzach.org.il';
const FROM_NAME = 'חיידר בעל שם טוב';
const APP_URL = process.env.APP_URL || 'http://localhost:4000';

let cachedTransporter = null;
function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return cachedTransporter;
}

// Pure builder — kept separate from actual sending so it can be tested
// without a real SMTP connection.
function buildSignedDocumentMail({ to, studentName, documentTitle, pdfBytes, pdfFilename }) {
  const subject = `המסמך החתום שלכם — ${documentTitle}`;
  const html = `
    <div dir="rtl" style="font-family: Arial, Heebo, sans-serif; color:#15282d; line-height:1.7; max-width:520px; margin:0 auto;">
      <div style="text-align:center; margin-bottom:20px;">
        <img src="${APP_URL}/assets/logo.png" alt="חיידר בעל שם טוב" style="height:56px; width:auto;" />
      </div>
      <p style="font-size:16px;">שלום${studentName ? ` וברכה,` : ','}</p>
      <p style="font-size:15px;">
        מצורף בזאת עותק של המסמך <strong>"${documentTitle}"</strong>${studentName ? ` עבור <strong>${studentName}</strong>` : ''},
        לאחר השלמת החתימה האלקטרונית עליו.
      </p>
      <p style="font-size:15px;">מומלץ לשמור את הקובץ המצורף לתיעודכם.</p>
      <p style="font-size:15px;">תודה רבה על שיתוף הפעולה!</p>
      <p style="font-size:15px; margin-top:24px;">
        בברכה,<br />
        <strong>ההנהלה</strong>
      </p>
    </div>
  `;
  const text = `שלום,\n\nמצורף בזאת עותק של המסמך "${documentTitle}"${studentName ? ` עבור ${studentName}` : ''}, לאחר השלמת החתימה האלקטרונית עליו.\n\nמומלץ לשמור את הקובץ המצורף לתיעודכם.\n\nתודה רבה על שיתוף הפעולה!\n\nבברכה,\nההנהלה`;

  return {
    from: `"${FROM_NAME}" <${FROM_ADDRESS}>`,
    to,
    subject,
    html,
    text,
    attachments: [{ filename: pdfFilename, content: pdfBytes, contentType: 'application/pdf' }]
  };
}

// SMTP 4xx codes are transient (e.g. a receiving server rate-limiting a
// burst of sends) — a permanent 5xx rejection (bad address, etc.) won't
// succeed on retry, so only 4xx is worth a second attempt.
function isTransientSmtpError(err) {
  const code = err && err.responseCode;
  return typeof code === 'number' && code >= 400 && code < 500;
}

async function sendWithRetry(mailOptions) {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured (missing SMTP_HOST/SMTP_USER/SMTP_PASS)');
  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    if (!isTransientSmtpError(err)) throw err;
    await new Promise(resolve => setTimeout(resolve, 5000));
    await transporter.sendMail(mailOptions);
  }
}

async function sendSignedDocumentEmail(params) {
  await sendWithRetry(buildSignedDocumentMail(params));
}

// Values in the confirmation mails come straight from the public forms.
function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CITY_REGISTRATION_URL = 'https://edu.onecity.co.il/edu-registration-site/intro?customerId=526100';

function wrapHtml(inner) {
  return `
    <div dir="rtl" style="font-family: Arial, Heebo, sans-serif; color:#15282d; line-height:1.7; max-width:520px; margin:0 auto;">
      <div style="text-align:center; margin-bottom:20px;">
        <img src="${APP_URL}/assets/logo.png" alt="חיידר בעל שם טוב" style="height:56px; width:auto;" />
      </div>
      ${inner}
      <p style="font-size:15px; margin-top:24px;">
        בברכה,<br />
        <strong>הנהלת תלמוד תורה בעל שם טוב</strong><br />
        <span style="font-size:13px; color:#5b6b70;">073-3458288 · Chaiderbs@netzach.org.il</span>
      </p>
    </div>
  `;
}

// Sent to the parents after the registration form is submitted.
function buildRegistrationConfirmationMail({ to, childName, grade }) {
  const needsCity = /גן|א'/.test(grade || '');
  const subject = `קיבלנו את טופס ההרשמה${childName ? ` של ${childName}` : ''}`;
  const html = wrapHtml(`
      <p style="font-size:16px;">שלום וברכה,</p>
      <p style="font-size:15px;">
        טופס ההרשמה${childName ? ` עבור <strong>${escHtml(childName)}</strong>` : ''}${grade ? ` (${escHtml(grade)})` : ''}
        התקבל בהצלחה בתלמוד תורה בעל שם טוב.
      </p>
      <p style="font-size:15px;">ניצור עמכם קשר בימים הקרובים.</p>
      ${needsCity ? `
      <div style="background:#fbf5e8; border:1px solid #e6d3a3; border-radius:12px; padding:14px 16px; margin:18px 0;">
        <p style="font-size:15px; margin:0 0 8px;"><strong>שימו לב!</strong> הרישום לגנים וכיתה א' אינו תקף ללא הרישום באתר העירייה.</p>
        <p style="font-size:15px; margin:0;"><a href="${CITY_REGISTRATION_URL}" style="color:#1b6273; font-weight:bold;">לחצו כאן להמשך רישום באתר העירייה</a></p>
      </div>` : ''}
  `);
  const text = `שלום וברכה,\n\nטופס ההרשמה${childName ? ` עבור ${childName}` : ''}${grade ? ` (${grade})` : ''} התקבל בהצלחה בתלמוד תורה בעל שם טוב.\nניצור עמכם קשר בימים הקרובים.\n` +
    (needsCity ? `\nשימו לב! הרישום לגנים וכיתה א' אינו תקף ללא הרישום באתר העירייה:\n${CITY_REGISTRATION_URL}\n` : '') +
    `\nבברכה,\nהנהלת תלמוד תורה בעל שם טוב\n073-3458288`;
  return { from: `"${FROM_NAME}" <${FROM_ADDRESS}>`, to, subject, html, text };
}

// Sent to whoever used the contact form, when they left an email.
function buildContactConfirmationMail({ to, name, message }) {
  const subject = 'קיבלנו את פנייתכם — תלמוד תורה בעל שם טוב';
  const html = wrapHtml(`
      <p style="font-size:16px;">שלום${name ? ` ${escHtml(name)}` : ''},</p>
      <p style="font-size:15px;">פנייתכם התקבלה, ונחזור אליכם בהקדם האפשרי.</p>
      ${message ? `<p style="font-size:14px; color:#5b6b70; border-right:3px solid #e6ddcd; padding-right:12px; white-space:pre-wrap;">${escHtml(message)}</p>` : ''}
  `);
  const text = `שלום${name ? ` ${name}` : ''},\n\nפנייתכם התקבלה, ונחזור אליכם בהקדם האפשרי.\n` +
    (message ? `\nתוכן הפנייה:\n${message}\n` : '') + `\nבברכה,\nהנהלת תלמוד תורה בעל שם טוב\n073-3458288`;
  return { from: `"${FROM_NAME}" <${FROM_ADDRESS}>`, to, subject, html, text };
}

async function sendRegistrationConfirmationEmail(params) {
  await sendWithRetry(buildRegistrationConfirmationMail(params));
}

async function sendContactConfirmationEmail(params) {
  await sendWithRetry(buildContactConfirmationMail(params));
}

module.exports = {
  buildSignedDocumentMail, sendSignedDocumentEmail,
  buildRegistrationConfirmationMail, sendRegistrationConfirmationEmail,
  buildContactConfirmationMail, sendContactConfirmationEmail,
};
