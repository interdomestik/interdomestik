import { ThankYouLetterParams } from '@/lib/email/thank-you-letter';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function generateThankYouPDF(params: ThankYouLetterParams): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Constants
  const margin = 50;
  let yPosition = height - margin;

  // Header Background
  page.drawRectangle({
    x: 0,
    y: height - 150,
    width: width,
    height: 150,
    color: rgb(0.06, 0.46, 0.43), // #0f766e
  });

  // Logo / Title
  page.drawText('Asistenca', {
    x: margin,
    y: height - 60,
    size: 30,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  page.drawText('Membership Confirmation', {
    x: margin,
    y: height - 90,
    size: 16,
    font: font,
    color: rgb(0.9, 0.9, 0.9),
  });

  yPosition = height - 180;

  // Welcome Message
  const welcomeTitle = params.locale === 'sq' ? 'Mirësevini në Familje!' : 'Welcome to the Family!';
  page.drawText(welcomeTitle, {
    x: margin,
    y: yPosition,
    size: 20,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  yPosition -= 30;

  page.drawText(`Dear ${params.memberName},`, {
    x: margin,
    y: yPosition,
    size: 12,
    font: font,
    color: rgb(0.2, 0.2, 0.2),
  });
  yPosition -= 20;

  const introText =
    params.locale === 'sq'
      ? 'Faleminderit që zgjodhët Asistenca për mbrojtjen tuaj. Anëtarësimi juaj është aktiv.'
      : 'Thank you for choosing Asistenca for your protection. Your membership is now active.';

  page.drawText(introText, {
    x: margin,
    y: yPosition,
    size: 11,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  yPosition -= 40;

  // Membership Details Box
  page.drawRectangle({
    x: margin,
    y: yPosition - 100,
    width: width - margin * 2,
    height: 100,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.9, 0.9, 0.9),
    borderWidth: 1,
  });

  const detailX = margin + 20;
  let detailY = yPosition - 30;

  // Row 1
  page.drawText(params.locale === 'sq' ? 'NUMRI I ANËTARIT' : 'MEMBER NUMBER', {
    x: detailX,
    y: detailY,
    size: 9,
    font: boldFont,
    color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText(params.memberNumber, {
    x: detailX,
    y: detailY - 15,
    size: 14,
    font: boldFont,
    color: rgb(0.06, 0.46, 0.43),
  });

  // Row 2
  const rightColX = detailX + 250;

  page.drawText(params.locale === 'sq' ? 'PLANI' : 'PLAN', {
    x: rightColX,
    y: detailY,
    size: 9,
    font: boldFont,
    color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText(`${params.planName}`, {
    x: rightColX,
    y: detailY - 15,
    size: 12,
    font: font,
    color: rgb(0.1, 0.1, 0.1),
  });

  detailY -= 50;

  page.drawText(params.locale === 'sq' ? 'E VLEFSHME NGA' : 'VALID FROM', {
    x: detailX,
    y: detailY,
    size: 9,
    font: boldFont,
    color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText(params.memberSince, {
    x: detailX,
    y: detailY - 15,
    size: 12,
    font: font,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawText(params.locale === 'sq' ? 'SKADON MË' : 'EXPIRES AT', {
    x: rightColX,
    y: detailY,
    size: 9,
    font: boldFont,
    color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText(params.expiresAt, {
    x: rightColX,
    y: detailY - 15,
    size: 12,
    font: font,
    color: rgb(0.1, 0.1, 0.1),
  });

  yPosition -= 140;

  // Benefits
  page.drawText(params.locale === 'sq' ? 'PËRFITIMET KRYESORE' : 'KEY BENEFITS', {
    x: margin,
    y: yPosition,
    size: 11,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.2),
  });
  yPosition -= 20;

  const benefits =
    params.locale === 'sq'
      ? [
          '• Linja Emergjente 24/7',
          '• Konsultime Ligjore nga Ekspertë',
          '• Menaxhim i Plotë i Ankesave',
          '• Kategorizimi i Lëndimeve',
        ]
      : [
          '• 24/7 Emergency Hotline',
          '• Expert Legal Consultations',
          '• Full Claims Management',
          '• Injury Categorization',
        ];

  for (const benefit of benefits) {
    page.drawText(benefit, {
      x: margin + 10,
      y: yPosition,
      size: 11,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });
    yPosition -= 18;
  }

  // Footer
  const footerText =
    params.locale === 'sq'
      ? 'Pyetje? Telefononi linjën tonë 24/7 ose na vizitoni në interdomestik.com'
      : 'Questions? Call our 24/7 hotline or visit interdomestik.com';

  page.drawText(footerText, {
    x: margin,
    y: 50,
    size: 10,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Embed QR code if available
  if (params.qrCodeDataUrl) {
    try {
      const qrImageBytes = Buffer.from(params.qrCodeDataUrl.split(',')[1], 'base64');
      const qrImage = await pdfDoc.embedPng(qrImageBytes);
      const qrDims = qrImage.scale(0.5);

      page.drawImage(qrImage, {
        x: width - margin - qrDims.width,
        y: height - 135, // Position in header area
        width: qrDims.width,
        height: qrDims.height,
      });
    } catch {
      // Ignore QR embedding error
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
