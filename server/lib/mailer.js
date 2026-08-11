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

async function sendSignedDocumentEmail(params) {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured (missing SMTP_HOST/SMTP_USER/SMTP_PASS)');
  const mailOptions = buildSignedDocumentMail(params);
  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    if (!isTransientSmtpError(err)) throw err;
    await new Promise(resolve => setTimeout(resolve, 5000));
    await transporter.sendMail(mailOptions);
  }
}

module.exports = { buildSignedDocumentMail, sendSignedDocumentEmail };
