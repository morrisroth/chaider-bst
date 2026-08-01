const nodemailer = require('nodemailer');

const FROM_ADDRESS = process.env.SMTP_FROM || 'Chaiderbs@netzach.org.il';
const FROM_NAME = 'חיידר בעל שם טוב';

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
      <p style="font-size:16px;">שלום${studentName ? ` וברכה,` : ','}</p>
      <p style="font-size:15px;">
        מצורף בזאת עותק של המסמך <strong>"${documentTitle}"</strong>${studentName ? ` עבור <strong>${studentName}</strong>` : ''},
        לאחר השלמת החתימה האלקטרונית עליו.
      </p>
      <p style="font-size:15px;">מומלץ לשמור את הקובץ המצורף לתיעודכם.</p>
      <p style="font-size:15px;">תודה רבה על שיתוף הפעולה!</p>
      <p style="font-size:15px; margin-top:24px;">
        בברכה,<br />
        <strong>צוות חיידר בעל שם טוב</strong>
      </p>
    </div>
  `;
  const text = `שלום,\n\nמצורף בזאת עותק של המסמך "${documentTitle}"${studentName ? ` עבור ${studentName}` : ''}, לאחר השלמת החתימה האלקטרונית עליו.\n\nמומלץ לשמור את הקובץ המצורף לתיעודכם.\n\nתודה רבה על שיתוף הפעולה!\n\nבברכה,\nצוות חיידר בעל שם טוב`;

  return {
    from: `"${FROM_NAME}" <${FROM_ADDRESS}>`,
    to,
    subject,
    html,
    text,
    attachments: [{ filename: pdfFilename, content: pdfBytes, contentType: 'application/pdf' }]
  };
}

async function sendSignedDocumentEmail(params) {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured (missing SMTP_HOST/SMTP_USER/SMTP_PASS)');
  const mailOptions = buildSignedDocumentMail(params);
  await transporter.sendMail(mailOptions);
}

module.exports = { buildSignedDocumentMail, sendSignedDocumentEmail };
